/**
 * Page settings: how a member's public page is presented (tagline, featured work, link buttons, which sections show
 * and in what order). Stored in KV as `page:<profileId>` so it needs no database change.
 */
import { cleanUrl } from './profiles';

export const PAGE_SECTIONS: Record<string, string> = { works: 'Works', journey: 'Level and achievements', credits: 'Credits', about: 'About' };
/** Groups arrange their own sections. */
export const GROUP_SECTIONS: Record<string, string> = { members: 'Members', works: 'Works', events: 'Upcoming' };
export type PageSection = string;

export interface PageLink { label: string; url: string }
/** Essentials: the works a member puts first (up to MAX_ESSENTIALS), and a short line per work on what it is and means. */
export const MAX_ESSENTIALS = 6;
export const NOTE_MAX = 220;
export interface PageConfig { tagline: string; featured: string | null; links: PageLink[]; order: PageSection[]; hide: PageSection[]; essentials: string[]; notes: Record<string, string>;
  /** Look: keys from src/lib/page-style.ts. Empty = the default for the account. */
  accent: string; backdrop: string;
  /** The title worn under the name: 'level', 'founder' or 'a:<achievement id>'. Shown only while earned. */
  title: string;
  /** Achievements the member puts first in their showcase (ids, up to MAX_PINS). */
  pins: string[] }
export const MAX_PINS = 4;

export const DEFAULT_PAGE: PageConfig = { tagline: '', featured: null, links: [], order: ['works', 'journey', 'credits', 'about'], hide: [], essentials: [], notes: {}, accent: '', backdrop: '', title: '', pins: [] };

export function cleanPage(raw: unknown, sections: Record<string, string> = PAGE_SECTIONS): PageConfig {
  const keys = Object.keys(sections);
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const tagline = String(o.tagline ?? '').replace(/\s+/g, ' ').trim().slice(0, 90);
  const featured = typeof o.featured === 'string' && /^[\w-]{1,40}$/.test(o.featured) ? o.featured : null;
  const links: PageLink[] = [];
  for (const l of Array.isArray(o.links) ? o.links : []) {
    const r = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>;
    const url = cleanUrl(r.url, null);
    const label = String(r.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (url && label && links.length < 8) links.push({ label, url });
  }
  const order = [...new Set((Array.isArray(o.order) ? o.order : []).filter((k): k is string => typeof k === 'string' && keys.includes(k)))];
  for (const k of keys) if (!order.includes(k)) order.push(k);
  const hide = [...new Set((Array.isArray(o.hide) ? o.hide : []).filter((k): k is string => typeof k === 'string' && keys.includes(k)))];
  const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,40}$/.test(v);
  const essentials = [...new Set((Array.isArray(o.essentials) ? o.essentials : []).filter(id))].slice(0, MAX_ESSENTIALS);
  const notes: Record<string, string> = {};
  const rawNotes = (o.notes && typeof o.notes === 'object' ? o.notes : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(rawNotes)) {
    const t = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
    if (id(k) && t && Object.keys(notes).length < 60) notes[k] = t;
  }
  const key = (v: unknown) => (typeof v === 'string' && /^[a-z0-9:-]{1,40}$/.test(v) ? v : '');
  const pins = [...new Set((Array.isArray(o.pins) ? o.pins : []).map(key).filter(Boolean))].slice(0, MAX_PINS);
  return { tagline, featured, links, order, hide, essentials, notes, accent: key(o.accent), backdrop: key(o.backdrop), title: key(o.title), pins };
}

export async function getPageConfig(kv: KVNamespace | undefined, profileId: string, sections: Record<string, string> = PAGE_SECTIONS): Promise<PageConfig> {
  const fallback = cleanPage({}, sections);
  if (!kv) return fallback;
  try { return cleanPage(JSON.parse((await kv.get(`page:${profileId}`)) ?? '{}'), sections); } catch { return fallback; }
}

export async function savePageConfig(kv: KVNamespace, profileId: string, raw: unknown, sections: Record<string, string> = PAGE_SECTIONS) {
  const c = cleanPage(raw, sections);
  await kv.put(`page:${profileId}`, JSON.stringify(c));
  return c;
}
