/**
 * Transactional email (verification, password reset).
 * Uses Cloudflare Email Service when the EMAIL binding exists, otherwise Resend when
 * RESEND_API_KEY is set. Outside production, if neither is configured, the email is
 * logged to the Worker console so the flow can be tested.
 */
import { esc } from '@/lib/html';

export interface Mail { to: string; subject: string; heading: string; body: string; action: { label: string; url: string }; footnote: string }

function render(m: Mail) {
  const html = `<!doctype html><html><body style="margin:0;background:#050506;padding:40px 16px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#f2efea">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto"><tr><td>
<p style="margin:0 0 32px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#8e8890">Opus Collective</p>
<h1 style="margin:0 0 16px;font-size:26px;font-weight:500;letter-spacing:-.02em;color:#fff">${esc(m.heading)}</h1>
<p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#a39da5">${esc(m.body)}</p>
<p style="margin:0 0 28px"><a href="${esc(m.action.url)}" style="display:inline-block;padding:13px 22px;border-radius:999px;background:#fff;color:#000;text-decoration:none;font-weight:500;font-size:15px">${esc(m.action.label)}</a></p>
<p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#6f6a70">Or paste this link into your browser:<br><span style="color:#a39da5;word-break:break-all">${esc(m.action.url)}</span></p>
<p style="margin:32px 0 0;font-size:12px;line-height:1.6;color:#6f6a70">${esc(m.footnote)}</p>
</td></tr></table></body></html>`;
  const text = `${m.heading}\n\n${m.body}\n\n${m.action.label}: ${m.action.url}\n\n${m.footnote}\n\nOpus Collective`;
  return { html, text };
}

export type EmailResult = 'sent' | 'logged' | 'unconfigured';

export async function sendMail(env: Env, m: Mail): Promise<EmailResult> {
  const { html, text } = render(m);
  const from = env.EMAIL_FROM || 'Opus Collective <hello@opuscollect.net>';
  if (env.EMAIL) {
    await env.EMAIL.send({ from, to: m.to, subject: m.subject, html, text });
    return 'sent';
  }
  if (env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, html, text }),
    });
    if (!r.ok) throw new Error(`Resend error ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return 'sent';
  }
  if (env.SITE_ENV !== 'production') {
    console.log(`[email:dev] to=${m.to} subject="${m.subject}" link=${m.action.url}`);
    return 'logged';
  }
  console.error('[email] No email provider configured; message not sent:', m.subject);
  return 'unconfigured';
}

export const verifyEmailMail = (to: string, url: string): Mail => ({
  to, subject: 'Confirm your email for Opus',
  heading: 'Confirm your email',
  body: 'Welcome to Opus. Confirm this is your email address to finish setting up your account. The link works for 24 hours.',
  action: { label: 'Confirm email', url },
  footnote: "If you didn't create an Opus account, you can ignore this email.",
});

export const resetPasswordMail = (to: string, url: string): Mail => ({
  to, subject: 'Reset your Opus password',
  heading: 'Reset your password',
  body: 'Someone asked to reset the password for this Opus account. If that was you, choose a new password. The link works for 1 hour and only once.',
  action: { label: 'Choose a new password', url },
  footnote: "If you didn't ask for this, you can ignore this email. Your password won't change.",
});

/** A plain notification with one button (bookings, requests). */
export const noticeMail = (to: string, subject: string, heading: string, body: string, label: string, url: string, footnote = 'You’re receiving this because of activity on Opus World.'): Mail => ({
  to, subject, heading, body, action: { label, url }, footnote,
});
