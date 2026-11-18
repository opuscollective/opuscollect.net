/**
 * Global Chat content rules: "No promo. Just conversation."
 *
 * Pure functions, run by the GlobalChat room on the server before a message is saved
 * (the browser only shows the outcome). A message is judged on several signals together,
 * plus the sender's own recent messages, so a single word never decides on its own.
 *
 *   refuse: not posted; the sender sees why.
 *   flag:   posted, and queued for a moderator to look at.
 *   ok:     posted.
 */

export const MAX_LEN = 500;
export const COOLDOWN_MS = 5_000;
export const BURST_MAX = 30;               // messages per BURST_WINDOW_MS, on top of the cooldown
export const BURST_WINDOW_MS = 10 * 60_000;
export const DUPLICATE_WINDOW_MS = 10 * 60_000;
export const NEW_ACCOUNT_MS = 24 * 60 * 60_000;

export type Verdict = { verdict: 'ok' } | { verdict: 'flag'; reason: string } | { verdict: 'refuse'; reason: string; message: string };

/** Hosts members may link to in Global Chat: Opus itself (profiles, releases, World). */
const ALLOWED_HOSTS = /^(?:www\.)?opuscollect\.net$/i;

const STORE_WORDS = /\b(spotify|apple\s?music|itunes|soundcloud|youtube|youtu\.be|tiktok|instagram|insta|bandcamp|linktr\.?ee|distrokid|patreon|onlyfans|cash\s?app|venmo|paypal|beatstars|audiomack|twitch)\b/i;
const PROMO_PHRASES = [
  /\bcheck\s+(?:out\s+)?my\b/i,
  /\bmy\s+(?:new\s+)?(?:single|track|song|album|ep|mixtape|tape|video|beat|beats|drop|release|channel|page|merch)\b/i,
  /\b(?:out\s+now|new\s+music\s+out|just\s+dropped)\b/i,
  /\b(?:stream|listen\s+to|support)\s+my\b/i,
  /\b(?:follow|sub(?:scribe)?(?:\s+to)?)\s+(?:me|my)\b/i,
  /\blink\s+in\s+(?:my\s+)?bio\b/i,
  /\b(?:beats?|features?|verses?|mixes?)\s+for\s+sale\b/i,
  /\b(?:buy|cop|grab)\s+my\b/i,
  /\bpre-?save\b/i,
  /\b(?:use|promo|discount)\s+code\b/i,
  /\bdm\s+(?:me\s+)?for\s+(?:prices?|rates?|beats?|features?|promo)\b/i,
];
const THREATS = /\b(kill\s+your\s*self|kys|go\s+die)\b/i;

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>]+|\b[a-z0-9-]{2,}\.(?:com|net|org|io|co|me|app|fm|ly|gg|tv|link|to|be|xyz|info|biz|music|store|shop)(?:\/[^\s<>]*)?/gi;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const PHONE_RE = /(?:\+?\d[\s().-]*){10,}/;
const HANDLE_RE = /(?:^|\s)@[a-z0-9_.]{3,}/i;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;

/** Lowercase letters and digits only, so "Hello!!" and "hello" count as the same text. */
export function normalize(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');
}

function hostOf(raw: string) {
  const s = raw.replace(/^https?:\/\//i, '').replace(/^www\./i, 'www.');
  return s.split(/[/?#:]/)[0].replace(/[.,!?)]+$/, '');
}

/** Cleans what a member typed: trims, collapses runs of blank lines, strips control characters. */
export function cleanBody(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface Context {
  /** How long ago the account was created. */
  accountAgeMs: number;
  /** The sender's own recent messages (normalized), newest first, within DUPLICATE_WINDOW_MS. */
  recentOwn: string[];
  /** How many different members posted this same normalized text recently (a spam wave). */
  sameTextOthers?: number;
}

/** Judges one Global Chat message. Call with the cleaned body. */
export function assessGlobal(body: string, ctx: Context): Verdict {
  if (!body) return { verdict: 'refuse', reason: 'empty', message: 'Write something first.' };
  if (body.length > MAX_LEN) return { verdict: 'refuse', reason: 'length', message: `Keep it under ${MAX_LEN} characters.` };

  const norm = normalize(body);
  if (!norm) return { verdict: 'refuse', reason: 'empty', message: 'Write something first.' };
  for (const prev of ctx.recentOwn) {
    if (prev === norm || (norm.length >= 12 && (prev.includes(norm) || norm.includes(prev)) && Math.min(prev.length, norm.length) / Math.max(prev.length, norm.length) > 0.8)) {
      return { verdict: 'refuse', reason: 'duplicate', message: 'You just said that. Say something new.' };
    }
  }
  if (THREATS.test(body)) return { verdict: 'refuse', reason: 'harassment', message: 'That breaks the Global Chat rules.' };

  const links = [...body.matchAll(URL_RE)].map((m) => hostOf(m[0])).filter((h) => !ALLOWED_HOSTS.test(h));
  const newAccount = ctx.accountAgeMs < NEW_ACCOUNT_MS;
  if (links.length && newAccount) return { verdict: 'refuse', reason: 'link-new-account', message: 'New accounts can’t post links yet. Try again tomorrow.' };

  let score = 0;
  const why: string[] = [];
  const add = (n: number, r: string) => { score += n; why.push(r); };
  if (links.length) add(3, 'link');
  if (EMAIL_RE.test(body)) add(3, 'email');
  else if (PHONE_RE.test(body)) add(3, 'phone');
  if (STORE_WORDS.test(body)) add(1, 'platform');
  const phrases = PROMO_PHRASES.filter((re) => re.test(body)).length;
  if (phrases) add(phrases > 1 ? 3 : 2, 'promo-phrase');
  if (HANDLE_RE.test(body)) add(1, 'handle');
  const letters = body.replace(/[^\p{L}]/gu, '');
  if (letters.length >= 12 && letters.replace(/[^\p{Lu}]/gu, '').length / letters.length > 0.7) add(1, 'caps');
  if ((body.match(EMOJI_RE)?.length ?? 0) > 8) add(1, 'emoji');
  if (/(.)\1{9,}/u.test(body)) add(1, 'repeat');
  if ((ctx.sameTextOthers ?? 0) >= 2 && norm.length >= 8) add(2, 'wave');

  if (score >= 3) {
    const message = why.includes('link') ? 'Links to other sites aren’t allowed in Global. Share your Opus profile instead.'
      : why.includes('email') || why.includes('phone') ? 'Keep contact details out of Global. Connect first, then message privately.'
      : 'No promo in Global. Just conversation.';
    return { verdict: 'refuse', reason: why.join(','), message };
  }
  if (score === 2) return { verdict: 'flag', reason: why.join(',') };
  return { verdict: 'ok' };
}

/** Seconds left before a member may post again, from their last accepted send. 0 means now. */
export function cooldownLeft(lastSentAt: number | undefined, t: number) {
  if (!lastSentAt) return 0;
  const left = lastSentAt + COOLDOWN_MS - t;
  return left > 0 ? Math.ceil(left / 1000) : 0;
}
