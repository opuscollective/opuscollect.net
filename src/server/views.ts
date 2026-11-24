/**
 * Page views for members and studios: one KV counter per page per day (`views:<profileId>:<YYYY-MM-DD>`), kept ~70 days.
 * No database change. Counts are real page loads by other people: the owner's own visits and obvious crawlers are skipped.
 * KV isn't atomic, so two views in the same instant can count once; fine for a trend, and never inflated.
 */
const TTL = 70 * 86400;
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|lighthouse|curl|wget/i;
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

export async function recordView(env: { WAITLIST: KVNamespace }, ctx: { waitUntil(p: Promise<unknown>): void } | undefined, profileId: string, req: Request, skip = false) {
  if (skip || req.method !== 'GET' || BOT.test(req.headers.get('user-agent') ?? '')) return;
  const k = `views:${profileId}:${dayKey(Date.now())}`;
  const job = env.WAITLIST.get(k).then((v) => env.WAITLIST.put(k, String((Number(v) || 0) + 1), { expirationTtl: TTL })).catch(() => {});
  if (ctx) ctx.waitUntil(job); else await job;
}

export interface ViewSeries { days: { day: string; n: number }[]; total: number; thisWeek: number; lastWeek: number }

/** The last `n` days, oldest first. */
export async function viewSeries(env: { WAITLIST: KVNamespace }, profileId: string, n = 30): Promise<ViewSeries> {
  const now = Date.now();
  const days = await Promise.all(Array.from({ length: n }, (_, i) => {
    const day = dayKey(now - (n - 1 - i) * 86400000);
    return env.WAITLIST.get(`views:${profileId}:${day}`).then((v) => ({ day, n: Number(v) || 0 })).catch(() => ({ day, n: 0 }));
  }));
  const sum = (a: { n: number }[]) => a.reduce((s, d) => s + d.n, 0);
  return { days, total: sum(days), thisWeek: sum(days.slice(-7)), lastWeek: sum(days.slice(-14, -7)) };
}
