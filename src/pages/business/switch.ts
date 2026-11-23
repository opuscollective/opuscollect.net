import type { APIRoute } from 'astro';
import { STUDIO_COOKIE, listMyStudios } from '@/server/business';

export const prerender = false;

/** /business/switch?id=…&to=/business/bookings — choose which of your studios the dashboard shows. */
export const GET: APIRoute = async ({ locals, url, cookies, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/sign-in?next=/business');
  const id = url.searchParams.get('id') ?? '';
  const to = url.searchParams.get('to') ?? '/business';
  if ((await listMyStudios(locals.runtime.env.DB, user.id)).some((s) => s.id === id)) {
    cookies.set(STUDIO_COOKIE, id, { path: '/', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', maxAge: 60 * 60 * 24 * 365 });
  }
  return redirect(/^\/business(\/[a-z]*)?$/.test(to) ? to : '/business');
};
