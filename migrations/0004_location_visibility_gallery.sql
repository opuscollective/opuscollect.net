-- Opus World directory upgrade.
-- 1. Members choose how precisely their location is shown publicly:
--    city   = their chosen city or suburb (a suburb only shows when MIN_LOCALITY_GROUP members share it, else the metro)
--    metro  = always the metro area (Hoover -> Birmingham area)
--    region = only the state or country; never placed on the map
--    hidden = no public location; never placed on the map
--    The API enforces this. Nothing more precise than the choice is ever sent to a browser.
ALTER TABLE profiles ADD COLUMN location_visibility TEXT NOT NULL DEFAULT 'city'
  CHECK (location_visibility IN ('city', 'metro', 'region', 'hidden'));

-- 2. Photo galleries (studios first). Images live in R2; metadata is stripped on upload.
CREATE TABLE profile_gallery (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX profile_gallery_profile ON profile_gallery(profile_id, sort);
