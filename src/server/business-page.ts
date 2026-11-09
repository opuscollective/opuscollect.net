/** Shared loader for /business pages: signed-in user, their studio, and the pending request count. */
import type { AstroGlobal } from 'astro';
import { getMyStudio } from './business';
import { expireStale } from './bookings';

export async function loadBusiness(Astro: AstroGlobal) {
  const user = Astro.locals.user;
  if (!user) return { redirect: Astro.redirect(`/sign-in?next=${encodeURIComponent(Astro.url.pathname)}`) } as const;
  const db = Astro.locals.runtime.env.DB;
  const studio = await getMyStudio(db, user.id);
  if (!studio) return { redirect: Astro.redirect('/business') } as const;
  await expireStale(db, studio.id);
  const p = await db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE profile_id = ? AND status = 'requested'").bind(studio.id).first<{ n: number }>();
  return { user, studio, db, pending: p?.n ?? 0 } as const;
}
