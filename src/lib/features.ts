/**
 * Feature switches. Hiring through Opus is built but OFF: without payments there is no refund path and too much
 * liability, so Bogo put it on hold (2026-11-23). Turn it on only together with payments and migration 0013.
 */
export const HIRE_ENABLED = false;

/**
 * Email confirmation is REQUIRED (Bogo, 2026-11-24): Opus is a directory of real people, so nobody is public,
 * counted, or able to connect, message, join groups or host until their email is confirmed. A member can fill in
 * their whole profile first; confirming is the last step. One account per email. Leave this true.
 * (false lets unconfirmed members publish; it exists only so the gate lives in one place.)
 */
export const EMAIL_CONFIRM_REQUIRED = true;

/**
 * Whether Opus can send email yet. False until Resend (or Cloudflare Email) is connected. It only chooses what
 * the sign-in form opens on for someone with no remembered method: the password form while emailed codes can't
 * arrive, emailed codes once they can. Flip to true when email sends for real.
 */
export const EMAIL_SENDING = false;
