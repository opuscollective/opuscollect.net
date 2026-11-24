# CLAUDE.md — Opus Collective (opuscollect.net)

Read this first instead of re-exploring the repo. Keep Claude usage low: batch small fixes into one pass, avoid rebuild/re-screenshot loops, keep reports short.

## Stack
- Astro 5 + TypeScript, `@astrojs/cloudflare` adapter (static pages + server routes in the Worker).
- Hosted as the Cloudflare **Worker** project `opuscollect-net` (config: `wrangler.jsonc`). Not Pages, not Supabase.
- Backend is Cloudflare only: **D1** (`DB`, migrations in `migrations/`), **R2** (`MEDIA`, never public by URL, served through the Worker), **KV** (`WAITLIST`), a Durable Object (`CHAT`, Global Chat). Auth lives in the Worker.
- Listening parties (`/party`, `src/server/parties.ts`, `party-room.ts`, `src/lib/party.ts`): synced playback, not streaming. Each party's room is an instance of the existing `GlobalChat` Durable Object class named `party:<id>`, so no new class or Durable Object migration is needed (a new class can't ship through preview uploads). Audio is private in R2 under `party/`, served only by `/api/parties/:id/media/:track`.
- Preview builds use separate throwaway D1/R2/KV (`previews` block in `wrangler.jsonc`), `SITE_ENV=preview`, `SHOW_SAMPLE_DATA=1`. Production has `SHOW_SAMPLE_DATA=0`.
- Map/globe: `maplibre-gl`, `globe.gl`, `three`. Email sender: Resend (not yet set up by Bogo).
- The README's Cloudflare Pages notes are outdated; this file and `wrangler.jsonc` win.

## Commands
```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # astro check && astro build -> dist/
npm test          # node --test tests/*.test.ts
```
- Build before pushing; type errors fail it.
- When a test fails, re-run only the failing test(s).
- New D1 migration = new numbered file in `migrations/`. Apply to the **preview** D1 only unless Bogo approves production.

