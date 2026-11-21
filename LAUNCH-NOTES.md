# Launch rehearsal notes (Milestone 4)

Rehearsal ran against local astro dev + local D1 (never remote), map tiles blocked, /media stubbed (see below).

## Remaining launch blockers
- **Email sender (Resend)**: publishing a profile requires a confirmed email, and production has no sender, so live signups cannot publish. Needs Bogo's Resend key/domain.
- **Migrations 0010-0012** (Groups) not yet on the preview D1; Group pages/invites need them. Needs Bogo's OK.
- **Nav**: header shows ten items vs the five-item rule. Waiting on Bogo's answer.

## Recorded dependencies (not built)
- Sharing a Future milestone publicly needs a schema change (per-milestone visibility flag).
- Label setup stays "Coming soon". Venues, Airplay, Charts are honest "Coming soon" pages (no fabricated metrics).
- Street-level map tiles were never checked from the sandbox.
- Local dev only: reading an R2 object in `src/pages/media/[...key].ts` returns 500 under `astro dev` (miniflare cannot serialize the object). Production is unaffected; stub `/media` in browser tests.
