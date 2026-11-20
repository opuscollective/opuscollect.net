-- Group admin access is separate from the public roster (2026-11-20).
-- Admins live in profile_managers (role 'admin'), so leaving the roster never removes management.
-- Backfill: anyone who got admin only through an active roster row keeps it. Additive; clan_members.is_admin is no longer read.
INSERT OR IGNORE INTO profile_managers (profile_id, user_id, role, created_at)
  SELECT clan_id, user_id, 'admin', updated_at FROM clan_members WHERE is_admin = 1 AND status = 'active' AND user_id IS NOT NULL;
