-- Migration v4: Create archive tables and reset cycle RPC

-- 0. Ensure preferences table has applied_at
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS archived_players (
  archive_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  alliance TEXT NOT NULL,
  speedup_mon INTEGER NOT NULL DEFAULT 0,
  speedup_tue INTEGER NOT NULL DEFAULT 0,
  speedup_thu INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS archived_preferences (
  archive_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id UUID NOT NULL,
  player_id INTEGER NOT NULL,
  day_of_week TEXT NOT NULL,
  block_start_utc INTEGER NOT NULL,
  cycle_id INTEGER NOT NULL,
  applied_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS archived_reservations (
  archive_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id UUID NOT NULL,
  player_id INTEGER NOT NULL,
  slot_id INTEGER,
  status TEXT NOT NULL,
  cycle_id INTEGER NOT NULL,
  applied_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION archive_and_reset_cycle() RETURNS void AS $$
BEGIN
  -- Copy data
  INSERT INTO archived_players (game_id, name, alliance, speedup_mon, speedup_tue, speedup_thu, created_at)
  SELECT game_id, name, alliance, speedup_mon, speedup_tue, speedup_thu, created_at FROM players;

  INSERT INTO archived_preferences (original_id, player_id, day_of_week, block_start_utc, cycle_id, applied_at)
  SELECT id, player_id, day_of_week, block_start_utc, cycle_id, applied_at FROM preferences;

  INSERT INTO archived_reservations (original_id, player_id, slot_id, status, cycle_id, applied_at)
  SELECT id, player_id, slot_id, status, cycle_id, applied_at FROM reservations;

  -- Delete data
  DELETE FROM reservations WHERE cycle_id >= 0;
  DELETE FROM preferences WHERE cycle_id >= 0;
  DELETE FROM players WHERE game_id >= 0;
END;
$$ LANGUAGE plpgsql;
