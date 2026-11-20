import type { APIRoute } from 'astro';
import { clansIAdmin } from '@/server/clans';
import { fail, json } from '@/server/util';

export const prerender = false;

/** GET: the groups the signed-in user manages, for "Manage <group>" in the account menu. Private to the user. */
export const GET: APIRoute = async ({ locals }) => {
  try {
    if (!locals.user) return json({ groups: [] });
    const groups = (await clansIAdmin(locals.runtime.env.DB, locals.user.id)).map((c) => ({ name: c.name, href: `${c.href}#manage` }));
    return json({ groups });
  } catch (e) { return fail(e); }
};
