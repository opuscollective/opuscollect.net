/**
 * Public portfolio (opuscollect.net/<username>): everything the page shows, built from the same
 * profile row World uses. Nothing here is stored separately:
 * - Featured releases are read live from Opus Music (published, owned or confirmed-credit only).
 * - Social links come from profiles.links, custom links from profiles.portfolio.
 * - Location honors the member's visibility choice through visibleLabel().
 */
import { CITIES, citySlug } from '@/data/cities';
import { RELEASE_KINDS } from '@/data/music';
import { PLACE_BY_ID, visibleLabel } from '@/data/places';
import { SPECIALTIES, allSpecialties } from '@/data/specialties';
import { getPublicProfile, mediaUrl, WORK_KINDS, type ProfileData, type LinkKey } from './profiles';
import { profileReleases, type ProfileReleaseItem } from './releases';
import { resolveRetired } from './usernames';

export interface FeaturedCard {
  key: string;
  title: string;
  /** Small spaced caption under the art, ballerbogo.com style: "AMAZING — 10.16". */
  caption: string;
  /** Quiet second line: "Single · Bogo" or "Music video". */
  meta: string;
  href: string | null;
  external: boolean;
  image: string | null;
  upcoming: boolean;
}

export interface SocialLink { key: LinkKey; label: string; url: string; /** 'manual' until accounts can be connected and verified. */ source: 'manual' }
export interface CustomLink { title: string; url: string; host: string }
export interface CreditLine { title: string; detail: string; href: string | null; source: 'confirmed' | 'self' }

/** Order icons appear in: listening first, then social, then website. */
export const SOCIAL_ORDER: LinkKey[] = ['spotify', 'appleMusic', 'youtube', 'soundcloud', 'instagram', 'tiktok', 'website'];
export const SOCIAL_LABEL: Record<LinkKey, string> = { spotify: 'Spotify', appleMusic: 'Apple Music', soundcloud: 'SoundCloud', youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', website: 'Website' };

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** "10.16" for dates inside the last year or ahead, otherwise the year. */
export function shortDate(d: string | null, today = new Date()): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
  const t = Date.parse(`${d}T12:00:00Z`);
  const recent = t > today.getTime() - 330 * 86_400_000;
  return recent ? `${d.slice(5, 7)}.${d.slice(8, 10)}` : d.slice(0, 4);
}

function releaseCard(r: ProfileReleaseItem): FeaturedCard {
  const date = shortDate(r.releaseDate);
  const upcoming = !r.released && !!r.releaseDate && Date.parse(`${r.releaseDate}T23:59:59Z`) > Date.now();
  return {
    key: `r-${r.id}`,
    title: r.title,
    caption: [r.title.toUpperCase(), upcoming && date ? `OUT ${date}` : date].filter(Boolean).join(' — '),
    meta: [RELEASE_KINDS[r.kind] ?? r.kind, !r.own && r.artist ? r.artist : '', !r.own && r.roles.length ? r.roles.join(', ') : ''].filter(Boolean).join(' · '),
    href: `/r/${r.id}`, external: false, image: mediaUrl(r.coverKey), upcoming,
  };
}

export interface Portfolio {
  profile: ProfileData;
  isOwner: boolean;
  ownerId: string;
  roles: string[];
  where: string;
  /** Short form for the hero and footer: "Birmingham, AL" or "London, United Kingdom". */
  whereShort: string;
  worldHref: string | null;
  hero: string | null;
  photo: string | null;
  featured: FeaturedCard[];
  socials: SocialLink[];
  links: CustomLink[];
  credits: CreditLine[];
}

export type PortfolioResult = { redirect: string } | { portfolio: Portfolio } | null;

