-- SVS Reservation schema
-- Supabase SQL Editor에서 전체 실행

CREATE TABLE players (
  player_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  alliance TEXT NOT NULL,
  speedup_mon INTEGER NOT NULL DEFAULT 0,
  speedup_tue INTEGER NOT NULL DEFAULT 0,
  speedup_thu INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE slots (
  id SERIAL PRIMARY KEY,
  day_of_week TEXT NOT NULL,
  office_type TEXT NOT NULL,
  block_start_utc INTEGER NOT NULL,
  slot_index INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(day_of_week, block_start_utc, slot_index)
);

INSERT INTO slots (day_of_week, office_type, block_start_utc, slot_index)
SELECT d.day, d.office, b.bs, s.si
FROM (VALUES ('mon','VP'),('tue','VP'),('thu','MO')) AS d(day,office),
     generate_series(0,22,2) AS b(bs),
     generate_series(0,3) AS s(si);

CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id INTEGER REFERENCES players(player_id) ON DELETE CASCADE,
  slot_id INTEGER REFERENCES slots(id),
  status TEXT NOT NULL DEFAULT 'assigned',
  cycle_id INTEGER NOT NULL DEFAULT 1,
  applied_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(player_id, slot_id, cycle_id)
);

CREATE TABLE preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id INTEGER REFERENCES players(player_id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL,
  block_start_utc INTEGER NOT NULL,
  cycle_id INTEGER NOT NULL DEFAULT 1,
  applied_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(player_id, day_of_week, block_start_utc, cycle_id)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('access_token', 'CHANGE_ON_FIRST_RUN'),
  ('admin_password_hash', ''),
  ('current_cycle_id', '1'),
  ('reservation_open', 'true');

-- RLS
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "players_select" ON players FOR SELECT TO anon USING (true);
CREATE POLICY "slots_select" ON slots FOR SELECT TO anon USING (true);
CREATE POLICY "reservations_select" ON reservations FOR SELECT TO anon USING (true);
CREATE POLICY "preferences_select" ON preferences FOR SELECT TO anon USING (true);
CREATE POLICY "settings_reservation_open" ON settings FOR SELECT TO anon
  USING (key = 'reservation_open');

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE reservations;

-- Archive Tables for Reset Cycle
CREATE TABLE archived_players (
  archive_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  alliance TEXT NOT NULL,
  speedup_mon INTEGER NOT NULL DEFAULT 0,
  speedup_tue INTEGER NOT NULL DEFAULT 0,
  speedup_thu INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE archived_preferences (
  archive_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id UUID NOT NULL,
  player_id INTEGER NOT NULL,
  day_of_week TEXT NOT NULL,
  block_start_utc INTEGER NOT NULL,
  cycle_id INTEGER NOT NULL,
  applied_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE archived_reservations (
  archive_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id UUID NOT NULL,
  player_id INTEGER NOT NULL,
  slot_id INTEGER,
  status TEXT NOT NULL,
  cycle_id INTEGER NOT NULL,
  applied_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ DEFAULT now()
);

-- RPC for archiving and resetting cycle
CREATE OR REPLACE FUNCTION archive_and_reset_cycle() RETURNS void AS $$
BEGIN
  -- Copy data
  INSERT INTO archived_players (player_id, name, alliance, speedup_mon, speedup_tue, speedup_thu, created_at)
  SELECT player_id, name, alliance, speedup_mon, speedup_tue, speedup_thu, created_at FROM players;

  INSERT INTO archived_preferences (original_id, player_id, day_of_week, block_start_utc, cycle_id, applied_at)
  SELECT id, player_id, day_of_week, block_start_utc, cycle_id, applied_at FROM preferences;

  INSERT INTO archived_reservations (original_id, player_id, slot_id, status, cycle_id, applied_at)
  SELECT id, player_id, slot_id, status, cycle_id, applied_at FROM reservations;

  -- Delete data
  DELETE FROM reservations WHERE cycle_id >= 0;
  DELETE FROM preferences WHERE cycle_id >= 0;
  DELETE FROM players WHERE player_id >= 0;
END;
$$ LANGUAGE plpgsql;

