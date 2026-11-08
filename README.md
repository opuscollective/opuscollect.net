# Opus Collective — refined source files

Open index.html or upload this folder to your static host. All six pages use site.css and site.js. The tall four-card navigation is on index.html. Edit height and breakpoints under .opus-explore-card in site.css.

Waitlist: see WAITLIST-SETUP.md (Cloudflare Pages Functions + KV). Presave links: Amazing → https://ditto.fm/amazing-bogo, Scenic → https://ditto.fm/scenic-bogo.

## v2 — vision-first restructure
- Home hero now says what Opus is, with two clear actions: Join the waitlist (primary) and Enter the Discord.
- Hero side nav matches the real pages (Home, About, Releases, Community, Events, Join).
- New "What Opus is" statement + stats directly under the hero.
- The four tall cards are now "How Opus works": 01 Connect (Now) → 02 Release (Now) → 03 Gather (Coming) → 04 Build (Summer 2027).
- About: new "What ownership means here" section (the four questions).
- Events: #summit and #conferences anchors; buttons send ?interest=summit / ?interest=conferences to the waitlist.
- Every waitlist button now says "Join the waitlist"; the Join page explains vital membership.
- Presave buttons live: Amazing (home + releases) and Scenic (releases).
- Removed the photo reel from Home (it was all portraits of Bogo).
- Community: new "Events in the server" section with banners for Collective Call, Feedback Wednesday, Live Music Reviews, Opus Sessions and King of the Hill. Program count updated to 10.
- Home "Connect" card now uses the crowned OC mark (images/event-king-portrait.jpg) instead of a portrait.

## v3 — motion + new home order
Home: hero → the vision → Amazing (timer + release timeline) → Explore Opus (About, Releases, Community, Events) → creed → Don't create in isolation.
Motion (all in site.css / site.js, switched off automatically for visitors who turn on "reduce motion"):
- Hero staggers in; side rails fade in; scroll arrow bobs.
- Sections rise in as you scroll; on inner pages this is applied automatically.
- Vision statement lights up word by word.
- Countdown digits tick; the timeline draws itself to "Today" and marks each release as it passes.
- Amazing cover settles in; Explore cards stagger in; creed lines land one at a time.
The countdown now lives in site.js (one place to change the date).

## v4
- Home hero: logo, name, tagline, and two buttons only (Become a vital member / Join the Discord). Left-side menu removed.
- The four cards (About, Releases, Community, Events) now sit right under the hero and are nearly full-screen tall.
- About page: full founder feature (#founder): intro, "The story so far" timeline, the Leny-becoming-Bogo quote, Why he built Opus, and presave buttons.

## v5
- Scenic cover unblurred everywhere (home Releases card + releases page).
- Community card: new OC chat-bubble mark (images/community-mark.jpg).
- About card + founder intro: Scenic-era portrait (images/bogo-scenic.jpg).

## v6
- Releases page rebuilt: the Opus catalog is an animated vertical timeline (line fills as you scroll, release dots light up, covers slide in). Countdown sits inside the Amazing entry.
- Community releases are now a catalog: Spotlight (with a playable Spotify player), a swipeable "Latest drops" shelf, and an "Artists in the collective" row.
  - Covers: drop square images into images/releases/ named luciaism.jpg, but-i-want-you-to-know-me.jpg, 4x3.jpg, old-me.jpg, saving-grace.jpg. They replace the colored tiles automatically.
  - To change the Spotlight, edit the album name, artist, line and the Spotify album ID in the "opus-spot-hero" block on releases.html.
- Home cards reordered: About, Community, Releases, Events. Community card now uses a clean glowing OC logo.

## v7
- About: founder timeline removed; intro keeps the "Founded by Bogo…" line.
- Covers added in images/releases/: luciaism, but-i-want-you-to-know-me, old-me, eternal-dream (Natalie Chludz EP, links to her Spotify artist page), patient-list (Exlines, shown as "Coming soon", not clickable).
- Spotlight background now picks up a soft glow from the featured cover.

## v8
- 4x3 cover added (jayx3 & 403gon).
- "Artists in the collective" row removed.

## v9
- Release timeline scaled down about 25% on desktop (cards 605px to 444px wide). Design unchanged; phone layout unchanged.

## v10
- saving grace cover added; credited to chrme.shwty & Natalie Chludz.

## v11
- New Summit resort photo (images/summit-resort.jpg) on the home Events card and the Events page.

## v12
- luciaism (NUGGET!) now links to https://unitedmasters.com/m/luciaism (Spotlight button, Spotlight cover, shelf tile).
- v13: Spotlight Spotify player replaced with a large clickable cover (play button) that opens UnitedMasters.
- v14: Spotlight now rotates through all six community releases every 6 seconds (cover, artist, title, one-line description, Listen now). Pauses on hover, has dots + arrows, swipes on phones. Edit slides in the "opus-spot-slide" blocks on releases.html.

## v15
- About page rebuilt: founder first (Leny Mbogo / Bogo / Founder, Opus Collective / Birmingham, AL), then Notable releases (Amazing + Scenic), a short About Opus with four pillars, a scrolling culture line, and the join banner. Removed the long ownership, "why Opus" and story sections.

## v18
- Removed the scrolling culture ticker from the About page.

## v19
- Waitlist now works on Cloudflare Pages: functions/api/waitlist.js saves signups to KV; functions/api/waitlist-export.js downloads them as CSV. Setup steps in WAITLIST-SETUP.md.

## v23 (refining the editorial home)
- One label system for every chapter: hairline + "01 / THE MOVEMENT" on the left, a small tag on the right (01 Movement, 02 Culture, 03 Find your way in, 04 What's next, 05 Creed).
- One background (pure black) for the whole page; chapters are separated by the hairlines instead of grey bands.
- Culture gallery: same rounded corners, frame and black-and-white-to-color hover as the four cards. "The people" tile now uses the Opus Sessions artwork (the Collective Call banner was getting cropped mid-sentence). On phones the gallery is a swipe row.
- What's next is now real and dated: the first project under Opus (Oct 26, 2026), Birmingham conferences (2027), the Opus Summit (Summer 2027, 200 creatives), the Opus Mixtape.
- Arrows: ↗ only on links that leave the site (Scenic presave, socials); → for pages on the site.
- Tighter spacing between chapters.
- Vision (01) is now a light editorial banner: warm off-white, dark type, the Scenic portrait fading in from the right (on phones it sits on top and fades down).
- Scenic tile in the culture gallery is framed on the face at every screen width.
- Vision banner now shows a clickable collage of collective releases instead of the Scenic portrait: Scenic largest in the middle, then Amazing, luciaism, 4x3, But I want you to know me, Old Me, Eternal Dream, saving grace and Patient List (marked "Soon", not clickable). Titles appear on hover. On phones the collage sits above the vision text.
- Releases timeline: the handle follows your finger smoothly and stays wherever you drop it; it only snaps when dropped close to a date (SNAP in site.js, 0.14).