/** Builds a public portfolio, or tells the page where to redirect (old usernames, wrong case, studios). */
export async function loadPortfolio(db: D1Database, handleParam: string, viewerId: string | null): Promise<PortfolioResult> {
  const handle = handleParam.toLowerCase();
  if (!/^[a-z0-9-]{1,40}$/.test(handle)) return null;
  const found = await getPublicProfile(db, handle, viewerId);
  if (!found) {
    // A studio shares the namespace but keeps its page; an old username follows the member.
    const studio = await db.prepare("SELECT handle FROM profiles WHERE handle = ? AND kind = 'studio' AND status = 'published'").bind(handle).first<{ handle: string }>();
    if (studio) return { redirect: `/studios/${studio.handle}` };
    const moved = await resolveRetired(db, handle);
    if (moved) return { redirect: moved.kind === 'studio' ? `/studios/${moved.handle}` : `/${moved.handle}` };
    return null;
  }
  const { profile: p, isOwner, ownerId } = found;
  if (p.handle !== handleParam) return { redirect: `/${p.handle}` };

  const roles = p.primarySpecialty ? allSpecialties(p.primarySpecialty, p.specialties).map((s) => SPECIALTIES[s].label) : [];
  const where = visibleLabel(p.placeId, p.locationVisibility);
  const parts = where.split(', ');
  const whereShort = parts.length > 2 ? parts.slice(0, 2).join(', ') : where;
  const metro = p.placeId ? PLACE_BY_ID.get(PLACE_BY_ID.get(p.placeId)?.metroId ?? '') : undefined;
  const worldCity = p.locationVisibility === 'city' || p.locationVisibility === 'metro' ? metro?.name : undefined;
  const worldHref = worldCity ? (CITIES.some((c) => c.name === worldCity) ? `/world/${citySlug(worldCity)}` : `/world?city=${encodeURIComponent(worldCity)}`) : null;

  const record = await profileReleases(db, ownerId);
  const byId = new Map(record.map((r) => [r.id, r]));
  let featured: FeaturedCard[];
  if (p.featured == null) {
    featured = record.slice(0, 8).map(releaseCard);
  } else {
    featured = p.featured.flatMap((f): FeaturedCard[] => {
      if (f.t === 'release') { const r = byId.get(f.id); return r ? [releaseCard(r)] : []; }
      return [{
        key: `w-${f.id}`, title: f.title, caption: f.title.toUpperCase(), meta: WORK_KINDS[f.kind] ?? 'Work',
        href: f.url || null, external: !!f.url, image: mediaUrl(f.imageKey), upcoming: false,
      }];
    });
  }

  const shown = new Set(featured.map((f) => f.key));
  const credits: CreditLine[] = [
    // Confirmed on Opus: the release owner credited them and they accepted.
    ...record.filter((r) => !r.own && !shown.has(`r-${r.id}`)).map((r) => ({
      title: r.title, detail: [r.artist, r.roles.join(', '), r.releaseDate?.slice(0, 4)].filter(Boolean).join(' · '), href: `/r/${r.id}`, source: 'confirmed' as const,
    })),
    // Listed by the member themselves.
    ...p.credits.map((c) => ({ title: c.title, detail: [c.artist, c.role, c.year].filter(Boolean).join(' · '), href: c.url || null, source: 'self' as const })),
  ];

  const socials: SocialLink[] = SOCIAL_ORDER.flatMap((k) => (p.links[k] ? [{ key: k, label: SOCIAL_LABEL[k], url: p.links[k]!, source: 'manual' as const }] : []));
  const links: CustomLink[] = p.portfolio.filter((x) => !x.hidden && x.url).map((x) => ({ title: x.title || hostOf(x.url), url: x.url, host: hostOf(x.url) }));

  return {
    portfolio: {
      profile: p, isOwner, ownerId, roles, where, whereShort, worldHref,
      hero: mediaUrl(p.coverKey) ?? mediaUrl(p.photoKey), photo: mediaUrl(p.photoKey),
      featured, socials, links, credits,
    },
  };
}

/** One sentence for search results and link previews. Built only from what the member wrote. */
export function describe(pf: Portfolio): string {
  const p = pf.profile;
  const lead = [pf.roles[0], pf.where ? `in ${pf.where}` : ''].filter(Boolean).join(' ');
  const text = p.tagline || p.bio.split(/\n/)[0] || '';
  const s = [`${p.displayName}${lead ? `, ${lead}` : ''}.`, text].filter(Boolean).join(' ');
  return s.length > 158 ? s.slice(0, 157).replace(/\s+\S*$/, '') + '…' : s;
}
