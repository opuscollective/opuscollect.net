-- Opus Music: releases, tracks and linked credits.
-- A release is built by one member (its owner). Credits point at Opus members (user_id) or,
-- for people not on Opus yet, just a name. A credit that names a member stays 'pending'
-- until that member confirms it, and only confirmed credits appear on their profile.
-- Past releases are ordinary releases with released = 1, so they share one record.

CREATE TABLE releases (
  id             TEXT PRIMARY KEY,
  owner_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'single' CHECK (kind IN ('single', 'ep', 'album', 'mixtape')),
  release_date   TEXT,                          -- YYYY-MM-DD (planned or actual)
  released       INTEGER NOT NULL DEFAULT 0,    -- 1 = already out (added to the record after the fact)
  description    TEXT NOT NULL DEFAULT '',
  cover_key      TEXT,                          -- R2 object key
  links          TEXT NOT NULL DEFAULT '{}',    -- JSON: spotify, appleMusic, youtube, soundcloud, other
  genres         TEXT NOT NULL DEFAULT '[]',    -- JSON: values from src/data/genres.ts
  moods          TEXT NOT NULL DEFAULT '[]',    -- JSON: values from src/data/music.ts (the release's vibe)
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  published_at   INTEGER
);
CREATE INDEX releases_owner ON releases(owner_user_id, updated_at);
CREATE INDEX releases_public ON releases(status, release_date);

CREATE TABLE release_tracks (
  id          TEXT PRIMARY KEY,
  release_id  TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  title       TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX release_tracks_release ON release_tracks(release_id, position);

CREATE TABLE release_credits (
  id            TEXT PRIMARY KEY,
  release_id    TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  track_id      TEXT REFERENCES release_tracks(id) ON DELETE CASCADE,  -- NULL = the whole release
  role          TEXT NOT NULL,                                        -- key from src/data/music.ts
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,         -- linked Opus member, if any
  name          TEXT NOT NULL,                                        -- display name (member snapshot or typed name)
  status        TEXT NOT NULL CHECK (status IN ('unlinked', 'pending', 'confirmed', 'declined')),
  note          TEXT NOT NULL DEFAULT '',                             -- message sent with the request
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL,
  responded_at  INTEGER
);
CREATE INDEX release_credits_release ON release_credits(release_id);
CREATE INDEX release_credits_user ON release_credits(user_id, status);
CREATE UNIQUE INDEX release_credits_unique ON release_credits(release_id, coalesce(track_id, ''), role, coalesce(user_id, lower(name)));
