-- Clans (2026-11-20): a shared home for a band, collective, production crew or label.
-- Additive only: no existing table or row is changed.
--
-- A Clan is a profile with kind = 'organization', so it reuses what organizations already have:
-- a unique handle, photo, city (public centre point only), bio, World discovery and the events
-- organizer link (events.organizer_profile_id). Its owner is profiles.owner_user_id; more admins can be
-- added later through profile_managers (role 'admin').
--
-- clan_details   The group type. Shown publicly as Band, Collective, Production crew or Label.
-- clan_members   The roster. One row per spot. A spot is:
--                  open      a named spot with an invite link for someone new (only the hash of the link is stored)
--                  invited   an existing Opus member was invited and hasn't answered
--                  active    the member accepted; the only status ever shown publicly
--                  declined / left / removed   kept for the admins' history, never public
--                Every member keeps their own profile and works; leaving changes nothing on their profile.
-- clan_works     Works (releases) the admins chose to show on the Clan page. Only published releases
--                owned by, or with a confirmed credit for, an active member can be linked (checked in the Worker).

CREATE TABLE clan_details (
  profile_id  TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  group_type  TEXT NOT NULL CHECK (group_type IN ('band', 'collective', 'crew', 'label')),
  is_sample   INTEGER NOT NULL DEFAULT 0,   -- development data, always labeled on screen
  created_at  INTEGER NOT NULL
);

CREATE TABLE clan_members (
  id            TEXT PRIMARY KEY,
  clan_id       TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,                       -- as the admin wrote it; a linked member's profile name wins once active
  roles         TEXT NOT NULL DEFAULT '[]',          -- JSON: ["Lead vocals", "Guitar"]
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  status        TEXT NOT NULL CHECK (status IN ('open', 'invited', 'active', 'declined', 'left', 'removed')),
  is_admin      INTEGER NOT NULL DEFAULT 0,
  claim_hash    TEXT UNIQUE,                         -- sha256 of the invite link token, open spots only
  sort          INTEGER NOT NULL DEFAULT 0,
  invited_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  responded_at  INTEGER
);
CREATE INDEX clan_members_clan ON clan_members (clan_id, status, sort);
CREATE INDEX clan_members_user ON clan_members (user_id, status);
-- A member holds at most one live spot per Clan.
CREATE UNIQUE INDEX clan_members_one_live ON clan_members (clan_id, user_id) WHERE user_id IS NOT NULL AND status IN ('invited', 'active');

CREATE TABLE clan_works (
  clan_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  release_id  TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  sort        INTEGER NOT NULL DEFAULT 0,
  added_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (clan_id, release_id)
);
CREATE INDEX clan_works_release ON clan_works (release_id);
