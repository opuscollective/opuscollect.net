/**
 * Worker entry. Astro handles every request, except the Global Chat socket, which is upgraded
 * here (before Astro) and handed to the GlobalChat Durable Object with the member's identity.
 */
import type { SSRManifest } from 'astro';
import { App } from 'astro/app';
import { handle } from '@astrojs/cloudflare/handler';
import { GlobalChat } from './server/chat-room';
import { chatIdentity, room, userIdFromRequest } from './server/chat';

export { GlobalChat };

export function createExports(manifest: SSRManifest) {
  const app = new App(manifest);
  return {
    default: {
      async fetch(request: Request, env: Env, ctx: import('@cloudflare/workers-types').ExecutionContext) {
        const url = new URL(request.url);
        if (url.pathname === '/api/chat/socket') return chatSocket(request, env, url);
        return handle(manifest, app, request as never, env as never, ctx as never);
      },
    },
    GlobalChat,
  };
}

async function chatSocket(request: Request, env: Env, url: URL) {
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
  // Only our own pages may open a member's socket (cookies are sent cross-site on WebSocket upgrades).
  const origin = request.headers.get('origin');
  if (!origin || origin !== url.origin) return new Response('Cross-site request blocked', { status: 403 });
  if (!env.CHAT) return new Response('Chat isn’t available', { status: 503 });
  const uid = await userIdFromRequest(env.DB, request);
  if (!uid) return new Response('Sign in first', { status: 401 });
  const id = await chatIdentity(env.DB, uid);
  if (!id) return new Response('Sign in first', { status: 401 });
  const headers = new Headers({ upgrade: 'websocket', 'x-opus-identity': encodeURIComponent(JSON.stringify(id)) });
  return room(env).fetch('https://room/socket', { headers });
}
