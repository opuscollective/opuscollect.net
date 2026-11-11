/** Client side of the release form: create or edit, then hand the saved release back. */
export interface ReleaseOut {
  id: string; title: string; kind: string; stage: 'in_progress' | 'released'; role: string; artist: string;
  releaseDate: string; link: string; notes: string; showOnProfile: boolean;
}

export function bindReleaseForm(form: HTMLFormElement, onSaved: (r: ReleaseOut, wasNew: boolean) => void) {
  const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const label = btn.textContent ?? '';
  const box = form.querySelector<HTMLElement>('[data-status]')!;
  const dateLabel = form.querySelector<HTMLElement>('[data-date-label]')!;
  const syncStage = () => { dateLabel.textContent = (form.elements.namedItem('stage') as RadioNodeList).value === 'released' ? 'Release date' : 'Target date'; };
  form.querySelectorAll('input[name="stage"]').forEach((r) => r.addEventListener('change', syncStage));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.querySelectorAll('.field.has-error').forEach((f) => f.classList.remove('has-error'));
    form.querySelectorAll('.field__error').forEach((f) => f.remove());
    box.textContent = ''; box.className = 'form-status';
    const v = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | null)?.value ?? '';
    const id = v('id');
    const body = {
      title: v('title'), kind: v('kind'), stage: (form.elements.namedItem('stage') as RadioNodeList).value, role: v('role'), artist: v('artist'),
      releaseDate: v('releaseDate'), link: v('link'), notes: v('notes'), showOnProfile: (form.elements.namedItem('showOnProfile') as HTMLInputElement).checked,
    };
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const res = await fetch(id ? `/api/releases/${encodeURIComponent(id)}` : '/api/releases', {
        method: id ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin',
      });
      const data = (await res.json().catch(() => ({}))) as { release?: ReleaseOut; error?: string; field?: string };
      if (!res.ok || !data.release) {
        const msg = data.error ?? 'Something went wrong. Please try again.';
        const field = data.field ? form.querySelector(`[name="${data.field}"]`)?.closest('.field') : null;
        if (field) { field.classList.add('has-error'); const p = document.createElement('p'); p.className = 'field__error'; p.setAttribute('role', 'alert'); p.textContent = msg; field.append(p); }
        else { box.textContent = msg; box.className = 'form-status notice notice--error'; box.setAttribute('role', 'alert'); }
        return;
      }
      onSaved(data.release, !id);
    } catch {
      box.textContent = 'Couldn’t reach Opus. Check your connection and try again.'; box.className = 'form-status notice notice--error'; box.setAttribute('role', 'alert');
    } finally { btn.disabled = false; btn.textContent = label; }
  });

  return {
    fill(r: ReleaseOut | null) {
      form.reset();
      const set = (n: string, val: string) => { const el = form.elements.namedItem(n) as HTMLInputElement | null; if (el) el.value = val; };
      set('id', r?.id ?? '');
      if (r) {
        set('title', r.title); set('kind', r.kind); set('role', r.role); set('artist', r.artist); set('releaseDate', r.releaseDate); set('link', r.link); set('notes', r.notes);
        (form.querySelector(`input[name="stage"][value="${r.stage}"]`) as HTMLInputElement).checked = true;
        (form.elements.namedItem('showOnProfile') as HTMLInputElement).checked = r.showOnProfile;
      }
      syncStage();
    },
  };
}
