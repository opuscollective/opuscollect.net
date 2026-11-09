/**
 * Musician profiles: read, validate, save, publish, photos.
 * All validation happens here on the server. Public reads never expose private fields.
 */
import { SPECIALTY_KEYS, type Specialty } from '@/data/specialties';
import { GENRES } from '@/data/genres';
import { HttpError, audit, now, randomId, str } from './util';
import { limit } from './ratelimit';
import type { SessionUser } from './session';

export const LINK_KEYS = ['spotify', 'appleMusic', 'soundcloud', 'youtube', 'instagram', 'tiktok', 'website'] as const;
export type LinkKey = (typeof LINK_KEYS)[number];
const LINK_HOSTS: Record<LinkKey, string[] | null> = {
  spotify: ['open.spotify.com', 'spotify.com'],
  appleMusic: ['music.apple.com'],
  soundcloud: ['soundcloud.com', 'on.soundcloud.com'],
  youtube: ['youtube.com', 'youtu.be', 'music.youtube.com'],
  instagram: ['instagram.com'],
  tiktok: ['tiktok.com'],
  website: null, // any https site
};

export interface Credit { title: string; role: string; artist: string; year: string; url: string }
export interface PortfolioItem { title: string; url: string }

export interface ProfileData {
  id: string;
  handle: string;
  displayName: string;
  primarySpecialty: Specialty | null;
  specialties: Specialty[]; // additional
  genres: string[];
  placeId: string | null;
  bio: string;
  openToCollab: boolean;
  photoKey: string | null;
  coverKey: string | null;
  links: Partial<Record<LinkKey, string>>;
  credits: Credit[];
  achievements: string[];
  collaborations: string[];
  portfolio: PortfolioItem[];
  status: 'draft' | 'published' | 'hidden';
  verification: 'none' | 'verified' | 'revoked';
  updatedAt: number;
}

interface Row {
  id: string; handle: string; display_name: string; primary_specialty: string | null; bio: string; place_id: string | null;
  photo_key: string | null; cover_key: string | null; open_to_collab: number; links: string; credits: string; achievements: string;
  collaborations: string; portfolio: string; status: ProfileData['status']; verification: ProfileData['verification']; updated_at: number;
  owner_user_id: string;
}

const parse = <T>(s: string, fallback: T): T => { try { return JSON.parse(s) as T; } catch { return fallback; } };

async function hydrate(db: D1Database, r: Row): Promise<ProfileData> {
  const [sp, gn] = await db.batch([
    db.prepare('SELECT specialty, is_primary FROM profile_specialties WHERE profile_id = ?').bind(r.id),
    db.prepare('SELECT genre FROM profile_genres WHERE profile_id = ?').bind(r.id),
  ]);
  const specs = (sp!.results as { specialty: Specialty; is_primary: number }[]);
  return {
    id: r.id, handle: r.handle, displayName: r.display_name,
    primarySpecialty: (r.primary_specialty as Specialty) ?? null,
    specialties: specs.filter((s) => !s.is_primary).map((s) => s.specialty),
    genres: (gn!.results as { genre: string }[]).map((g) => g.genre),
    placeId: r.place_id, bio: r.bio, openToCollab: !!r.open_to_collab, photoKey: r.photo_key, coverKey: r.cover_key,
    links: parse(r.links, {}), credits: parse(r.credits, []), achievements: parse(r.achievements, []),
    collaborations: parse(r.collaborations, []), portfolio: parse(r.portfolio, []),
    status: r.status, verification: r.verification, updatedAt: r.updated_at,
  };
}

export async function getMyProfile(db: D1Database, userId: string) {
  const r = await db.prepare("SELECT * FROM profiles WHERE owner_user_id = ? AND kind = 'musician'").bind(userId).first<Row>();
  return r ? hydrate(db, r) : null;
}

/** Public profile by handle. Drafts and hidden profiles are visible only to their owner. */
export async function getPublicProfile(db: D1Database, handle: string, viewerId: string | null) {
  const r = await db.prepare("SELECT * FROM profiles WHERE handle = ? AND kind = 'musician'").bind(handle).first<Row>();
  if (!r) return null;
  const isOwner = viewerId === r.owner_user_id;
  if (r.status !== 'published' && !isOwner) return null;
  return { profile: await hydrate(db, r), isOwner, ownerId: r.owner_user_id };
}

