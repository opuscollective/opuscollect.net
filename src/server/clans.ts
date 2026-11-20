/**
 * Clans: a shared home for a band, collective, production crew or label (2026-11-20).
 *
 * A Clan is an organization profile (profiles.kind = 'organization') plus clan_details, so it shares
 * handles, photos, places, World discovery and the events organizer link with the rest of Opus.
 *
 * Rules enforced here, never in the pages:
 * - Only a Clan admin (the owner, or a profile_managers admin) edits the Clan, its roster and its Works.
 * - Nobody is shown on a roster until they accept. Open spots, invitations and declines are visible
 *   to the Clan's admins only (and an invitation to the person it is for).
 * - An invite link is a random token; only its hash is stored. It works once, for one spot.
 * - Members keep their own profile and works. Leaving or being removed changes nothing on their profile.
 * - Only published Works that belong to, or credit (confirmed), an active member can be linked.
 */
import { PLACE_BY_ID, visibleLabel } from '@/data/places';
import { isBlockedEitherWay } from './connections';
import { getMyProfile, mediaUrl, RESERVED, slugify } from './profiles';
import { limit } from './ratelimit';
import type { SessionUser } from './session';
import { HttpError, audit, now, randomId, sha256, str } from './util';

export type GroupType = 'band' | 'collective' | 'crew' | 'label';
/** Public labels. Bands always read "Band". */
export const GROUP_TYPES: Record<GroupType, { label: string; membersStep: string; rolePlaceholder: string; line: string }> = {
  band: { label: 'Band', membersStep: 'Add band members', rolePlaceholder: 'Lead vocals, guitar', line: 'Players and singers who make music together.' },
  collective: { label: 'Collective', membersStep: 'Add members', rolePlaceholder: 'Producer, DJ', line: 'Artists who move as one.' },
  crew: { label: 'Production crew', membersStep: 'Add crew members', rolePlaceholder: 'Producer, engineer', line: 'The people behind the sound.' },
  label: { label: 'Label', membersStep: 'Add team members', rolePlaceholder: 'A&R, artist', line: 'A label and its people.' },
};
export const isGroupType = (v: unknown): v is GroupType => typeof v === 'string' && v in GROUP_TYPES;
/** Quick picks for a member's role. Free text is fine too. */
export const ROLE_SUGGESTIONS = ['Lead vocals', 'Backing vocals', 'Guitar', 'Bass', 'Drums', 'Keys', 'Producer', 'DJ', 'Engineer', 'Songwriter', 'Manager'];

const MAX_ROSTER = 40;
const MAX_WORKS = 24;
const MAX_ROLES = 4;
const parse = <T,>(s: string | null | undefined, f: T): T => { try { return s ? (JSON.parse(s) as T) : f; } catch { return f; } };

export type MemberStatus = 'open' | 'invited' | 'active' | 'declined' | 'left' | 'removed';

export interface Clan {
  id: string; handle: string; name: string; groupType: GroupType; typeLabel: string; bio: string;
  placeId: string | null; place: string; photo: string | null; photoKey: string | null; status: 'draft' | 'published' | 'hidden';
  ownerUserId: string; isSample: boolean; href: string;
}

export interface RosterEntry {
  id: string; name: string; roles: string[]; status: MemberStatus; isAdmin: boolean; isOwner: boolean;
  userId: string | null; handle: string | null; photo: string | null; profilePublished: boolean;
}

interface ClanRow {
  id: string; handle: string; display_name: string; bio: string; place_id: string | null; photo_key: string | null;
  status: Clan['status']; owner_user_id: string; group_type: GroupType; is_sample: number;
}

const CLAN_SELECT = `SELECT p.id, p.handle, p.display_name, p.bio, p.place_id, p.photo_key, p.status, p.owner_user_id, d.group_type, d.is_sample
  FROM profiles p JOIN clan_details d ON d.profile_id = p.id`;

function clanView(r: ClanRow): Clan {
  return {
    id: r.id, handle: r.handle, name: r.display_name, groupType: r.group_type, typeLabel: GROUP_TYPES[r.group_type]?.label ?? 'Clan', bio: r.bio,
    placeId: r.place_id, place: visibleLabel(r.place_id, 'city'), photo: mediaUrl(r.photo_key), photoKey: r.photo_key, status: r.status,
    ownerUserId: r.owner_user_id, isSample: !!r.is_sample, href: `/c/${r.handle}`,
  };
}

