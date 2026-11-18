/**
 * US ZIP code → approximate centre (US Census ZCTA centres, public/data/us-zip.txt, ~140 KB gzipped).
 * Loaded only when someone types a five-digit ZIP into World's entrance question. The whole table is
 * downloaded, so the ZIP itself is never sent anywhere.
 */
let table: Promise<Map<number, { lat: number; lng: number }>> | null = null;

function load() {
  table ??= fetch('/data/us-zip.txt')
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((txt) => {
      const m = new Map<number, { lat: number; lng: number }>();
      let zip = 0;
      for (const row of txt.split(';')) {
        const [d, la, lo] = row.split(',');
        zip += parseInt(d, 36);
        m.set(zip, { lat: parseInt(la, 36) / 100, lng: parseInt(lo, 36) / 100 });
      }
      return m;
    })
    .catch((err) => { table = null; throw err; });
  return table;
}

/** The centre of a US ZIP code, or null if it isn't a known residential ZIP. */
export async function zipPoint(zip: string): Promise<{ lat: number; lng: number } | null> {
  if (!/^\d{5}$/.test(zip)) return null;
  return (await load()).get(Number(zip)) ?? null;
}
