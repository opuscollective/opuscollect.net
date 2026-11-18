-- World: members follow cities (World milestone, 2026-11-15). Additive only: no existing table is altered.
--
-- city_follows  One row per member per followed city. city_id is a metro id from src/data/places.ts (the same
--               ids events.place_id resolves to), so events and future city updates join on it directly.
--               Following never changes the member's profile location.
--               notify is reserved for opt-in city updates later (0 = off). Nothing sends notifications yet.
CREATE TABLE city_follows (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city_id    TEXT NOT NULL,
  notify     INTEGER NOT NULL DEFAULT 0 CHECK (notify IN (0, 1)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, city_id)
);
CREATE INDEX city_follows_by_city ON city_follows (city_id);
