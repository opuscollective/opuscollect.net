/** Small server helpers. Runs on the Cloudflare Worker only. */
export const now = () => Date.now();

const B64URL = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Random URL-safe id/token. 16 bytes for ids, 32 for secrets. */
export function randomId(bytes = 16) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return B64URL(b);
}

export async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

/** A user-facing error with a status code. Messages are safe to show on screen. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public field?: string) { super(message); }
}

export const fail = (e: unknown) => {
  if (e instanceof HttpError) return json({ error: e.message, field: e.field }, { status: e.status });
  console.error(e);
  return json({ error: 'Something went wrong on our side. Please try again.' }, { status: 500 });
};

export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 64_000): Promise<T> {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > maxBytes) throw new HttpError(413, 'That request is too large.');
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'That request is too large.');
  try { return JSON.parse(text || '{}') as T; } catch { throw new HttpError(400, 'Invalid request.'); }
}

export const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export const clientIp = (req: Request) => req.headers.get('cf-connecting-ip') ?? '0.0.0.0';

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;

export async function audit(db: D1Database, userId: string | null, action: string, detail?: unknown) {
  await db.prepare('INSERT INTO audit_log (id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(randomId(), userId, action, detail == null ? null : JSON.stringify(detail), now()).run();
}
