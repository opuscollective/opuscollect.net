// GET (called from src/pages/api/waitlist-export.ts): /api/waitlist-export?key=YOUR_EXPORT_KEY
// Downloads every signup as a CSV you can open in Excel or Google Sheets.
export async function onRequestGet({ request, env }) {
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!env.EXPORT_KEY || key !== env.EXPORT_KEY) return new Response('Not found', { status: 404 });
  if (!env.WAITLIST) return new Response('Waitlist not connected', { status: 500 });

  const rows = [];
  let cursor;
  do {
    const page = await env.WAITLIST.list({ prefix: 'signup:', cursor });
    for (const k of page.keys) {
      const r = await env.WAITLIST.get(k.name, 'json');
      if (r) rows.push(r);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  rows.sort((a, b) => a.joined.localeCompare(b.joined));
  const esc = (v) => {
    let t = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(t) && !/^@[a-z0-9._]+$/.test(t)) t = "'" + t; // stop spreadsheet formulas (plain @handles are safe)
    return `"${t.replace(/"/g, '""')}"`;
  };
  const header = ['joined', 'name', 'artist_name', 'email', 'instagram', 'other_socials', 'role', 'interests', 'country', 'kit'];
  const csv = [header.join(','), ...rows.map((r) =>
    [r.joined, r.name, r.artist_name, r.email, r.instagram, r.other_socials, r.role, (r.interests || []).join(' '), r.country, r.kit || ''].map(esc).join(','))].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="opus-waitlist-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
