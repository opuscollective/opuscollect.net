/**
 * Opus usernames: the part after opuscollect.net/ in a member's public link.
 *
 * Profiles live at the site root (opuscollect.net/bogo). This is safe because Astro always
 * matches a real page (/world, /music, …) before the [handle] route, and because every
 * top-level page, folder and public file name is reserved here so no member can claim it.
 * tests/usernames.test.ts fails if a new top-level page is added without reserving it.
 */

/** Top-level routes and files that exist today. Keep in sync with src/pages and public/ (the test checks). */
const ROUTES = [
  '404', 'about', 'account', 'api', 'bookings', 'business', 'charts', 'collective', 'community', 'directory', 'events',
  'forgot-password', 'future', 'home', 'index', 'join', 'legal', 'm', 'media', 'music', 'musicians', 'network', 'organizations',
  'r', 'releases', 'reset-password', 'services', 'sign-in', 'sign-up', 'sitemap', 'start', 'studios', 'verified', 'verify-email', 'world',
  // public/ and build output
  'data', 'icons', 'images', 'favicon', 'site', 'robots', '_astro', '_worker',
];

/** Product areas, platform words and protected names that may become pages later. */
const FUTURE = [
  'admin', 'administrator', 'app', 'apps', 'auth', 'billing', 'blog', 'book', 'booking', 'brand', 'careers', 'cart', 'checkout',
  'contact', 'cookies', 'credits', 'dashboard', 'dev', 'developers', 'discover', 'docs', 'download', 'edit', 'email', 'explore', 'faq',
  'feed', 'gigs', 'guide', 'help', 'inbox', 'jobs', 'labels', 'learn', 'live', 'login', 'logout', 'map', 'me', 'members', 'merch',
  'messages', 'new', 'news', 'notifications', 'oauth', 'official', 'opportunities', 'opus', 'opus-collective', 'opuscollective',
  'opusworld', 'opus-world', 'people', 'playlists', 'portfolio', 'press', 'pricing', 'privacy', 'profile', 'profiles', 'projects',
  'radio', 'register', 'root', 'search', 'security', 'sessions', 'settings', 'shop', 'signin', 'signup', 'staff', 'static', 'status',
  'store', 'studio', 'summit', 'support', 'system', 'team', 'terms', 'tickets', 'tour', 'tracks', 'trust', 'u', 'user', 'users',
  'venues', 'verification', 'videos', 'www',
];

export const RESERVED = new Set([...ROUTES, ...FUTURE]);

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

/** Lowercase letters, numbers and single hyphens; starts and ends with a letter or number. */
export const USERNAME_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,29}$/;

/** Turns any text into a username candidate ("Lil Bogo!" → "lil-bogo"). */
export const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '').slice(0, USERNAME_MAX).replace(/-+$/, '');

/** Why a username can't be used, without touching the database. Null when the shape is fine. */
export function usernameProblem(u: string): string | null {
  if (u.length < USERNAME_MIN) return `Use at least ${USERNAME_MIN} characters.`;
  if (u.length > USERNAME_MAX) return `Use ${USERNAME_MAX} characters or fewer.`;
  if (!USERNAME_RE.test(u)) return 'Use lowercase letters, numbers and single hyphens.';
  if (RESERVED.has(u)) return 'That name is reserved for Opus. Try another.';
  return null;
}

export type Availability = { ok: true; username: string } | { ok: false; username: string; reason: string };

/**
 * Checks a username against the rules, current profiles (musicians and studios share one namespace)
 * and retired usernames. A member's own current or past usernames count as available to them.
 */
export async function checkUsername(db: D1Database, raw: string, profileId: string | null): Promise<Availability> {
  const username = slugify(raw);
  const problem = usernameProblem(username);
  if (problem) return { ok: false, username, reason: problem };
  const [cur, old] = await db.batch([
    db.prepare('SELECT id FROM profiles WHERE handle = ?').bind(username),
    db.prepare('SELECT profile_id FROM profile_handle_history WHERE handle = ?').bind(username),
  ]);
  const c = (cur!.results as { id: string }[])[0];
  const o = (old!.results as { profile_id: string }[])[0];
  if (c && c.id !== profileId) return { ok: false, username, reason: 'That username is taken. Try another.' };
  if (o && o.profile_id !== profileId) return { ok: false, username, reason: 'That username was used before and isn’t available.' };
  return { ok: true, username };
}

/** Where an old username points now, if anywhere. */
export async function resolveRetired(db: D1Database, handle: string) {
  return db.prepare(`SELECT p.handle, p.kind FROM profile_handle_history h JOIN profiles p ON p.id = h.profile_id WHERE h.handle = ?`)
    .bind(handle).first<{ handle: string; kind: string }>();
}

/** Public path for a profile. Musicians live at the root; studios keep /studios/<handle>. */
export const profilePath = (handle: string, kind: string = 'musician') => (kind === 'studio' ? `/studios/${handle}` : `/${handle}`);
