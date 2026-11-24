import type { APIRoute } from 'astro';
import { groupMessages, groupMessagesSince, markGroupRead, removeGroupMessage, rsvpGroupMessage, sendGroupMessage, shareableSessions } from '@/server/group-chat';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** GET /api/group-chat/{groupId}?before=ID | ?after=ID | ?share=1 */
export const GET: APIRoute = async ({ locals, params, url }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const db = locals.runtime.env.DB, id = params.id ?? '';
    if (url.searchParams.get('share')) return json({ sessions: await shareableSessions(db, locals.user.id, id) });
    const after = Number(url.searchParams.get('after')) || 0;
    if (after) return json(await groupMessagesSince(db, locals.user.id, id, after));
    return json(await groupMessages(db, locals.user.id, id, Number(url.searchParams.get('before')) || undefined));
  } catch (e) { return fail(e); }
};

/**
 * POST { body, cid }               send text
 * POST { sessionId, body? }        share one of my upcoming sessions
 * POST { action: 'read' }          mark read
 * POST { action: 'remove', messageId }
 * POST { action: 'rsvp', messageId, status: 'going' | 'no' | null }
 */
export const POST: APIRoute = async ({ locals, params, request }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const env = locals.runtime.env, id = params.id ?? '';
    const b = await readJson<{ body?: unknown; cid?: unknown; sessionId?: unknown; action?: unknown; messageId?: unknown; status?: unknown }>(request, 16_000);
    if (b.action === 'read') { await markGroupRead(env.DB, locals.user.id, id); return json({ ok: true }); }
    if (b.action === 'rsvp') return json(await rsvpGroupMessage(env, locals.user.id, id, Number(b.messageId), b.status));
    if (b.action === 'remove') return json(await removeGroupMessage(env, locals.user.id, id, Number(b.messageId)));
    return json(await sendGroupMessage(env, locals.user.id, id, b));
  } catch (e) { return fail(e); }
};
