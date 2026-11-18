/**
 * Follow City buttons, anywhere on the page: <button data-follow="<metro id>" data-follow-name="Birmingham">.
 * One request learns what the member follows; signed-out visitors are sent to sign in and come back here.
 * The server is the source of truth: the button shows the state it confirms, never a guess.
 */
type FollowState = { signedIn: boolean; ids: Set<string> };
let state: Promise<FollowState> | null = null;

export function followState(force = false): Promise<FollowState> {
  if (!state || force) {
    state = fetch('/api/cities/follows', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { signedIn: false, cities: [] }))
      .then((d: { signedIn: boolean; cities: { id: string }[] }) => ({ signedIn: d.signedIn, ids: new Set(d.cities.map((c) => c.id)) }))
      .catch(() => ({ signedIn: false, ids: new Set<string>() }));
  }
  return state;
}

function paint(b: HTMLButtonElement, on: boolean) {
  b.setAttribute('aria-pressed', String(on));
  b.classList.toggle('is-on', on);
  const label = b.querySelector('[data-follow-label]') ?? b;
  label.textContent = on ? 'Following' : 'Follow City';
  b.setAttribute('aria-label', on ? `Following ${b.dataset.followName ?? 'this city'}. Unfollow` : `Follow ${b.dataset.followName ?? 'this city'}`);
}

/** Wire every Follow button inside root that isn't wired yet. Safe to call after each render. */
export async function initFollowButtons(root: ParentNode = document) {
  const btns = [...root.querySelectorAll<HTMLButtonElement>('[data-follow]:not([data-follow-ready])')];
  if (!btns.length) return;
  btns.forEach((b) => { b.dataset.followReady = ''; b.addEventListener('click', () => toggle(b)); });
  const s = await followState();
  btns.forEach((b) => paint(b, s.ids.has(b.dataset.follow!)));
}

async function toggle(b: HTMLButtonElement) {
  const id = b.dataset.follow!;
  const s = await followState();
  if (!s.signedIn) {
    location.href = `/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`;
    return;
  }
  const on = !s.ids.has(id);
  b.disabled = true;
  try {
    const r = await fetch(`/api/cities/${encodeURIComponent(id)}/follow`, { method: on ? 'PUT' : 'DELETE', credentials: 'same-origin' });
    if (r.status === 401) { location.href = `/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`; return; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (on) s.ids.add(id); else s.ids.delete(id);
    document.querySelectorAll<HTMLButtonElement>(`[data-follow="${CSS.escape(id)}"]`).forEach((x) => paint(x, on));
    window.dispatchEvent(new CustomEvent('opus:follows', { detail: { id, following: on } }));
  } catch (err) {
    console.error('Follow failed', err);
    b.classList.add('is-error');
    setTimeout(() => b.classList.remove('is-error'), 1600);
  } finally { b.disabled = false; }
}
