/**
 * Profile previews for World: everything the expanded card shows, for one listing.
 * The listing itself (name, location, verification) comes from the same privacy-enforcing
 * queries as /api/world, so a preview can never reveal more than the directory does.
 * Never selects private fields (studio address, email, owner).
 */
import type { Listing } from '@/types/directory';
import { profileReleases } from './releases';
import { RELEASE_KINDS } from '@/data/music';
import { LINK_KEYS, listGallery, mediaUrl, type Credit, type PortfolioItem } from './profiles';
import { publicMusicians, publicStudios } from './directory';
import { money } from '@/lib/booking-time';

export interface PreviewLink { key: string; label: string; url: string }
export interface PreviewService { name: string; detail: string; price: string; description: string }
export interface PreviewAction { label: string; href?: string; disabledReason?: string }

export interface ProfileDetail {
  bio: string;
  cover?: string;
  /** Image URLs. "art:<seed>" means a generated placeholder (sample listings only). */
  gallery: string[];
  links: PreviewLink[];
  /** Featured music: portfolio items, then streaming links. */
  featured: { title: string; url: string; platform: string }[];
  credits: Credit[];
  /** Published releases from Opus Music: ones they own or hold a confirmed credit on. */
  releases: { title: string; meta: string; url: string; upcoming: boolean }[];
  achievements: string[];
  services: PreviewService[];
  equipment: string[];
  projects: string[];
  /** A button is only live when it does something. Otherwise it carries the honest reason. */
  actions: { primary: PreviewAction; profile: PreviewAction };
  isSample?: boolean;
}

const LINK_LABEL: Record<string, string> = { spotify: 'Spotify', appleMusic: 'Apple Music', soundcloud: 'SoundCloud', youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', website: 'Website' };
const STREAMING = new Set(['spotify', 'appleMusic', 'soundcloud', 'youtube']);
const parse = <T,>(s: string | null | undefined, f: T): T => { try { return s ? (JSON.parse(s) as T) : f; } catch { return f; } };
/** Only http(s) links leave the server. They were validated on save; this is a second guard. */
const safeUrl = (u: unknown) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : '');
const platformOf = (url: string) => {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    if (h.includes('spotify')) return 'Spotify';
    if (h.includes('apple')) return 'Apple Music';
    if (h.includes('soundcloud')) return 'SoundCloud';
    if (h.includes('youtu')) return 'YouTube';
    if (h.includes('bandcamp')) return 'Bandcamp';
    return h;
  } catch { return ''; }
};

interface DetailRow { owner_user_id: string; bio: string; cover_key: string | null; links: string; credits: string; achievements: string; portfolio: string }

async function realDetail(db: D1Database, l: Listing): Promise<ProfileDetail | null> {
  const r = await db.prepare("SELECT owner_user_id, bio, cover_key, links, credits, achievements, portfolio FROM profiles WHERE id = ? AND status = 'published'").bind(l.id).first<DetailRow>();
  if (!r) return null;
  const rawLinks = parse<Record<string, unknown>>(r.links, {});
  const links: PreviewLink[] = LINK_KEYS.map((k) => ({ key: k, label: LINK_LABEL[k]!, url: safeUrl(rawLinks[k]) })).filter((x) => x.url);
  const portfolio = parse<PortfolioItem[]>(r.portfolio, []).map((p) => ({ title: String(p.title ?? '').slice(0, 120), url: safeUrl(p.url) })).filter((p) => p.url);
  const featured = [
    ...portfolio.map((p) => ({ title: p.title || platformOf(p.url), url: p.url, platform: platformOf(p.url) })),
    ...links.filter((x) => STREAMING.has(x.key)).map((x) => ({ title: 'Listen on ' + x.label, url: x.url, platform: x.label })),
  ].slice(0, 4);
  const credits = parse<Credit[]>(r.credits, []).slice(0, 5).map((c) => ({ ...c, url: safeUrl(c.url) }));
  const base = {
    bio: r.bio, cover: mediaUrl(r.cover_key) ?? undefined, gallery: [] as string[], links, featured, credits,
    releases: l.kind === 'musician'
      ? (await profileReleases(db, r.owner_user_id).catch(() => [])).slice(0, 6).map((x) => ({
          title: x.title, url: '/r/' + x.id, upcoming: !x.released,
          meta: [x.artist && !x.own ? x.artist : '', x.roles.join(', '), RELEASE_KINDS[x.kind], x.released ? x.releaseDate?.slice(0, 4) ?? '' : 'Coming'].filter(Boolean).join(' · '),
        }))
      : [],
    achievements: parse<string[]>(r.achievements, []).filter((a) => typeof a === 'string').slice(0, 4),
    services: [] as PreviewService[], equipment: [] as string[], projects: [] as string[],
  };
  if (l.kind === 'musician') {
    return {
      ...base,
      actions: {
        primary: l.openToCollab ? { label: 'Connect', href: l.href + '?connect=1' } : { label: 'Connect', disabledReason: 'Not taking new collaborations right now' },
        profile: { label: 'View full profile', href: l.href },
      },
    };
  }
  // Studio: services with prices, gallery and equipment. Requests are made on the studio page.
  const [svc, gallery] = await Promise.all([
    db.prepare('SELECT name, description, mode, duration_min, price_cents, currency FROM services WHERE profile_id = ? AND active = 1 ORDER BY sort, created_at LIMIT 6')
      .bind(l.id).all<{ name: string; description: string; mode: string; duration_min: number; price_cents: number; currency: string }>(),
    listGallery(db, l.id),
  ]);
  const hours = (m: number) => (m % 60 ? (m / 60).toFixed(1) + ' hr' : m / 60 + (m === 60 ? ' hr' : ' hrs'));
  return {
    ...base,
    gallery: gallery.map((g) => g.url),
    equipment: l.kind === 'studio' ? l.equipment : [],
    services: svc.results.map((s) => ({ name: s.name, detail: s.mode === 'remote' ? 'Remote' : hours(s.duration_min), price: money(s.price_cents, s.currency), description: s.description.slice(0, 200) })),
    actions: {
      primary: { label: 'Request session', href: '/studios/' + l.slug + '?from=world#book' },
      profile: { label: 'View full profile', href: '/studios/' + l.slug + '?from=world' },
    },
  };
}

