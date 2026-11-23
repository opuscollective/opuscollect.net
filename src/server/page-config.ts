/**
 * Page settings: how a member's public page is presented (tagline, featured work, link buttons, which sections show
 * and in what order). Stored in KV as `page:<profileId>` so it needs no database change.
 */
import { cleanUrl } from './profiles';

export const PAGE_SECTIONS = { works: 'Works', credits: 'Credits', about: 'About' } as const;
export type PageSection = keyof typeof PAGE_SECTIONS;

export interface PageLink { label: string; url: string }
export interface PageConfig { tagline: string; featured: string | null; links: PageLink[]; order: PageSection[]; hide: PageSection[] }

export const DEFAULT_PAGE: PageConfig = { tagline: '', featured: null, links: [], order: ['works', 'credits', 'about'], hide: [] };
const keys = Object.keys(PAGE_SECTIONS) as PageSection[];

export function cleanPage(raw: unknown): PageConfig {
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
  const order = [...new Set((Array.isArray(o.order) ? o.order : []).filter((k): k is PageSection => keys.includes(k as PageSection)))];
  for (const k of keys) if (!order.includes(k)) order.push(k);
  const hide = [...new Set((Array.isArray(o.hide) ? o.hide : []).filter((k): k is PageSection => keys.includes(k as PageSection)))];
  return { tagline, featured, links, order, hide };
}

export async function getPageConfig(kv: KVNamespace | undefined, profileId: string): Promise<PageConfig> {
  if (!kv) return DEFAULT_PAGE;
  try { return cleanPage(JSON.parse((await kv.get(`page:${profileId}`)) ?? '{}')); } catch { return DEFAULT_PAGE; }
}

export async function savePageConfig(kv: KVNamespace, profileId: string, raw: unknown) {
  const c = cleanPage(raw);
  await kv.put(`page:${profileId}`, JSON.stringify(c));
  return c;
}
