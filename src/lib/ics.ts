/** iCalendar (.ics) feed for a member's Future. Pure: no database, no imports, so tests can run it directly. */
export interface IcsItem { id: string; title: string; detail: string; day: string | null; at: number; href: string; kind: string }

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** RFC 5545 line folding at 75 octets (counted as characters, which is safe for the ASCII-heavy lines we write). */
const fold = (l: string) => l.length <= 74 ? l : l.slice(0, 74) + '\r\n' + l.slice(74).match(/.{1,73}/g)!.map((x) => ' ' + x).join('\r\n');
const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateOnly = (d: string) => d.replace(/-/g, '');
const nextDay = (d: string) => dateOnly(new Date(Date.parse(d + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10));

export function buildIcs(items: IcsItem[], origin: string, now = Date.now()): string {
  const L: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Opus Collective//Future//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:My Opus Future', 'X-WR-CALDESC:Your sessions, release dates and events on Opus', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
  for (const i of items) {
    if (!i.day && !i.at) continue;
    L.push('BEGIN:VEVENT', `UID:${i.id}@opuscollect.net`, `DTSTAMP:${utc(now)}`);
    if (i.at > 0 && i.kind !== 'release') L.push(`DTSTART:${utc(i.at)}`, `DTEND:${utc(i.at + (i.kind === 'event' ? 2 : 1) * 3_600_000)}`);
    else L.push(`DTSTART;VALUE=DATE:${dateOnly(i.day!)}`, `DTEND;VALUE=DATE:${nextDay(i.day!)}`);
    L.push(`SUMMARY:${esc(i.title)}`, `DESCRIPTION:${esc([i.detail, new URL(i.href, origin).href].filter(Boolean).join('\n'))}`, `URL:${new URL(i.href, origin).href}`, 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

/** Month grid for a calendar view: weeks of 7 day cells (YYYY-MM-DD, with `inMonth`), Sunday first. */
export function monthGrid(ym: string): { day: string; inMonth: boolean }[][] {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const start = Date.UTC(y, m - 1, 1 - first.getUTCDay());
  const weeks: { day: string; inMonth: boolean }[][] = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) { const t = new Date(start + (w * 7 + d) * 86_400_000); row.push({ day: t.toISOString().slice(0, 10), inMonth: t.getUTCMonth() === m - 1 }); }
    if (w >= 4 && !row.some((c) => c.inMonth)) break;
    weeks.push(row);
  }
  return weeks;
}
