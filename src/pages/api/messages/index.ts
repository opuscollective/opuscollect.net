import type { APIRoute } from 'astro';
import { listConversations, openConversation, unreadSummary } from '@/server/messages';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** GET /api/messages: my conversations and unread counts. */
export const GET: APIRoute = async ({ locals }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const db = locals.runtime.env.DB;
    const [conversations, unread] = await Promise.all([listConversations(db, locals.user.id), unreadSummary(db, locals.user.id)]);
    return json({ conversations, unread });
  } catch (e) { return fail(e); }
};

/** POST /api/messages { to: handle }: open the conversation with a connection. */
export const POST: APIRoute = async ({ locals, request }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const b = await readJson<{ to?: unknown }>(request, 2_000);
    return json(await openConversation(locals.runtime.env.DB, locals.user.id, b.to));
  } catch (e) { return fail(e); }
};
