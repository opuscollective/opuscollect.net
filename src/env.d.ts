/// <reference types="astro/client" />

// Cloudflare binding types, imported by name so they don't replace the browser DOM types.
type D1Database = import('@cloudflare/workers-types').D1Database;
type R2Bucket = import('@cloudflare/workers-types').R2Bucket;
type KVNamespace = import('@cloudflare/workers-types').KVNamespace;
type Fetcher = import('@cloudflare/workers-types').Fetcher;
type D1PreparedStatement = import('@cloudflare/workers-types').D1PreparedStatement;

interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  WAITLIST: KVNamespace;
  ASSETS: Fetcher;
  /** Cloudflare Email Service binding (optional until the domain is onboarded). */
  EMAIL?: { send(msg: { from: string; to: string; subject: string; html: string; text: string }): Promise<{ messageId: string }> };
  /** Resend API key (optional alternative to Cloudflare Email Service). Set with `wrangler secret put`. */
  RESEND_API_KEY?: string;
  EXPORT_KEY?: string;
  SITE_ENV: 'production' | 'preview' | 'development';
  SHOW_SAMPLE_DATA: string;
  EMAIL_FROM: string;
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {
    user: import('./server/session').SessionUser | null;
  }
}
