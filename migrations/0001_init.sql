-- Opus Collective core schema (Cloudflare D1 / SQLite).
-- Times are Unix epoch milliseconds. Ids are random URL-safe strings.
-- Apply with: npx wrangler d1 migrations apply opus-db --remote

PRAGMA foreign_keys = ON;

-- ---------- Accounts ----------
CREATE TABLE users (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash      TEXT NOT NULL,
  email_verified_at  INTEGER,
  role               TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

-- Session tokens are stored only as SHA-256 hashes, so a database leak can't be replayed.
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,           -- sha256(token)
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  user_agent    TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);

-- One-time links for email verification and password reset (hashed, short-lived, single use).
CREATE TABLE auth_tokens (
  id          TEXT PRIMARY KEY,             -- sha256(token)
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX auth_tokens_user ON auth_tokens(user_id, purpose);

-- Fixed-window counters for abuse prevention (sign-in, sign-up, reset, uploads, requests).
CREATE TABLE rate_limits (
  key           TEXT NOT NULL,
  window_start  INTEGER NOT NULL,
  count         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- ---------- Places (public, generalized locations) ----------
-- Members choose a place; they never store an address or their own coordinates.
CREATE TABLE places (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  region        TEXT,
  country       TEXT NOT NULL,             -- ISO 3166-1 alpha-2
  country_name  TEXT NOT NULL,
  lat           REAL NOT NULL,             -- public centre point, never a member's home
  lng           REAL NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('metro', 'locality')),
  metro_id      TEXT NOT NULL
);
CREATE INDEX places_metro ON places(metro_id);

-- ---------- Profiles ----------
-- One table for musicians, studios and organizations. An account owns its individual
-- (musician) profile and can manage organization/studio profiles through profile_managers.
CREATE TABLE profiles (
  id                  TEXT PRIMARY KEY,
  kind                TEXT NOT NULL CHECK (kind IN ('musician', 'studio', 'organization')),
  owner_user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  handle              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name        TEXT NOT NULL,
  primary_specialty   TEXT,                -- musicians only
  bio                 TEXT NOT NULL DEFAULT '',
  place_id            TEXT REFERENCES places(id),
  photo_key           TEXT,                -- R2 object key
  cover_key           TEXT,
  open_to_collab      INTEGER NOT NULL DEFAULT 1,
  links               TEXT NOT NULL DEFAULT '{}',   -- JSON: spotify, appleMusic, soundcloud, youtube, instagram, tiktok, website
  credits             TEXT NOT NULL DEFAULT '[]',   -- JSON: [{title, role, artist, year, url}]
  achievements        TEXT NOT NULL DEFAULT '[]',   -- JSON: [string]
  collaborations      TEXT NOT NULL DEFAULT '[]',   -- JSON: [string]
  portfolio           TEXT NOT NULL DEFAULT '[]',   -- JSON: [{title, url}]
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden')),
  -- Verification is set only by an admin decision (see verification_events). Never by payment.
  verification        TEXT NOT NULL DEFAULT 'none' CHECK (verification IN ('none', 'verified', 'revoked')),
  verified_at         INTEGER,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE UNIQUE INDEX profiles_one_musician_per_user ON profiles(owner_user_id) WHERE kind = 'musician';
CREATE INDEX profiles_public ON profiles(status, kind, place_id);

CREATE TABLE profile_specialties (
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  specialty   TEXT NOT NULL,
  is_primary  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, specialty)
);
CREATE INDEX profile_specialties_by ON profile_specialties(specialty);

CREATE TABLE profile_genres (
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  genre       TEXT NOT NULL,
  PRIMARY KEY (profile_id, genre)
);
CREATE INDEX profile_genres_by ON profile_genres(genre);

-- People who can edit an organization or studio profile besides its owner (Phase 3).
CREATE TABLE profile_managers (
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor')),
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (profile_id, user_id)
);

-- Studio specifics (Phase 3). The private address is never returned by public endpoints.
CREATE TABLE studio_details (
  profile_id                TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  studio_type               TEXT NOT NULL CHECK (studio_type IN ('commercial', 'home')),
  services                  TEXT NOT NULL DEFAULT '[]',
  equipment                 TEXT NOT NULL DEFAULT '[]',
  hourly_rate_cents         INTEGER,
  currency                  TEXT DEFAULT 'USD',
  accepts_booking_requests  INTEGER NOT NULL DEFAULT 0,
  private_address           TEXT,           -- JSON, disclosed only within a confirmed booking (future)
  studio_verification       TEXT NOT NULL DEFAULT 'none' CHECK (studio_verification IN ('none', 'identity', 'studio'))
);

-- Organizations (labels, management, collectives, marketing agencies) (Phase 3).
CREATE TABLE organization_details (
  profile_id  TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  category    TEXT NOT NULL CHECK (category IN ('label', 'management', 'collective', 'marketing', 'other')),
  services    TEXT NOT NULL DEFAULT '[]',
  verified    INTEGER NOT NULL DEFAULT 0
);

-- ---------- Connections & safety (Phase 2) ----------
CREATE TABLE connections (
  id            TEXT PRIMARY KEY,
  requester_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message       TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at    INTEGER NOT NULL,
  responded_at  INTEGER,
  CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX connections_pair ON connections(min(requester_id, addressee_id), max(requester_id, addressee_id));
CREATE INDEX connections_addressee ON connections(addressee_id, status);
CREATE INDEX connections_requester ON connections(requester_id, status);

CREATE TABLE blocks (
  blocker_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

-- ---------- Opus Verified (Phase 3) ----------
CREATE TABLE verification_applications (
  id            TEXT PRIMARY KEY,
  profile_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'in_review', 'approved', 'rejected', 'withdrawn')),
  criteria      TEXT NOT NULL DEFAULT '[]', -- JSON: which criteria the applicant claims
  statement     TEXT NOT NULL DEFAULT '',
  evidence      TEXT NOT NULL DEFAULT '[]', -- JSON: [{label, url}] and R2 keys for uploaded documents
  reviewer_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  review_note   TEXT,
  created_at    INTEGER NOT NULL,
  decided_at    INTEGER
);
CREATE INDEX verification_applications_status ON verification_applications(status, created_at);

-- Every grant, rejection and revocation is recorded with the admin who made it.
CREATE TABLE verification_events (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action      TEXT NOT NULL CHECK (action IN ('granted', 'rejected', 'revoked')),
  admin_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  reason      TEXT,
  created_at  INTEGER NOT NULL
);

-- ---------- Audit ----------
CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  action      TEXT NOT NULL,
  detail      TEXT,
  created_at  INTEGER NOT NULL
);

-- Future (Phase 4, not built): memberships, paid listings, opportunities, projects, events.
-- Paid placement will live in its own tables and must never write to profiles.verification.
