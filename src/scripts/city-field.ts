/**
 * City field: type a city, a suburb or a US ZIP code; pick from the list. Fills a hidden input with the
 * city's place id. With nothing typed, focusing shows every Opus city. Works with the keyboard.
 */
import { allCities, cityFor, nearestCity, searchCities, type CityOption } from '@/lib/city-search';
import { zipPoint } from '@/scripts/zip-lookup';

document.querySelectorAll<HTMLElement>('[data-cityfield]').forEach(init);

function init(root: HTMLElement) {
  const text = root.querySelector<HTMLInputElement>('[data-cf-text]')!;
  const hidden = root.querySelector<HTMLInputElement>('[data-cf-value]')!;
  const list = root.querySelector<HTMLUListElement>('[data-cf-list]')!;
  const msg = root.querySelector<HTMLElement>('[data-cf-msg]')!;
  const required = root.hasAttribute('data-required');
  let opts: CityOption[] = [], at = -1, chosen: CityOption | null = cityFor(hidden.value);
  if (chosen) text.value = chosen.label;
  const validity = () => text.setCustomValidity(required && !hidden.value ? 'Choose a city from the list.' : '');
  validity();

  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  function draw(note = '') {
    msg.textContent = note;
    list.innerHTML = opts.map((o, i) => `<li role="option" id="${hidden.name}-o${i}" data-i="${i}" aria-selected="${i === at}"><b>${esc(o.label)}</b><small>${esc(o.sub)}</small></li>`).join('')
      + (note && !opts.length ? `<li class="cf__none" role="presentation">${esc(note)}</li>` : '');
    list.hidden = !opts.length && !note;
    text.setAttribute('aria-expanded', String(!list.hidden && opts.length > 0));
    if (at >= 0) text.setAttribute('aria-activedescendant', `${hidden.name}-o${at}`); else text.removeAttribute('aria-activedescendant');
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  function choose(o: CityOption) {
    chosen = o; hidden.value = o.id; text.value = o.label; opts = []; at = -1; draw(); validity();
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }
  async function update() {
    const v = text.value.trim();
    if (chosen && v !== chosen.label) { chosen = null; hidden.value = ''; validity(); if (!required) hidden.dispatchEvent(new Event('change', { bubbles: true })); }
    if (!v) { opts = allCities(); at = -1; draw(); return; }
    if (/^\d{1,5}$/.test(v)) {
      if (v.length < 5) { opts = []; draw(); return; }
      const pt = await zipPoint(v).catch(() => null);
      if (text.value.trim() !== v) return;
      const near = pt ? nearestCity(pt) : null;
      opts = near ? [{ ...near, sub: `Nearest Opus city to ${v}` }] : [];
      at = opts.length ? 0 : -1;
      draw(near ? '' : pt ? 'There’s no Opus city near that ZIP code yet.' : 'We don’t know that ZIP code. Try your city.');
      return;
    }
    opts = searchCities(v); at = opts.length ? 0 : -1;
    draw(opts.length ? '' : 'No Opus city by that name yet. Try the nearest big city.');
  }
  text.addEventListener('input', update);
  text.addEventListener('focus', () => { if (!chosen) update(); else text.select(); });
  text.addEventListener('blur', () => setTimeout(() => { list.hidden = true; text.setAttribute('aria-expanded', 'false'); if (chosen) text.value = chosen.label; }, 120));
  text.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) update();
      if (!opts.length) return;
      at = (at + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length; draw();
    } else if (e.key === 'Enter') {
      if (!list.hidden && opts.length) { e.preventDefault(); choose(opts[Math.max(0, at)]); }
    } else if (e.key === 'Escape') { list.hidden = true; }
  });
  list.addEventListener('pointerdown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => { const li = (e.target as Element).closest<HTMLElement>('[data-i]'); if (li) choose(opts[Number(li.dataset.i)]); });
}
