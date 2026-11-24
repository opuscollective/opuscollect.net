-- Group chat: one private room per group, for its active members only.
-- Existing messages tables can't carry this: conversations is a strict two-person pair (a_id < b_id)
-- and dm_messages hangs off it. Group messages hang off the group's profile instead, and each member
-- keeps one read marker per group, so unread state is the same on every device.
CREATE TABLE group_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  clan_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'session')),
  body        TEXT NOT NULL DEFAULT '',
  session     TEXT,                    -- JSON for kind = 'session': { title, detail, when, at, href }
  session_at  INTEGER,                 -- start time (ms) for shared sessions, so Upcoming can sort and expire them
  client_id   TEXT,                    -- the sender's id for this message, so a double tap saves once
  created_at  INTEGER NOT NULL
);
CREATE INDEX group_messages_room ON group_messages (clan_id, id);
CREATE INDEX group_messages_upcoming ON group_messages (clan_id, session_at) WHERE kind = 'session';
CREATE UNIQUE INDEX group_messages_client ON group_messages (sender_id, client_id) WHERE client_id IS NOT NULL;

CREATE TABLE group_reads (
  clan_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (clan_id, user_id)
);

-- Answers to a shared session: Going puts it in the member's Future (and their calendar feed).
CREATE TABLE group_rsvps (
  message_id  INTEGER NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('going', 'no')),
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX group_rsvps_user ON group_rsvps (user_id, status);
