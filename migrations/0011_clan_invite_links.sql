-- Group invite links (2026-11-20): one reusable link per group that managers copy and share.
-- Anyone who opens it sees the group, then joins as a plain member (never an admin). Replacing the link
-- deactivates the old one. The token is shown only to the group's managers; membership is created in the Worker.
CREATE TABLE clan_invite_links (
  clan_id     TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL
);
