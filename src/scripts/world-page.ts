/**
 * Opus World page controller.
 *
 * One state, three views. Search text, filters, category, the searched city and the selected
 * profile live here, so switching between Map, Split and List never resets anything.
 * - Map: the globe fills the page; a compact panel floats over it.
 * - Split (desktop default): map left, results right, kept in sync.
 * - List (phone default): no map at all. The WebGL map is destroyed to save GPU and battery,
 *   and remounted at the same camera position when you come back.
 * Profiles open in a preview (panel, drawer or bottom sheet) without leaving the page.
 */
import { cardHtml, matches, isVerified, esc, type WorldFilters } from '@/lib/world';
import type { WorldStats } from '@/lib/world';
import { placeIndex, suggest, norm, type Place, type Suggestion } from '@/lib/world-search';
import { previewHtml, previewSkeleton, previewError } from '@/lib/world-preview';
import { installImageFallbacks } from '@/lib/media';
import { findCity } from '@/data/cities';
import { SPECIALTIES, toSpecialty } from '@/data/specialties';
import { hasPoint, type Listing } from '@/types/directory';
import type { ProfileDetail } from '@/server/world-detail';
import type { Camera, WorldMapApi } from '@/scripts/world-map';

type View = 'map' | 'split' | 'list';
type Sheet = 'peek' | 'half' | 'full';

