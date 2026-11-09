import type { APIRoute } from 'astro';
import { onRequestGet } from '@/server/legacy/waitlist-export.js';

export const prerender = false;

/** CSV export of waitlist signups. Requires ?key=EXPORT_KEY; answers 404 otherwise. */
export const GET: APIRoute = ({ request, locals }) => onRequestGet({ request, env: locals.runtime.env });
