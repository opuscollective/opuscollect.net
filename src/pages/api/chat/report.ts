import type { APIRoute } from 'astro';
import { reportGlobal } from '@/server/chat';
import { limit } from '@/server/ratelimit';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** POST /api/chat/report { messageId, reason, note } */
export const POST: APIRoute = async ({ locals, request }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const env = locals.runtime.env;
    const b = await readJson<{ messageId?: unknown; reason?: unknown; note?: unknown }>(request, 4_000);
    await limit(env.DB, `chat-report:${locals.user.id}`, 30, 60 * 60_000);
    return json(await reportGlobal(env, locals.user.id, Number(b.messageId), b.reason, b.note));
  } catch (e) { return fail(e); }
};