const VIEW_KEY = 'opus.world.view.v1';
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
  const mobile = matchMedia('(max-width: 860px)');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  installImageFallbacks(root);

  let ALL: Listing[] = [];
  let PLACES: Place[] = [];
  let byId = new Map<string, Listing>();
  let loaded = false;
  let loadError = false;

  const f: WorldFilters = { kinds: [], specialty: '', genre: '', openToCollab: false, studioType: '', verifiedOnly: false, text: '' };
  let sort = 'recommended';
  let inView = true;
  let active: string | null = null;
  let map: WorldMapApi | null = null;
  let mapFailed = false;
  let camera: Camera | null = null;
  let place: { name: string; lat: number; lng: number } | null = null;
  let previewId: string | null = null;

  // ---------- URL state ----------
  const params = new URLSearchParams(location.search);
  const t = params.get('type');
  if (t === 'musician' || t === 'studio' || t === 'organization') f.kinds = [t];
  f.text = params.get('q') ?? '';
  f.specialty = toSpecialty(params.get('specialty') ?? params.get('discipline')); // "discipline" kept for old links
  f.genre = params.get('genre') ?? '';
  f.openToCollab = params.get('collab') === '1';
  f.verifiedOnly = params.get('verified') === '1';
  const st0 = params.get('studio');
  if (st0 === 'commercial' || st0 === 'home' || st0 === 'remote') f.studioType = st0;
  q.value = f.text;

  function writeUrl() {
    const u = new URL(location.href);
    const set = (k: string, v?: string | null) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
    set('type', f.kinds[0]); set('q', f.text); set('specialty', f.specialty || ''); set('genre', f.genre); set('studio', f.studioType || '');
    set('collab', f.openToCollab ? '1' : ''); set('verified', f.verifiedOnly ? '1' : ''); set('city', place?.name); set('p', previewId);
    history.replaceState(history.state, '', u);
  }

  // ---------- View mode: Map, Split, List ----------
  const readPref = (): Partial<Record<'desktop' | 'mobile', View>> => { try { return JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}'); } catch { return {}; } };
  const device = () => (mobile.matches ? 'mobile' : 'desktop');
  /** Phones have Map and List only; a saved Split means Map there. */
  const fit = (v: View | undefined): View => (mobile.matches ? (v === 'list' ? 'list' : v ? 'map' : 'list') : v ?? 'split');
  let view: View = fit(readPref()[device()]);

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
      setTimeout(() => map?.resize(), 360);
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
  // Map view: the results list opens on request so the map stays the main thing.
  $('[data-results-toggle]').addEventListener('click', () => {
    root.toggleAttribute('data-results-open');
    syncResultsToggle();
  });
  function syncResultsToggle() {
    const open = root.hasAttribute('data-results-open');
    const b = $<HTMLButtonElement>('[data-results-toggle]');
    b.setAttribute('aria-expanded', String(open));
    b.textContent = open ? 'Hide list' : 'Show list';
  }

  // ---------- Filters panel ----------
  const kind = () => f.kinds[0] ?? '';
  const filterCount = () => [f.specialty, f.genre, f.studioType, f.verifiedOnly, f.openToCollab].filter(Boolean).length;
  function syncControls() {
    $<HTMLSelectElement>('[data-specialty]').value = f.specialty ?? '';
    $<HTMLSelectElement>('[data-genre]').value = f.genre ?? '';
    $<HTMLSelectElement>('[data-studio-type]').value = f.studioType ?? '';
    $<HTMLInputElement>('[data-collab]').checked = !!f.openToCollab;
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
    if (place) c.push(chipHtml('place', `Near ${place.name}`));
    if (f.specialty) c.push(chipHtml('specialty', SPECIALTIES[f.specialty].plural));
    if (f.genre) c.push(chipHtml('genre', f.genre));
    if (f.studioType) c.push(chipHtml('studioType', { commercial: 'Recording studios', home: 'Home studios', remote: 'Remote services' }[f.studioType]));
    if (f.verifiedOnly) c.push(chipHtml('verified', 'Opus Verified'));
    if (f.openToCollab) c.push(chipHtml('collab', 'Open to collaborate'));
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
    if (k === 'collab') f.openToCollab = false;
    if (k === 'all') { resetAll(); return; }
    changed();
    q.focus();
  });

  function resetFilters() { f.specialty = ''; f.genre = ''; f.studioType = ''; f.verifiedOnly = false; f.openToCollab = false; sort = 'recommended'; inView = true; }
  function resetAll() { resetFilters(); f.kinds = []; f.text = ''; q.value = ''; clearPlace(); changed(); }
  /** Forget the searched city. When it was set, the globe also returns to the whole world so results widen again. */
  function clearPlace() {
    const had = !!place;
    place = null; map?.setPlace(null);
    if (had && map && map.getZoom() >= 4) map.resetView();
    if (had && !map) camera = null;
  }
  /** Something the visitor chose changed: sync controls and redraw with a gentle fade. */
  function changed() { syncControls(); renderChips(); render(true, true); }

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
      showEmpty('We couldn’t load Opus World.', 'Check your connection and try again.', [{ label: 'Try again', primary: true, run: () => { loaded = false; loadError = false; count.textContent = 'Loading Opus World…'; empty.hidden = true; load(); } }]);
      return;
    }
    const ls = visible();
    const ids = ls.map((l) => l.id).join(',');
    if (ids !== lastIds || !results.firstElementChild || results.querySelector('.wc--skeleton')) {
      results.innerHTML = ls.map(cardHtml).join('');
      if (animate && !reduceMotion.matches) {
        results.classList.remove('is-entering'); void results.offsetWidth; results.classList.add('is-entering');
      }
      lastIds = ids;
    }
    if (active) results.querySelector(`[data-id="${CSS.escape(active)}"]`)?.classList.add('is-active');
    results.hidden = ls.length === 0;

    const where = inArea() ? (place ? `near ${place.name}` : 'in this area') : nearPlace() ? `near ${place!.name}` : 'worldwide';
    count.textContent = ALL.length === 0 ? '' : ls.length ? `${ls.length} result${ls.length === 1 ? '' : 's'} ${where}` : '';
    $('[data-results-toggle]').hidden = !ls.length;

    if (ALL.length === 0) {
      showEmpty('Opus World is just opening.', 'Members appear here as soon as they publish a profile.', [{ label: 'Create your profile', primary: true, run: () => (location.href = '/sign-up') }]);
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
        showEmpty('No matches.', f.text ? `Nothing on Opus World matches “${f.text}” yet.` : 'Try fewer filters.', [
          { label: 'Clear filters', primary: true, run: resetAll },
        ]);
      }
      if (view === 'map') root.setAttribute('data-results-open', '');
    }
    if (empty.hidden) emptySig = '';
    if (updateMap) map?.setData(matching());
    writeUrl();
  }

  // ---------- Controls ----------
  root.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((b) =>
    b.addEventListener('click', () => {
      const k = b.dataset.kind as WorldFilters['kinds'][number] | '';
      f.kinds = k ? [k] : [];
      // Category-specific filters don't carry over to a category they don't apply to.
      if (k && k !== 'musician') { f.specialty = ''; f.genre = ''; f.openToCollab = false; }
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
  $<HTMLInputElement>('[data-collab]').addEventListener('change', (e) => { f.openToCollab = (e.target as HTMLInputElement).checked; changed(); });
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
  function goPlace(p: { name: string; lat: number; lng: number }) {
    place = p; inView = true;
    if (map) { map.setPlace(p); map.flyToCity(p.lat, p.lng); }
    else camera = { center: [p.lng, p.lat], zoom: 10.2 };
    changed();
    if (mobile.matches && view === 'map') setSheet('half');
  }

  // ---------- Selection and previews (card ↔ marker ↔ preview) ----------
  const cardOf = (id: string) => results.querySelector<HTMLElement>(`.wc[data-id="${CSS.escape(id)}"]`);
  function markActive(id: string | null) {
    active = id;
    results.querySelectorAll('.wc.is-active').forEach((x) => x.classList.remove('is-active'));
    if (id) cardOf(id)?.classList.add('is-active');
    map?.setActive(id);
  }
  /** Opening a profile from a card, a marker, or search: highlight both sides, then show the preview. */
  function select(id: string, from: 'card' | 'map' | 'search') {
    markActive(id);
    const l = byId.get(id);
    if (from === 'map') cardOf(id)?.scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    // Keep the visitor's map position; only pan if the marker is off screen.
    if (from !== 'map' && l && map) { if (from === 'search') map.flyToListing(l); else map.ensureVisible(l); }
    openPreview(id);
  }
  results.addEventListener('click', (e) => {
    const c = (e.target as Element).closest<HTMLElement>('.wc[data-id]');
    if (c) select(c.dataset.id!, 'card');
  });
  results.addEventListener('pointerover', (e) => { const c = (e.target as Element).closest<HTMLElement>('.wc'); map?.setHover(c?.dataset.id ?? null); });
  results.addEventListener('pointerleave', () => map?.setHover(null));
  results.addEventListener('focusin', (e) => { const c = (e.target as Element).closest<HTMLElement>('.wc'); map?.setHover(c?.dataset.id ?? null); });

  let pvToken = 0;
  let returnFocus: HTMLElement | null = null;
  let pushed = false;
  const asModal = () => mobile.matches || view === 'list';
  /** Where the preview sits depends on the view; the markup is the same everywhere. */
  function placePreview() {
    pv.dataset.pv = mobile.matches ? 'sheet' : view === 'list' ? 'drawer' : view === 'map' ? 'card' : 'panel';
    scrim.hidden = !asModal();
    pv.setAttribute('aria-modal', String(asModal()));
    // In Split view the results underneath stay in place (and keep their scroll), but leave the tab order.
    panel.toggleAttribute('inert', view === 'split' && !mobile.matches);
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
        const m = await mountWorldMap(host, matching(), {
          onSelect: (id) => select(id, 'map'),
          onMove: () => { if (inView) render(false); },
          onGroup: () => {
            // A grouped marker shows the members in that area: open the list in Map view or the sheet on phones.
            if (view === 'map' && !mobile.matches) { root.setAttribute('data-results-open', ''); syncResultsToggle(); }
            if (sheetActive()) setSheet('half');
          },
        }, { padBottom: sheetActive() ? peekPx() : 0, camera });
        if ((view as View) === 'list') { m.destroy(); return; } // switched to List while the map loaded
        map = m;
        root.classList.add('is-ready');
        $('[data-map-loading]').hidden = true;
        if (place) map.setPlace(place);
        if (active) map.setActive(active);
        render(false);
        const qc = params.get('city');
        if (qc && !place) {
          params.delete('city');
          const p = PLACES.find((x) => norm(x.name) === norm(qc)) ?? findCity(qc);
          if (p) goPlace({ name: p.name, lat: p.lat, lng: p.lng });
        } else if (place && !camera) map.flyToCity(place.lat, place.lng);
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
        s.musicians && plural(s.musicians, 'musician', 'musicians'), s.studios && plural(s.studios, 'studio', 'studios'),
        s.organizations && plural(s.organizations, 'organization', 'organizations'), s.countries && plural(s.countries, 'country', 'countries'),
      ].filter(Boolean);
      $('[data-stats-line]').textContent = parts.join(' · ');
      $('[data-stats]').hidden = ALL.length === 0;
      $('[data-sample-note]').hidden = !d.includesSample;
      loadError = false;
    } catch (err) {
      console.error('Could not load Opus World', err);
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
  syncResultsToggle();
  load().then(() => { if (view !== 'list') boot(); });
}
