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

-- RPC for transactional multi-day reservation submit
CREATE OR REPLACE FUNCTION submit_multi_day_reservation(
  p_player_id INTEGER,
  p_name TEXT,
  p_alliance TEXT,
  p_days JSONB,
  p_skip_open_check BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_cycle_id INTEGER;
  v_had_existing BOOLEAN;
  v_speedup_mon INTEGER := 0;
  v_speedup_tue INTEGER := 0;
  v_speedup_thu INTEGER := 0;
  v_last_assignment_run TEXT;
  v_day JSONB;
  v_day_of_week TEXT;
  v_speedup INTEGER;
  v_block INTEGER;
BEGIN
  IF p_days IS NULL OR jsonb_array_length(p_days) = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Select at least one day.');
  END IF;

  SELECT COALESCE(NULLIF(value, '')::INTEGER, 1)
  INTO v_cycle_id
  FROM settings
  WHERE key = 'current_cycle_id';

  IF v_cycle_id IS NULL THEN
    v_cycle_id := 1;
  END IF;

  IF NOT p_skip_open_check THEN
    IF EXISTS (
      SELECT 1 FROM settings WHERE key = 'reservation_open' AND value = 'false'
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Reservations are currently closed.'
      );
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM preferences
    WHERE player_id = p_player_id AND cycle_id = v_cycle_id
    LIMIT 1
  ) INTO v_had_existing;

  SELECT p.speedup_mon, p.speedup_tue, p.speedup_thu
  INTO v_speedup_mon, v_speedup_tue, v_speedup_thu
  FROM players p
  WHERE p.player_id = p_player_id;

  IF NOT FOUND THEN
    v_speedup_mon := 0;
    v_speedup_tue := 0;
    v_speedup_thu := 0;
  END IF;

  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days)
  LOOP
    v_day_of_week := v_day->>'day_of_week';
    v_speedup := (v_day->>'speedup')::INTEGER;
    IF v_day_of_week = 'mon' THEN
      v_speedup_mon := v_speedup;
    ELSIF v_day_of_week = 'tue' THEN
      v_speedup_tue := v_speedup;
    ELSIF v_day_of_week = 'thu' THEN
      v_speedup_thu := v_speedup;
    END IF;
  END LOOP;

  BEGIN
    INSERT INTO players (
      player_id, name, alliance, speedup_mon, speedup_tue, speedup_thu
    )
    VALUES (
      p_player_id, p_name, p_alliance, v_speedup_mon, v_speedup_tue, v_speedup_thu
    )
    ON CONFLICT (player_id) DO UPDATE SET
      name = EXCLUDED.name,
      alliance = EXCLUDED.alliance,
      speedup_mon = EXCLUDED.speedup_mon,
      speedup_tue = EXCLUDED.speedup_tue,
      speedup_thu = EXCLUDED.speedup_thu;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Failed to save player: %', SQLERRM;
  END;

  IF p_skip_open_check THEN
    SELECT value
    INTO v_last_assignment_run
    FROM settings
    WHERE key = 'last_assignment_run'
    LIMIT 1;

    IF v_last_assignment_run IS NOT NULL AND v_last_assignment_run <> '' THEN
      BEGIN
        DELETE FROM reservations
        WHERE player_id = p_player_id AND cycle_id = v_cycle_id;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE EXCEPTION 'Failed to clear prior assignments: %', SQLERRM;
      END;
    END IF;
  END IF;

  BEGIN
    DELETE FROM preferences
    WHERE player_id = p_player_id AND cycle_id = v_cycle_id;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Failed to replace preferences: %', SQLERRM;
  END;

  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days)
  LOOP
    v_day_of_week := v_day->>'day_of_week';
    FOR v_block IN
      SELECT DISTINCT (elem::TEXT)::INTEGER
      FROM jsonb_array_elements(v_day->'preferred_blocks') AS elem
    LOOP
      BEGIN
        INSERT INTO preferences (
          player_id, day_of_week, block_start_utc, cycle_id
        )
        VALUES (p_player_id, v_day_of_week, v_block, v_cycle_id);
      EXCEPTION
        WHEN OTHERS THEN
          RAISE EXCEPTION 'Failed to save preferences: %', SQLERRM;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'had_existing', v_had_existing,
    'player_id', p_player_id
  );
END;
$$;

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