export async function getClanByHandle(db: D1Database, handle: string) {
  if (!handle || handle.length > 40) return null;
  const r = await db.prepare(`${CLAN_SELECT} WHERE p.handle = ?`).bind(handle).first<ClanRow>();
  return r ? clanView(r) : null;
}

export async function getClan(db: D1Database, id: string) {
  if (!id || id.length > 40) return null;
  const r = await db.prepare(`${CLAN_SELECT} WHERE p.id = ?`).bind(id).first<ClanRow>();
  return r ? clanView(r) : null;
}

/** Owner, a profile_managers admin, or a roster admin. */
export async function isClanAdmin(db: D1Database, clan: Pick<Clan, 'id' | 'ownerUserId'>, userId: string | null | undefined) {
  if (!userId) return false;
  if (clan.ownerUserId === userId) return true;
  const r = await db.prepare(`SELECT 1 AS ok FROM profile_managers WHERE profile_id = ? AND user_id = ? AND role = 'admin'
    UNION SELECT 1 FROM clan_members WHERE clan_id = ? AND user_id = ? AND status = 'active' AND is_admin = 1 LIMIT 1`)
    .bind(clan.id, userId, clan.id, userId).first<{ ok: number }>();
  return !!r;
}

async function adminClan(db: D1Database, user: SessionUser, id: unknown) {
  const clan = await getClan(db, str(id, 40));
  if (!clan) throw new HttpError(404, 'That Clan doesn’t exist.');
  if (!(await isClanAdmin(db, clan, user.id))) throw new HttpError(403, 'Only the Clan’s admins can do that.');
  return clan;
}

/** Clans the user can manage (owner or admin), for the event host picker and My Clans. */
export async function clansIAdmin(db: D1Database, userId: string): Promise<Clan[]> {
  const { results } = await db.prepare(`${CLAN_SELECT} WHERE p.owner_user_id = ?1
      OR EXISTS (SELECT 1 FROM profile_managers m WHERE m.profile_id = p.id AND m.user_id = ?1 AND m.role = 'admin')
      OR EXISTS (SELECT 1 FROM clan_members c WHERE c.clan_id = p.id AND c.user_id = ?1 AND c.status = 'active' AND c.is_admin = 1)
    ORDER BY p.display_name`).bind(userId).all<ClanRow>();
  return results.map(clanView);
}

// ---------- roster ----------
interface MemberRow {
  id: string; display_name: string; roles: string; status: MemberStatus; is_admin: number; user_id: string | null;
  handle: string | null; pname: string | null; photo_key: string | null; pstatus: string | null;
}

/** Public: active members only. withPrivate (admins): every spot, including open, invited and past ones. */
export async function roster(db: D1Database, clan: Pick<Clan, 'id' | 'ownerUserId'>, withPrivate = false): Promise<RosterEntry[]> {
  const { results } = await db.prepare(`SELECT c.id, c.display_name, c.roles, c.status, c.is_admin, c.user_id,
      p.handle, p.display_name AS pname, p.photo_key, p.status AS pstatus
    FROM clan_members c LEFT JOIN profiles p ON p.owner_user_id = c.user_id AND p.kind = 'musician'
    WHERE c.clan_id = ? ${withPrivate ? '' : "AND c.status = 'active'"}
    ORDER BY CASE c.status WHEN 'active' THEN 0 WHEN 'invited' THEN 1 WHEN 'open' THEN 2 ELSE 3 END, c.sort, c.created_at`)
    .bind(clan.id).all<MemberRow>();
  return results.map((r) => {
    const published = r.pstatus === 'published';
    // Once a member accepts, the roster uses the name on their own profile.
    const name = r.status === 'active' && r.pname ? r.pname : r.display_name;
    return {
      id: r.id, name, roles: parse<string[]>(r.roles, []), status: r.status, isAdmin: !!r.is_admin || r.user_id === clan.ownerUserId,
      isOwner: r.user_id === clan.ownerUserId, userId: withPrivate ? r.user_id : null,
      handle: published || withPrivate ? r.handle : null, photo: published || withPrivate ? mediaUrl(r.photo_key) : null, profilePublished: published,
    };
  });
}

