import type { APIRoute } from 'astro';
import { CITIES } from '@/data/cities';
import { nearestCity } from '@/scripts/hero-dive';

export const prerender = false;

/**
 * Explore World's first guess at where a visitor is: the Opus city nearest to the approximate area
 * Cloudflare already attaches to every request (from the network, city level at best). Asked only when
 * someone taps Explore World. Nothing is stored or logged, and only the Opus city's name and centre are
 * returned, never the visitor's own position. World always lets them change it.
 */
export const GET: APIRoute = ({ locals }) => {
  const cf = (locals.runtime as { cf?: { latitude?: string; longitude?: string } }).cf;
  const lat = Number(cf?.latitude), lng = Number(cf?.longitude);
  let city: { name: string; lat: number; lng: number } | null = null;
  if (cf?.latitude && cf?.longitude && Number.isFinite(lat) && Number.isFinite(lng)) {
    const near = nearestCity(CITIES, { lat, lng });
    if (near && near.km < 1500) city = { name: near.city.name, lat: near.city.lat, lng: near.city.lng };
  }
  return new Response(JSON.stringify({ city }), { headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
};
