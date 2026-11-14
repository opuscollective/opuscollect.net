import type { APIRoute } from 'astro';
import { isModerator, moderate, moderationQueue } from '@/server/chat';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

async function mod(locals: App.Locals) {
  if (!locals.user) throw new HttpError(401, 'Please sign in first.');
  if (!(await isModerator(locals.runtime.env.DB, locals.user.id, locals.user.role))) throw new HttpError(403, 'Moderators only.');
  return locals.user;
}

/** GET /api/chat/moderate: the moderator queue. */
export const GET: APIRoute = async ({ locals }) => {
  try { await mod(locals); return json({ items: await moderationQueue(locals.runtime.env.DB) }); } catch (e) { return fail(e); }
};

/** POST /api/chat/moderate { action: remove|restore|dismiss|timeout|ban|unban, messageId, minutes?, reason? } */
export const POST: APIRoute = async ({ locals, request }) => {
  try {
    const user = await mod(locals);
    return json(await moderate(locals.runtime.env, user.id, await readJson(request, 4_000)));
  } catch (e) { return fail(e); }
};