// ---------- validation ----------
const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 30);
const RESERVED = new Set(['admin', 'account', 'api', 'world', 'opus', 'support', 'help', 'settings', 'verified', 'sign-in', 'sign-up', 'about', 'legal', 'new', 'edit']);

function cleanUrl(v: unknown, hosts: string[] | null): string {
  const s = str(v, 500);
  if (!s) return '';
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { throw new HttpError(400, `“${s.slice(0, 60)}” isn’t a valid link.`); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new HttpError(400, 'Links must start with https://');
  u.protocol = 'https:';
  if (hosts && !hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))) {
    throw new HttpError(400, `That link should be on ${hosts[0]}.`);
  }
  return u.toString();
}

const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);

export interface SaveInput {
  handle?: unknown; displayName?: unknown; primarySpecialty?: unknown; specialties?: unknown; genres?: unknown;
  placeId?: unknown; bio?: unknown; openToCollab?: unknown; links?: unknown; credits?: unknown; achievements?: unknown;
  collaborations?: unknown; portfolio?: unknown; publish?: unknown;
}

/** What's still missing before a profile can be published. */
export function missingForPublish(p: ProfileData, emailVerified: boolean): string[] {
  const m: string[] = [];
  if (!emailVerified) m.push('Confirm your email address');
  if (!p.displayName) m.push('Artist or professional name');
  if (!p.primarySpecialty) m.push('Primary specialty');
  if (!p.placeId) m.push('City');
  if (!p.genres.length) m.push('At least one genre');
  if (p.bio.trim().length < 40) m.push('A short bio (40 characters or more)');
  if (!p.photoKey) m.push('Profile photo');
  return m;
}

