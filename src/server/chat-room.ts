/**
 * GlobalChat: the one worldwide room, a single SQLite-backed Durable Object.
 *
 * Every Global Chat send, from any tab, phone or API caller, arrives here, so the 5 second
 * cooldown, the burst limit, duplicate detection and the content rules can't be bypassed by
 * opening another tab or calling the endpoint directly. Members' sockets use the WebSocket
 * Hibernation API, so an idle room costs nothing.
 *
 * The Worker authenticates before forwarding (src/worker.ts); the room trusts the identity
 * header because the object is only reachable through the Worker.
 */
import { DurableObject } from 'cloudflare:workers';
import { assessGlobal, cleanBody, cooldownLeft, normalize, BURST_MAX, BURST_WINDOW_MS, COOLDOWN_MS, DUPLICATE_WINDOW_MS, MAX_LEN } from '@/lib/chat-rules';
import { activeRestriction, type ChatIdentity, type ChatMessage } from './chat';
import type * as CF from '@cloudflare/workers-types';

type WebSocket = CF.WebSocket;
declare const WebSocketPair: typeof CF.WebSocketPair;
declare const WebSocketRequestResponsePair: typeof CF.WebSocketRequestResponsePair;

interface UserState { last: number; burst: number[]; recent: { n: string; t: number }[] }
interface Attachment { uid: string; handle: string | null; mod: boolean; createdAt: number; blocker: ChatIdentity['blocker']; author: ChatIdentity['author'] }

const RETENTION_MS = 90 * 86_400_000;
const MAX_SOCKETS_PER_USER = 8;
const enc = (o: unknown) => JSON.stringify(o);

export type SendResult =
  | { ok: true; message: ChatMessage }
  | { ok: false; error: string; code: string; retryAfter?: number };

export class GlobalChat extends DurableObject<Env> {
  private users = new Map<string, UserState>();
  /** Recent normalized texts across members, to notice the same message arriving from many accounts. */
  private wave: { n: string; uid: string; t: number }[] = [];

