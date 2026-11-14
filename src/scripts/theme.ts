/**
 * Theme preference: 'system' | 'light' | 'dark', saved in this browser.
 * The inline script in BaseLayout applies it before first paint; this module keeps it
 * in sync afterwards and tells the map and globe (event 'opus:theme') when it changes.
 */
export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const KEY = 'opus.theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');
const COLORS: Record<Theme, string> = { light: '#f2efea', dark: '#141416' };

export function getPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* storage blocked: follow the device */ }
  return 'system';
}

export const resolve = (p: ThemePref): Theme => (p === 'system' ? (media().matches ? 'dark' : 'light') : p);

/** The theme currently on the page. */
export const currentTheme = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

function apply(p: ThemePref) {
  const root = document.documentElement;
  const t = resolve(p);
  const changed = root.dataset.theme !== t;
  root.dataset.theme = t;
  root.dataset.themePref = p;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[t]);
  document.querySelectorAll<HTMLElement>('[data-theme-value]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeValue === p)));
  if (changed) window.dispatchEvent(new CustomEvent<Theme>('opus:theme', { detail: t }));
}

export function setPref(p: ThemePref) {
  try { if (p === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch { /* not saved; still applied */ }
  apply(p);
}

let started = false;
export function initThemeSwitches() {
  if (!started) {
    started = true;
    media().addEventListener('change', () => { if (getPref() === 'system') apply('system'); });
    // Another tab changed it.
    window.addEventListener('storage', (e) => { if (e.key === KEY) apply(getPref()); });
  }
  document.querySelectorAll<HTMLElement>('[data-theme-switch]:not([data-ready])').forEach((sw) => {
    sw.dataset.ready = '';
    const openBtn = sw.querySelector<HTMLButtonElement>('[data-theme-open]');
    const menu = sw.querySelector<HTMLElement>('[data-theme-menu]');
    const show = (on: boolean) => { if (!openBtn || !menu) return; menu.hidden = !on; openBtn.setAttribute('aria-expanded', String(on)); };
    openBtn?.addEventListener('click', (e) => { e.stopPropagation(); show(!!menu?.hidden); if (menu && !menu.hidden) menu.querySelector<HTMLElement>('[aria-checked="true"]')?.focus(); });
    document.addEventListener('click', (e) => { if (menu && !menu.hidden && !sw.contains(e.target as Node)) show(false); });
    sw.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu && !menu.hidden) { show(false); openBtn?.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const items = [...sw.querySelectorAll<HTMLElement>('[data-theme-value]')];
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (i < 0) return;
        e.preventDefault();
        items.at((i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1)) % items.length)?.focus();
      }
    });
    sw.querySelectorAll<HTMLElement>('[data-theme-value]').forEach((b) => b.addEventListener('click', () => {
      setPref(b.dataset.themeValue as ThemePref);
      show(false);
    }));
  });
  apply(getPref());
}
