-- Feedback: a member posts a track (a link, nothing is hosted) and other members give it a thumbs up or a
-- thumbs down, one tap, with an optional comment. Open all week. A thumb on another member's track counts
-- toward the giver's level (src/lib/progress.ts), counted from these rows; no score is stored.

CREATE TABLE feedback_tracks (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,                     -- where the track plays (SoundCloud, Spotify, a private link...)
  title       TEXT NOT NULL,
  artist      TEXT NOT NULL DEFAULT '',
  artwork     TEXT NOT NULL DEFAULT '',          -- cover from the link lookup (known cover-art hosts only), or ''
  ask         TEXT NOT NULL DEFAULT '',          -- what the member wants ears on
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'removed')),
  created_at  INTEGER NOT NULL
);
CREATE INDEX feedback_tracks_feed ON feedback_tracks (status, created_at);
CREATE INDEX feedback_tracks_user ON feedback_tracks (user_id, created_at);

-- One thumb per member per track: 1 = up, -1 = down. Changing your mind replaces the row; taking it back deletes it.
CREATE TABLE feedback_votes (
  track_id    TEXT NOT NULL REFERENCES feedback_tracks(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote        INTEGER NOT NULL CHECK (vote IN (1, -1)),
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (track_id, user_id)
);
CREATE INDEX feedback_votes_user ON feedback_votes (user_id);

-- Optional comments.
CREATE TABLE feedback_notes (
  id          TEXT PRIMARY KEY,
  track_id    TEXT NOT NULL REFERENCES feedback_tracks(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'removed')),
  created_at  INTEGER NOT NULL
);
CREATE INDEX feedback_notes_track ON feedback_notes (track_id, created_at);
CREATE INDEX feedback_notes_user ON feedback_notes (user_id, track_id);
