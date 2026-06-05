-- Migration v5: players.email for cross-channel duplicate detection

ALTER TABLE players ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE archived_players ADD COLUMN IF NOT EXISTS email TEXT;

CREATE OR REPLACE FUNCTION archive_and_reset_cycle() RETURNS void AS $$
BEGIN
  INSERT INTO archived_players (game_id, name, alliance, email, speedup_mon, speedup_tue, speedup_thu, created_at)
  SELECT game_id, name, alliance, email, speedup_mon, speedup_tue, speedup_thu, created_at FROM players;

  INSERT INTO archived_preferences (original_id, player_id, day_of_week, block_start_utc, cycle_id, applied_at)
  SELECT id, player_id, day_of_week, block_start_utc, cycle_id, applied_at FROM preferences;

  INSERT INTO archived_reservations (original_id, player_id, slot_id, status, cycle_id, applied_at)
  SELECT id, player_id, slot_id, status, cycle_id, applied_at FROM reservations;

  DELETE FROM reservations WHERE cycle_id >= 0;
  DELETE FROM preferences WHERE cycle_id >= 0;
  DELETE FROM players WHERE game_id >= 0;
END;
$$ LANGUAGE plpgsql;
