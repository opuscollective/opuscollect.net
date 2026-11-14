import type { APIRoute } from 'astro';
import { history } from '@/server/chat';
import { limit } from '@/server/ratelimit';
import { clientIp, fail, json } from '@/server/util';

export const prerender = false;

const VISITOR_WINDOW = 100;
const PAGE = 50;

/**
 * GET /api/chat/history            latest messages (visitors: the latest 100, cached for 10s)
 * GET /api/chat/history?before=ID  older messages, members only, 50 at a time
 *
 * Visitors only ever see a short, cached window, so the room can't be scraped from outside.
 */
export const GET: APIRoute = async ({ locals, request, url }) => {
  try {
    const db = locals.runtime.env.DB;
    const before = Number(url.searchParams.get('before')) || 0;
    if (!locals.user) {
      if (before) return json({ error: 'Join Opus to read further back.', messages: [], more: false }, { status: 401 });
      const cache = (globalThis as unknown as { caches?: { default: Cache } }).caches?.default;
      const key = new Request(new URL('/api/chat/history?visitor=1', url).href);
      const hit = await cache?.match(key);
      if (hit) return new Response(hit.body, hit);
      await limit(db, `chat-hist:${clientIp(request)}`, 120, 10 * 60_000);
      const res = json({ messages: await history(db, { limit: VISITOR_WINDOW }), more: false, visitor: true }, { headers: { 'cache-control': 'public, max-age=10' } });
      await cache?.put(key, res.clone());
      return res;
    }
    if (before) await limit(db, `chat-hist:u:${locals.user.id}`, 300, 10 * 60_000);
    const messages = await history(db, { before: before || undefined, limit: PAGE });
    return json({ messages, more: messages.length === PAGE });
  } catch (e) { return fail(e); }
};
