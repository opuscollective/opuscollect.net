/**
 * Sign in by emailed code, as a popup. Any click on a link to /sign-in opens it (see BaseLayout); /sign-in itself
 * mounts the same flow inline. Step 1: email. Step 2: the 6-digit code. Nothing here trusts the browser:
 * the Worker checks the code (/api/auth/login-verify).
 */
import '@/styles/signin.css';
import { EMAIL_SENDING } from '@/lib/features';

/** How this person signed in last time on this device, so the form opens on it. Never the email or anything secret. */
const METHOD_KEY = 'opus.signin.method';
type Method = 'code' | 'password';
const savedMethod = (): Method => {
  try { const m = localStorage.getItem(METHOD_KEY); if (m === 'code' || m === 'password') return m; } catch { /* default below */ }
  // Nothing remembered: emailed codes when email works, the password form while it doesn't (see features.ts).
  return EMAIL_SENDING ? 'code' : 'password';
};
const remember = (m: Method) => { try { localStorage.setItem(METHOD_KEY, m); } catch { /* fine */ } };

interface Opts { next?: string; invite?: string; onDone?: (d: { joined?: { href?: string } | null }) => void; signUpHref?: string }

const post = async (action: string, body: unknown) => {
  const r = await fetch(`/api/auth/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as { error?: string }).error || 'Something went wrong. Try again.');
  return d as Record<string, unknown>;
};

export function mountSignin(root: HTMLElement, opts: Opts = {}) {
  root.innerHTML = `
    <form class="sm__step" data-s1 novalidate>
      <h2 class="sm__title">Sign in</h2>
      <p class="sm__lead">We’ll email you a code. No password needed.</p>
      <label class="sm__field"><span>Email</span><input name="email" type="email" autocomplete="email" inputmode="email" required /></label>
      <p class="sm__msg" data-msg role="alert" hidden></p>
      <button class="sm__btn" type="submit">Email me a code</button>
      <p class="sm__alt"><button type="button" class="sm__link" data-topw>Use a password instead</button></p>
      <p class="sm__alt">New to Opus? <a href="${opts.signUpHref ?? '/sign-up'}">Create an account</a></p>
    </form>
    <form class="sm__step" data-s3 novalidate hidden>
      <h2 class="sm__title">Sign in</h2>
      <label class="sm__field"><span>Email</span><input name="email" type="email" autocomplete="email" inputmode="email" required /></label>
      <label class="sm__field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required /></label>
      <p class="sm__msg" data-msg3 role="alert" hidden></p>
      <button class="sm__btn" type="submit">Sign in</button>
      <p class="sm__alt"><button type="button" class="sm__link" data-tocode>Email me a code instead</button> · <a href="/forgot-password">Forgot password?</a></p>
    </form>
    <form class="sm__step" data-s2 novalidate hidden>
      <h2 class="sm__title">Check your email</h2>
      <p class="sm__lead">We sent a 6-digit code to <b data-to></b>.</p>
      <p class="sm__dev" data-dev hidden></p>
      <label class="sm__field"><span>Code</span><input class="sm__code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" required /></label>
      <p class="sm__msg" data-msg2 role="alert" hidden></p>
      <button class="sm__btn" type="submit">Sign in</button>
      <p class="sm__alt"><button type="button" class="sm__link" data-resend>Send a new code</button> · <button type="button" class="sm__link" data-back>Use a different email</button></p>
    </form>`;
  const s1 = root.querySelector<HTMLFormElement>('[data-s1]')!;
  const s2 = root.querySelector<HTMLFormElement>('[data-s2]')!;
  const s3 = root.querySelector<HTMLFormElement>('[data-s3]')!;
  const msg3 = s3.querySelector<HTMLElement>('[data-msg3]')!;
  const msg1 = s1.querySelector<HTMLElement>('[data-msg]')!;
  const msg2 = s2.querySelector<HTMLElement>('[data-msg2]')!;
  const dev = s2.querySelector<HTMLElement>('[data-dev]')!;
  const email = s1.elements.namedItem('email') as HTMLInputElement;
  const code = s2.elements.namedItem('code') as HTMLInputElement;
  const show = (el: HTMLElement, text: string) => { el.textContent = text; el.hidden = !text; };
  const busy = (f: HTMLFormElement, on: boolean) => f.querySelectorAll('button, input').forEach((x) => ((x as HTMLButtonElement).disabled = on));

  async function send(): Promise<boolean> {
    show(msg1, ''); busy(s1, true);
    try {
      const d = await post('login-code', { email: email.value });
      s2.querySelector('[data-to]')!.textContent = email.value.trim();
      // Previews without an email provider return the code so the flow can be tested. Production never does.
      show(dev, typeof d.devCode === 'string' ? `Preview only: email isn’t set up here yet. Your code is ${d.devCode}.` : '');
      return true;
    } catch (e) { show(msg1, (e as Error).message); return false; }
    finally { busy(s1, false); }
  }
  s1.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!(await send())) return;
    s1.hidden = true; s2.hidden = false; code.value = ''; code.focus();
  });
  const verify = async () => {
    show(msg2, ''); busy(s2, true);
    try {
      const d = await post('login-verify', { email: email.value, code: code.value, ...(opts.invite ? { invite: opts.invite, join: true } : {}) });
      remember('code');
      opts.onDone?.(d as { joined?: { href?: string } | null });
    } catch (e) { show(msg2, (e as Error).message); busy(s2, false); code.select(); }
  };
  s2.addEventListener('submit', (e) => { e.preventDefault(); void verify(); });
  code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, '').slice(0, 6); if (code.value.length === 6) void verify(); });
  s2.querySelector('[data-resend]')!.addEventListener('click', async () => { if (await send()) show(msg2, 'A new code is on its way.'); else show(msg2, msg1.textContent || ''); });
  s2.querySelector('[data-back]')!.addEventListener('click', () => { s2.hidden = true; s1.hidden = false; email.focus(); });
  // Password option: same account, same session, no code.
  const email3 = s3.elements.namedItem('email') as HTMLInputElement;
  const pw = s3.elements.namedItem('password') as HTMLInputElement;
  s1.querySelector('[data-topw]')!.addEventListener('click', () => { email3.value = email.value; s1.hidden = true; s3.hidden = false; (email3.value ? pw : email3).focus(); });
  s3.querySelector('[data-tocode]')!.addEventListener('click', () => { email.value = email3.value; s3.hidden = true; s1.hidden = false; email.focus(); });
  s3.addEventListener('submit', async (e) => {
    e.preventDefault(); show(msg3, ''); busy(s3, true);
    try {
      const d = await post('login', { email: email3.value, password: pw.value, ...(opts.invite ? { invite: opts.invite, join: true } : {}) });
      remember('password');
      opts.onDone?.(d as { joined?: { href?: string } | null });
    } catch (err) { show(msg3, (err as Error).message); busy(s3, false); pw.select(); }
  });
  if (savedMethod() === 'password') { s1.hidden = true; s3.hidden = false; email3.focus(); }
  else email.focus();
}

let dlg: HTMLDialogElement | null = null;
/** Opens the sign-in popup. `next` is where to go afterwards; without it the current page reloads, signed in. */
export function openSignin(next?: string) {
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.className = 'sm';
    dlg.setAttribute('aria-label', 'Sign in');
    dlg.innerHTML = '<button type="button" class="sm__x" aria-label="Close">×</button><div data-mount></div>';
    document.body.append(dlg);
    dlg.querySelector('.sm__x')!.addEventListener('click', () => dlg!.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg!.close(); });
  }
  mountSignin(dlg.querySelector<HTMLElement>('[data-mount]')!, {
    signUpHref: next ? `/sign-up?next=${encodeURIComponent(next)}` : '/sign-up',
    onDone: (d) => { if (d.joined?.href) location.href = d.joined.href; else if (next) location.href = next; else location.reload(); },
  });
  dlg.showModal();
}
