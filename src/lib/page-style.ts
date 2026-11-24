/**
 * The look a member gives their page: an accent colour and a backdrop. Both come from a fixed Opus
 * palette so every page stays inside the design system. The same choice styles the profile and the
 * link-in-bio page. Keys are saved in page settings; keep them stable.
 */
export interface Accent { key: string; label: string; h: number; s: number; reserved?: 'founder' }

export const ACCENTS: readonly Accent[] = [
  { key: 'ice', label: 'Ice', h: 213, s: 62 },
  { key: 'periwinkle', label: 'Periwinkle', h: 228, s: 90 },
  { key: 'violet', label: 'Violet', h: 268, s: 70 },
  { key: 'rose', label: 'Rose', h: 338, s: 72 },
  { key: 'ember', label: 'Ember', h: 16, s: 82 },
  { key: 'sand', label: 'Sand', h: 36, s: 46 },
  { key: 'moss', label: 'Moss', h: 152, s: 34 },
  { key: 'teal', label: 'Teal', h: 186, s: 60 },
  { key: 'mono', label: 'Mono', h: 240, s: 0 },
  { key: 'gold', label: 'Founder gold', h: 42, s: 64, reserved: 'founder' },
];

export interface Backdrop { key: string; label: string; reserved?: 'founder' }

/** Backdrops are drawn in CSS (crisp at any size). A banner photo, when uploaded, sits on top of the banner. */
export const BACKDROPS: readonly Backdrop[] = [
  { key: 'aura', label: 'Aura' },
  { key: 'horizon', label: 'Horizon' },
  { key: 'waves', label: 'Waves' },
  { key: 'grid', label: 'Grid' },
  { key: 'spotlight', label: 'Spotlight' },
  { key: 'plain', label: 'Plain' },
  { key: 'laurel', label: 'Founder', reserved: 'founder' },
];

export const DEFAULT_ACCENT = 'ice';
export const DEFAULT_BACKDROP = 'aura';

const allowed = (reserved: string | undefined, distinction: string | null) => !reserved || reserved === distinction;

export const accentsFor = (distinction: string | null) => ACCENTS.filter((a) => allowed(a.reserved, distinction));
export const backdropsFor = (distinction: string | null) => BACKDROPS.filter((b) => allowed(b.reserved, distinction));

export interface PageStyle { accent: Accent; backdrop: string; css: string }

/**
 * Resolve saved keys to a style. Unknown or reserved keys fall back, so a saved choice can never
 * show a look the account isn't entitled to. A founder with no choice gets the founder look.
 */
export function pageStyle(accentKey: string | null | undefined, backdropKey: string | null | undefined, distinction: string | null = null): PageStyle {
  const founder = distinction === 'founder';
  const accent = accentsFor(distinction).find((a) => a.key === accentKey) ?? ACCENTS.find((a) => a.key === (founder ? 'gold' : DEFAULT_ACCENT))!;
  const backdrop = (backdropsFor(distinction).find((b) => b.key === backdropKey) ?? BACKDROPS.find((b) => b.key === (founder ? 'laurel' : DEFAULT_BACKDROP))!).key;
  return { accent, backdrop, css: `--pf-h:${accent.h};--pf-s:${accent.s}%` };
}