const cleanRoles = (v: unknown) => {
  const raw = Array.isArray(v) ? v : String(v ?? '').split(/[,/]| & /);
  const out: string[] = [];
  for (const x of raw) {
    const s = str(x, 40).replace(/\s+/g, ' ');
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out.slice(0, MAX_ROLES);
};

// ---------- create & edit ----------
export interface ClanInput { name?: unknown; groupType?: unknown; placeId?: unknown; bio?: unknown; myRoles?: unknown }

export async function createClan(env: Env, user: SessionUser, body: ClanInput) {
  const db = env.DB;
  if (!user.emailVerified) throw new HttpError(403, 'Confirm your email before creating a Clan.');
  const me = await getMyProfile(db, user.id);
  if (!me) throw new HttpError(400, 'Set up your profile first. You’ll be the first member on the roster.');
  await limit(db, `clan-create:${user.id}`, 10, 86_400_000);
  const name = str(body.name, 80).replace(/\s+/g, ' ');
  if (name.length < 2) throw new HttpError(400, 'Give it a name.', 'name');
  if (!isGroupType(body.groupType)) throw new HttpError(400, 'Choose what kind of group it is.', 'groupType');
  const placeId = str(body.placeId, 80) || null;
  if (placeId && !PLACE_BY_ID.has(placeId)) throw new HttpError(400, 'Choose a city from the list.', 'placeId');
  const bio = str(body.bio, 600);

  let handle = slugify(name) || 'clan';
  if (handle.length < 3) handle = `${handle}-clan`;
  if (RESERVED.has(handle) || (await db.prepare('SELECT 1 AS x FROM profiles WHERE handle = ?').bind(handle).first())) {
    handle = `${handle.slice(0, 24)}-${randomId(3).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  }
  const id = randomId();
  const t = now();
  await db.batch([
    db.prepare(`INSERT INTO profiles (id, kind, owner_user_id, handle, display_name, bio, place_id, location_visibility, open_to_collab, status, created_at, updated_at)
      VALUES (?, 'organization', ?, ?, ?, ?, ?, 'city', 1, 'published', ?, ?)`).bind(id, user.id, handle, name, bio, placeId, t, t),
    db.prepare('INSERT INTO clan_details (profile_id, group_type, created_at) VALUES (?, ?, ?)').bind(id, body.groupType, t),
    db.prepare(`INSERT INTO clan_members (id, clan_id, display_name, roles, user_id, status, is_admin, sort, invited_by, created_at, updated_at, responded_at)
      VALUES (?, ?, ?, ?, ?, 'active', 1, 0, ?, ?, ?, ?)`).bind(randomId(), id, me.displayName, JSON.stringify(cleanRoles(body.myRoles)), user.id, user.id, t, t, t),
  ]);
  await audit(db, user.id, 'clan.create', { id });
  return { id, handle, href: `/c/${handle}` };
}

export async function updateClan(env: Env, user: SessionUser, id: unknown, body: ClanInput) {
  const db = env.DB;
  const clan = await adminClan(db, user, id);
  const name = body.name === undefined ? clan.name : str(body.name, 80).replace(/\s+/g, ' ');
  if (name.length < 2) throw new HttpError(400, 'Give it a name.', 'name');
  const placeId = body.placeId === undefined ? clan.placeId : (str(body.placeId, 80) || null);
  if (placeId && !PLACE_BY_ID.has(placeId)) throw new HttpError(400, 'Choose a city from the list.', 'placeId');
  const bio = body.bio === undefined ? clan.bio : str(body.bio, 600);
  const type = body.groupType === undefined ? clan.groupType : body.groupType;
  if (!isGroupType(type)) throw new HttpError(400, 'Choose what kind of group it is.', 'groupType');
  await db.batch([
    db.prepare('UPDATE profiles SET display_name = ?, place_id = ?, bio = ?, updated_at = ? WHERE id = ?').bind(name, placeId, bio, now(), clan.id),
    db.prepare('UPDATE clan_details SET group_type = ? WHERE profile_id = ?').bind(type, clan.id),
  ]);
  return { ok: true };
}

/** The photo target for uploadImage/removeImage, after the admin check. */
export async function clanImageTarget(db: D1Database, user: SessionUser, id: unknown) {
  const clan = await adminClan(db, user, id);
  // Clans don't need a photo to stay public, so 'draft' lets removeImage take it away.
  return { id: clan.id, photoKey: clan.photoKey, coverKey: null, status: 'draft' };
}

// ---------- roster actions (admins) ----------
export interface SpotInput { name?: unknown; roles?: unknown; handle?: unknown }

/**
 * Adds one roster spot. With a handle: invites that existing member (they accept from their account).
 * Without: an open spot with a one-time invite link the admin shares with someone new.
 */
export async function addSpot(env: Env, user: SessionUser, clanId: unknown, body: SpotInput, origin: string) {
  const db = env.DB;
  const clan = await adminClan(db, user, clanId);
  await limit(db, `clan-spot:${user.id}`, 120, 3_600_000);
  const n = await db.prepare("SELECT COUNT(*) AS n FROM clan_members WHERE clan_id = ? AND status IN ('open', 'invited', 'active')").bind(clan.id).first<{ n: number }>();
  if ((n?.n ?? 0) >= MAX_ROSTER) throw new HttpError(400, `A roster holds up to ${MAX_ROSTER} people.`);
  const roles = cleanRoles(body.roles);
  const handle = str(body.handle, 60).replace(/^@/, '').replace(/^.*opuscollect\.net\/(m\/)?/i, '').replace(/[/?#].*$/, '');
  const t = now();
  const sort = (n?.n ?? 0) + 1;

  if (handle) {
    const p = await db.prepare("SELECT owner_user_id, display_name, status FROM profiles WHERE handle = ? AND kind = 'musician'").bind(handle)
      .first<{ owner_user_id: string; display_name: string; status: string }>();
    if (!p || p.status !== 'published') throw new HttpError(404, 'We couldn’t find a published Opus profile with that username.', 'handle');
    if (await isBlockedEitherWay(db, user.id, p.owner_user_id)) throw new HttpError(404, 'We couldn’t find a published Opus profile with that username.', 'handle');
    const live = await db.prepare("SELECT status FROM clan_members WHERE clan_id = ? AND user_id = ? AND status IN ('invited', 'active')").bind(clan.id, p.owner_user_id).first<{ status: string }>();
    if (live) throw new HttpError(400, live.status === 'active' ? `${p.display_name} is already on the roster.` : `${p.display_name} already has an invitation.`, 'handle');
    const name = str(body.name, 80) || p.display_name;
    const id = randomId();
    await db.prepare(`INSERT INTO clan_members (id, clan_id, display_name, roles, user_id, status, sort, invited_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'invited', ?, ?, ?, ?)`).bind(id, clan.id, name, JSON.stringify(roles), p.owner_user_id, sort, user.id, t, t).run();
    await audit(db, user.id, 'clan.invite', { clan: clan.id, spot: id });
    return { id, status: 'invited' as const, name };
  }

  const name = str(body.name, 80).replace(/\s+/g, ' ');
  if (name.length < 1) throw new HttpError(400, 'Add the member’s name.', 'name');
  const token = randomId(24);
  const id = randomId();
  await db.prepare(`INSERT INTO clan_members (id, clan_id, display_name, roles, status, claim_hash, sort, invited_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`).bind(id, clan.id, name, JSON.stringify(roles), await sha256(token), sort, user.id, t, t).run();
  await audit(db, user.id, 'clan.spot', { clan: clan.id, spot: id });
  return { id, status: 'open' as const, name, link: `${origin}/clans/join/${token}` };
}

async function spotOf(db: D1Database, clanId: string, spotId: unknown) {
  const s = await db.prepare('SELECT id, user_id, status FROM clan_members WHERE id = ? AND clan_id = ?').bind(str(spotId, 40), clanId)
    .first<{ id: string; user_id: string | null; status: MemberStatus }>();
  if (!s) throw new HttpError(404, 'That roster spot doesn’t exist.');
  return s;
}

export async function updateSpot(env: Env, user: SessionUser, clanId: unknown, spotId: unknown, body: SpotInput) {
  const db = env.DB;
  const clan = await adminClan(db, user, clanId);
  const s = await spotOf(db, clan.id, spotId);
  const sets: string[] = []; const vals: unknown[] = [];
  if (body.roles !== undefined) { sets.push('roles = ?'); vals.push(JSON.stringify(cleanRoles(body.roles))); }
  if (body.name !== undefined && s.status !== 'active') {
    const name = str(body.name, 80);
    if (!name) throw new HttpError(400, 'Add the member’s name.', 'name');
    sets.push('display_name = ?'); vals.push(name);
  }
  if (!sets.length) return { ok: true };
  await db.prepare(`UPDATE clan_members SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).bind(...vals, now(), s.id).run();
  return { ok: true };
}

/** A fresh invite link for an open spot. The old link stops working. */
export async function renewLink(env: Env, user: SessionUser, clanId: unknown, spotId: unknown, origin: string) {
  const db = env.DB;
  const clan = await adminClan(db, user, clanId);
  const s = await spotOf(db, clan.id, spotId);
  if (s.status !== 'open') throw new HttpError(400, 'Only open spots have an invite link.');
  const token = randomId(24);
  await db.prepare('UPDATE clan_members SET claim_hash = ?, updated_at = ? WHERE id = ?').bind(await sha256(token), now(), s.id).run();
  return { link: `${origin}/clans/join/${token}` };
}

/** Removes a member or withdraws an invitation / open spot. The owner can't be removed. */
export async function removeSpot(env: Env, user: SessionUser, clanId: unknown, spotId: unknown) {
  const db = env.DB;
  const clan = await adminClan(db, user, clanId);
  const s = await spotOf(db, clan.id, spotId);
  if (s.user_id === clan.ownerUserId) throw new HttpError(400, 'The owner can’t be removed from the roster.');
  if (s.status === 'open' || s.status === 'invited' || s.status === 'declined') {
    await db.prepare('DELETE FROM clan_members WHERE id = ?').bind(s.id).run();
  } else {
    await db.prepare("UPDATE clan_members SET status = 'removed', is_admin = 0, claim_hash = NULL, updated_at = ? WHERE id = ?").bind(now(), s.id).run();
  }
  await audit(db, user.id, 'clan.remove', { clan: clan.id, spot: s.id });
}

// ---------- the member's side ----------
export interface MyInvite { spotId: string; clan: Clan; roles: string[]; invitedBy: string | null }

/** Pending invitations for this user. Private to them. */
export async function myInvites(db: D1Database, userId: string): Promise<MyInvite[]> {
  const { results } = await db.prepare(`SELECT c.id AS spot_id, c.roles, ip.display_name AS inviter, p.id, p.handle, p.display_name, p.bio, p.place_id, p.photo_key, p.status, p.owner_user_id, d.group_type, d.is_sample
    FROM clan_members c JOIN profiles p ON p.id = c.clan_id JOIN clan_details d ON d.profile_id = p.id
    LEFT JOIN profiles ip ON ip.owner_user_id = c.invited_by AND ip.kind = 'musician'
    WHERE c.user_id = ? AND c.status = 'invited' ORDER BY c.created_at DESC`).bind(userId).all<ClanRow & { spot_id: string; roles: string; inviter: string | null }>();
  return results.map((r) => ({ spotId: r.spot_id, clan: clanView(r), roles: parse<string[]>(r.roles, []), invitedBy: r.inviter }));
}

export interface Membership { clan: Clan; roles: string[]; isAdmin: boolean }

/** Clans a member is active in. Public when the Clan is published (shown on their profile). */
export async function membershipsOf(db: D1Database, userId: string, publicOnly = true): Promise<Membership[]> {
  const { results } = await db.prepare(`SELECT c.roles, c.is_admin, p.id, p.handle, p.display_name, p.bio, p.place_id, p.photo_key, p.status, p.owner_user_id, d.group_type, d.is_sample
    FROM clan_members c JOIN profiles p ON p.id = c.clan_id JOIN clan_details d ON d.profile_id = p.id
    WHERE c.user_id = ? AND c.status = 'active' ${publicOnly ? "AND p.status = 'published'" : ''} ORDER BY c.created_at`).bind(userId).all<ClanRow & { roles: string; is_admin: number }>();
  return results.map((r) => ({ clan: clanView(r), roles: parse<string[]>(r.roles, []), isAdmin: !!r.is_admin || r.owner_user_id === userId }));
}

/** Accept or decline an invitation addressed to this user. */
export async function respondInvite(env: Env, user: SessionUser, spotId: unknown, action: unknown) {
  const db = env.DB;
  if (action !== 'accept' && action !== 'decline') throw new HttpError(400, 'Invalid request.');
  const s = await db.prepare("SELECT id, clan_id FROM clan_members WHERE id = ? AND user_id = ? AND status = 'invited'").bind(str(spotId, 40), user.id)
    .first<{ id: string; clan_id: string }>();
  if (!s) throw new HttpError(404, 'That invitation isn’t open anymore.');
  const t = now();
  await db.prepare('UPDATE clan_members SET status = ?, responded_at = ?, updated_at = ? WHERE id = ?').bind(action === 'accept' ? 'active' : 'declined', t, t, s.id).run();
  await audit(db, user.id, action === 'accept' ? 'clan.accept' : 'clan.decline', { clan: s.clan_id, spot: s.id });
  const clan = await getClan(db, s.clan_id);
  return { href: clan?.href ?? '/clans/mine' };
}

/** Leave a Clan. The member's own profile and works are untouched. */
export async function leaveClan(env: Env, user: SessionUser, clanId: unknown) {
  const db = env.DB;
  const clan = await getClan(db, str(clanId, 40));
  if (!clan) throw new HttpError(404, 'That Clan doesn’t exist.');
  if (clan.ownerUserId === user.id) throw new HttpError(400, 'You own this Clan, so you can’t leave it yet. Owners can’t hand a Clan over in this version.');
  const r = await db.prepare("UPDATE clan_members SET status = 'left', is_admin = 0, updated_at = ? WHERE clan_id = ? AND user_id = ? AND status = 'active' RETURNING id")
    .bind(now(), clan.id, user.id).first<{ id: string }>();
  if (!r) throw new HttpError(404, 'You’re not on this roster.');
  await audit(db, user.id, 'clan.leave', { clan: clan.id });
}

// ---------- invite links ----------
export interface ClaimView { spotId: string; clan: Clan; name: string; roles: string[] }

export async function readClaim(db: D1Database, token: string): Promise<ClaimView | null> {
  if (!token || token.length > 64) return null;
  const r = await db.prepare("SELECT id, clan_id, display_name, roles FROM clan_members WHERE claim_hash = ? AND status = 'open'").bind(await sha256(token))
    .first<{ id: string; clan_id: string; display_name: string; roles: string }>();
  if (!r) return null;
  const clan = await getClan(db, r.clan_id);
  return clan ? { spotId: r.id, clan, name: r.display_name, roles: parse<string[]>(r.roles, []) } : null;
}

/** The person with the link takes the spot (accept) or turns it down (decline). One use. */
export async function claimSpot(env: Env, user: SessionUser, token: unknown, action: unknown) {
  const db = env.DB;
  if (action !== 'accept' && action !== 'decline') throw new HttpError(400, 'Invalid request.');
  await limit(db, `clan-claim:${user.id}`, 30, 3_600_000);
  const c = await readClaim(db, str(token, 64));
  if (!c) throw new HttpError(404, 'This invite link has already been used or was replaced. Ask the admin for a new one.');
  const t = now();
  if (action === 'decline') {
    await db.prepare("UPDATE clan_members SET status = 'declined', claim_hash = NULL, responded_at = ?, updated_at = ? WHERE id = ? AND status = 'open'").bind(t, t, c.spotId).run();
    return { href: '/clans/mine' };
  }
  const live = await db.prepare("SELECT status FROM clan_members WHERE clan_id = ? AND user_id = ? AND status IN ('invited', 'active')").bind(c.clan.id, user.id).first<{ status: string }>();
  if (live?.status === 'active') throw new HttpError(400, `You’re already on the ${c.clan.name} roster.`);
  const stmts = [];
  // An invitation they already had for this Clan is folded into the spot they're claiming.
  if (live) stmts.push(db.prepare("DELETE FROM clan_members WHERE clan_id = ? AND user_id = ? AND status = 'invited'").bind(c.clan.id, user.id));
  stmts.push(db.prepare("UPDATE clan_members SET user_id = ?, status = 'active', claim_hash = NULL, responded_at = ?, updated_at = ? WHERE id = ? AND status = 'open'").bind(user.id, t, t, c.spotId));
  await db.batch(stmts);
  await audit(db, user.id, 'clan.claim', { clan: c.clan.id, spot: c.spotId });
  return { href: c.clan.href };
}

// ---------- works ----------
export interface ClanWork { id: string; title: string; kind: string; releaseDate: string | null; released: boolean; cover: string | null; artist: string }

const WORK_COLS = `r.id, r.title, r.kind, r.release_date, r.released, r.cover_key,
  (SELECT group_concat(c.name, ', ') FROM release_credits c WHERE c.release_id = r.id AND c.role = 'primary-artist' AND c.track_id IS NULL AND c.status IN ('confirmed', 'unlinked', 'pending')) AS artist`;
type WorkRow = { id: string; title: string; kind: string; release_date: string | null; released: number; cover_key: string | null; artist: string | null };
const workView = (r: WorkRow): ClanWork => ({ id: r.id, title: r.title, kind: r.kind, releaseDate: r.release_date, released: !!r.released, cover: mediaUrl(r.cover_key), artist: r.artist ?? '' });

/** Linked Works that are still published. */
export async function clanWorks(db: D1Database, clanId: string): Promise<ClanWork[]> {
  const { results } = await db.prepare(`SELECT ${WORK_COLS} FROM clan_works w JOIN releases r ON r.id = w.release_id
    WHERE w.clan_id = ? AND r.status = 'published' ORDER BY w.sort, w.created_at`).bind(clanId).all<WorkRow>();
  return results.map(workView);
}

const ELIGIBLE = `r.status = 'published' AND (
  r.owner_user_id IN (SELECT user_id FROM clan_members WHERE clan_id = ?1 AND status = 'active' AND user_id IS NOT NULL)
  OR EXISTS (SELECT 1 FROM release_credits rc WHERE rc.release_id = r.id AND rc.status = 'confirmed'
    AND rc.user_id IN (SELECT user_id FROM clan_members WHERE clan_id = ?1 AND status = 'active' AND user_id IS NOT NULL)))`;

/** Works an admin can add: published, by or crediting an active member, not linked yet. */
export async function eligibleWorks(db: D1Database, clanId: string): Promise<ClanWork[]> {
  const { results } = await db.prepare(`SELECT ${WORK_COLS} FROM releases r WHERE ${ELIGIBLE}
    AND NOT EXISTS (SELECT 1 FROM clan_works w WHERE w.clan_id = ?1 AND w.release_id = r.id)
    ORDER BY coalesce(r.release_date, '') DESC LIMIT 100`).bind(clanId).all<WorkRow>();
  return results.map(workView);
}

export async function linkWork(env: Env, user: SessionUser, clanId: unknown, releaseId: unknown) {
  const db = env.DB;
  const clan = await adminClan(db, user, clanId);
  const rid = str(releaseId, 40);
  const ok = await db.prepare(`SELECT 1 AS ok FROM releases r WHERE r.id = ?2 AND ${ELIGIBLE}`).bind(clan.id, rid).first();
  if (!ok) throw new HttpError(400, 'Only published Works by members on the roster can be added.');
  const n = await db.prepare('SELECT COUNT(*) AS n FROM clan_works WHERE clan_id = ?').bind(clan.id).first<{ n: number }>();
  if ((n?.n ?? 0) >= MAX_WORKS) throw new HttpError(400, `A Clan page shows up to ${MAX_WORKS} Works.`);
  await db.prepare('INSERT OR IGNORE INTO clan_works (clan_id, release_id, sort, added_by, created_at) VALUES (?, ?, ?, ?, ?)').bind(clan.id, rid, n?.n ?? 0, user.id, now()).run();
}

export async function unlinkWork(env: Env, user: SessionUser, clanId: unknown, releaseId: unknown) {
  const clan = await adminClan(env.DB, user, clanId);
  await env.DB.prepare('DELETE FROM clan_works WHERE clan_id = ? AND release_id = ?').bind(clan.id, str(releaseId, 40)).run();
}

/** Published Clans that feature a Work, for the release page ("From …"). */
export async function clansForWork(db: D1Database, releaseId: string) {
  const { results } = await db.prepare(`SELECT p.handle, p.display_name, d.group_type FROM clan_works w
    JOIN profiles p ON p.id = w.clan_id JOIN clan_details d ON d.profile_id = p.id WHERE w.release_id = ? AND p.status = 'published' LIMIT 6`)
    .bind(releaseId).all<{ handle: string; display_name: string; group_type: GroupType }>();
  return results.map((r) => ({ name: r.display_name, href: `/c/${r.handle}`, typeLabel: GROUP_TYPES[r.group_type]?.label ?? 'Clan' }));
}
