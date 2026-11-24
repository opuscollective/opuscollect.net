-- Hire a member through Opus (first step: no payments). A member lists a few services (stored in the existing
-- `services` table against their musician profile). Anyone signed in can send a request for one of them.
-- Prices are "from" prices for display only; nothing is charged on Opus and price never affects ranking.
CREATE TABLE work_requests (
  id                 TEXT PRIMARY KEY,
  profile_id         TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,   -- the member being asked
  owner_user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id         TEXT REFERENCES services(id) ON DELETE SET NULL,
  -- Snapshot at request time, so later edits never change an existing request.
  service_name       TEXT NOT NULL,
  mode               TEXT NOT NULL CHECK (mode IN ('session', 'remote')),
  from_price_cents   INTEGER NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'USD',
  project            TEXT NOT NULL,                 -- what the requester needs (required)
  budget_note        TEXT NOT NULL DEFAULT '',
  deadline_note      TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'accepted', 'declined', 'withdrawn')),
  reply_note         TEXT NOT NULL DEFAULT '',
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE INDEX work_requests_owner ON work_requests(owner_user_id, status, created_at);
CREATE INDEX work_requests_requester ON work_requests(requester_user_id, created_at);
