-- "Show me in World" (Bogo, 2026-11-24): a member can keep a public page and link while staying out of World's
-- directory, map and city counts. Default on. Additive; the code works with or without this column
-- (src/server/schema.ts), so it can be applied to preview and production whenever Bogo approves.
ALTER TABLE profiles ADD COLUMN in_world INTEGER NOT NULL DEFAULT 1;
