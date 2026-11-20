import type { APIRoute } from 'astro';
import { addMeAsMember, addSpot, groupInviteLink, leaveClan, linkWork, removeSpot, renewLink, unlinkWork, updateClan, updateSpot } from '@/server/clans';
import { HttpError, fail, json, readJson } from '@/server/util';

export const prerender = false;

/**
 * POST { action, ... } on one group. Every admin action re-checks admin rights in src/server/clans.ts.
 *   update      { name, groupType, placeId, bio }
 *   add-spot    { name, roles, handle? }   handle = invite an existing member; without = open spot + invite link
 *   edit-spot   { spotId, name?, roles? }
 *   renew-link  { spotId }
 *   remove-spot { spotId }
 *   link-work / unlink-work { releaseId }
 *   add-me      { roles? }   the admin shows their own profile on the roster
 *   invite-link { renew? }   the group's reusable invite link (managers only)
 *   leave       (a member leaves; their profile is untouched)
 */
export const POST: APIRoute = async ({ locals, request, params, url }) => {
  try {
    const user = locals.user;
    if (!user) throw new HttpError(401, 'Please sign in first.');
    const env = locals.runtime.env, id = params.id ?? '';
    const b = await readJson(request);
    switch (b.action) {
      case 'update': return json(await updateClan(env, user, id, b));
      case 'add-spot': return json(await addSpot(env, user, id, b, url.origin));
      case 'edit-spot': return json(await updateSpot(env, user, id, b.spotId, b));
      case 'renew-link': return json(await renewLink(env, user, id, b.spotId, url.origin));
      case 'remove-spot': await removeSpot(env, user, id, b.spotId); return json({ ok: true });
      case 'link-work': await linkWork(env, user, id, b.releaseId); return json({ ok: true });
      case 'unlink-work': await unlinkWork(env, user, id, b.releaseId); return json({ ok: true });
      case 'add-me': return json(await addMeAsMember(env, user, id, b));
      case 'invite-link': return json(await groupInviteLink(env, user, id, url.origin, b.renew === true));
      case 'leave': return json(await leaveClan(env, user, id));
      default: throw new HttpError(400, 'Invalid request.');
    }
  } catch (e) { return fail(e); }
};
