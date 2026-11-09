/**
 * Every text colour in both themes must meet WCAG AA (4.5:1) on every surface it sits on.
 * Reads the values straight from src/styles/tokens.css, so a palette change can't slip below AA.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  assert.ok(start >= 0, `missing ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) out[m[1]] = m[2];
  return out;
}

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const themes = { light: block(':root {'), dark: block("[data-theme='dark'], .tone-dark {") };
const TEXT = ['text', 'text-2', 'text-3', 'accent', 'live', 'danger'];
const SURFACES = ['bg', 'surface', 'surface-sunken', 'surface-raised', 'surface-hover'];

for (const [name, t] of Object.entries(themes)) {
  test(`${name}: text tokens meet WCAG AA on every surface`, () => {
    for (const fg of TEXT) for (const bg of SURFACES) {
      assert.ok(t[fg] && t[bg], `${name} is missing --${fg} or --${bg}`);
      const r = ratio(t[fg], t[bg]);
      assert.ok(r >= 4.5, `${name}: --${fg} on --${bg} is ${r.toFixed(2)}:1`);
    }
  });
  test(`${name}: text on the accent fill meets AA`, () => {
    assert.ok(ratio(t['on-accent'], t.accent) >= 4.5);
  });
}

test('the no-JavaScript dark block matches the explicit dark theme', () => {
  const media = css.slice(css.indexOf(':root:not([data-theme])'));
  for (const [k, v] of Object.entries(themes.dark)) assert.ok(media.includes(`--${k}: ${v}`), `--${k} differs in the prefers-color-scheme block`);
});
