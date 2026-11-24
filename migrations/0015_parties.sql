-- Listening parties: a member plays a work from their Opus Works for everyone at once.
-- Nothing is streamed: each listener's device plays the private file itself, kept in step by the
-- party's room (a Durable Object, src/server/party-room.ts). Files are playable only while the
-- party is live and are deleted a day after it ends.
-- Chat lives in the room's own storage and goes away with the party; only reports are kept here.

CREATE TABLE parties (
  id             TEXT PRIMARY KEY,
  host_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  release_id     TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  place_id       TEXT,                           -- metro the pin sits on in World; NULL = no pin
  starts_at      INTEGER NOT NULL,
  timezone       TEXT NOT NULL,
  note           TEXT NOT NULL DEFAULT '',       -- the host's line on the party page
  status         TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended', 'canceled')),
  current_track  INTEGER NOT NULL DEFAULT -1,    -- index of the track playing; listeners can only fetch tracks up to it
  started_at     INTEGER,
  ended_at       INTEGER,
  peak_listeners INTEGER NOT NULL DEFAULT 0,     -- the most people in the room at once (real, written when it ends)
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX parties_public ON parties (status, starts_at);
CREATE INDEX parties_host ON parties (host_user_id, starts_at);
CREATE INDEX parties_release ON parties (release_id);

CREATE TABLE party_tracks (
  id           TEXT PRIMARY KEY,
  party_id     TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  title        TEXT NOT NULL,
  note         TEXT NOT NULL DEFAULT '',         -- the artist's note, shown as the track starts
  audio_key    TEXT,                             -- private R2 key (never under /media)
  audio_type   TEXT,
  audio_bytes  INTEGER,
  duration_ms  INTEGER,
  visual_key   TEXT,                             -- optional pre-made video, played muted in step with the audio
  visual_type  TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX party_tracks_party ON party_tracks (party_id, position);

-- "Remind me": puts the party in the member's Future.
CREATE TABLE party_reminders (
  party_id    TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (party_id, user_id)
);
CREATE INDEX party_reminders_user ON party_reminders (user_id);

-- A listener reported a chat message. The text is copied here because the chat itself is not kept.
CREATE TABLE party_reports (
  id                TEXT PRIMARY KEY,
  party_id          TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  message_id        TEXT NOT NULL,
  author_user_id    TEXT NOT NULL,
  reporter_user_id  TEXT NOT NULL,
  body              TEXT NOT NULL,
  reason            TEXT NOT NULL,
  created_at        INTEGER NOT NULL,
  UNIQUE (party_id, message_id, reporter_user_id)
);

-- The host (or an Opus moderator) removed someone from a party. They can't come back into that room.
CREATE TABLE party_removals (
  party_id    TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  removed_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (party_id, user_id)
);
