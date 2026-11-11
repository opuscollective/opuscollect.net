-- Releases: what a member is working on and what they've put out.
-- Additive only. Each release belongs to one profile; the member chooses whether it appears on that profile.
-- Everything here is self-reported by the member and is labeled that way wherever it's shown.
CREATE TABLE releases (
  id               TEXT PRIMARY KEY,
  profile_id       TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  kind             TEXT NOT NULL DEFAULT 'single' CHECK (kind IN ('single', 'ep', 'album', 'mixtape', 'project')),
  stage            TEXT NOT NULL DEFAULT 'in_progress' CHECK (stage IN ('in_progress', 'released')),
  role             TEXT NOT NULL DEFAULT '',     -- the member's role on it, e.g. "Producer"
  artist           TEXT NOT NULL DEFAULT '',     -- primary artist, if not the member
  release_date     TEXT,                         -- YYYY, YYYY-MM or YYYY-MM-DD (planned or actual)
  link             TEXT NOT NULL DEFAULT '',     -- https only
  notes            TEXT NOT NULL DEFAULT '',     -- short description
  show_on_profile  INTEGER NOT NULL DEFAULT 1,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX releases_profile ON releases(profile_id, stage, release_date);