  constructor(ctx: CF.DurableObjectState, env: Env) {
    super(ctx, env);
    // Keep-alive pings are answered without waking the room.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/socket') return this.openSocket(req);
    if (req.method !== 'POST') return new Response('Not found', { status: 404 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (url.pathname === '/send') {
      const id = identityFrom(req);
      if (!id) return Response.json({ ok: false, error: 'Please sign in first.', code: 'auth' }, { status: 401 });
      return Response.json(await this.send(id, body.body, typeof body.cid === 'string' ? body.cid : null));
    }
    if (url.pathname === '/remove') {
      const ids = Array.isArray(body.ids) ? body.ids.filter((n: unknown) => Number.isInteger(n)) : [];
      if (ids.length) this.broadcast({ t: 'remove', ids });
      return Response.json({ ok: true });
    }
    if (url.pathname === '/nudge') {
      // Private events (a new DM, a connection request) go only to that member's own sockets.
      const uids = Array.isArray(body.uids) ? body.uids.filter((u: unknown): u is string => typeof u === 'string').slice(0, 20) : [];
      for (const uid of uids) for (const ws of this.ctx.getWebSockets(`u:${uid}`)) safeSend(ws, enc({ t: 'nudge', ...(body.event as object ?? {}) }));
      return Response.json({ ok: true });
    }
    return new Response('Not found', { status: 404 });
  }

  private async openSocket(req: Request) {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const id = identityFrom(req);
    if (!id) return new Response('Sign in first', { status: 401 });
    // One person, a handful of tabs and devices. Close the oldest beyond that.
    const mine = this.ctx.getWebSockets(`u:${id.uid}`);
    for (const old of mine.slice(0, Math.max(0, mine.length - MAX_SOCKETS_PER_USER + 1))) try { old.close(4000, 'Too many tabs'); } catch { /* gone */ }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [`u:${id.uid}`]);
    const att: Attachment = { uid: id.uid, handle: id.author?.handle ?? null, mod: id.mod, createdAt: id.createdAt, blocker: id.blocker, author: id.author };
    server.serializeAttachment(att);
    const st = await this.state(id.uid);
    const restriction = await activeRestriction(this.env.DB, id.uid).catch(() => null);
    server.send(enc({
      t: 'hello',
      me: { handle: att.handle, mod: att.mod, blocker: att.blocker, restriction },
      cooldown: cooldownLeft(st.last, Date.now()),
    }));
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 4000) return;
    let msg: { t?: string; body?: unknown; cid?: unknown };
    try { msg = JSON.parse(raw); } catch { return; }
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) return;
    if (msg.t === 'send') {
      const cid = typeof msg.cid === 'string' ? msg.cid.slice(0, 40) : null;
      const r = await this.send({ uid: att.uid, createdAt: att.createdAt, mod: att.mod, blocker: att.blocker, author: att.author }, msg.body, cid);
      safeSend(ws, enc(r.ok ? { t: 'ack', cid, id: r.message.id } : { t: 'error', cid, error: r.error, code: r.code, retryAfter: r.retryAfter }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch { /* already closed */ }
  }

  async webSocketError() { /* the socket is gone; nothing to clean up */ }

  /** Housekeeping: Global Chat keeps 90 days of history. */
  async alarm() {
    await this.env.DB.prepare('DELETE FROM chat_messages WHERE created_at < ?').bind(Date.now() - RETENTION_MS).run();
    await this.ctx.storage.setAlarm(Date.now() + 86_400_000);
  }

  private async state(uid: string): Promise<UserState> {
    const have = this.users.get(uid);
    if (have) return have;
    const s: UserState = (await this.ctx.storage.get<UserState>(`u:${uid}`)) ?? { last: 0, burst: [], recent: [] };
    this.users.set(uid, s);
    return s;
  }

  /** The single path for a Global Chat message. Order matters: see the plan doc. */
  async send(id: Omit<ChatIdentity, 'author'> & { author: ChatIdentity['author'] }, rawBody: unknown, cid: string | null): Promise<SendResult> {
    if (id.blocker === 'verify') return { ok: false, code: 'verify', error: 'Confirm your email to join the conversation.' };
    if (id.blocker === 'profile' || !id.author) return { ok: false, code: 'profile', error: 'Publish your profile to join the conversation, so people can see who you are.' };
    const body = cleanBody(rawBody);
    if (!body) return { ok: false, code: 'empty', error: 'Write something first.' };
    if (body.length > MAX_LEN) return { ok: false, code: 'length', error: `Keep it under ${MAX_LEN} characters.` };

    // Storage reads hold the room's input gate, so no other send interleaves before the slot is claimed.
    const st = await this.state(id.uid);
    const t = Date.now();
    const wait = cooldownLeft(st.last, t);
    if (wait) return { ok: false, code: 'cooldown', error: `Wait ${wait}s`, retryAfter: wait };
    st.burst = st.burst.filter((x) => t - x < BURST_WINDOW_MS);
    if (st.burst.length >= BURST_MAX) {
      const retryAfter = Math.ceil((st.burst[0] + BURST_WINDOW_MS - t) / 1000);
      return { ok: false, code: 'burst', error: 'You’ve said a lot in the last few minutes. Take a short break.', retryAfter };
    }
    // Claim the slot now, synchronously: a second tab sending in the same instant sees it.
    const prevLast = st.last;
    st.last = t;
    st.burst.push(t);

    const release = () => { st.last = prevLast; st.burst.pop(); };

    let restriction: Awaited<ReturnType<typeof activeRestriction>>;
    try { restriction = await activeRestriction(this.env.DB, id.uid); } catch { release(); return { ok: false, code: 'server', error: 'Couldn’t send. Try again.' }; }
    if (restriction) {
      release();
      if (restriction.kind === 'ban') return { ok: false, code: 'banned', error: 'You can’t post in Global Chat.' };
      const mins = Math.max(1, Math.ceil(((restriction.until ?? t) - t) / 60_000));
      return { ok: false, code: 'timeout', error: `You’re timed out for ${mins} more minute${mins === 1 ? '' : 's'}.`, retryAfter: Math.ceil(((restriction.until ?? t) - t) / 1000) };
    }

    st.recent = st.recent.filter((r) => t - r.t < DUPLICATE_WINDOW_MS);
    this.wave = this.wave.filter((w) => t - w.t < DUPLICATE_WINDOW_MS).slice(-300);
    const norm = normalize(body);
    const sameTextOthers = new Set(this.wave.filter((w) => w.n === norm && w.uid !== id.uid).map((w) => w.uid)).size;
    const verdict = assessGlobal(body, { accountAgeMs: t - id.createdAt, recentOwn: st.recent.map((r) => r.n), sameTextOthers });
    if (verdict.verdict === 'refuse') {
      // A refused message still uses the cooldown, so rewording a promo can't be spammed.
      this.persist(id.uid, st);
      return { ok: false, code: verdict.reason === 'duplicate' ? 'duplicate' : 'rules', error: verdict.message, retryAfter: COOLDOWN_MS / 1000 };
    }

    let rowId: number | undefined;
    try {
      const flagged = verdict.verdict === 'flag';
      const ins = await this.env.DB.prepare(`INSERT OR IGNORE INTO chat_messages (user_id, body, flagged, flag_reason, client_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?) RETURNING id`)
        .bind(id.uid, body, flagged ? 1 : 0, flagged ? verdict.reason : null, cid, t).first<{ id: number }>();
      rowId = ins?.id;
      if (!rowId && cid) {
        // The same message arrived twice (a double tap or a retry): answer with the first one.
        release();
        const prev = await this.env.DB.prepare('SELECT id, body, created_at FROM chat_messages WHERE user_id = ? AND client_id = ?').bind(id.uid, cid).first<{ id: number; body: string; created_at: number }>();
        if (prev) return { ok: true, message: { id: prev.id, body: prev.body, at: prev.created_at, author: id.author } };
      }
    } catch (e) {
      console.error('chat insert', e);
      release();
      return { ok: false, code: 'server', error: 'Couldn’t send. Try again.' };
    }
    if (!rowId) { release(); return { ok: false, code: 'server', error: 'Couldn’t send. Try again.' }; }

    st.recent.unshift({ n: norm, t });
    st.recent = st.recent.slice(0, 10);
    this.wave.push({ n: norm, uid: id.uid, t });
    this.persist(id.uid, st);
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(t + 86_400_000);

    const message: ChatMessage = { id: rowId, body, at: t, author: id.author };
    this.broadcast({ t: 'msg', m: message });
    return { ok: true, message };
  }

  private persist(uid: string, st: UserState) {
    // Not awaited: Durable Object storage writes are durable before the response leaves the room.
    void this.ctx.storage.put(`u:${uid}`, st);
  }

  private broadcast(o: unknown) {
    const s = enc(o);
    for (const ws of this.ctx.getWebSockets()) safeSend(ws, s);
  }
}

function safeSend(ws: WebSocket, s: string) { try { ws.send(s); } catch { /* closing */ } }

function identityFrom(req: Request): ChatIdentity | null {
  const h = req.headers.get('x-opus-identity');
  if (!h) return null;
  try { return JSON.parse(decodeURIComponent(h)) as ChatIdentity; } catch { return null; }
}