## Branches, previews, deploys
- `main` is the old v23 site and is stale. Work is a stacked PR chain; the active line is `claude/project-thread-imb3a0` (PR #6, base `claude/opus-world-views`). Check the open PRs/latest commit before choosing a base, and say which one you used.
- Previews are Cloudflare Workers preview URLs, e.g. `https://claude-project-thread-imb3a0-opuscollect-net.mbogoleny.workers.dev` (pattern: `<branch-slug>-opuscollect-net.mbogoleny.workers.dev`).
- Push to the session's assigned `claude/...` branch and open a PR. **Do not deploy to production, switch the domain, make structural changes or add paid services without Bogo's approval.**

## Key directories
```
src/pages/        routes (index, world, music, charts, network, collective, future, account, [handle].astro portfolios, api/)
src/layouts/      BaseLayout, PortfolioLayout
src/components/   UI by area (layout, ui, directory, home, world, ...)
src/server/       Worker-side logic: auth, profiles, directory, cities, connections, messages, chat, releases, bookings, business, events, future, email
src/lib/          shared client/server helpers
src/data/         site nav, cities, placeholder data (labeled)
src/styles/       tokens.css (design tokens), global.css, product.css (shared product system), world.css, music.css, events.css, business.css, app.css
src/worker.ts, src/middleware.ts   Worker entry and request middleware
migrations/       D1 SQL migrations
tests/            node --test suites (e.g. reserved usernames)
public/           static assets and legacy pages
out/, scripts/    build outputs and helper scripts
```
Use design tokens (`tokens.css`, `--m-*` motion tokens) and the shared product system; don't invent one-off styles.

## Product and naming
- Brand: **Opus Collective**. Motto: "The Future. The Legacy. The Sound." Ask Bogo before brand changes.
- Opus = the tech platform; Opus Collective = people/community/culture; **World** = geographic discovery (user-facing name is just "World", routes unchanged); **Charts** = public location-based rankings.
- Every product is one word: World, Music, Charts, Network, Collective, Future. Studios live under World, Releases under Music. Verified is a trust feature, not a top-level nav item.
- Desktop nav is centered (logo left, controls right) on a translucent header at the very top.
- The assistant is named "Opus": V1 = structured intents and real navigation, **no generative AI**. Shown as one dark glass "Opus" chip everywhere. Not AI-first.
- Terminology: **Specialty**, never "Discipline"; multiple specialties with one **Primary Specialty**.

## Profiles: look, founder, progress
- Profile = `src/pages/[handle].astro`; link-in-bio = `[handle]/links.astro`; editor = `/account/page`. Page settings live in KV `page:<profileId>` (`src/server/page-config.ts`), no migration.
- Look: accent + backdrop keys from the fixed palette in `src/lib/page-style.ts`, drawn in `src/styles/profile.css` (`.pf`, `.pf-bd[data-backdrop]`). Add options there; never free-form colours.
- Founder: `profiles.distinction = 'founder'` (migration 0016), set by hand with the SQL in that migration's header. It implies verified, the Founder mark and the founder-only look. Never hardcode a handle.
- Travel: home city = the profile city. `away` (where the member says they are now) and `cities` (marked by the member) live in the KV page settings; `/api/travel` reads and changes them. World shows a "New territory" card only after Use My Location puts a signed-in member in a non-home city; only the city id is used, nothing is saved without a tap. Marked cities earn nothing; travel achievements read real connections and parties.
- Greeting: `src/lib/greeting.ts` (time of day at home, "Welcome to <city>" when away; lines are working copy). Shown above the homepage hero title for signed-in members and as the Happening headline. Time comes from the viewer's clock, city from saved home/away only.
- Happening (working name): `/world/happening`, in World's sub-nav. `src/server/happening.ts` gathers real parties, events, studios and members for one metro; quiet cities get the designed empty state. `?city=<slug or metro id>` switches city.
- Social links: one list in `src/data/socials.ts` (hosts, placeholder, Opus-drawn line icon; no icon package). Stored in the profile's existing `links`; a bare @handle is expanded on save. Shown by `SocialRow.astro` on the profile and link page. Add a service there only.
- Levels, achievements, titles: `src/lib/progress.ts` (rules, names) + `src/server/progress.ts` (counts from existing tables, nothing stored). Real activity only; connections are capped so they can't carry a level. Names are proposed copy until Bogo confirms.

## Design rules
- "Apple-inspired presentation. Opus-original interaction." Cinematic technology meets editorial minimalism.
- Premium = **consistency**: World must look and behave identically from every entry point and stay sharp when zoomed. Differentiate from Apple (e.g. Opus OC location marker, not a blue dot).
- **Dark is the default theme** for visitors with no saved choice (Bogo 2026-11-20); saved Light/Dark/System choices win. The inline script in `BaseLayout.astro` applies it before paint (no flash). Light keeps its own warm palette.
- Homepage hero is approved, **do not redesign**: headline "Your world of music." (centered, one line on desktop), sub "Make connections around the world." Buttons: "Explore World →" (primary) and "Join" (straight to registration). Hero text in the lower half; Earth never cut off; globe auto-spins, not draggable. Product tiles: one name, one value line, one primary action, one real visual demo, no redundant secondary buttons.
- World: directory always on the left (~46% panel), listing-feed cards (Zillow-like): big 3:2 photos, details beneath, ~3px gaps, sharp corners. Desktop profiles slide out as a card to the right of the directory with the map still visible. Homepage card grid capped at 1480px.
- **Verified** badge: saturated Opus blue seal with white check. Green is only for "Open to collaborate". Verification is earned, never bought. Credits use Confirmed / Self-reported / Awaiting confirmation / Not on Opus, never "verified".
- Accent: restrained icy blue (#a9c7ec); sage (#9fcaa9) only for availability.
- **Charts: no pay-to-rank and no fabricated metrics.** Until real data exists it is an honest "Coming soon" preview.
- **Placeholder/sample data must be visibly labeled**, never presented as real members.
- Privacy: location is stored as city name only; professionals are counted once, separately from studios/orgs.

## Screenshots and QA (usage limits, Bogo 2026-11-19)
- Send only **one desktop (1440) and one phone (390)** screenshot per change, **light mode only**, unless Bogo asks for more.
- Prefer Sonnet; use Opus only for big builds (3D globe, World map, major architecture).
- Keep PR descriptions and replies short. Read this file rather than rediscovering the stack.
