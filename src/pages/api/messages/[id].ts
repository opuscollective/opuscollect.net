import type { APIRoute } from 'astro';
import { conversationMessages, markConversationRead, reportDm, sendDm } from '@/server/messages';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** GET /api/messages/{id}?before=ID: messages, newest last. Opening it marks the conversation read. */
export const GET: APIRoute = async ({ locals, params, url }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const before = Number(url.searchParams.get('before')) || undefined;
    return json(await conversationMessages(locals.runtime.env.DB, locals.user.id, params.id ?? '', before));
  } catch (e) { return fail(e); }
};

/**
 * POST /api/messages/{id} { body, cid }      send
 * POST /api/messages/{id} { action: 'read' } mark read
 * POST /api/messages/report { messageId, reason }
 */
export const POST: APIRoute = async ({ locals, params, request }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const env = locals.runtime.env;
    const b = await readJson<{ body?: unknown; cid?: unknown; action?: unknown; messageId?: unknown; reason?: unknown }>(request, 16_000);
    if (params.id === 'report') return json(await reportDm(env.DB, locals.user.id, Number(b.messageId), b.reason));
    if (b.action === 'read') { await markConversationRead(env.DB, locals.user.id, params.id ?? ''); return json({ ok: true }); }
    return json(await sendDm(env, locals.user.id, params.id ?? '', b.body, b.cid));
  } catch (e) { return fail(e); }
};
