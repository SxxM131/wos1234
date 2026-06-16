-- Migration v7: players.game_id → player_id (align with reservations/preferences FK naming)

ALTER TABLE players RENAME COLUMN game_id TO player_id;

ALTER TABLE archived_players RENAME COLUMN game_id TO player_id;

CREATE OR REPLACE FUNCTION archive_and_reset_cycle() RETURNS void AS $$
BEGIN
  INSERT INTO archived_players (player_id, name, alliance, speedup_mon, speedup_tue, speedup_thu, created_at)
  SELECT player_id, name, alliance, speedup_mon, speedup_tue, speedup_thu, created_at FROM players;

  INSERT INTO archived_preferences (original_id, player_id, day_of_week, block_start_utc, cycle_id, applied_at)
  SELECT id, player_id, day_of_week, block_start_utc, cycle_id, applied_at FROM preferences;

  INSERT INTO archived_reservations (original_id, player_id, slot_id, status, cycle_id, applied_at)
  SELECT id, player_id, slot_id, status, cycle_id, applied_at FROM reservations;

  DELETE FROM reservations WHERE cycle_id >= 0;
  DELETE FROM preferences WHERE cycle_id >= 0;
  DELETE FROM players WHERE player_id >= 0;
END;
$$ LANGUAGE plpgsql;
