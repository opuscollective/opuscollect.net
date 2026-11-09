/**
 * Progressive JSON form helper for account pages.
 * Collects named fields, posts JSON, shows field errors inline and a status message.
 */
export interface FormOptions {
  url: string;
  /** Turn form values into the request body. Defaults to name/value pairs (checkboxes as booleans). */
  body?: (form: HTMLFormElement) => unknown;
  onSuccess: (data: Record<string, unknown>) => void | Promise<void>;
  busyLabel?: string;
  /** Called after an error response has been shown. */
  onError?: (data: Record<string, unknown>, status: number) => void;
}

export function values(form: HTMLFormElement) {
  const out: Record<string, unknown> = {};
  for (const el of Array.from(form.elements) as HTMLInputElement[]) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value;
  }
  return out;
}

export function status(form: HTMLFormElement, msg: string, kind: 'ok' | 'error' | 'warn' = 'error') {
  const box = form.querySelector<HTMLElement>('[data-status]');
  if (!box) return;
  box.className = `form-status notice notice--${kind}`;
  box.textContent = msg;
  box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
}

export function bindForm(form: HTMLFormElement, opts: FormOptions) {
  const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const label = btn?.textContent ?? '';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.querySelectorAll('.field.has-error').forEach((f) => f.classList.remove('has-error'));
    form.querySelectorAll('.field__error').forEach((f) => f.remove());
    const box = form.querySelector<HTMLElement>('[data-status]');
    if (box) { box.textContent = ''; box.className = 'form-status'; }
    if (btn) { btn.disabled = true; btn.textContent = opts.busyLabel ?? 'Working…'; }
    try {
      const res = await fetch(opts.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(opts.body ? opts.body(form) : values(form)),
        credentials: 'same-origin',
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const msg = String(data.error ?? 'Something went wrong. Please try again.');
        const field = data.field ? form.querySelector<HTMLElement>(`[name="${String(data.field)}"]`)?.closest('.field') : null;
        if (field) {
          field.classList.add('has-error');
          const p = document.createElement('p');
          p.className = 'field__error'; p.textContent = msg; p.setAttribute('role', 'alert');
          field.append(p);
          field.querySelector<HTMLElement>('input, select, textarea')?.focus();
        } else status(form, msg, 'error');
        opts.onError?.(data, res.status);
        return;
      }
      await opts.onSuccess(data);
    } catch {
      status(form, 'We couldn’t reach Opus. Check your connection and try again.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = label; }
    }
  });
}
