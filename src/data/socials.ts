/**
 * The profile links a member can add: one list for the edit form, the checks on save, and the icons
 * on the profile and link-in-bio page. Stored in the existing `profiles.links` JSON, so adding a
 * service here needs no migration. Keys are saved; keep them stable.
 *
 * Icons are Opus's own simple line drawings (24 x 24, stroke = currentColor), not the services' logos.
 */
export interface Social {
  key: string; label: string;
  /** Hosts a link must be on. null = any https site. */
  hosts: string[] | null;
  placeholder: string;
  /** Turns a bare @handle into a link. Absent: the member must paste a link. */
  fromHandle?: (h: string) => string;
  /** SVG path data, drawn with a stroke. */
  icon: string;
  /** Parts of the icon that are filled instead of stroked. */
  fill?: string;
}

export const SOCIALS = [
  { key: 'instagram', label: 'Instagram', hosts: ['instagram.com'], placeholder: '@you or instagram.com/you', fromHandle: (h) => `https://instagram.com/${h}`,
    icon: 'M7.5 3.5h9a4 4 0 0 1 4 4v9a4 4 0 0 1-4 4h-9a4 4 0 0 1-4-4v-9a4 4 0 0 1 4-4ZM12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z', fill: 'M17 6.1a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Z' },
  { key: 'tiktok', label: 'TikTok', hosts: ['tiktok.com'], placeholder: '@you or tiktok.com/@you', fromHandle: (h) => `https://www.tiktok.com/@${h}`,
    icon: 'M13.5 3.5v11.200a3.8 3.8 0 1 1-3.8-3.800M13.5 3.5c.300 2.7 2 4.5 4.8 4.8' },
  { key: 'facebook', label: 'Facebook', hosts: ['facebook.com', 'fb.com', 'fb.me'], placeholder: 'facebook.com/you', fromHandle: (h) => `https://facebook.com/${h}`,
    icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM13 21v-8.500M10.3 12.500h5.200M13 12.500v-2.300c0-1.3.800-2 2.1-2h.700' },
  { key: 'x', label: 'X', hosts: ['x.com', 'twitter.com'], placeholder: '@you or x.com/you', fromHandle: (h) => `https://x.com/${h}`,
    icon: 'M5 4.5 19 19.500M19 4.5 5 19.5' },
  { key: 'threads', label: 'Threads', hosts: ['threads.net', 'threads.com'], placeholder: '@you or threads.net/@you', fromHandle: (h) => `https://www.threads.net/@${h}`,
    icon: 'M16.5 8.500c-.800-2.3-2.3-3.5-4.6-3.500C8.7 5 7 7.6 7 12s1.7 7 4.9 7c2.7 0 4.6-1.5 4.6-3.7 0-2-1.6-3.2-4.1-3.2-1.9 0-3 .800-3 2 0 1.1.900 1.8 2.2 1.8 2 0 3.1-1.5 3.1-4.2' },
  { key: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'youtu.be', 'music.youtube.com'], placeholder: 'youtube.com/@you', fromHandle: (h) => `https://www.youtube.com/@${h}`,
    icon: 'M5.5 6h13A2.5 2.5 0 0 1 21 8.500v7a2.5 2.5 0 0 1-2.5 2.500h-13A2.5 2.5 0 0 1 3 15.500v-7A2.5 2.5 0 0 1 5.5 6Z', fill: 'M10.2 9.300v5.400l4.8-2.700z' },
  { key: 'twitch', label: 'Twitch', hosts: ['twitch.tv'], placeholder: 'twitch.tv/you', fromHandle: (h) => `https://www.twitch.tv/${h}`,
    icon: 'M5 4h14v10l-3.5 3.500H12L9 20.500v-3H5ZM11 8.500v4M15 8.500v4' },
  { key: 'spotify', label: 'Spotify', hosts: ['open.spotify.com', 'spotify.com', 'spotify.link'], placeholder: 'open.spotify.com/artist/…',
    icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM7.3 9.700c3.2-1 6.7-.700 9.6.900M7.9 12.600c2.7-.800 5.5-.500 7.8.800M8.6 15.300c2-.500 4-.300 5.8.600' },
  { key: 'appleMusic', label: 'Apple Music', hosts: ['music.apple.com'], placeholder: 'music.apple.com/…',
    icon: 'M9.5 17.500V6.800l9-2v10.700M9.5 17.500a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0ZM18.5 15.500a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0Z' },
  { key: 'soundcloud', label: 'SoundCloud', hosts: ['soundcloud.com', 'on.soundcloud.com'], placeholder: 'soundcloud.com/you', fromHandle: (h) => `https://soundcloud.com/${h}`,
    icon: 'M3 16.500v-3M5.7 16.500v-5M8.4 16.500V9.700M11.1 16.500V8.500c2.9-1.5 6.2.200 6.7 3.300a2.5 2.5 0 1 1 .700 4.700h-7.4' },
  { key: 'bandcamp', label: 'Bandcamp', hosts: ['bandcamp.com'], placeholder: 'you.bandcamp.com', fromHandle: (h) => `https://${h}.bandcamp.com`,
    icon: 'M8.5 7H21l-5.5 10H3Z' },
  { key: 'audiomack', label: 'Audiomack', hosts: ['audiomack.com'], placeholder: 'audiomack.com/you', fromHandle: (h) => `https://audiomack.com/${h}`,
    icon: 'M3 13.500h2l1.8-4 2.4 8 2.6-12 2.4 10 1.7-5 1.3 3H21' },
  { key: 'website', label: 'Website', hosts: null, placeholder: 'yourname.com',
    icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9S14.5 18.4 12 21c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3Z' },
] as const satisfies readonly Social[];

export type SocialKey = (typeof SOCIALS)[number]['key'];
export const SOCIAL_KEYS = SOCIALS.map((s) => s.key) as SocialKey[];
export const SOCIAL_BY_KEY = new Map<string, Social>(SOCIALS.map((s) => [s.key, s]));
export const socialLabel = (key: string) => SOCIAL_BY_KEY.get(key)?.label ?? key;

/**
 * What the member typed, as something to check as a link: a bare @handle (no dot, slash or space)
 * becomes that service's address where the service supports it; anything else is left as typed.
 */
export function expandHandle(key: string, value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const v = value.trim();
  const s = SOCIAL_BY_KEY.get(key);
  if (!v || !s?.fromHandle || !/^@?[A-Za-z0-9._-]{1,60}$/.test(v) || (v.includes('.') && !v.startsWith('@') && /\.[a-z]{2,}$/i.test(v))) return value;
  return s.fromHandle(v.replace(/^@/, ''));
}

/** The member's saved links in the house order, ready to draw. */
export function socialLinks(links: Record<string, string | undefined>): { key: string; label: string; url: string; icon: string; fill?: string }[] {
  return (SOCIALS as readonly Social[]).filter((s) => !!links[s.key]).map((s) => ({ key: s.key, label: s.label, url: links[s.key]!, icon: s.icon, fill: s.fill }));
}

/**
 * How a service's address wraps a username, for the "type your username" boxes: `pre` + username + `suf` is the link
 * (without https://). null when the service has no username address (Spotify, Apple Music, a website).
 */
export function handleShape(key: string): { pre: string; suf: string } | null {
  const s = SOCIAL_BY_KEY.get(key);
  if (!s?.fromHandle) return null;
  const [pre, suf] = s.fromHandle('\u0000').replace(/^https:\/\//, '').split('\u0000');
  return { pre: pre ?? '', suf: suf ?? '' };
}

/** The username inside a saved link, when the link is that service's plain username address. Otherwise null. */
export function handleOf(key: string, url: string | undefined): string | null {
  const shape = handleShape(key);
  if (!shape || !url) return null;
  const bare = (v: string) => v.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  const u = bare(url.trim()).replace(/[?#].*$/, '').replace(/\/+$/, '');
  const pre = bare(shape.pre), suf = shape.suf.replace(/\/+$/, '');
  if (!u.toLowerCase().startsWith(pre.toLowerCase()) || !u.toLowerCase().endsWith(suf.toLowerCase())) return null;
  const h = u.slice(pre.length, u.length - suf.length);
  return /^[A-Za-z0-9._-]{1,60}$/.test(h) ? h : null;
}
