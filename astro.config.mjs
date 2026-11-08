// @ts-check
import { defineConfig } from 'astro/config';

// Static build for Cloudflare Pages. Pages Functions in /functions keep working.
// Phase 3 can switch to output: 'server' with @astrojs/cloudflare for D1-backed profiles.
export default defineConfig({
  site: 'https://opuscollect.net',
  output: 'static',
  build: { format: 'directory' },
  trailingSlash: 'ignore',
});
