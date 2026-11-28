// Thumbs up / down (src/components/feedback/Thumbs.astro). The tap shows at once; the server's real counts replace it.
document.addEventListener('click', async (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.fbv__b');
  const box = btn?.closest<HTMLElement>('[data-fbv]');
  if (!btn || !box || btn.disabled || box.dataset.busy) return;
  const btns = [...box.querySelectorAll<HTMLButtonElement>('.fbv__b')];
  const before = btns.map((b) => [b.getAttribute('aria-pressed'), b.querySelector('[data-n]')!.textContent] as const);
  const vote = btn.getAttribute('aria-pressed') === 'true' ? 0 : Number(btn.dataset.v);
  const paint = (v: number, ups?: number, downs?: number) => btns.forEach((b) => {
    const mine = Number(b.dataset.v), n = b.querySelector<HTMLElement>('[data-n]')!, was = b.getAttribute('aria-pressed') === 'true';
    b.setAttribute('aria-pressed', String(mine === v));
    n.textContent = String(ups === undefined ? Math.max(0, Number(n.textContent) + (mine === v ? 1 : 0) - (was ? 1 : 0)) : mine === 1 ? ups : downs);
  });
  paint(vote); box.dataset.busy = '1';
  try {
    const r = await fetch('/api/feedback/' + encodeURIComponent(box.dataset.fbv!), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vote }) });
    const d = (await r.json().catch(() => ({}))) as { vote?: number; ups?: number; downs?: number; error?: string };
    if (!r.ok) throw new Error(d.error || 'Couldn’t save that.');
    paint(d.vote ?? vote, d.ups, d.downs);
    document.dispatchEvent(new CustomEvent('opus:feedback-vote', { detail: { id: box.dataset.fbv, vote: d.vote ?? vote } }));
  } catch (x) {
    btns.forEach((b, i) => { b.setAttribute('aria-pressed', before[i]![0] ?? 'false'); b.querySelector('[data-n]')!.textContent = before[i]![1]; });
    box.title = (x as Error).message;
  } finally { delete box.dataset.busy; }
});
