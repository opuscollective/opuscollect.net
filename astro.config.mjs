// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Marketing pages and Opus World are prerendered (static, fast, cached).
// Account, profile and API routes opt out with `export const prerender = false`
// and run on the Cloudflare Worker with D1 (database) and R2 (photos).
export default defineConfig({
  site: 'https://opuscollect.net',
  output: 'static',
  adapter: cloudflare({ imageService: 'passthrough', platformProxy: { enabled: true } }),
  build: { format: 'directory' },
  trailingSlash: 'ignore',
  security: { checkOrigin: true },
});
