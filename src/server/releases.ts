/**
 * Releases on a member's profile: things they're working on and things they've put out.
 * Self-reported by the member. They choose, per release, whether it shows on their profile.
 */
import { HttpError, now, randomId, str } from './util';
import { limit } from './ratelimit';
import { cleanUrl } from './profiles';

export const RELEASE_KINDS = ['single', 'ep', 'album', 'mixtape', 'project'] as const;
export type ReleaseKind = (typeof RELEASE_KINDS)[number];
export const KIND_LABEL: Record<ReleaseKind, string> = { single: 'Single', ep: 'EP', album: 'Album', mixtape: 'Mixtape', project: 'Project' };
export type ReleaseStage = 'in_progress' | 'released';

export interface Release {
  id: string;
  title: string;
  kind: ReleaseKind;
  stage: ReleaseStage;
  role: string;
  artist: string;
  releaseDate: string;
  link: string;
  notes: string;
  showOnProfile: boolean;
  updatedAt: number;
}

interface Row {
  id: string; title: string; kind: ReleaseKind; stage: ReleaseStage; role: string; artist: string; release_date: string | null;
  link: string; notes: string; show_on_profile: number; updated_at: number;
}
const toRelease = (r: Row): Release => ({
  id: r.id, title: r.title, kind: r.kind, stage: r.stage, role: r.role, artist: r.artist, releaseDate: r.release_date ?? '',
  link: /^https?:\/\//i.test(r.link) ? r.link : '', notes: r.notes, showOnProfile: !!r.show_on_profile, updatedAt: r.updated_at,
});

// Works in progress first (most recently touched), then releases newest first.
const ORDER = "ORDER BY CASE stage WHEN 'in_progress' THEN 0 ELSE 1 END, CASE stage WHEN 'in_progress' THEN -updated_at ELSE 0 END, COALESCE(release_date, '') DESC, created_at DESC";

export async function listReleases(db: D1Database, profileId: string, opts: { publicOnly?: boolean; max?: number } = {}): Promise<Release[]> {
  const where = opts.publicOnly ? 'AND show_on_profile = 1' : '';
  const r = await db.prepare(`SELECT * FROM releases WHERE profile_id = ? ${where} ${ORDER} LIMIT ?`).bind(profileId, opts.max ?? 100).all<Row>();
  return r.results.map(toRelease);
}

const DATE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;
export const MAX_RELEASES = 100;

function clean(body: Record<string, unknown>) {
  const title = str(body.title, 120);
  if (!title) throw new HttpError(400, 'Give it a title. A working title is fine.', 'title');
  const kind = (RELEASE_KINDS as readonly string[]).includes(body.kind as string) ? (body.kind as ReleaseKind) : 'single';
  const stage: ReleaseStage = body.stage === 'released' ? 'released' : 'in_progress';
  const releaseDate = str(body.releaseDate, 10);
  if (releaseDate && !DATE.test(releaseDate)) throw new HttpError(400, 'Use a date like 2026, 2026-11 or 2026-11-20.', 'releaseDate');
  const rawLink = str(body.link, 500);
  const link = cleanUrl(rawLink, null);
  if (rawLink && !link) throw new HttpError(400, 'Links need to start with https://', 'link');
  return {
    title, kind, stage, releaseDate: releaseDate || null, link,
    role: str(body.role, 80), artist: str(body.artist, 120), notes: str(body.notes, 280),
    show: body.showOnProfile === false ? 0 : 1,
  };
}

export async function createRelease(db: D1Database, userId: string, profileId: string, body: Record<string, unknown>) {
  await limit(db, `release-save:${userId}`, 60, 10 * 60_000);
  const n = await db.prepare('SELECT COUNT(*) AS n FROM releases WHERE profile_id = ?').bind(profileId).first<{ n: number }>();
  if ((n?.n ?? 0) >= MAX_RELEASES) throw new HttpError(400, `You can list up to ${MAX_RELEASES} releases.`);
  const c = clean(body);
  const id = randomId();
  const t = now();
  await db.prepare(`INSERT INTO releases (id, profile_id, title, kind, stage, role, artist, release_date, link, notes, show_on_profile, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, profileId, c.title, c.kind, c.stage, c.role, c.artist, c.releaseDate, c.link, c.notes, c.show, t, t).run();
  return (await getRelease(db, profileId, id))!;
}

export async function getRelease(db: D1Database, profileId: string, id: string) {
  const r = await db.prepare('SELECT * FROM releases WHERE id = ? AND profile_id = ?').bind(id, profileId).first<Row>();
  return r ? toRelease(r) : null;
}

export async function updateRelease(db: D1Database, userId: string, profileId: string, id: string, body: Record<string, unknown>) {
  await limit(db, `release-save:${userId}`, 60, 10 * 60_000);
  const existing = await getRelease(db, profileId, id);
  if (!existing) throw new HttpError(404, 'That release was not found.');
  // Partial updates: fields not sent keep their value (so "show on profile" can be toggled on its own).
  const merged = { ...existing, ...body } as Record<string, unknown>;
  const c = clean(merged);
  await db.prepare(`UPDATE releases SET title=?, kind=?, stage=?, role=?, artist=?, release_date=?, link=?, notes=?, show_on_profile=?, updated_at=? WHERE id=? AND profile_id=?`)
    .bind(c.title, c.kind, c.stage, c.role, c.artist, c.releaseDate, c.link, c.notes, c.show, now(), id, profileId).run();
  return (await getRelease(db, profileId, id))!;
}

export async function deleteRelease(db: D1Database, profileId: string, id: string) {
  const r = await db.prepare('DELETE FROM releases WHERE id = ? AND profile_id = ?').bind(id, profileId).run();
  if (!r.meta.changes) throw new HttpError(404, 'That release was not found.');
}

/** "Nov 2026", "2026", "Nov 20, 2026" */
export function dateLabel(d: string): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (!m) return y!;
  const mon = M[Number(m) - 1] ?? '';
  return day ? `${mon} ${Number(day)}, ${y}` : `${mon} ${y}`;
}
