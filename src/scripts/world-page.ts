/**
 * World page controller.
 *
 * One state, three views. Search text, filters, category, the searched city and the selected
 * profile live here, so switching between Map, Split and List never resets anything.
 * - Map: the globe fills the page; a compact panel floats over it.
 * - Split (desktop default): map left, results right, kept in sync.
 * - List (phone default): no map at all. The WebGL map is destroyed to save GPU and battery,
 *   and remounted at the same camera position when you come back.
 * Profiles open in a preview (panel, drawer or bottom sheet) without leaving the page.
 */
import { HIRE_ENABLED } from '@/lib/features';
import { tileHtml, matches, isVerified, esc, type WorldFilters } from '@/lib/world';
import { cityGuide, type Shelf } from '@/lib/world-guide';
import { cityGuideHeader } from '@/lib/city-guide-html';
import { guideFor } from '@/data/city-guides';
import { initFollowButtons, followState } from '@/scripts/city-follow';
import { motion } from '@/lib/motion';
import type { WorldStats } from '@/lib/world';
import { placeIndex, suggest, norm, type Place, type Suggestion } from '@/lib/world-search';
import { previewHtml, previewSkeleton, previewError, overlapHtml, type OverlapView } from '@/lib/world-preview';
import { installImageFallbacks } from '@/lib/media';
import { CITIES, citySlug, findCity } from '@/data/cities';
import { PLACES as AREAS, PLACE_BY_ID as AREA_BY_ID, metroId } from '@/data/places';
import { SPECIALTIES, toSpecialty } from '@/data/specialties';
import { hasPoint, type Listing } from '@/types/directory';
import type { ProfileDetail } from '@/server/world-detail';
import type { Camera, WorldMapApi } from '@/scripts/world-map';
import { takeHandoff, cameraFor, readFrom, saveFrom, type From } from '@/scripts/world-entry';
import { nearestCity } from '@/scripts/hero-dive';
import { zipPoint } from '@/scripts/zip-lookup';

type View = 'map' | 'split' | 'list';
type Sheet = 'peek' | 'half' | 'full';

const VIEW_KEY = 'opus.world.view.v2';
/** Results near a searched city when there is no map to follow (List view), in km. */
const NEAR_KM = 100;

