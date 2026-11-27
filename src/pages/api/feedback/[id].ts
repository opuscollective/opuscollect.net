import type { APIRoute } from 'astro';
import { postNote, removeNote, removeTrack } from '@/server/feedback';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/** POST /api/feedback/:id { body }: leave a note on a track. */
export const POST: APIRoute = async ({ locals, request, params }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    return json(await postNote(locals.runtime.env.DB, locals.user, params.id ?? '', await readJson(request, 8_000)));
  } catch (e) { return fail(e); }
};

/** DELETE /api/feedback/:id takes the track down; ?note=<id> removes one note. */
export const DELETE: APIRoute = async ({ locals, params, url }) => {
  try {
    if (!locals.user) throw new HttpError(401, 'Please sign in first.');
    const note = url.searchParams.get('note');
    const db = locals.runtime.env.DB;
    return json(note ? await removeNote(db, locals.user, params.id ?? '', note) : await removeTrack(db, locals.user, params.id ?? ''));
  } catch (e) { return fail(e); }
};
