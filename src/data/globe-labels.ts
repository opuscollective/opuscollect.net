/**
 * Names on the Earth, shared by the homepage globe and the World globe so both read the same:
 * continents in spaced capitals, oceans in italics, and a spread of major cities with a small dot.
 * Reference points only (no member data). Birmingham is included as the home of Opus.
 */
export interface GlobeLabel { lat: number; lng: number; text: string; kind: 'land' | 'sea' | 'city' }

export const GLOBE_LABELS: GlobeLabel[] = [
  { lat: 46, lng: -102, text: 'North America', kind: 'land' }, { lat: -14, lng: -60, text: 'South America', kind: 'land' },
  { lat: 46.5, lng: 19, text: 'Europe', kind: 'land' }, { lat: 6, lng: 21, text: 'Africa', kind: 'land' },
  { lat: 47, lng: 92, text: 'Asia', kind: 'land' }, { lat: -24, lng: 134, text: 'Australia', kind: 'land' },
  { lat: 32, lng: -42, text: 'North Atlantic Ocean', kind: 'sea' }, { lat: -24, lng: -16, text: 'South Atlantic Ocean', kind: 'sea' },
  { lat: 28, lng: -150, text: 'North Pacific Ocean', kind: 'sea' }, { lat: -28, lng: -118, text: 'South Pacific Ocean', kind: 'sea' },
  { lat: -22, lng: 78, text: 'Indian Ocean', kind: 'sea' },
  ...([
    ['Birmingham', 33.52, -86.81], ['New York', 40.71, -74.01], ['Los Angeles', 34.05, -118.24], ['Chicago', 41.88, -87.63],
    ['Toronto', 43.65, -79.38], ['Mexico City', 19.43, -99.13], ['Bogotá', 4.71, -74.07], ['Lima', -12.05, -77.04],
    ['São Paulo', -23.55, -46.63], ['Buenos Aires', -34.6, -58.38], ['London', 51.51, -0.13], ['Paris', 48.86, 2.35],
    ['Madrid', 40.42, -3.7], ['Berlin', 52.52, 13.4], ['Rome', 41.9, 12.5], ['Stockholm', 59.33, 18.07],
    ['Moscow', 55.76, 37.62], ['Istanbul', 41.01, 28.98], ['Cairo', 30.04, 31.24], ['Lagos', 6.52, 3.38],
    ['Kinshasa', -4.44, 15.27], ['Nairobi', -1.29, 36.82], ['Johannesburg', -26.2, 28.05], ['Dubai', 25.2, 55.27],
    ['Delhi', 28.61, 77.21], ['Mumbai', 19.08, 72.88], ['Beijing', 39.9, 116.4], ['Shanghai', 31.23, 121.47],
    ['Seoul', 37.57, 126.98], ['Tokyo', 35.68, 139.69], ['Singapore', 1.35, 103.82], ['Jakarta', -6.21, 106.85],
    ['Sydney', -33.87, 151.21],
  ] as const).map(([text, lat, lng]): GlobeLabel => ({ text, lat, lng, kind: 'city' })),
];

/** The label's element. Cities get a dot that sits on the place itself, with the name to its right. */
export function globeLabelEl(l: GlobeLabel): HTMLElement {
  const e = document.createElement('div');
  e.className = `gl-label gl-label--${l.kind}`;
  e.setAttribute('aria-hidden', 'true');
  if (l.kind === 'city') { const s = document.createElement('span'); s.textContent = l.text; e.append(document.createElement('i'), s); }
  else e.textContent = l.text;
  return e;
}