export function initWorld(root: HTMLElement) {
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const results = $('[data-results]');
  const empty = $('[data-empty]');
  const count = $('[data-count]');
  const panel = $('[data-panel]');
  const q = $<HTMLInputElement>('[data-q]');
  const sug = $<HTMLUListElement>('[data-suggest]');
  const filtersEl = $('[data-filters]');
  const filtersBtn = $<HTMLButtonElement>('[data-filters-toggle]');
  const chips = $('[data-chips]');
  const pv = $('[data-preview]');
  const pvBody = $('[data-preview-body]');
  const scrim = $('[data-scrim]');
  const host = $('[data-map]');
  const guide = $('[data-guide]');
  const cards = $('[data-cards]');
  const track = $('[data-cards-track]');
  const mobile = matchMedia('(max-width: 860px)');
  /** Fluid motion only when the Motion setting (or the device) allows it: Reduced and Off skip flourishes. */
  const reduceMotion = { get matches() { return motion() !== 'fluid'; } };
  installImageFallbacks(root);

  let ALL: Listing[] = [];
  let PLACES: Place[] = [];
  let byId = new Map<string, Listing>();
  let loaded = false;
  let loadError = false;

  const f: WorldFilters = { kinds: [], specialty: '', genre: '', forHire: false, studioType: '', verifiedOnly: false, text: '' };
  let sort = 'recommended';
  let inView = true;
  let active: string | null = null;
  let map: WorldMapApi | null = null;
  let mapFailed = false;
  let camera: Camera | null = null;
  let place: { name: string; lat: number; lng: number } | null = null;
  let previewId: string | null = null;
  /** A city was chosen before the map finished loading (a cold first visit): fly there as soon as it's up. */
  let flyOnBoot = false;
  /** The visitor asked to see everyone in the place as a plain list instead of the guide. */
  let guideOff = false;

  // ---------- URL state ----------
  const params = new URLSearchParams(location.search);
  // Clean addresses (/musicians, /studios, /organizations, /world/<city>) preset the kind or the city.
  if (root.dataset.city && !params.has('city')) params.set('city', root.dataset.city);
  const t = params.get('type') ?? root.dataset.defaultKind;
  if (t === 'musician' || t === 'studio' || t === 'organization') f.kinds = [t];
  f.text = params.get('q') ?? '';
  f.specialty = toSpecialty(params.get('specialty') ?? params.get('discipline')); // "discipline" kept for old links
  f.genre = params.get('genre') ?? '';
  f.forHire = HIRE_ENABLED && params.get('hire') === '1';
  f.verifiedOnly = params.get('verified') === '1';
  const st0 = params.get('studio');
  if (st0 === 'commercial' || st0 === 'home' || st0 === 'remote') f.studioType = st0;
  q.value = f.text;

  const KIND_PATH = { '': '/world', musician: '/musicians', studio: '/studios', organization: '/clans' } as const;
  function writeUrl() {
    const u = new URL(location.href);
    const set = (k: string, v?: string | null) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
    // Keep the address short: the kind is the path, and a known city on its own is /world/<city>.
    const city = place && !f.kinds.length ? CITIES.find((c) => c.name === place!.name) : undefined;
    u.pathname = city ? `/world/${citySlug(city.name)}` : KIND_PATH[f.kinds[0] ?? ''];
    u.searchParams.delete('type'); u.searchParams.delete('view'); u.searchParams.delete('enter');
    set('q', f.text); set('specialty', f.specialty || ''); set('genre', f.genre); set('studio', f.studioType || '');
    set('hire', f.forHire ? '1' : ''); set('verified', f.verifiedOnly ? '1' : ''); set('city', city ? '' : place?.name); set('p', previewId);
    history.replaceState(history.state, '', u);
  }

  // ---------- Entering World: where are you connecting from? ----------
  // Explore World on the homepage lands here with ?enter=1 and the homepage camera (see world-entry.ts).
  const entering = params.get('enter') === '1';
  params.delete('enter');
  const handoff = entering ? takeHandoff() : null;
  let from: From | null = readFrom();
  // A plain /world visit (nothing asked for in the address) also gets the question the first time.
  const plain = location.pathname.replace(/\/$/, '') === '/world' && !params.get('city') && !f.text && !f.kinds.length && !params.get('p');
  const asking = !from && (entering || plain);
  // Answered before: go straight there, without asking again.
  if (!asking && from?.mode === 'city' && (entering || plain)) params.set('city', from.name);
  if (asking) root.dataset.entry = 'ask';
  else if (handoff) root.dataset.entry = 'arrive';
  else delete root.dataset.entry;

  // ---------- View mode: Map, Split, List ----------
  const readPref = (): Partial<Record<'desktop' | 'mobile', View>> => { try { return JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}'); } catch { return {}; } };
  const device = () => (mobile.matches ? 'mobile' : 'desktop');
  /** Phones have Map and List only; a saved Split means Map there. */
  const fit = (v: View | undefined): View => (mobile.matches ? (v === 'list' ? 'list' : v ? 'map' : 'list') : v ?? 'split');
  // ?view=map|split|list (used by "Explore the World" on the homepage) wins over the saved choice for this visit.
  const askedView = new URLSearchParams(location.search).get('view');
  let view: View = fit((['map', 'split', 'list'] as const).find((v) => v === askedView) ?? readPref()[device()]);

  function setView(v: View, save = true) {
    v = fit(v);
    const changedView = v !== view || !root.dataset.view;
    view = v;
    root.dataset.view = v;
    if (save) { try { localStorage.setItem(VIEW_KEY, JSON.stringify({ ...readPref(), [device()]: v })); } catch { /* private mode */ } }
    root.querySelectorAll<HTMLButtonElement>('[data-view-btn]').forEach((b) => {
      const on = b.dataset.viewBtn === v;
      b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1;
    });
    syncMode();
    if (v === 'list') suspendMap(); else boot();
    if (mobile.matches) setSheet(v === 'list' ? 'full' : 'peek');
    if (v !== 'map') root.removeAttribute('data-results-open');
    if (changedView) {
      // Previews follow the view: panel in Split, card in Map, drawer in List, sheet on phones.
      if (previewId) placePreview();
      requestAnimationFrame(() => map?.resize());
      // Once the new layout has settled, keep what was in the middle in the middle of the part you can see.
      setTimeout(() => { map?.resize(); map?.reframe(); }, 360);
      render(true, true);
    }
  }
  root.querySelectorAll<HTMLButtonElement>('[data-view-btn]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.viewBtn as View)));
  $('[data-views]').addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent;
    const d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    const all = [...root.querySelectorAll<HTMLButtonElement>('[data-view-btn]')].filter((b) => b.offsetParent);
    const i = all.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    const n = all[(i + d + all.length) % all.length]!;
    n.focus(); n.click();
  });
  // ---------- Directory width (desktop): resize, collapse ----------
  // The View switcher already offers Map / Split / List, so there is no separate "Show list" control.
  const rz = $<HTMLElement>('[data-rz]');
  const collapseBtn = $<HTMLButtonElement>('[data-collapse]');
  // v2: the widest size is the default (Bogo 2026-11-24); widths saved under v1 are dropped so nobody stays on the thin panel.
  const RZ_KEY = 'opus.world.panel.v2';
  const RZ_MIN = 340;
  const rzMax = () => Math.max(RZ_MIN, Math.min(640, Math.round(innerWidth * 0.5)));
  let panelW: number | null = null; let collapsed = false;
  try { localStorage.removeItem('opus.world.panel.v1'); } catch { /* private mode */ }
  try { const sv = JSON.parse(localStorage.getItem(RZ_KEY) || 'null'); if (sv) { panelW = Number(sv.w) || null; collapsed = !!sv.c; } } catch { /* defaults */ }
  const saveRz = () => { try { localStorage.setItem(RZ_KEY, JSON.stringify({ w: panelW, c: collapsed })); } catch { /* private mode */ } };
  function applyRz(resizeMap = true) {
    if (panelW) root.style.setProperty('--panel-w', `${Math.min(rzMax(), Math.max(RZ_MIN, panelW))}px`); else root.style.removeProperty('--panel-w');
    root.toggleAttribute('data-collapsed', collapsed);
    collapseBtn.setAttribute('aria-expanded', String(!collapsed));
    collapseBtn.setAttribute('aria-label', collapsed ? 'Show directory' : 'Hide directory'); collapseBtn.title = collapsed ? 'Show directory' : 'Hide directory';
    const pw = panel.offsetWidth;
    rz.setAttribute('aria-valuenow', String(collapsed ? 0 : pw));
    if (resizeMap) { requestAnimationFrame(() => map?.resize()); setTimeout(() => { map?.resize(); map?.reframe(); }, 320); }
  }
  collapseBtn.addEventListener('click', (e) => { e.stopPropagation(); collapsed = !collapsed; saveRz(); applyRz(); });
  rz.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('[data-collapse]') || collapsed || e.button !== 0) return;
    e.preventDefault(); rz.setPointerCapture(e.pointerId); root.classList.add('is-resizing');
    const left = root.getBoundingClientRect().left;
    const move = (ev: PointerEvent) => { panelW = Math.round(ev.clientX - left); applyRz(false); map?.resize(); };
    const up = () => { rz.removeEventListener('pointermove', move); rz.removeEventListener('pointerup', up); rz.removeEventListener('pointercancel', up); root.classList.remove('is-resizing'); saveRz(); applyRz(); };
    rz.addEventListener('pointermove', move); rz.addEventListener('pointerup', up); rz.addEventListener('pointercancel', up);
  });
  rz.addEventListener('dblclick', (e) => { if ((e.target as HTMLElement).closest('[data-collapse]')) return; panelW = null; saveRz(); applyRz(); });
  rz.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); panelW = (panelW ?? panel.offsetWidth) + (e.key === 'ArrowRight' ? 24 : -24); saveRz(); applyRz(); }
    else if (e.key === 'Enter') { e.preventDefault(); collapsed = !collapsed; saveRz(); applyRz(); }
  });
  addEventListener('resize', () => { if (panelW) applyRz(false); });

  // ---------- Filters panel ----------
  const kind = () => f.kinds[0] ?? '';
  const filterCount = () => [f.specialty, f.genre, f.studioType, f.verifiedOnly, f.forHire].filter(Boolean).length;
  function syncControls() {
    $<HTMLSelectElement>('[data-specialty]').value = f.specialty ?? '';
    $<HTMLSelectElement>('[data-genre]').value = f.genre ?? '';
    $<HTMLSelectElement>('[data-studio-type]').value = f.studioType ?? '';
    const hireSw = document.querySelector<HTMLInputElement>('[data-hire]'); if (hireSw) hireSw.checked = !!f.forHire;
    $<HTMLInputElement>('[data-verified]').checked = f.verifiedOnly;
    $<HTMLInputElement>('[data-inview]').checked = inView;
    $<HTMLSelectElement>('[data-sort]').value = sort;
    // Radio group: only the selected category is in the tab order; arrow keys move between them.
    root.querySelectorAll<HTMLElement>('[data-kind]').forEach((x) => { const on = x.dataset.kind === kind(); x.setAttribute('aria-checked', String(on)); x.tabIndex = on ? 0 : -1; });
    // Category-specific filters: musician filters show for All and Musicians; studio filters only for Studios.
    root.querySelectorAll<HTMLElement>('[data-only]').forEach((el) => (el.hidden = kind() ? el.dataset.only !== kind() : el.dataset.only === 'studio'));
    const n = filterCount();
    const badge = $('[data-fcount]');
    badge.hidden = n === 0; badge.textContent = String(n);
    filtersBtn.classList.toggle('is-active', n > 0);
    filtersBtn.setAttribute('aria-label', n ? `Filters, ${n} applied` : 'Filters');
    $<HTMLButtonElement>('[data-clear-q]').hidden = !q.value;
    syncQuick();
  }
  // ---------- Quick filters: one-tap pills, always visible, in sync with the Filters panel ----------
  const quick = $('[data-quick]');
  type QF = { id: string; label: string; only?: string; on: () => boolean; toggle: () => void };
  const QUICK: QF[] = [
    ...(HIRE_ENABLED ? [{ id: 'hire', label: 'For hire', only: 'musician', on: () => !!f.forHire, toggle: () => { f.forHire = !f.forHire; } }] : []),
    { id: 'verified', label: 'Verified', on: () => f.verifiedOnly, toggle: () => { f.verifiedOnly = !f.verifiedOnly; } },
    ...Object.entries(SPECIALTIES).slice(0, 12).map(([k, d]): QF => ({ id: 'sp-' + k, label: d.plural, only: 'musician', on: () => f.specialty === k, toggle: () => { f.specialty = f.specialty === k ? '' : toSpecialty(k); } })),
    ...([['commercial', 'Recording studios'], ['home', 'Home studios'], ['remote', 'Remote']] as const).map(([k, l]): QF => ({ id: 'st-' + k, label: l, only: 'studio', on: () => f.studioType === k, toggle: () => { f.studioType = f.studioType === k ? '' : k; } })),
  ];
  quick.innerHTML = QUICK.map((x) => `<button type="button" class="wp__q" data-q="${x.id}" aria-pressed="false">${esc(x.label)}</button>`).join('');
  quick.addEventListener('click', (e) => {
    const id = (e.target as Element).closest<HTMLElement>('[data-q]')?.dataset.q;
    const x = QUICK.find((y) => y.id === id);
    if (!x) return;
    x.toggle(); changed();
  });
  function syncQuick() {
    quick.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => {
      const x = QUICK.find((y) => y.id === b.dataset.q)!;
      b.hidden = x.only ? (kind() ? x.only !== kind() : x.only === 'studio') : false;
      b.setAttribute('aria-pressed', String(x.on()));
    });
  }
  function setFilters(open: boolean) {
    filtersEl.classList.toggle('is-open', open);
    filtersBtn.setAttribute('aria-expanded', String(open));
    if (open) { filtersEl.removeAttribute('inert'); if (mobile.matches) setSheet('full'); }
    else filtersEl.setAttribute('inert', '');
  }
  filtersBtn.addEventListener('click', () => setFilters(!filtersEl.classList.contains('is-open')));
  $('[data-filters-done]').addEventListener('click', () => { setFilters(false); filtersBtn.focus(); });

  function chipHtml(key: string, label: string) {
    return `<button type="button" class="wp__chip" data-chip="${key}" aria-label="Remove ${esc(label)}">${esc(label)}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
  }
  function renderChips() {
    const c: string[] = [];
    // The city guide already names the place (and its photo is the way back out), so the chip only shows without it.
    if (place && !guideMode()) c.push(chipHtml('place', `Near ${place.name}`));
    if (f.specialty) c.push(chipHtml('specialty', SPECIALTIES[f.specialty].plural));
    if (f.genre) c.push(chipHtml('genre', f.genre));
    if (f.studioType) c.push(chipHtml('studioType', { commercial: 'Recording studios', home: 'Home studios', remote: 'Remote services' }[f.studioType]));
    if (f.verifiedOnly) c.push(chipHtml('verified', 'Opus Verified'));
    if (f.forHire) c.push(chipHtml('hire', 'For hire'));
    if (c.length > 1) c.push('<button type="button" class="wp__chip wp__chip--clear" data-chip="all">Clear all</button>');
    chips.innerHTML = c.join('');
    chips.hidden = c.length === 0;
  }
  chips.addEventListener('click', (e) => {
    const k = (e.target as Element).closest<HTMLElement>('[data-chip]')?.dataset.chip;
    if (!k) return;
    if (k === 'place') clearPlace();
    if (k === 'specialty') f.specialty = '';
    if (k === 'genre') f.genre = '';
    if (k === 'studioType') f.studioType = '';
    if (k === 'verified') f.verifiedOnly = false;
    if (k === 'hire') f.forHire = false;
    if (k === 'all') { resetAll(); return; }
    changed();
    q.focus();
  });

  function resetFilters() { f.specialty = ''; f.genre = ''; f.studioType = ''; f.verifiedOnly = false; f.forHire = false; sort = 'recommended'; inView = true; }
  function resetAll() { resetFilters(); f.kinds = []; f.text = ''; q.value = ''; clearPlace(); changed(); }
  /** Forget the searched city. When it was set, the globe also returns to the whole world so results widen again. */
  function clearPlace() {
    const had = !!place;
    place = null; guideOff = false; map?.setPlace(null);
    if (had && map && map.getZoom() >= 4) map.resetView();
    if (had && !map) camera = null;
  }
  /** Something the visitor chose changed: sync controls and redraw with a gentle fade. */
  function changed() { syncControls(); renderChips(); render(true, true); renderMyCities(); }

  // ---------- Results ----------
  const inArea = () => !!map && inView && map.getZoom() >= 4;
  const dist = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const r = Math.PI / 180;
    return Math.acos(Math.min(1, Math.sin(a.lat * r) * Math.sin(b.lat * r) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos((a.lng - b.lng) * r)));
  };
  const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => dist(a, b) * 6371;
  const metroOf = (l: Listing) => l.metro ?? { name: l.location.city.replace(/ area$/, ''), lat: l.location.lat, lng: l.location.lng };
  /** Without a map (List view), a searched city still narrows results: members within NEAR_KM of it. */
  const nearPlace = () => !map && !!place;

  function matching(): Listing[] { return ALL.filter((l) => matches(l, f)); }
  function visible(): Listing[] {
    let ls = matching();
    if (inArea()) {
      const b = map!.getBounds();
      ls = ls.filter((l) => hasPoint(l) && b.contains([l.location.lng, l.location.lat]));
    } else if (nearPlace()) {
      ls = ls.filter((l) => hasPoint(l) && km(place!, metroOf(l)) <= NEAR_KM);
    }
    const score = (l: Listing) => (isVerified(l) ? 0 : 1);
    ls.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'recent') return b.id.localeCompare(a.id);
      // Recommended: verified first, then a fair mix of kinds (never paid placement).
      return score(a) - score(b) || a.id.localeCompare(b.id);
    });
    return ls;
  }

  /** Cities with matching listings, nearest to the map centre (or searched city) first. */
  function nearbyCities(ls: Listing[], limit = 3) {
    const c = map ? map.getCenter() : place;
    if (!c) return [];
    const groups = new Map<string, { name: string; lat: number; lng: number; n: number }>();
    for (const l of ls) {
      if (!hasPoint(l)) continue;
      const m = metroOf(l);
      const g = groups.get(m.name) ?? groups.set(m.name, { name: m.name, lat: m.lat, lng: m.lng, n: 0 }).get(m.name)!;
      g.n++;
    }
    return [...groups.values()].filter((g) => !place || g.name !== place.name).sort((a, b) => dist(c, a) - dist(c, b)).slice(0, limit);
  }

  let emptySig = '';
  function showEmpty(title: string, body: string, actions: { label: string; run: () => void; primary?: boolean }[]) {
    const sig = [title, body, ...actions.map((a) => a.label)].join('|');
    const same = sig === emptySig;
    empty.hidden = false;
    if (same) return; // the map moving (e.g. the idle spin) must not rebuild buttons under the pointer
    emptySig = sig;
    $('[data-empty-title]').textContent = title;
    $('[data-empty-body]').textContent = body;
    const box = $('[data-empty-actions]');
    box.replaceChildren(...actions.map((a) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `wp__btn${a.primary ? '' : ' wp__btn--quiet'}`; b.textContent = a.label;
      b.addEventListener('click', a.run);
      return b;
    }));
  }

  let lastIds = '';
  function render(updateMap = true, animate = false) {
    if (!loaded) return;
    empty.hidden = true;
    if (loadError) {
      results.innerHTML = ''; results.hidden = true;
      count.textContent = '';
      showEmpty('We couldn’t load World.', 'Check your connection and try again.', [{ label: 'Try again', primary: true, run: () => { loaded = false; loadError = false; count.textContent = 'Loading World…'; empty.hidden = true; load(); } }]);
      return;
    }
    const ls = visible();
    const ids = ls.map((l) => l.id).join(',');
    if (ids !== lastIds || !results.firstElementChild || results.querySelector('.wt--skeleton')) {
      results.innerHTML = ls.map((l) => tileHtml(l, 'grid')).join('');
      if (animate && !reduceMotion.matches) {
        results.classList.remove('is-entering'); void results.offsetWidth; results.classList.add('is-entering');
      }
      lastIds = ids;
    }
    if (active) results.querySelector(`[data-id="${CSS.escape(active)}"]`)?.classList.add('is-active');
    results.hidden = ls.length === 0;
    renderCards(ls);
    if (renderGuide()) {
      // The guide stands in for the list: no empty state, no plain results underneath.
      results.hidden = true;
      count.textContent = '';
      if (updateMap) map?.setData(matching());
      writeUrl();
      return;
    }

    const where = inArea() ? (place ? `near ${place.name}` : 'in this area') : nearPlace() ? `near ${place!.name}` : 'worldwide';
    count.textContent = ALL.length === 0 ? '' : ls.length ? `${tally(ls)} ${where}` : '';

    if (ALL.length === 0) {
      showEmpty('World is just opening.', 'Members appear here as soon as they publish a profile.', [{ label: 'Create your profile', primary: true, run: () => (location.href = '/sign-up') }]);
    } else if (!ls.length) {
      const anywhere = matching();
      const filtered = filterCount() > 0 || !!f.text || f.kinds.length > 0;
      if ((inArea() || nearPlace()) && anywhere.length) {
        const near = nearbyCities(anywhere);
        showEmpty(nearPlace() ? `No matches near ${place!.name}.` : 'No matches in this area.', near.length ? 'There are matches nearby.' : '', [
          { label: 'Expand search area', primary: true, run: () => { if (map) map.zoomOut(); else { clearPlace(); changed(); } } },
          ...near.map((c) => ({ label: `${c.name} · ${c.n}`, run: () => goPlace({ name: c.name, lat: c.lat, lng: c.lng }) })),
          ...(filtered ? [{ label: 'Clear filters', run: resetAll }] : []),
        ]);
      } else {
        const bare = !f.text && filterCount() === 0;
        showEmpty(bare ? 'Nothing here yet.' : 'No matches.', f.text ? `Nothing in World matches “${f.text}” yet.` : bare ? (kind() === 'studio' ? 'No studios are listed here yet. Run a studio, home studios included? List yours from the bar above.' : 'No one has published in this part of World yet. Join Opus to be the first.') : 'Try fewer filters.', [
          { label: 'Clear filters', primary: true, run: resetAll },
        ]);
      }
      if (view === 'map') root.setAttribute('data-results-open', '');
    }
    if (empty.hidden) emptySig = '';
    if (updateMap) map?.setData(matching());
    writeUrl();
  }

  // ---------- City guide ----------
  /** A place is chosen and nothing else narrows it: show the place as an editorial guide. */
  const guideMode = () => !!place && !guideOff && !f.text && !f.kinds.length && filterCount() === 0;
  let guideSig = '';
  let guideShelves: Shelf[] = [];
  /** The followable city for a place: a metro World knows (its id is what follows and events use). */
  const cityFor = (name: string) => { const c = CITIES.find((x) => x.name === name); return c ? { id: metroId(c), slug: citySlug(c.name), city: c } : null; };
  function renderGuide(): boolean {
    if (!guideMode()) { guide.hidden = true; guideSig = ''; return false; }
    const g = cityGuide(ALL, place!);
    const known = cityFor(place!.name);
    const ed = guideFor(known?.slug);
    // A city with an editorial guide always shows it, even before anyone there has published a profile.
    if (!g.shelves.length && !ed) { guide.hidden = true; guideSig = ''; return false; }
    const sig = `${place!.name}|${g.total}`;
    if (sig !== guideSig) {
      guideSig = sig;
      guideShelves = g.shelves;
      const region = ed?.region ?? (known ? [known.city.region, known.city.countryName].filter(Boolean).join(', ') : '');
      guide.innerHTML = cityGuideHeader(g, { region, entry: ed, followId: known?.id })
        + (known ? `<section class="wg__shelf wg__events" data-guide-events="${esc(known.id)}" aria-labelledby="wg-ev" hidden><div class="wg__shead"><h3 id="wg-ev">What’s Happening</h3><a class="wg__all" href="/future?tab=our">All events</a></div><div class="wg-ev" role="list"></div></section>` : '')
        + g.shelves.map((sh, i) => `<section class="wg__shelf" style="--i:${i}" aria-labelledby="wg-s${i}">
  <div class="wg__shead"><h3 id="wg-s${i}">${esc(sh.title)}</h3>${sh.total > 2 ? `<button type="button" class="wg__all" data-shelf="${i}">See all ${sh.total}</button>` : ''}</div>
  <div class="wg__track" role="list">${sh.items.map((l) => tileHtml(l, 'grid')).join('')}</div>
</section>`).join('')
        + (g.total ? `<button type="button" class="wg__everyone" data-guide-list>See everyone in ${esc(g.name)} as a list</button>` : '');
      if (motion() === 'fluid') { guide.classList.remove('is-entering'); void guide.offsetWidth; guide.classList.add('is-entering'); }
      initFollowButtons(guide);
      if (known) loadHappening(known.id);
    }
    guide.hidden = false;
    return true;
  }
  // What's Happening: upcoming public events in the city (real events only; nothing shows when there are none).
  type Happening = { title: string; when: string; venue: string; href: string; organizer: { name: string } };
  const happening = new Map<string, Happening[]>();
  async function loadHappening(id: string) {
    let list: Happening[] = happening.get(id) ?? [];
    if (!happening.has(id)) {
      try {
        const r = await fetch(`/api/events?place=${encodeURIComponent(id)}`, { credentials: 'same-origin' });
        list = r.ok ? ((await r.json()) as { events: Happening[] }).events.slice(0, 4) : [];
      } catch { list = []; }
      happening.set(id, list);
    }
    const sec = guide.querySelector<HTMLElement>(`[data-guide-events="${CSS.escape(id)}"]`);
    if (!sec || !list.length) return;
    sec.querySelector('.wg-ev')!.innerHTML = list.map((e) => `<a class="wg-ev__item" role="listitem" href="${esc(e.href)}"><span class="wg-ev__when">${esc(e.when)}</span><b>${esc(e.title)}</b><small>${esc(e.venue)} · Hosted by ${esc(e.organizer.name)}</small></a>`).join('');
    sec.hidden = false;
  }
  guide.addEventListener('click', (e) => {
    const t = e.target as Element;
    const tile = t.closest<HTMLElement>('.wt[data-id]');
    if (tile) { select(tile.dataset.id!, 'card'); return; }
    const all = t.closest<HTMLElement>('[data-shelf]');
    if (all) {
      const sh = guideShelves[Number(all.dataset.shelf)];
      if (!sh) return;
      f.kinds = sh.filter.kind ? [sh.filter.kind] : [];
      f.specialty = sh.filter.specialty ?? '';
      f.forHire = HIRE_ENABLED && !!sh.filter.hire;
      changed();
      results.scrollIntoView?.({ block: 'start' });
      return;
    }
    if (t.closest('[data-guide-list]')) { guideOff = true; changed(); }
  });

  // ---------- My Cities ----------
  const myEl = $('[data-mycities]');
  let myIds: string[] = [];
  async function loadMyCities(force = false) {
    const s = await followState(force);
    myIds = s.signedIn ? [...s.ids] : [];
    renderMyCities();
  }
  function renderMyCities() {
    const list = myIds.map((id) => AREA_BY_ID.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
    myEl.hidden = !list.length || !!place;
    if (myEl.hidden) return;
    myEl.innerHTML = `<span class="wmy__label">My Cities</span>${list.map((p) => `<button type="button" class="wmy__city" data-my="${esc(p.id)}">${esc(p.name)}</button>`).join('')}<a class="wmy__all" href="/world/cities">All</a>`;
  }
  myEl.addEventListener('click', (e) => {
    const id = (e.target as Element).closest<HTMLElement>('[data-my]')?.dataset.my;
    const p = id ? AREA_BY_ID.get(id) : undefined;
    if (p) goPlace({ name: p.name, lat: p.lat, lng: p.lng });
  });
  window.addEventListener('opus:follows', () => loadMyCities());

  // ---------- Cards over the map ----------
  let cardIds = '';
  function renderCards(ls: Listing[]) {
    const show = mobile.matches && view === 'map' && !!map && inArea() && ls.length > 0;
    root.classList.toggle('has-cards', show);
    cards.hidden = !show;
    if (!show) { cardIds = ''; return; }
    const top = ls.filter(hasPoint).slice(0, 24);
    const ids = top.map((l) => l.id).join(',');
    if (ids === cardIds) return;
    cardIds = ids;
    track.innerHTML = top.map((l) => tileHtml(l, 'wide')).join('');
    if (!reduceMotion.matches) { cards.classList.remove('is-entering'); void cards.offsetWidth; cards.classList.add('is-entering'); }
    const keep = active ? track.querySelector<HTMLElement>(`.wt[data-id="${CSS.escape(active)}"]`) : null;
    track.scrollLeft = keep ? keep.offsetLeft - (track.clientWidth - keep.offsetWidth) / 2 : 0;
  }
  /** The card nearest the middle of the strip is the one you're on: its marker lights up and stays in view. */
  let carT = 0;
  track.addEventListener('scroll', () => {
    clearTimeout(carT);
    carT = window.setTimeout(() => {
      const mid = track.scrollLeft + track.clientWidth / 2;
      let best: HTMLElement | null = null, d = Infinity;
      track.querySelectorAll<HTMLElement>('.wt').forEach((c) => { const x = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (x < d) { d = x; best = c; } });
      const id = (best as HTMLElement | null)?.dataset.id;
      if (!id || id === active) return;
      markActive(id);
      const l = byId.get(id);
      if (l && map) map.ensureVisible(l);
    }, 120);
  }, { passive: true });
  track.addEventListener('click', (e) => {
    const c = (e.target as Element).closest<HTMLElement>('.wt[data-id]');
    if (c) select(c.dataset.id!, 'card');
  });
  function showCard(id: string) {
    const c = track.querySelector<HTMLElement>(`.wt[data-id="${CSS.escape(id)}"]`);
    if (!c || cards.hidden) return;
    track.scrollTo({ left: c.offsetLeft - (track.clientWidth - c.offsetWidth) / 2, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  }

  // ---------- Controls ----------
  root.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((b) =>
    b.addEventListener('click', () => {
      const k = b.dataset.kind as WorldFilters['kinds'][number] | '';
      f.kinds = k ? [k] : [];
      // Category-specific filters don't carry over to a category they don't apply to.
      if (k && k !== 'musician') { f.specialty = ''; f.genre = ''; f.forHire = false; }
      if (k !== 'studio') f.studioType = '';
      changed();
    }),
  );
  $('[data-kinds]').addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent;
    const d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    const all = [...root.querySelectorAll<HTMLButtonElement>('[data-kind]')];
    const cur = all.indexOf(document.activeElement as HTMLButtonElement);
    const i = cur >= 0 ? cur : all.findIndex((x) => x.getAttribute('aria-checked') === 'true');
    const n = all[(i + d + all.length) % all.length]!;
    n.focus(); n.click();
  });
  $<HTMLSelectElement>('[data-specialty]').addEventListener('change', (e) => { f.specialty = toSpecialty((e.target as HTMLSelectElement).value); changed(); });
  $<HTMLSelectElement>('[data-genre]').addEventListener('change', (e) => { f.genre = (e.target as HTMLSelectElement).value; changed(); });
  $<HTMLSelectElement>('[data-studio-type]').addEventListener('change', (e) => { f.studioType = (e.target as HTMLSelectElement).value as WorldFilters['studioType']; changed(); });
  document.querySelector<HTMLInputElement>('[data-hire]')?.addEventListener('change', (e) => { f.forHire = (e.target as HTMLInputElement).checked; changed(); });
  $<HTMLInputElement>('[data-verified]').addEventListener('change', (e) => { f.verifiedOnly = (e.target as HTMLInputElement).checked; changed(); });
  $<HTMLSelectElement>('[data-sort]').addEventListener('change', (e) => { sort = (e.target as HTMLSelectElement).value; changed(); });
  $<HTMLInputElement>('[data-inview]').addEventListener('change', (e) => { inView = (e.target as HTMLInputElement).checked; changed(); });
  $('[data-reset]').addEventListener('click', () => { resetFilters(); changed(); });

  // ---------- Universal search ----------
  let sugItems: Suggestion[] = [];
  let sugIndex = -1;
  const ICON: Record<Suggestion['type'], string> = {
    place: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    specialty: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.6 3.9-5.5 7-5.5s5.8 1.9 7 5.5"/></svg>',
    genre: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>',
    listing: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/></svg>',
  };
  const KIND_LABEL: Record<Suggestion['type'], string> = { place: 'Place', specialty: 'Specialty', genre: 'Genre', listing: 'Profile' };
  function closeSuggest() { sug.hidden = true; q.setAttribute('aria-expanded', 'false'); q.removeAttribute('aria-activedescendant'); sugIndex = -1; }
  function openSuggest() {
    sugItems = loaded ? suggest(q.value, ALL, PLACES) : [];
    if (!sugItems.length) { closeSuggest(); return; }
    sug.innerHTML = sugItems.map((s, i) => {
      const detail = s.type === 'place' ? `${s.detail}${s.count ? ` · ${s.count} on Opus` : ''}` : s.type === 'listing' ? s.detail : `${s.count} on Opus`;
      return `<li id="w-sg-${i}" role="option" aria-selected="false" data-i="${i}"><span class="wp__sg-ic">${ICON[s.type]}</span><span class="wp__sg-tx"><b>${esc(s.label)}</b><small>${esc(detail)}</small></span><em>${KIND_LABEL[s.type]}</em></li>`;
    }).join('');
    sug.hidden = false; q.setAttribute('aria-expanded', 'true'); sugIndex = -1;
  }
  function highlight(i: number) {
    sugIndex = (i + sugItems.length) % sugItems.length;
    sug.querySelectorAll('li').forEach((li, j) => li.setAttribute('aria-selected', String(j === sugIndex)));
    q.setAttribute('aria-activedescendant', `w-sg-${sugIndex}`);
    sug.querySelector(`#w-sg-${sugIndex}`)?.scrollIntoView({ block: 'nearest' });
  }
  function choose(s: Suggestion) {
    closeSuggest();
    q.value = ''; f.text = '';
    if (s.type === 'place') { goPlace({ name: s.label, lat: s.lat, lng: s.lng }); return; }
    if (s.type === 'specialty') { f.kinds = ['musician']; f.specialty = s.value; }
    if (s.type === 'genre') { f.kinds = ['musician']; f.genre = s.value; }
    if (s.type === 'listing') {
      // Show that one listing wherever it is: widen to worldwide, then open its preview.
      clearPlace(); resetFilters(); f.kinds = [];
      changed(); select(s.id, 'search'); return;
    }
    changed();
  }
  let qt = 0;
  q.addEventListener('input', () => {
    $<HTMLButtonElement>('[data-clear-q]').hidden = !q.value;
    openSuggest();
    clearTimeout(qt);
    qt = window.setTimeout(() => { f.text = q.value.trim(); render(true, true); }, 160);
  });
  q.addEventListener('focus', () => { if (mobile.matches && view === 'map' && sheet !== 'full') setSheet('full'); if (q.value) openSuggest(); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && sugItems.length && !sug.hidden) { e.preventDefault(); highlight(sugIndex + 1); }
    else if (e.key === 'ArrowUp' && sugItems.length && !sug.hidden) { e.preventDefault(); highlight(sugIndex - 1); }
    else if (e.key === 'Escape') { if (!sug.hidden) closeSuggest(); else if (q.value) { q.value = ''; f.text = ''; changed(); } }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (sugIndex >= 0 && sugItems[sugIndex]) { choose(sugItems[sugIndex]!); return; }
      // A city typed in full goes to that city; anything else stays a text search.
      const v = norm(q.value);
      const p = PLACES.find((x) => norm(x.name) === v) ?? (() => { const c = findCity(q.value); return c && norm(c.name) === v ? { name: c.name, lat: c.lat, lng: c.lng } : null; })();
      closeSuggest();
      if (p) { q.value = ''; f.text = ''; goPlace(p); }
      else { clearTimeout(qt); f.text = q.value.trim(); render(true, true); }
    }
  });
  sug.addEventListener('pointerdown', (e) => e.preventDefault()); // keep focus in the input
  sug.addEventListener('click', (e) => {
    const li = (e.target as Element).closest<HTMLElement>('[data-i]');
    if (li) choose(sugItems[Number(li.dataset.i)]!);
  });
  q.addEventListener('blur', () => setTimeout(closeSuggest, 120));
  $('[data-clear-q]').addEventListener('click', () => { q.value = ''; f.text = ''; closeSuggest(); changed(); q.focus(); });

  // A place: the globe turns to the city, marks it, and results follow the map. In List view the
  // same choice filters to members near the city, and the map picks it up when you switch back.
  function goPlace(p: { name: string; lat: number; lng: number }, openSheet = true) {
    place = p; inView = true; guideOff = false;
    // The sheet opens first, so the camera frames the city in the map that stays visible above it.
    if (openSheet && mobile.matches && view === 'map') setSheet('half');
    if (map) { map.setPlace(p); map.flyToCity(p.lat, p.lng); revealAfterArrival(); }
    else { camera = { center: [p.lng, p.lat], zoom: 10.2 }; flyOnBoot = true; }
    changed();
  }

  // ---------- Selection and previews (card ↔ marker ↔ preview) ----------
  const cardOf = (id: string) => results.querySelector<HTMLElement>(`.wt[data-id="${CSS.escape(id)}"]`);
  function markActive(id: string | null) {
    active = id;
    results.querySelectorAll('.wt.is-active').forEach((x) => x.classList.remove('is-active'));
    if (id) cardOf(id)?.classList.add('is-active');
    track.querySelectorAll('.wt.is-active').forEach((x) => x.classList.remove('is-active'));
    if (id) track.querySelector(`.wt[data-id="${CSS.escape(id)}"]`)?.classList.add('is-active');
    map?.setActive(id);
  }
  /** Opening a profile from a card, a marker, or search: highlight both sides, then show the preview. */
  function select(id: string, from: 'card' | 'map' | 'search') {
    markActive(id);
    const l = byId.get(id);
    if (from === 'map') { cardOf(id)?.scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' }); showCard(id); }
    // Keep the visitor's map position; only pan if the marker is off screen.
    if (from !== 'map' && l && map) { if (from === 'search') map.flyToListing(l); else map.ensureVisible(l); }
    openPreview(id);
  }
  results.addEventListener('click', (e) => {
    const c = (e.target as Element).closest<HTMLElement>('.wt[data-id]');
    if (c) select(c.dataset.id!, 'card');
  });
  results.addEventListener('pointerover', (e) => { const c = (e.target as Element).closest<HTMLElement>('.wt'); map?.setHover(c?.dataset.id ?? null); });
  results.addEventListener('pointerleave', () => map?.setHover(null));
  results.addEventListener('focusin', (e) => { const c = (e.target as Element).closest<HTMLElement>('.wt'); map?.setHover(c?.dataset.id ?? null); });

  let pvToken = 0;
  let returnFocus: HTMLElement | null = null;
  let pushed = false;
  const asModal = () => mobile.matches || view === 'list';
  /** Where the preview sits depends on the view; the markup is the same everywhere. */
  function placePreview() {
    pv.dataset.pv = mobile.matches ? 'sheet' : view === 'list' ? 'drawer' : view === 'map' ? 'card' : 'panel';
    scrim.hidden = !asModal();
    pv.setAttribute('aria-modal', String(asModal()));
    // In Split view the profile slides out beside the directory: the directory stays usable, so another
    // card swaps the profile, and the map stays in view on the right.
    panel.removeAttribute('inert');
    if (asModal()) { panel.setAttribute('inert', ''); host.setAttribute('inert', ''); } else host.removeAttribute('inert');
  }
  async function openPreview(id: string, push = true) {
    const l = byId.get(id);
    if (!previewId) returnFocus = (document.activeElement as HTMLElement | null) ?? null;
    previewId = id;
    placePreview();
    pv.hidden = false;
    requestAnimationFrame(() => pv.classList.add('is-open'));
    if (push && !pushed) { history.pushState({ pv: id }, ''); pushed = true; }
    writeUrl();
    const token = ++pvToken;
    pvBody.innerHTML = previewSkeleton(l);
    pvBody.scrollTop = 0;
    pvBody.focus({ preventScroll: true });
    try {
      const r = await fetch(`/api/world/${encodeURIComponent(id)}`);
      if (token !== pvToken) return;
      if (r.status === 404) { pvBody.innerHTML = previewError('This profile isn’t public anymore.', false); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = (await r.json()) as { listing: Listing; detail: ProfileDetail };
      if (token !== pvToken) return;
      pvBody.innerHTML = previewHtml(d.listing, d.detail);
      $('[data-preview-label]').textContent = d.listing.name;
      // Signed-in visitors see what they share with this member. A separate, private request: the profile itself stays cacheable.
      const slot = pvBody.querySelector<HTMLElement>('[data-pv-overlap]');
      if (slot && document.documentElement.classList.contains('is-signed-in')) {
        fetch(`/api/world/${encodeURIComponent(id)}/overlap`).then((x) => (x.ok ? x.json() : null)).then((o: OverlapView | null) => {
          if (!o || token !== pvToken) return;
          // Already connected: the card stops offering Connect; the button says so and opens their profile, where Message lives.
          const cta = pvBody.querySelector<HTMLAnchorElement>('a.pv__btn:not(.pv__btn--quiet)');
          if (o.connected && cta && /[?&]connect=1/.test(cta.href)) { cta.textContent = 'Connected'; cta.href = cta.href.replace(/[?&]connect=1/, ''); }
          const html = overlapHtml(o);
          if (html) { slot.innerHTML = html; slot.hidden = false; }
        }).catch(() => {});
      }
    } catch (err) {
      if (token !== pvToken) return;
      console.error('Preview failed', err);
      pvBody.innerHTML = previewError('We couldn’t load this profile.', true);
    }
  }
  function closePreview(fromHistory = false) {
    if (!previewId) return;
    const id = previewId;
    previewId = null; pvToken++;
    pv.classList.remove('is-open');
    scrim.hidden = true;
    panel.removeAttribute('inert'); host.removeAttribute('inert');
    const done = () => { if (!previewId) { pv.hidden = true; pvBody.innerHTML = ''; } };
    if (reduceMotion.matches) done(); else setTimeout(done, 260);
    if (!fromHistory && pushed) { pushed = false; history.back(); } else pushed = false;
    writeUrl();
    // Back to exactly where you were: same results, same scroll, focus on the card you opened.
    const card = cardOf(id);
    const back = card?.querySelector<HTMLElement>('.wc__hit') ?? returnFocus;
    back?.focus({ preventScroll: true });
  }
  pv.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t.closest('[data-preview-close]')) closePreview();
    if (t.closest('[data-preview-retry]') && previewId) openPreview(previewId, false);
    const g = t.closest<HTMLElement>('[data-g]');
    if (g) { const strip = g.closest('[data-gallery]')!.querySelector<HTMLElement>('.pg__strip')!; strip.scrollBy({ left: Number(g.dataset.g) * strip.clientWidth * 0.85, behavior: reduceMotion.matches ? 'auto' : 'smooth' }); }
  });
  scrim.addEventListener('click', () => closePreview());
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && previewId && !(e.target as Element)?.closest?.('[data-search]')) closePreview(); });
  addEventListener('popstate', () => { if (previewId) closePreview(true); });
  // Keep keyboard focus inside the drawer or sheet while it covers the page.
  pv.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !asModal()) return;
    const els = [...pv.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]')].filter((x) => x.offsetParent);
    if (!els.length) return;
    const first = els[0]!, last = els[els.length - 1]!;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // Swipe the phone sheet down from its top to close it.
  let pvY = -1;
  pv.addEventListener('touchstart', (e) => { pvY = pvBody.scrollTop <= 0 ? (e.touches[0]?.clientY ?? -1) : -1; }, { passive: true });
  pv.addEventListener('touchmove', (e) => { if (pvY >= 0 && mobile.matches && (e.touches[0]?.clientY ?? 0) - pvY > 90) { pvY = -1; closePreview(); } }, { passive: true });

  // ---------- Mobile bottom sheet (Map view): drag between peek, half and full ----------
  const toggle = $<HTMLButtonElement>('[data-sheet-toggle]');
  let sheet: Sheet = 'peek';
  const peekPx = () => parseFloat(getComputedStyle(root).getPropertyValue('--peek')) || 136;
  const sheetY = (st: Sheet) => {
    const h = panel.offsetHeight;
    return st === 'full' ? 0 : st === 'half' ? Math.round(h * 0.45) : h - peekPx();
  };
  const sheetActive = () => mobile.matches && view === 'map';
  function setSheet(st: Sheet | boolean) {
    if (typeof st === 'boolean') st = st ? 'half' : 'peek';
    sheet = st;
    panel.dataset.sheet = st;
    root.dataset.sheet = st;
    panel.classList.toggle('is-open', st !== 'peek');
    toggle.setAttribute('aria-expanded', String(st !== 'peek'));
    if (sheetActive()) panel.style.setProperty('--sheet-y', `${sheetY(st)}px`);
    else panel.style.removeProperty('--sheet-y');
    if (st !== 'full') panel.scrollTop = 0;
  }
  toggle.addEventListener('click', (e) => {
    if (dragMoved) { e.preventDefault(); return; }
    setSheet(sheet === 'peek' ? 'half' : sheet === 'half' ? 'full' : 'peek');
  });
  // Drag the sheet by its grip, or from anywhere on it while it isn't fully open (like a maps app).
  let dragStart = -1, dragBase = 0, dragMoved = false, lastY = 0, lastT = 0, vel = 0;
  panel.addEventListener('pointerdown', (e) => {
    if (!sheetActive() || e.button > 0) return;
    if (sheet === 'full' && !toggle.contains(e.target as Node)) return;
    dragStart = e.clientY; dragBase = sheetY(sheet); dragMoved = false; lastY = e.clientY; lastT = e.timeStamp; vel = 0;
  });
  window.addEventListener('pointermove', (e) => {
    if (dragStart < 0) return;
    const dy = e.clientY - dragStart;
    if (!dragMoved && Math.abs(dy) < 6) return;
    if (!dragMoved) { dragMoved = true; panel.classList.add('is-dragging'); (document.activeElement as HTMLElement | null)?.blur?.(); }
    const y = Math.max(0, Math.min(panel.offsetHeight - peekPx(), dragBase + dy));
    panel.style.setProperty('--sheet-y', `${y}px`);
    vel = (e.clientY - lastY) / Math.max(1, e.timeStamp - lastT); lastY = e.clientY; lastT = e.timeStamp;
  });
  const endDrag = () => {
    if (dragStart < 0) return;
    dragStart = -1;
    if (!dragMoved) return;
    panel.classList.remove('is-dragging');
    const y = parseFloat(panel.style.getPropertyValue('--sheet-y')) || 0;
    const order: Sheet[] = ['full', 'half', 'peek'];
    let next = order.reduce((a, b) => (Math.abs(sheetY(b) - y) < Math.abs(sheetY(a) - y) ? b : a));
    if (Math.abs(vel) > 0.5) { // a flick moves one step in its direction
      const i = order.indexOf(sheet);
      next = order[Math.max(0, Math.min(2, i + (vel > 0 ? 1 : -1)))]!;
    }
    setSheet(next);
    setTimeout(() => (dragMoved = false), 0);
  };
  // A drag that ends over a card must not also select it.
  panel.addEventListener('click', (e) => { if (dragMoved) { e.stopPropagation(); e.preventDefault(); } }, true);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  // Scrolling the results from half height opens the sheet fully, so the list is never cut off.
  panel.addEventListener('wheel', (e) => { if (sheetActive() && sheet !== 'full' && e.deltaY > 0) setSheet('full'); }, { passive: true });
  let touchY = 0;
  panel.addEventListener('touchmove', (e) => {
    if (sheetActive() && sheet === 'full' && panel.scrollTop <= 0 && (e.touches[0]?.clientY ?? 0) - touchY > 60) setSheet('half');
  }, { passive: true });
  panel.addEventListener('touchstart', (e) => { touchY = e.touches[0]?.clientY ?? 0; }, { passive: true });
  mobile.addEventListener('change', () => { setView(readPref()[device()] ?? view, false); setSheet(sheet); if (previewId) placePreview(); });
  addEventListener('resize', () => { if (sheetActive()) setSheet(sheet); });

  // ---------- Phones: Map / List pill ----------
  const modeBtn = $<HTMLButtonElement>('[data-mode]');
  const LIST_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>';
  const MAP_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/></svg>';
  function syncMode() {
    const isList = view === 'list';
    modeBtn.innerHTML = isList ? `${MAP_ICON}<span>Map</span>` : `${LIST_ICON}<span>List</span>`;
    modeBtn.setAttribute('aria-label', isList ? 'Show the map' : 'Show the list');
    modeBtn.hidden = !mobile.matches || mapFailed;
  }
  modeBtn.addEventListener('click', () => setView(view === 'list' ? 'map' : 'list'));

  /** Real counts for what's showing: each professional once (however many specialties), places counted apart. */
  function tally(ls: Listing[]) {
    const n = { musician: 0, studio: 0, organization: 0 };
    for (const l of ls) n[l.kind]++;
    const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
    return [n.musician && plural(n.musician, 'professional', 'professionals'), n.studio && plural(n.studio, 'studio', 'studios'),
      n.organization && plural(n.organization, 'group', 'groups')].filter(Boolean).join(' · ');
  }

  // ---------- The entrance question ----------
  const whereEl = $('[data-where]');
  const whereNote = $('[data-where-note]');
  const whereForm = $<HTMLFormElement>('[data-where-form]');
  const whereQ = $<HTMLInputElement>('[data-where-q]');
  const whereList = $<HTMLUListElement>('[data-where-list]');
  const whereCityBtn = $<HTMLButtonElement>('[data-where-city]');
  const whereBtns = () => root.querySelectorAll<HTMLButtonElement>('[data-where-opts] button');
  const whereLabel = () => { $('[data-where-label]').textContent = from?.mode === 'city' ? from.name : 'Worldwide'; };
  whereLabel();

  function showWhere() {
    root.dataset.entry = 'ask';
    whereEl.hidden = false;
    whereNote.textContent = '';
    whereForm.hidden = true; whereCityBtn.setAttribute('aria-expanded', 'false');
    whereQ.value = ''; cityOpts = []; cityAt = -1; whereList.hidden = true; whereList.innerHTML = '';
    whereBtns().forEach((b) => (b.disabled = false));
    if (!reduceMotion.matches) { whereEl.classList.remove('is-in'); void whereEl.offsetWidth; }
    whereEl.classList.add('is-in');
    if (mobile.matches) setSheet('peek');
    requestAnimationFrame(() => $<HTMLElement>('#wx-title').focus({ preventScroll: true }));
  }
  /** An answer: remember it (a city name or "worldwide", nothing else), then open World there. */
  function answer(next: From, p?: { name: string; lat: number; lng: number }) {
    from = next; saveFrom(next); whereLabel();
    whereEl.classList.remove('is-in');
    setTimeout(() => { whereEl.hidden = true; }, reduceMotion.matches ? 0 : 380);
    // A city: the directory and controls stay hidden until the camera has settled on it (see goPlace).
    if (next.mode === 'city' && p && map) root.dataset.entry = 'arrive'; else delete root.dataset.entry;
    if (next.mode === 'city' && p) { map?.release(false); preparing().then(() => goPlace(p)); }
    else { map?.release(true); if (place) { clearPlace(); changed(); } }
    requestAnimationFrame(() => map?.resize());
  }
  /** "Preparing your world": a moment on the chosen answer before the zoom into the city begins. */
  function preparing(): Promise<void> {
    if (reduceMotion.matches) return Promise.resolve();
    const el = document.createElement('p');
    el.className = 'opus-prep'; el.setAttribute('role', 'status'); el.textContent = 'Preparing your world';
    document.body.append(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    return new Promise((res) => setTimeout(() => {
      el.classList.add('is-out'); setTimeout(() => el.remove(), 600); res();
    }, 1100));
  }
  $('[data-where-open]').addEventListener('click', showWhere);
  $('[data-where-world]').addEventListener('click', () => answer({ mode: 'world' }));
  $('[data-where-me]').addEventListener('click', () => {
    if (!('geolocation' in navigator)) { whereNote.textContent = 'Location isn’t available in this browser. Enter a city or explore worldwide.'; return; }
    whereNote.textContent = 'Finding where you are…';
    whereBtns().forEach((b) => (b.disabled = true));
    // Asked only now, after the tap. The position stays in this page: only the nearest city is kept.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const near = nearestCity(CITIES, { lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (near && near.km < 1500) answer({ mode: 'city', name: near.city.name }, near.city);
        else { whereBtns().forEach((b) => (b.disabled = false)); whereNote.textContent = 'There’s no Opus city near you yet. Enter a city or explore worldwide.'; }
      },
      () => { whereBtns().forEach((b) => (b.disabled = false)); whereNote.textContent = 'Location is off. Enter a city or explore worldwide.'; },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 },
    );
  });

  // Enter a city: cities and regions from the gazetteer plus every place Opus members are in.
  /** metro: a suburb or neighbouring city belongs to a metro area, and World opens that area (Hoover → Birmingham). */
  type CityOpt = { name: string; sub: string; lat: number; lng: number; metro?: { name: string; lat: number; lng: number } };
  function cityOptions(text: string): CityOpt[] {
    const t = norm(text);
    if (!t) return [];
    const seen = new Set<string>();
    const out: CityOpt[] = [];
    const add = (o: CityOpt, hay: string[]) => {
      if (seen.has(o.name) || !hay.some((h) => norm(h).startsWith(t) || norm(h).includes(` ${t}`))) return;
      seen.add(o.name); out.push(o);
    };
    for (const c of CITIES) add({ name: c.name, sub: [c.region, c.countryName].filter(Boolean).join(', '), lat: c.lat, lng: c.lng }, [c.name, c.region ?? '', c.countryName, ...(c.aliases ?? [])]);
    for (const p of AREAS) {
      if (p.kind !== 'locality') continue;
      const m = AREA_BY_ID.get(p.metroId);
      if (!m) continue;
      add({ name: p.name, sub: `${m.name} area${m.region ? `, ${m.region}` : ''}`, lat: p.lat, lng: p.lng, metro: { name: m.name, lat: m.lat, lng: m.lng } }, [p.name]);
    }
    for (const p of PLACES) add({ name: p.name, sub: '', lat: p.lat, lng: p.lng }, [p.name]);
    return out.slice(0, 6);
  }
  let cityOpts: CityOpt[] = [];
  let cityAt = -1;
  function drawCities() {
    whereList.innerHTML = cityOpts.map((o, i) => `<li role="option" id="wx-o${i}" data-i="${i}" aria-selected="${i === cityAt}"><b>${esc(o.name)}</b>${o.sub ? `<span>${esc(o.sub)}</span>` : ''}</li>`).join('')
      || (whereQ.value.trim() ? '<li class="wx__none" role="presentation">No match yet. Try a nearby city, or explore worldwide.</li>' : '');
    const open = !!whereList.innerHTML;
    whereList.hidden = !open; whereQ.setAttribute('aria-expanded', String(open && cityOpts.length > 0));
    if (cityAt >= 0) whereQ.setAttribute('aria-activedescendant', `wx-o${cityAt}`); else whereQ.removeAttribute('aria-activedescendant');
  }
  whereCityBtn.addEventListener('click', () => {
    const open = whereForm.hidden;
    whereForm.hidden = !open; whereCityBtn.setAttribute('aria-expanded', String(open));
    if (open) whereQ.focus();
  });
  whereQ.addEventListener('input', async () => {
    const v = whereQ.value.trim();
    // A US ZIP code: its approximate centre, then the nearest Opus city (looked up in the browser).
    if (/^\d{1,5}$/.test(v)) {
      cityOpts = []; cityAt = -1;
      if (v.length < 5) { whereList.hidden = true; whereList.innerHTML = ''; return; }
      const pt = await zipPoint(v).catch(() => null);
      if (whereQ.value.trim() !== v) return; // typed on meanwhile
      const near = pt ? nearestCity(CITIES, pt) : undefined;
      if (near && near.km < 1500) cityOpts = [{ name: near.city.name, sub: `Nearest Opus city to ${v}`, lat: near.city.lat, lng: near.city.lng }];
      cityAt = cityOpts.length ? 0 : -1;
      whereList.innerHTML = cityOpts.length ? '' : `<li class="wx__none" role="presentation">${pt ? 'There’s no Opus city near that ZIP code yet.' : 'We don’t know that ZIP code. Try your city.'}</li>`;
      if (cityOpts.length) drawCities(); else { whereList.hidden = false; whereQ.setAttribute('aria-expanded', 'false'); }
      return;
    }
    cityOpts = cityOptions(whereQ.value); cityAt = cityOpts.length ? 0 : -1; drawCities();
  });
  whereQ.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!cityOpts.length) return;
      cityAt = (cityAt + (e.key === 'ArrowDown' ? 1 : -1) + cityOpts.length) % cityOpts.length; drawCities();
    } else if (e.key === 'Escape') { whereList.hidden = true; }
  });
  const pickCity = (o?: CityOpt) => { if (o) answer({ mode: 'city', name: o.metro?.name ?? o.name }, o.metro ?? o); };
  whereForm.addEventListener('submit', (e) => { e.preventDefault(); pickCity(cityOpts[Math.max(0, cityAt)]); });
  whereList.addEventListener('pointerdown', (e) => e.preventDefault());
  whereList.addEventListener('click', (e) => { const li = (e.target as Element).closest<HTMLElement>('[data-i]'); if (li) pickCity(cityOpts[Number(li.dataset.i)]); });

  /**
   * How much of the map the directory covers, so the camera centres things in the part you can actually see:
   * the floating card in desktop Map view, the bottom sheet on phones (at the height it is opening to).
   * Read from layout (offsets), not from getBoundingClientRect: during the entrance the directory is still
   * translated off-screen, and framing against that position left the city behind the card once it slid in.
   */
  function mapInset() {
    if (sheetActive()) {
      const y = sheet === 'full' ? sheetY('peek') : sheetY(sheet);
      return { left: 0, bottom: Math.max(0, host.offsetHeight - (panel.offsetTop + y)) };
    }
    if (view !== 'map') return { left: 0, bottom: 0 };
    return { left: Math.max(0, Math.round(panel.offsetLeft + panel.offsetWidth - host.offsetLeft)), bottom: 0 };
  }
  async function settleHandoff(m: WorldMapApi) {
    const img = document.querySelector<HTMLImageElement>('[data-handoff]');
    await Promise.race([m.ready(), new Promise((r) => setTimeout(r, 6000))]);
    img?.classList.add('is-gone');
    setTimeout(() => img?.remove(), 900);
  }
  /** The directory and controls slide in as the camera starts down into the city the visitor chose. */
  function revealAfterArrival() { if (root.dataset.entry === 'arrive') delete root.dataset.entry; }
  // ---------- Map: mounted only when a view shows it ----------
  const hasWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };
  function noMap() {
    mapFailed = true;
    $('[data-map-loading]').hidden = true; $('[data-map-fallback]').hidden = false;
    root.classList.add('is-nomap'); syncMode(); render();
  }
  let booting: Promise<void> | null = null;
  function boot(): Promise<void> {
    if (map || mapFailed || !loaded) return Promise.resolve();
    if (booting) return booting;
    if (!hasWebGL()) { noMap(); return Promise.resolve(); }
    $('[data-map-loading]').hidden = false;
    booting = (async () => {
      try {
        const { mountWorldMap } = await import('@/scripts/world-map');
        if (view === 'list') return; // switched away while loading
        // A city in the URL (from the homepage globe, a link or a search): World opens over it at the same
        // framing the homepage globe stops at, then flies down into the city. Every way in looks the same.
        const qc0 = params.get('city');
        let arrive = false;
        if (qc0 && !place) {
          const p = PLACES.find((x) => norm(x.name) === norm(qc0)) ?? findCity(qc0);
          if (p) { place = { name: p.name, lat: p.lat, lng: p.lng }; camera = { center: [p.lng, p.lat], zoom: 2.9 }; arrive = true; params.delete('city'); syncControls(); renderChips(); }
        }
        // From the homepage: open at exactly the view its camera stopped at, then move on from there.
        // This replaces any camera set while loading, so a city chosen meanwhile must still be flown to (flyOnBoot).
        const hand = handoff ? cameraFor(handoff, host, sheetActive() ? peekPx() : 0) : null;
        if (hand) { if (place && !arrive) flyOnBoot = true; camera = hand.camera; }
        const m = await mountWorldMap(host, matching(), {
          onSelect: (id) => select(id, 'map'),
          onMove: () => { if (inView) render(false); },
          onGroup: () => {
            // A grouped marker shows the members in that area: open the list in Map view or the sheet on phones.
            if (view === 'map' && !mobile.matches) { root.setAttribute('data-results-open', ''); }
            if (sheetActive()) setSheet('half');
          },
        }, { padBottom: sheetActive() ? peekPx() : 0, inset: mapInset, camera, pad: hand?.pad });
        if ((view as View) === 'list') { m.destroy(); return; } // switched to List while the map loaded
        map = m;
        root.classList.add('is-ready');
        $('[data-map-loading]').hidden = true;
        if (place) map.setPlace(place);
        if (active) map.setActive(active);
        render(false);
        // If the visitor already answered while the map loaded, don't make them wait for the handoff frame to fade.
        if (hand) { if (flyOnBoot) void settleHandoff(m); else await settleHandoff(m); }
        // "Preparing your world" stays a moment on the arrived view, then gives way as the zoom into the city begins.
        const prep = document.querySelector<HTMLElement>('[data-prep]');
        if (prep) {
          if (arrive && !reduceMotion.matches) await new Promise((r) => setTimeout(r, 650));
          prep.classList.add('is-out');
          setTimeout(() => prep.remove(), 600);
        }
        if (arrive && place) { inView = true; if (hand || entering) root.dataset.entry = 'arrive'; if (hand) m.release(false); map.flyToCity(place.lat, place.lng); revealAfterArrival(); changed(); if (askedView !== 'map' && mobile.matches && view === 'map') setSheet('half'); }
        else if (place && (flyOnBoot || !camera)) {
          // The visitor answered "Where are you connecting from?" while the map was still loading.
          flyOnBoot = false;
          if (hand && root.dataset.entry !== 'ask') m.release(false);
          map.flyToCity(place.lat, place.lng); revealAfterArrival();
        } else revealAfterArrival();
      } catch (err) {
        console.error('Map failed to load', err);
        noMap();
      } finally { booting = null; }
    })();
    return booting;
  }
  /** List view: remember the camera, then free the map entirely. */
  function suspendMap() {
    if (!map) return;
    camera = map.getCamera();
    map.destroy(); map = null;
    root.classList.remove('is-ready');
  }

  // ---------- Data: real published members from the directory API ----------
  async function load() {
    try {
      const r = await fetch('/api/world');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = (await r.json()) as { listings: Listing[]; stats: WorldStats; includesSample: boolean };
      ALL = d.listings;
      PLACES = placeIndex(ALL);
      byId = new Map(ALL.map((l) => [l.id, l]));
      const s = d.stats;
      const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
      const parts = [
        s.musicians && plural(s.musicians, 'professional', 'professionals'), s.studios && plural(s.studios, 'studio', 'studios'),
        s.organizations && plural(s.organizations, 'group', 'groups'), s.countries && plural(s.countries, 'country', 'countries'),
      ].filter(Boolean);
      $('[data-stats-line]').textContent = parts.join(' · ');
      $('[data-stats]').hidden = ALL.length === 0;
      $('[data-sample-note]').hidden = !d.includesSample;
      loadError = false;
    } catch (err) {
      console.error('Could not load World', err);
      loadError = true;
    }
    loaded = true;
    // A city in the URL works in every view, including List (no map).
    const qc = params.get('city');
    if (qc && view === 'list') {
      const p = PLACES.find((x) => norm(x.name) === norm(qc)) ?? findCity(qc);
      if (p) { place = { name: p.name, lat: p.lat, lng: p.lng }; camera = { center: [p.lng, p.lat], zoom: 10.2 }; params.delete('city'); }
    }
    syncControls(); renderChips();
    render();
    const p0 = params.get('p');
    if (p0 && byId.has(p0)) { params.delete('p'); select(p0, 'search'); }
  }

  syncControls();
  setView(view, false);
  applyRz(false);
  if (asking) showWhere();
  load().then(() => { if (view !== 'list') boot(); });
  loadMyCities();
}