export async function saveProfile(env: Env, user: SessionUser, body: SaveInput) {
  const db = env.DB;
  await limit(db, `profile-save:${user.id}`, 60, 10 * 60_000);
  const existing = await getMyProfile(db, user.id);

  const displayName = str(body.displayName, 80);
  if (!displayName) throw new HttpError(400, 'Add your artist or professional name.', 'displayName');

  const primary = typeof body.primarySpecialty === 'string' && (SPECIALTY_KEYS as readonly string[]).includes(body.primarySpecialty) ? (body.primarySpecialty as Specialty) : null;
  if (!primary) throw new HttpError(400, 'Choose your primary specialty.', 'primarySpecialty');
  const additional = [...new Set(list(body.specialties, 12).filter((s): s is Specialty => typeof s === 'string' && (SPECIALTY_KEYS as readonly string[]).includes(s) && s !== primary))].slice(0, 6);

  const genres = [...new Set(list(body.genres, 20).filter((g): g is string => typeof g === 'string' && (GENRES as readonly string[]).includes(g)))].slice(0, 5);

  const placeId = str(body.placeId, 80) || null;
  if (placeId && !(await db.prepare('SELECT 1 FROM places WHERE id = ?').bind(placeId).first())) throw new HttpError(400, 'Choose a city from the list.', 'placeId');

  const bio = str(body.bio, 1200);

  const linksIn = (body.links && typeof body.links === 'object' ? body.links : {}) as Record<string, unknown>;
  const links: Partial<Record<LinkKey, string>> = {};
  for (const k of LINK_KEYS) { const u = cleanUrl(linksIn[k], LINK_HOSTS[k]); if (u) links[k] = u; }

  const credits: Credit[] = list(body.credits, 30).map((c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    return { title: str(o.title, 120), role: str(o.role, 80), artist: str(o.artist, 120), year: str(o.year, 4).replace(/\D/g, ''), url: cleanUrl(o.url, null) };
  }).filter((c) => c.title);
  const achievements = list(body.achievements, 12).map((a) => str(a, 200)).filter(Boolean);
  const collaborations = list(body.collaborations, 20).map((a) => str(a, 120)).filter(Boolean);
  const portfolio: PortfolioItem[] = list(body.portfolio, 12).map((c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    return { title: str(o.title, 120), url: cleanUrl(o.url, null) };
  }).filter((p) => p.url);

  // Handle: user-chosen or derived from the name; must be unique.
  let handle = slugify(str(body.handle, 40)) || existing?.handle || slugify(displayName) || 'member';
  if (handle.length < 3) handle = `${handle}-${randomId(3).toLowerCase()}`;
  if (RESERVED.has(handle)) throw new HttpError(400, 'That profile address is reserved. Try another.', 'handle');
  const taken = await db.prepare('SELECT owner_user_id FROM profiles WHERE handle = ?').bind(handle).first<{ owner_user_id: string }>();
  if (taken && taken.owner_user_id !== user.id) {
    if (str(body.handle, 40)) throw new HttpError(409, 'That profile address is taken. Try another.', 'handle');
    handle = `${handle}-${randomId(3).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  }

  // A published profile must stay complete; check before writing anything.
  const willPublish = body.publish === true || (body.publish !== false && existing?.status === 'published');
  if (willPublish) {
    const missing = missingForPublish({
      ...(existing ?? ({} as ProfileData)), displayName, primarySpecialty: primary, placeId, genres, bio, photoKey: existing?.photoKey ?? null,
    } as ProfileData, user.emailVerified);
    if (missing.length) {
      if (body.publish === true && existing?.status !== 'published') {
        // First publish: save the draft anyway, then explain what's missing (handled below).
      } else throw new HttpError(400, `Published profiles need: ${missing.join(', ')}.`);
    }
  }

  const t = now();
  const id = existing?.id ?? randomId();
  const openToCollab = body.openToCollab === false ? 0 : 1;
  const stmts: D1PreparedStatement[] = [];
  if (existing) {
    stmts.push(db.prepare(`UPDATE profiles SET handle=?, display_name=?, primary_specialty=?, bio=?, place_id=?, open_to_collab=?, links=?, credits=?,
      achievements=?, collaborations=?, portfolio=?, updated_at=? WHERE id=?`)
      .bind(handle, displayName, primary, bio, placeId, openToCollab, JSON.stringify(links), JSON.stringify(credits),
        JSON.stringify(achievements), JSON.stringify(collaborations), JSON.stringify(portfolio), t, id));
  } else {
    stmts.push(db.prepare(`INSERT INTO profiles (id, kind, owner_user_id, handle, display_name, primary_specialty, bio, place_id, open_to_collab, links, credits,
      achievements, collaborations, portfolio, status, created_at, updated_at) VALUES (?, 'musician', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`)
      .bind(id, user.id, handle, displayName, primary, bio, placeId, openToCollab, JSON.stringify(links), JSON.stringify(credits),
        JSON.stringify(achievements), JSON.stringify(collaborations), JSON.stringify(portfolio), t, t));
  }
  stmts.push(db.prepare('DELETE FROM profile_specialties WHERE profile_id = ?').bind(id));
  stmts.push(db.prepare('INSERT INTO profile_specialties (profile_id, specialty, is_primary) VALUES (?, ?, 1)').bind(id, primary));
  for (const s of additional) stmts.push(db.prepare('INSERT INTO profile_specialties (profile_id, specialty, is_primary) VALUES (?, ?, 0)').bind(id, s));
  stmts.push(db.prepare('DELETE FROM profile_genres WHERE profile_id = ?').bind(id));
  for (const g of genres) stmts.push(db.prepare('INSERT INTO profile_genres (profile_id, genre) VALUES (?, ?)').bind(id, g));
  await db.batch(stmts);

  const saved = (await getMyProfile(db, user.id))!;
  let status = saved.status;
  if (body.publish === true) {
    const missing = missingForPublish(saved, user.emailVerified);
    if (missing.length) throw new HttpError(400, `Saved. To publish, add: ${missing.join(', ')}.`);
    status = 'published';
  } else if (body.publish === false) status = 'draft';
  if (status !== saved.status) {
    await db.prepare('UPDATE profiles SET status = ?, updated_at = ? WHERE id = ?').bind(status, now(), id).run();
    saved.status = status;
    await audit(db, user.id, status === 'published' ? 'profile.published' : 'profile.unpublished', { id });
  }
  return { profile: saved, missing: missingForPublish(saved, user.emailVerified) };
}

// ---------- photos ----------
const MAX_BYTES = 5 * 1024 * 1024;

/** Removes metadata (including GPS location) from a JPEG by dropping APPn (except JFIF APP0) and COM segments. */
export function stripJpegMetadata(buf: Uint8Array): Uint8Array {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new HttpError(400, 'That file isn’t a valid JPEG.');
  const out: Uint8Array[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) throw new HttpError(400, 'That image file is damaged.');
    const marker = buf[i + 1]!;
    if (marker === 0xda) { out.push(buf.subarray(i)); break; } // start of scan: rest is image data
    const len = (buf[i + 2]! << 8) | buf[i + 3]!;
    const seg = buf.subarray(i, i + 2 + len);
    const isApp = marker >= 0xe1 && marker <= 0xef; // APP1..APP15 (EXIF, XMP, ICC...)
    if (!isApp && marker !== 0xfe) out.push(seg);
    i += 2 + len;
  }
  const total = out.reduce((n, a) => n + a.length, 0);
  const res = new Uint8Array(total);
  let o = 0; for (const a of out) { res.set(a, o); o += a.length; }
  return res;
}

/** Removes EXIF and XMP chunks from a WebP (RIFF) file. */
export function stripWebpMetadata(buf: Uint8Array): Uint8Array {
  const tag = (o: number) => String.fromCharCode(buf[o]!, buf[o + 1]!, buf[o + 2]!, buf[o + 3]!);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') throw new HttpError(400, 'That file isn’t a valid WebP image.');
  const parts: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const id = tag(i);
    const size = buf[i + 4]! | (buf[i + 5]! << 8) | (buf[i + 6]! << 16) | (buf[i + 7]! << 24);
    const end = i + 8 + size + (size & 1);
    if (id === 'VP8X') {
      const c = buf.slice(i, end); c[8] = c[8]! & ~0x0c; // clear EXIF and XMP flags
      parts.push(c);
    } else if (id !== 'EXIF' && id !== 'XMP ') parts.push(buf.subarray(i, end));
    i = end;
  }
  const bodyLen = parts.reduce((n, a) => n + a.length, 0);
  const res = new Uint8Array(12 + bodyLen);
  res.set(buf.subarray(0, 12));
  const size = 4 + bodyLen;
  res[4] = size & 255; res[5] = (size >> 8) & 255; res[6] = (size >> 16) & 255; res[7] = (size >> 24) & 255;
  let o = 12; for (const a of parts) { res.set(a, o); o += a.length; }
  return res;
}

export async function uploadImage(env: Env, user: SessionUser, request: Request, slot: 'photo' | 'cover') {
  const db = env.DB;
  await limit(db, `upload:${user.id}`, 30, 60 * 60_000);
  const profile = await getMyProfile(db, user.id);
  if (!profile) throw new HttpError(400, 'Save your profile details before adding photos.');
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BYTES) throw new HttpError(413, 'Images must be 5 MB or smaller.');
  const type = (request.headers.get('content-type') || '').split(';')[0]!.trim();
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.length > MAX_BYTES) throw new HttpError(413, 'Images must be 5 MB or smaller.');
  if (raw.length < 100) throw new HttpError(400, 'That image is empty.');
  let clean: Uint8Array; let ext: string;
  // Check the actual bytes, not just the declared type.
  if (raw[0] === 0xff && raw[1] === 0xd8 && type === 'image/jpeg') { clean = stripJpegMetadata(raw); ext = 'jpg'; }
  else if (type === 'image/webp' && String.fromCharCode(...raw.subarray(8, 12)) === 'WEBP') { clean = stripWebpMetadata(raw); ext = 'webp'; }
  else throw new HttpError(415, 'Use a JPEG or WebP image.');

  const key = `p/${profile.id}/${slot}-${randomId(12)}.${ext}`;
  await env.MEDIA.put(key, clean, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } });
  const old = slot === 'photo' ? profile.photoKey : profile.coverKey;
  await db.prepare(`UPDATE profiles SET ${slot === 'photo' ? 'photo_key' : 'cover_key'} = ?, updated_at = ? WHERE id = ?`).bind(key, now(), profile.id).run();
  if (old) await env.MEDIA.delete(old);
  return key;
}

export async function removeImage(env: Env, user: SessionUser, slot: 'photo' | 'cover') {
  const profile = await getMyProfile(env.DB, user.id);
  if (!profile) return;
  const old = slot === 'photo' ? profile.photoKey : profile.coverKey;
  if (!old) return;
  // A published profile must keep a photo; unpublish or replace it instead.
  if (slot === 'photo' && profile.status === 'published') throw new HttpError(400, 'Published profiles need a photo. Upload a new one to replace it.');
  await env.DB.prepare(`UPDATE profiles SET ${slot === 'photo' ? 'photo_key' : 'cover_key'} = NULL, updated_at = ? WHERE id = ?`).bind(now(), profile.id).run();
  await env.MEDIA.delete(old);
}

export const mediaUrl = (key: string | null) => (key ? `/media/${key}` : null);
