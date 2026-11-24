/**
 * PartyRoom: one listening party's room. It runs inside the chat Durable Object class (an instance
 * named party:<id>; see GlobalChat in chat-room.ts), so it needs no new class and costs nothing while
 * nobody is in it (hibernating WebSockets).
 *
 * The room never touches audio. It keeps the shared clock ("track 2 was at 1:14 when my clock read T"),
 * moves to the next track by alarm even if the host's phone drops, relays chat and reactions, counts
 * the people really connected, and gives the host a way to remove a message or a person.
 *
 * The Worker authenticates before forwarding (src/worker.ts); the room trusts the identity headers
 * because the object is only reachable through the Worker.
 */
import type * as CF from '@cloudflare/workers-types';
import { assessGlobal, cleanBody } from '@/lib/chat-rules';
import {
  CHAT_COOLDOWN_MS, CHAT_MAX, HIDE_AFTER_REPORTS, MAX_LIVE_MS, PAUSE_LIMIT_MS, REACTIONS,
  apply, initialState, settle, trackEndsAt, type HostAction, type PartyState,
} from '@/lib/party';
import { activeRestriction, type ChatIdentity } from './chat';
import { deletePartyMedia } from './parties';

type WebSocket = CF.WebSocket;
declare const WebSocketPair: typeof CF.WebSocketPair;

interface Meta { hostUid: string; durations: number[]; ready: boolean; dbStatus: string }
interface Who { handle: string; name: string; photo: string | null; city: string | null }
export interface PartyMessage { id: string; body: string; at: number; host: boolean; a: Who }
interface Stored extends PartyMessage { uid: string; reports: string[]; hidden?: boolean }
interface Attachment { pid: string; uid: string; host: boolean; mod: boolean; createdAt: number; blocker: ChatIdentity['blocker']; who: Who | null }

const KEEP = 150;
const CLEANUP_AFTER_MS = 24 * 3_600_000;
const REASONS = ['spam', 'harassment', 'hate', 'other'];
const enc = (o: unknown) => JSON.stringify(o);
const safeSend = (ws: WebSocket, s: string) => { try { ws.send(s); } catch { /* closing */ } };
const pub = ({ uid: _u, reports: _r, hidden: _h, ...m }: Stored): PartyMessage => m;

export class PartyRoom {
  private st: PartyState | null = null;
  private meta: Meta | null = null;
  private msgs: Stored[] | null = null;
  private removed: Set<string> | null = null;
  private lastSend = new Map<string, number>();
  private lastReact = new Map<string, number>();

  constructor(private ctx: CF.DurableObjectState, private env: Env, readonly id: string) {}

  // ---------- state ----------

  private async state() { return (this.st ??= (await this.ctx.storage.get<PartyState>('st')) ?? initialState()); }
  private async messages() { return (this.msgs ??= (await this.ctx.storage.get<Stored[]>('msgs')) ?? []); }
  private async removedSet() { return (this.removed ??= new Set((await this.ctx.storage.get<string[]>('removed')) ?? [])); }

  private async loadMeta(fresh = false): Promise<Meta | null> {
    if (this.meta && !fresh) return this.meta;
    const p = await this.env.DB.prepare('SELECT host_user_id, status FROM parties WHERE id = ?').bind(this.id).first<{ host_user_id: string; status: string }>();
    if (!p) return null;
    const tracks = (await this.env.DB.prepare('SELECT audio_key, duration_ms FROM party_tracks WHERE party_id = ? ORDER BY position, created_at').bind(this.id)
      .all<{ audio_key: string | null; duration_ms: number | null }>()).results;
    this.meta = { hostUid: p.host_user_id, durations: tracks.map((t) => t.duration_ms ?? 0), ready: tracks.length > 0 && tracks.every((t) => t.audio_key && t.duration_ms), dbStatus: p.status };
    return this.meta;
  }

