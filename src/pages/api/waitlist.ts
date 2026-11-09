import type { APIRoute } from 'astro';
import { onRequestPost } from '@/server/legacy/waitlist.js';

export const prerender = false;

/** Waitlist signups (join, events pages). Saved to KV, then sent to Kit. */
export const POST: APIRoute = ({ request, locals }) => {
  const req = Object.assign(request, { cf: locals.runtime.cf });
  return onRequestPost({ request: req, env: locals.runtime.env });
};
