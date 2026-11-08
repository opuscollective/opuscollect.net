# Opus Collective · opuscollect.net

Astro + TypeScript static site for Cloudflare Pages.

## Run it
```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # type-checks, then outputs to dist/
```

## Cloudflare Pages settings
- Build command: `npm run build`
- Build output directory: `dist`
- Node version: 20 or newer (set `NODE_VERSION=22` in Pages env vars if needed)
- `functions/` stays at the project root, so the waitlist (`/api/waitlist`, `/api/waitlist-export`) keeps working. See WAITLIST-SETUP.md. Deploy via GitHub or Wrangler (`npx wrangler pages deploy dist`) so functions are included.

## Structure
```
src/
  styles/tokens.css      design tokens (color, type, space, motion)
  styles/global.css      reset, layout primitives, type utilities, reveal
  layouts/BaseLayout     <head>, SEO meta, header, footer
  components/
    layout/              SiteHeader, SiteFooter, ComingSoon
    ui/                  Button, Icon, Tag, SectionHeader, VerifiedBadge
    directory/           SearchBar, MusicianCard   (reused in Phase 2)
    home/                one component per homepage section
  data/                  site nav, disciplines, events, services, placeholder musicians
  types/musician.ts      profile model, ready to map onto D1 in Phase 3
  pages/                 index, directory, verified, services, sign-in, legal, 404
public/                  images, icons, and the original pages (about, releases,
                         community, events, join) served unchanged
functions/api/           Cloudflare Pages Functions (waitlist)
```

## Placeholder data
`src/data/placeholder-musicians.ts` is development-only sample data. Every card built from it
shows a visible "Placeholder" label and uses a neutral photo slot instead of a face.
Replace it with real, consenting members before launch.