/** Sample previews: clearly labeled placeholder content so the design can be reviewed. Nothing here is real. */
function sampleDetail(l: Listing): ProfileDetail {
  const bio = 'Sample listing for the preview build. This is not a real member, and every detail shown here is placeholder content.';
  const off = 'Sample listing';
  const n = l.id.replace(/\D/g, '');
  const base = {
    bio, links: [], featured: [], gallery: [] as string[], services: [] as PreviewService[], equipment: [] as string[], projects: [] as string[],
    achievements: [] as string[], credits: [] as Credit[], releases: [] as ProfileDetail['releases'], isSample: true,
  };
  if (l.kind === 'musician') {
    return {
      ...base,
      credits: [
        { title: 'Sample Track ' + n + 'A', role: 'Sample credit', artist: 'Sample Artist', year: '2025', url: '' },
        { title: 'Sample Track ' + n + 'B', role: 'Sample credit', artist: 'Sample Artist', year: '2024', url: '' },
      ],
      achievements: l.highlight ? [l.highlight] : [],
      actions: { primary: { label: 'Connect', disabledReason: off }, profile: { label: 'View full profile', disabledReason: off } },
    };
  }
  if (l.kind === 'studio') {
    return {
      ...base,
      gallery: ['a', 'b', 'c', 'd'].map((x) => 'art:' + l.id + '-' + x),
      equipment: l.equipment,
      services: l.services.map((s) => ({ name: s, detail: 'Sample service', price: l.hourlyRate ? '$' + l.hourlyRate.amount + '/hr' : '', description: '' })),
      actions: { primary: { label: 'Request session', disabledReason: off }, profile: { label: 'View full profile', disabledReason: off } },
    };
  }
  return {
    ...base,
    projects: ['Sample project A', 'Sample project B'],
    actions: { primary: { label: 'Contact', disabledReason: off }, profile: { label: 'View full profile', disabledReason: off } },
  };
}

export async function worldDetail(env: Env, id: string): Promise<{ listing: Listing; detail: ProfileDetail } | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  if (/^[mso]-\d+$/.test(id)) {
    // Sample ids only resolve where sample data is switched on, and never in production.
    if (env.SHOW_SAMPLE_DATA !== '1' || env.SITE_ENV === 'production') return null;
    const { SAMPLE_LISTINGS } = await import('@/data/sample-world');
    const l = SAMPLE_LISTINGS.find((x) => x.id === id);
    return l ? { listing: l, detail: sampleDetail(l) } : null;
  }
  const [m, s] = await Promise.all([publicMusicians(env.DB, id), publicStudios(env.DB, id)]);
  const l: Listing | undefined = m[0] ?? s[0];
  if (!l) return null;
  const detail = await realDetail(env.DB, l);
  return detail ? { listing: l, detail } : null;
}
