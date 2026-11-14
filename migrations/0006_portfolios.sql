-- Opus profiles as personal portfolio websites (opuscollect.net/<username>).
-- Everything here extends the existing profiles row. Featured releases point at Opus Music
-- (releases.id); they are never copied, so Music stays the single source of truth.

-- One line under the name in the hero ("Visionary Artist & Founder of Opus Collective").
ALTER TABLE profiles ADD COLUMN tagline TEXT NOT NULL DEFAULT '';

-- Focal point of the hero photo as "x% y%" (CSS object-position). Keeps the face in frame on every screen.
ALTER TABLE profiles ADD COLUMN cover_focus TEXT NOT NULL DEFAULT '50% 35%';

-- 1 = show the hero photo in black and white.
ALTER TABLE profiles ADD COLUMN cover_mono INTEGER NOT NULL DEFAULT 0;

-- Featured Work, in the member's order. JSON array:
--   {"t":"release","id":"<releases.id>"}                       a published release they own or are confirmed on
--   {"t":"work","id":"…","title":"…","url":"…","kind":"music-video","imageKey":"p/<profile>/work-….jpg"|null}
-- NULL = never customized: show their published releases, newest first.
ALTER TABLE profiles ADD COLUMN featured TEXT;

-- 0 = published, but ask search engines not to index it (it stays reachable by link).
ALTER TABLE profiles ADD COLUMN allow_indexing INTEGER NOT NULL DEFAULT 1;

-- Previous usernames. Old links keep redirecting to the current one, and nobody else can claim them.
CREATE TABLE profile_handle_history (
  handle      TEXT PRIMARY KEY COLLATE NOCASE,
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL
);
CREATE INDEX profile_handle_history_profile ON profile_handle_history(profile_id);