  private listeners(except?: WebSocket) {
    const uids = new Set<string>(); const cities = new Map<string, number>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const a = ws.deserializeAttachment() as Attachment | null;
      if (!a || uids.has(a.uid)) continue;
      uids.add(a.uid);
      if (a.who?.city) cities.set(a.who.city, (cities.get(a.who.city) ?? 0) + 1);
    }
    return { n: uids.size, cities: [...cities.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([c]) => c) };
  }

  private broadcast(o: unknown, except?: WebSocket) {
    const s = enc(o);
    for (const ws of this.ctx.getWebSockets()) if (ws !== except) safeSend(ws, s);
  }

  private async announceCount(except?: WebSocket) {
    const c = this.listeners(except);
    const peak = (await this.ctx.storage.get<number>('peak')) ?? 0;
    if (c.n > peak) void this.ctx.storage.put('peak', c.n);
    this.broadcast({ t: 'count', ...c }, except);
  }

  /** Saves a new clock state, tells everyone, mirrors it to the database and sets the next alarm. */
  private async commit(next: PartyState, prev: PartyState) {
    this.st = next;
    await this.ctx.storage.put('st', next);
    this.broadcast({ t: 'state', state: next, now: Date.now() });
    const db = this.env.DB;
    const t = Date.now();
    try {
      if (prev.status === 'lobby' && next.status !== 'lobby') {
        await this.ctx.storage.put('liveSince', t);
        await db.prepare("UPDATE parties SET status = 'live', started_at = ?, current_track = ?, updated_at = ? WHERE id = ? AND status = 'scheduled'").bind(t, next.track, t, this.id).run();
      } else if (next.status !== 'ended' && next.track !== prev.track) {
        await db.prepare('UPDATE parties SET current_track = ?, updated_at = ? WHERE id = ?').bind(next.track, t, this.id).run();
      }
      if (next.status === 'ended' && prev.status !== 'ended') {
        const peak = (await this.ctx.storage.get<number>('peak')) ?? 0;
        await db.prepare("UPDATE parties SET status = 'ended', ended_at = ?, peak_listeners = ?, updated_at = ? WHERE id = ?").bind(t, peak, t, this.id).run();
      }
    } catch (e) { console.error('party db', e); }
    await this.schedule(next);
  }

  private async schedule(s: PartyState) {
    const t = Date.now();
    const m = await this.loadMeta();
    const since = (await this.ctx.storage.get<number>('liveSince')) ?? t;
    let at: number | null = null;
    if (s.status === 'playing') at = Math.min(trackEndsAt(s, m?.durations ?? []) ?? t + 60_000, since + MAX_LIVE_MS);
    else if (s.status === 'paused') at = s.at + PAUSE_LIMIT_MS;
    else if (s.status === 'ended') at = s.at + CLEANUP_AFTER_MS;
    if (at == null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(Math.max(t + 50, at));
  }

  async alarm() {
    const s = await this.state();
    const t = Date.now();
    if (s.status === 'ended') {
      // A day after the party: the private files and the chat go away for good.
      if (t >= s.at + CLEANUP_AFTER_MS - 1000) {
        try { await deletePartyMedia(this.env, this.id); } catch (e) { console.error('party cleanup', e); }
        for (const ws of this.ctx.getWebSockets()) try { ws.close(1000, 'ended'); } catch { /* gone */ }
        await this.ctx.storage.deleteAll();
        this.st = null; this.msgs = null; this.removed = null;
      } else await this.schedule(s);
      return;
    }
    const m = await this.loadMeta();
    const since = (await this.ctx.storage.get<number>('liveSince')) ?? t;
    let next = settle(s, m?.durations ?? [], t);
    if (next.status === 'paused' && t >= next.at + PAUSE_LIMIT_MS - 1000) next = apply(next, 'end', m?.durations ?? [], t);
    if (next.status !== 'ended' && s.status !== 'lobby' && t >= since + MAX_LIVE_MS) next = apply(next, 'end', m?.durations ?? [], t);
    if (next !== s) await this.commit(next, s); else await this.schedule(s);
  }

  // ---------- requests ----------

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/party/count') return Response.json(this.listeners());
    if (url.pathname === '/party/socket') return this.openSocket(req);
    return new Response('Not found', { status: 404 });
  }

  private async openSocket(req: Request) {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    let id: ChatIdentity;
    try { id = JSON.parse(decodeURIComponent(req.headers.get('x-opus-identity') ?? '')) as ChatIdentity; } catch { return new Response('Sign in first', { status: 401 }); }
    const meta = await this.loadMeta(true);
    if (!meta) return new Response('Not found', { status: 404 });
    if ((await this.removedSet()).has(id.uid)) return new Response('Removed', { status: 403 });
    await this.ctx.storage.put('pid', this.id);

    const mine = this.ctx.getWebSockets(`u:${id.uid}`);
    for (const old of mine.slice(0, Math.max(0, mine.length - 3))) try { old.close(4000, 'Too many tabs'); } catch { /* gone */ }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [`u:${id.uid}`]);
    const host = id.uid === meta.hostUid;
    const a = id.author;
    const att: Attachment = { pid: this.id, uid: id.uid, host, mod: id.mod, createdAt: id.createdAt, blocker: id.blocker, who: a ? { handle: a.handle, name: a.name, photo: a.photo, city: a.city } : null };
    server.serializeAttachment(att);

    // Catch the clock up first, in case the alarm is a moment late.
    const s0 = await this.state();
    const s = settle(s0, meta.durations, Date.now());
    if (s !== s0) await this.commit(s, s0);
    server.send(enc({
      t: 'hello', now: Date.now(), state: s, me: { host, mod: id.mod, blocker: id.blocker }, ready: meta.ready,
      msgs: (await this.messages()).filter((m) => !m.hidden).slice(-60).map(pub), ...this.listeners(),
    }));
    await this.announceCount();
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 2000) return;
    let msg: { t?: string; [k: string]: unknown };
    try { msg = JSON.parse(raw); } catch { return; }
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) return;
    const t = Date.now();
    switch (msg.t) {
      case 'sync': safeSend(ws, enc({ t: 'sync', c: msg.c, s: t })); return;
      case 'react': {
        if (!REACTIONS.includes(msg.e as never) || t - (this.lastReact.get(att.uid) ?? 0) < 350) return;
        this.lastReact.set(att.uid, t);
        this.broadcast({ t: 'react', e: msg.e });
        return;
      }
      case 'send': return this.send(ws, att, msg.body, typeof msg.cid === 'string' ? msg.cid.slice(0, 40) : null);
      case 'cmd': return this.command(ws, att, String(msg.a));
      case 'remove': return this.removeMessage(att, String(msg.id));
      case 'kick': return this.kick(att, String(msg.id));
      case 'report': return this.report(ws, att, String(msg.id), String(msg.reason));
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch { /* already closed */ }
    await this.announceCount(ws);
  }

  // ---------- host controls ----------

  private async command(ws: WebSocket, att: Attachment, action: string) {
    if (!att.host) return;
    if (!['start', 'pause', 'resume', 'next', 'end'].includes(action)) return;
    const s = await this.state();
    const meta = await this.loadMeta(action === 'start');
    if (!meta) return;
    if (action === 'start') {
      if (meta.dbStatus !== 'scheduled') return safeSend(ws, enc({ t: 'error', error: 'This party can’t be started.' }));
      if (!meta.ready) return safeSend(ws, enc({ t: 'error', error: 'Add audio to every track first, or remove the tracks you’re not playing.' }));
    }
    const next = apply(s, action as HostAction, meta.durations, Date.now());
    if (next !== s) await this.commit(next, s);
  }

  // ---------- chat ----------

  private async send(ws: WebSocket, att: Attachment, rawBody: unknown, cid: string | null) {
    const no = (error: string) => safeSend(ws, enc({ t: 'error', cid, error }));
    const s = await this.state();
    if (s.status === 'ended') return no('The party has ended.');
    if (att.blocker === 'verify') return no('Confirm your email to chat.');
    if (att.blocker === 'profile' || !att.who) return no('Publish your profile to chat, so people can see who you are.');
    const body = cleanBody(rawBody).replace(/\n+/g, ' ');
    if (!body) return;
    if (body.length > CHAT_MAX) return no(`Keep it under ${CHAT_MAX} characters.`);
    const t = Date.now();
    if (!att.host && t - (this.lastSend.get(att.uid) ?? 0) < CHAT_COOLDOWN_MS) return no('Give it a second.');
    if (!att.host) {
      const v = assessGlobal(body, { accountAgeMs: t - att.createdAt, recentOwn: [] });
      if (v.verdict === 'refuse') return no(v.reason === 'harassment' ? 'That breaks the chat rules.' : 'Keep links, contact details and promo out of the party chat.');
      const r = await activeRestriction(this.env.DB, att.uid).catch(() => null);
      if (r) return no('You can’t post in chat right now.');
    }
    this.lastSend.set(att.uid, t);
    const m: Stored = { id: `${t.toString(36)}${Math.random().toString(36).slice(2, 6)}`, body, at: t, host: att.host, a: att.who, uid: att.uid, reports: [] };
    const all = await this.messages();
    all.push(m);
    if (all.length > KEEP) all.splice(0, all.length - KEEP);
    void this.ctx.storage.put('msgs', all);
    safeSend(ws, enc({ t: 'ack', cid, id: m.id }));
    this.broadcast({ t: 'msg', m: pub(m), cid });
  }

  private async hide(ids: string[]) {
    const all = await this.messages();
    const hit = all.filter((m) => ids.includes(m.id) && !m.hidden);
    if (!hit.length) return;
    for (const m of hit) m.hidden = true;
    void this.ctx.storage.put('msgs', all);
    this.broadcast({ t: 'remove', ids: hit.map((m) => m.id) });
  }

  private async removeMessage(att: Attachment, id: string) {
    if (!att.host && !att.mod) return;
    await this.hide([id]);
  }

  /** Removes the author of a message from the room: their messages go, their sockets close, and they can't rejoin. */
  private async kick(att: Attachment, messageId: string) {
    if (!att.host && !att.mod) return;
    const all = await this.messages();
    const target = all.find((m) => m.id === messageId);
    const meta = await this.loadMeta();
    if (!target || target.uid === att.uid || target.uid === meta?.hostUid) return;
    const removed = await this.removedSet();
    removed.add(target.uid);
    await this.ctx.storage.put('removed', [...removed]);
    try {
      await this.env.DB.prepare('INSERT OR IGNORE INTO party_removals (party_id, user_id, removed_by, created_at) VALUES (?, ?, ?, ?)').bind(this.id, target.uid, att.uid, Date.now()).run();
    } catch (e) { console.error('party removal', e); }
    await this.hide(all.filter((m) => m.uid === target.uid).map((m) => m.id));
    for (const ws of this.ctx.getWebSockets(`u:${target.uid}`)) { safeSend(ws, enc({ t: 'kicked' })); try { ws.close(4003, 'Removed'); } catch { /* gone */ } }
  }

  private async report(ws: WebSocket, att: Attachment, messageId: string, reason: string) {
    const all = await this.messages();
    const m = all.find((x) => x.id === messageId);
    if (!m || m.uid === att.uid || m.reports.includes(att.uid) || m.reports.length > 50) return;
    m.reports.push(att.uid);
    void this.ctx.storage.put('msgs', all);
    try {
      await this.env.DB.prepare(`INSERT OR IGNORE INTO party_reports (id, party_id, message_id, author_user_id, reporter_user_id, body, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), this.id, m.id, m.uid, att.uid, m.body, REASONS.includes(reason) ? reason : 'other', Date.now()).run();
    } catch (e) { console.error('party report', e); }
    safeSend(ws, enc({ t: 'reported', id: m.id }));
    // Enough separate reports hide a message without waiting for the host. The host's own messages stay.
    if (!m.host && m.reports.length >= HIDE_AFTER_REPORTS) await this.hide([m.id]);
  }
}
