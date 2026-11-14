-- Opus messaging: one worldwide Global Chat, private messages between connections,
-- moderation and in-app notifications. Additive only: no existing table is altered.
--
-- Global Chat sends go through one GlobalChat Durable Object (src/server/chat-room.ts), which
-- enforces the 5 second cooldown and the content rules before a row is written here.
-- Retention: Global Chat rows older than 90 days are deleted by the room's housekeeping.

CREATE TABLE chat_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  -- visible: shown to everyone. held: hidden after member reports, waiting for a moderator.
  -- removed: taken down by a moderator.
  status      TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'held', 'removed')),
  flagged     INTEGER NOT NULL DEFAULT 0,       -- 1 = borderline, queued for a moderator to look at
  flag_reason TEXT,
  client_id   TEXT,                             -- the sender's id for this message, so a double tap saves once
  created_at  INTEGER NOT NULL,
  removed_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  removed_at  INTEGER
);
CREATE INDEX chat_messages_recent ON chat_messages(status, id);
CREATE INDEX chat_messages_user ON chat_messages(user_id, created_at);
CREATE UNIQUE INDEX chat_messages_client ON chat_messages(user_id, client_id) WHERE client_id IS NOT NULL;

-- Timeouts and bans from Global Chat. A ban never touches the member's account or profile.
CREATE TABLE chat_restrictions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('timeout', 'ban')),
  until       INTEGER,                          -- NULL for a ban without an end
  reason      TEXT NOT NULL DEFAULT '',
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL,
  lifted_at   INTEGER
);
CREATE INDEX chat_restrictions_user ON chat_restrictions(user_id, lifted_at);

-- Chat moderators besides admins. Kept apart from users.role so the users table is never altered.
CREATE TABLE chat_moderators (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  added_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE chat_reports (
  id           TEXT PRIMARY KEY,
  scope        TEXT NOT NULL CHECK (scope IN ('global', 'dm')),
  message_id   INTEGER NOT NULL,
  reporter_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL CHECK (reason IN ('spam', 'promo', 'harassment', 'hate', 'other')),
  note         TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  resolved_at  INTEGER,
  resolved_by  TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX chat_reports_once ON chat_reports(scope, message_id, reporter_id);
CREATE INDEX chat_reports_open ON chat_reports(resolved_at, created_at);

-- One-to-one conversations. a_id < b_id so a pair has exactly one row.
-- Each side's read time drives unread markers, synced across devices.
CREATE TABLE conversations (
  id               TEXT PRIMARY KEY,
  a_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  b_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at       INTEGER NOT NULL,
  last_message_at  INTEGER,
  last_sender_id   TEXT,
  last_preview     TEXT NOT NULL DEFAULT '',
  a_read_at        INTEGER NOT NULL DEFAULT 0,
  b_read_at        INTEGER NOT NULL DEFAULT 0,
  CHECK (a_id < b_id)
);
CREATE UNIQUE INDEX conversations_pair ON conversations(a_id, b_id);
CREATE INDEX conversations_a ON conversations(a_id, last_message_at);
CREATE INDEX conversations_b ON conversations(b_id, last_message_at);

CREATE TABLE dm_messages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id  TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body             TEXT NOT NULL,
  client_id        TEXT,
  created_at       INTEGER NOT NULL
);
CREATE INDEX dm_messages_conv ON dm_messages(conversation_id, id);
CREATE UNIQUE INDEX dm_messages_client ON dm_messages(sender_id, client_id) WHERE client_id IS NOT NULL;

-- In-app notifications. New private messages are counted from conversations, not stored here,
-- so there is one unread marker per conversation rather than one per message.
CREATE TABLE notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('connection_request', 'connection_accepted')),
  actor_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  ref_id      TEXT,
  created_at  INTEGER NOT NULL,
  read_at     INTEGER
);
CREATE INDEX notifications_user ON notifications(user_id, read_at, created_at);
