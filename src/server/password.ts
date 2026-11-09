/**
 * Password hashing with PBKDF2-SHA256 (Web Crypto, built into Workers).
 * 100,000 iterations is the Workers maximum. Each hash has its own 16-byte salt.
 * Format: pbkdf2$<iterations>$<salt b64>$<hash b64>
 */
const ITER = 100_000;
const enc = new TextEncoder();
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await derive(password, salt, ITER))}`;
}

/** A fixed hash used to spend the same time when the email doesn't exist (no account enumeration by timing). */
export const DUMMY_HASH = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export async function verifyPassword(password: string, stored: string) {
  const [alg, it, s, h] = stored.split('$');
  if (alg !== 'pbkdf2' || !it || !s || !h) return false;
  const got = new Uint8Array(await derive(password, unb64(s), Number(it)));
  const want = unb64(h);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i]! ^ want[i]!; // constant-time compare
  return diff === 0;
}

/** Rules shown to the user. Length matters most; we also block the most common passwords. */
const COMMON = new Set(['password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyuiop', 'iloveyou', 'opuscollective', 'opus1234', 'abc12345', 'letmein123', 'password12', 'qwerty1234']);
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return 'Use at least 10 characters.';
  if (pw.length > 200) return 'That password is too long.';
  if (COMMON.has(pw.toLowerCase())) return 'That password is too common. Try a short phrase instead.';
  return null;
}
