/**
 * Local city gazetteer used for search and fly-to. No external geocoder is called,
 * so search works offline and costs nothing. A geocoding API can replace this later.
 */
export interface City { name: string; region?: string; country: string; countryName: string; lat: number; lng: number; aliases?: string[] }

export const CITIES: City[] = [
  { name: 'Birmingham', region: 'AL', country: 'US', countryName: 'United States', lat: 33.5186, lng: -86.8104 },
  { name: 'Atlanta', region: 'GA', country: 'US', countryName: 'United States', lat: 33.749, lng: -84.388, aliases: ['atl'] },
  { name: 'Nashville', region: 'TN', country: 'US', countryName: 'United States', lat: 36.1627, lng: -86.7816 },
  { name: 'Memphis', region: 'TN', country: 'US', countryName: 'United States', lat: 35.1495, lng: -90.049 },
  { name: 'New Orleans', region: 'LA', country: 'US', countryName: 'United States', lat: 29.9511, lng: -90.0715, aliases: ['nola'] },
  { name: 'Houston', region: 'TX', country: 'US', countryName: 'United States', lat: 29.7604, lng: -95.3698 },
  { name: 'Dallas', region: 'TX', country: 'US', countryName: 'United States', lat: 32.7767, lng: -96.797 },
  { name: 'Austin', region: 'TX', country: 'US', countryName: 'United States', lat: 30.2672, lng: -97.7431 },
  { name: 'Miami', region: 'FL', country: 'US', countryName: 'United States', lat: 25.7617, lng: -80.1918 },
  { name: 'New York', region: 'NY', country: 'US', countryName: 'United States', lat: 40.7128, lng: -74.006, aliases: ['nyc', 'new york city', 'brooklyn'] },
  { name: 'Philadelphia', region: 'PA', country: 'US', countryName: 'United States', lat: 39.9526, lng: -75.1652, aliases: ['philly'] },
  { name: 'Chicago', region: 'IL', country: 'US', countryName: 'United States', lat: 41.8781, lng: -87.6298 },
  { name: 'Detroit', region: 'MI', country: 'US', countryName: 'United States', lat: 42.3314, lng: -83.0458 },
  { name: 'Los Angeles', region: 'CA', country: 'US', countryName: 'United States', lat: 34.0522, lng: -118.2437, aliases: ['la'] },
  { name: 'San Francisco', region: 'CA', country: 'US', countryName: 'United States', lat: 37.7749, lng: -122.4194, aliases: ['sf', 'bay area'] },
  { name: 'Seattle', region: 'WA', country: 'US', countryName: 'United States', lat: 47.6062, lng: -122.3321 },
  { name: 'Toronto', region: 'ON', country: 'CA', countryName: 'Canada', lat: 43.6532, lng: -79.3832 },
  { name: 'Montreal', region: 'QC', country: 'CA', countryName: 'Canada', lat: 45.5019, lng: -73.5674 },
  { name: 'Mexico City', country: 'MX', countryName: 'Mexico', lat: 19.4326, lng: -99.1332, aliases: ['cdmx'] },
  { name: 'Kingston', country: 'JM', countryName: 'Jamaica', lat: 17.9712, lng: -76.7936 },
  { name: 'São Paulo', country: 'BR', countryName: 'Brazil', lat: -23.5505, lng: -46.6333, aliases: ['sao paulo'] },
  { name: 'Rio de Janeiro', country: 'BR', countryName: 'Brazil', lat: -22.9068, lng: -43.1729, aliases: ['rio'] },
  { name: 'Bogotá', country: 'CO', countryName: 'Colombia', lat: 4.711, lng: -74.0721, aliases: ['bogota'] },
  { name: 'London', country: 'GB', countryName: 'United Kingdom', lat: 51.5074, lng: -0.1278 },
  { name: 'Manchester', country: 'GB', countryName: 'United Kingdom', lat: 53.4808, lng: -2.2426 },
  { name: 'Paris', country: 'FR', countryName: 'France', lat: 48.8566, lng: 2.3522 },
  { name: 'Berlin', country: 'DE', countryName: 'Germany', lat: 52.52, lng: 13.405 },
  { name: 'Amsterdam', country: 'NL', countryName: 'Netherlands', lat: 52.3676, lng: 4.9041 },
  { name: 'Stockholm', country: 'SE', countryName: 'Sweden', lat: 59.3293, lng: 18.0686 },
  { name: 'Madrid', country: 'ES', countryName: 'Spain', lat: 40.4168, lng: -3.7038 },
  { name: 'Lagos', country: 'NG', countryName: 'Nigeria', lat: 6.5244, lng: 3.3792 },
  { name: 'Accra', country: 'GH', countryName: 'Ghana', lat: 5.6037, lng: -0.187 },
  { name: 'Johannesburg', country: 'ZA', countryName: 'South Africa', lat: -26.2041, lng: 28.0473, aliases: ['joburg'] },
  { name: 'Nairobi', country: 'KE', countryName: 'Kenya', lat: -1.2921, lng: 36.8219 },
  { name: 'Seoul', country: 'KR', countryName: 'South Korea', lat: 37.5665, lng: 126.978 },
  { name: 'Tokyo', country: 'JP', countryName: 'Japan', lat: 35.6762, lng: 139.6503 },
  { name: 'Mumbai', country: 'IN', countryName: 'India', lat: 19.076, lng: 72.8777 },
  { name: 'Sydney', country: 'AU', countryName: 'Australia', lat: -33.8688, lng: 151.2093 },
  { name: 'Melbourne', country: 'AU', countryName: 'Australia', lat: -37.8136, lng: 144.9631 },
];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Best-effort match on city, "City, ST", country name or alias. */
export function findCity(query: string): City | undefined {
  const q = norm(query.split(',')[0] ?? '');
  if (!q) return undefined;
  return (
    CITIES.find((c) => norm(c.name) === q || c.aliases?.some((a) => norm(a) === q)) ??
    CITIES.find((c) => norm(c.name).startsWith(q)) ??
    CITIES.find((c) => norm(c.countryName) === q)
  );
}

export function suggestCities(query: string, limit = 6): City[] {
  const q = norm(query);
  if (!q) return [];
  return CITIES.filter((c) => norm(c.name).includes(q) || norm(c.countryName).includes(q) || c.aliases?.some((a) => norm(a).startsWith(q))).slice(0, limit);
}
