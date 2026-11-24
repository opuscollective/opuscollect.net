/**
 * Feature switches. Hiring through Opus is built but OFF: without payments there is no refund path and too much
 * liability, so Bogo put it on hold (2026-11-23). Turn it on only together with payments and migration 0013.
 */
export const HIRE_ENABLED = false;

/**
 * Email confirmation. OFF for now: no email service is connected yet (Resend isn't set up), so a confirmation
 * link can never arrive and nobody could publish or connect. While this is false, members can publish, appear
 * in World and connect right away; confirming is still asked for, as "confirm your email to secure your account",
 * with a resend button on the account page. Sign-in also opens on the password form, because emailed codes
 * can't arrive either.
 * Flip to true once email sends for real: every gate (publish, connect, events, groups, parties, chat) and the
 * emailed-code sign-in default come back exactly as before. Nothing else needs to change.
 * (Coordinator's call on 2026-11-24, awaiting Bogo's yes.)
 */
export const EMAIL_CONFIRM_REQUIRED = false;
