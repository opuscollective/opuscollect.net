-- Future: member events, featured artists and personal saves (Milestone 1, 2026-11-14).
-- Additive only: no existing table is altered.
--
-- events            One row per event. Times are UTC ms plus the event's own IANA time zone, so the
--                   date and time read the same for everyone, wherever they are.
-- event_performers  Artists featured on an event. The organizer invites; the artist accepts. An artist is
--                   shown as performing only when status = 'confirmed', so nobody can be listed (or list
--                   themselves) as performing without both sides agreeing.
-- event_saves       A member's relationship to an event: saved (Add to My Future), interested or going.
--                   It never means a ticket or a confirmed RSVP with the organizer.

CREATE TABLE events (
  id                  TEXT PRIMARY KEY,
  organizer_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organizer_profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  category            TEXT NOT NULL CHECK (category IN ('performance', 'open_mic', 'showcase', 'listening_party', 'workshop', 'networking', 'conference', 'other')),
  start_at            INTEGER NOT NULL,
  end_at              INTEGER,
  timezone            TEXT NOT NULL,
  place_id            TEXT NOT NULL,          -- a public place from src/data/places.ts (city level)
  venue               TEXT NOT NULL DEFAULT '', -- venue or location name, as the organizer writes it
  link                TEXT,                   -- optional page for details or tickets elsewhere
  image_key           TEXT,
  visibility          TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'unlisted')),
  status              TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'canceled')),
  canceled_at         INTEGER,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE INDEX events_upcoming ON events (visibility, status, start_at);
CREATE INDEX events_by_organizer ON events (organizer_user_id, start_at);
CREATE INDEX events_by_place ON events (place_id, start_at);

CREATE TABLE event_performers (
  event_id     TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  profile_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'confirmed', 'declined')),
  invited_at   INTEGER NOT NULL,
  responded_at INTEGER,
  PRIMARY KEY (event_id, profile_id)
);
CREATE INDEX event_performers_by_profile ON event_performers (profile_id, status);

CREATE TABLE event_saves (
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relation    TEXT NOT NULL DEFAULT 'saved' CHECK (relation IN ('saved', 'interested', 'going')),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX event_saves_by_user ON event_saves (user_id);
