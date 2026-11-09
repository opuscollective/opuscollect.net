-- Opus Business, Phase 2: studio profiles, services, availability and booking requests.
-- No payments yet. Times are UTC epoch milliseconds; money is integer cents.

-- Members choose whether their profile appears on the globe (it still appears in list results).
ALTER TABLE profiles ADD COLUMN show_on_map INTEGER NOT NULL DEFAULT 1;

-- Studio settings. Rebuilt (no live data yet) so studio_type can include 'remote' providers.
-- private_address is never returned by public queries.
CREATE TABLE studio_details_v2 (
  profile_id                TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  studio_type               TEXT NOT NULL CHECK (studio_type IN ('commercial', 'home', 'remote')),
  services                  TEXT NOT NULL DEFAULT '[]',
  equipment                 TEXT NOT NULL DEFAULT '[]',
  hourly_rate_cents         INTEGER,
  currency                  TEXT DEFAULT 'USD',
  accepts_booking_requests  INTEGER NOT NULL DEFAULT 0,
  private_address           TEXT,
  studio_verification       TEXT NOT NULL DEFAULT 'none' CHECK (studio_verification IN ('none', 'identity', 'studio')),
  timezone                  TEXT NOT NULL DEFAULT 'America/Chicago',
  booking_mode              TEXT NOT NULL DEFAULT 'request' CHECK (booking_mode IN ('request', 'instant')),
  min_notice_hours          INTEGER NOT NULL DEFAULT 24,
  max_days_ahead            INTEGER NOT NULL DEFAULT 60,
  booking_policy            TEXT NOT NULL DEFAULT '',
  cancellation_policy       TEXT NOT NULL DEFAULT ''
);
INSERT INTO studio_details_v2 (profile_id, studio_type, services, equipment, hourly_rate_cents, currency, accepts_booking_requests, private_address, studio_verification)
  SELECT profile_id, studio_type, services, equipment, hourly_rate_cents, currency, accepts_booking_requests, private_address, studio_verification FROM studio_details;
DROP TABLE studio_details;
ALTER TABLE studio_details_v2 RENAME TO studio_details;

-- Bookable resources. Every studio gets one room to start; commercial studios can add more later.
CREATE TABLE rooms (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX rooms_profile ON rooms(profile_id);

-- What a business sells. 'session' = booked time in a room; 'remote' = project work, no calendar slot.
CREATE TABLE services (
  id             TEXT PRIMARY KEY,
  profile_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  room_id        TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  mode           TEXT NOT NULL DEFAULT 'session' CHECK (mode IN ('session', 'remote')),
  duration_min   INTEGER NOT NULL DEFAULT 60,   -- session length; turnaround days live in description for remote
  buffer_min     INTEGER NOT NULL DEFAULT 0,    -- blocked after a session for reset/setup
  price_cents    INTEGER NOT NULL,              -- the full price of one booking of this service
  currency       TEXT NOT NULL DEFAULT 'USD',
  deposit_cents  INTEGER NOT NULL DEFAULT 0,    -- used when payments arrive (Phase 3)
  active         INTEGER NOT NULL DEFAULT 1,
  sort           INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX services_profile ON services(profile_id, active);

-- Weekly opening hours, in the studio's own time zone (minutes after local midnight).
CREATE TABLE availability_rules (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0 = Sunday
  start_min   INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1440),
  end_min     INTEGER NOT NULL CHECK (end_min BETWEEN 0 AND 1440),
  CHECK (end_min > start_min)
);
CREATE INDEX availability_rules_profile ON availability_rules(profile_id);

-- Blackout dates (whole local day closed).
CREATE TABLE availability_exceptions (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day         TEXT NOT NULL,                    -- YYYY-MM-DD, studio local date
  note        TEXT NOT NULL DEFAULT '',
  UNIQUE (profile_id, day)
);

-- A business's own client list. Guests become customers without creating an account.
CREATE TABLE customers (
  id            TEXT PRIMARY KEY,
  profile_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL COLLATE NOCASE,
  phone         TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',       -- private to the business
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  UNIQUE (profile_id, email)
);

CREATE TABLE bookings (
  id                 TEXT PRIMARY KEY,
  ref                TEXT NOT NULL UNIQUE,      -- short code shown to people, e.g. OPU-7K3Q9
  profile_id         TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  service_id         TEXT REFERENCES services(id) ON DELETE SET NULL,
  room_id            TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  customer_id        TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_id            TEXT REFERENCES users(id) ON DELETE SET NULL,
  -- Snapshot at request time, so later service edits never change an existing booking.
  service_name       TEXT NOT NULL,
  mode               TEXT NOT NULL CHECK (mode IN ('session', 'remote')),
  start_at           INTEGER,                   -- null for remote projects
  end_at             INTEGER,
  timezone           TEXT NOT NULL,
  price_cents        INTEGER NOT NULL,
  currency           TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('requested', 'accepted', 'declined', 'cancelled', 'expired')),
  cancelled_by       TEXT CHECK (cancelled_by IN ('customer', 'business')),
  customer_message   TEXT NOT NULL DEFAULT '',
  business_note      TEXT NOT NULL DEFAULT '',
  source             TEXT NOT NULL DEFAULT 'direct' CHECK (source IN ('directory', 'link', 'direct')),
  manage_token_hash  TEXT NOT NULL,             -- sha256 of the guest's private manage link
  expires_at         INTEGER,                   -- an unanswered request lapses at this time
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE INDEX bookings_profile ON bookings(profile_id, status, start_at);
CREATE INDEX bookings_user ON bookings(user_id, start_at);
CREATE INDEX bookings_customer ON bookings(customer_id);

-- Conflict prevention. Each held 15-minute slot of a room is one row; the primary key makes
-- a second booking of the same time fail inside the same transaction that creates it.
CREATE TABLE booking_slots (
  room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  slot_start  INTEGER NOT NULL,
  booking_id  TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  PRIMARY KEY (room_id, slot_start)
);
CREATE INDEX booking_slots_booking ON booking_slots(booking_id);

-- Every state change, with who made it. Booking states are never changed silently.
CREATE TABLE booking_events (
  id          TEXT PRIMARY KEY,
  booking_id  TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  actor       TEXT NOT NULL,                    -- 'customer', 'business', 'system'
  user_id     TEXT,
  action      TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);
CREATE INDEX booking_events_booking ON booking_events(booking_id);
