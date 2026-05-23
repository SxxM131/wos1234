-- Run in Supabase SQL Editor to split player speedup by day

-- 1. 새 컬럼 추가
ALTER TABLE players ADD COLUMN IF NOT EXISTS speedup_mon INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS speedup_tue INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS speedup_thu INTEGER NOT NULL DEFAULT 0;

-- 2. 기존 데이터 마이그레이션
--    speedup_vp → speedup_mon, speedup_tue 동일하게 복사
--    speedup_mo → speedup_thu 복사
UPDATE players SET
  speedup_mon = speedup_vp,
  speedup_tue = speedup_vp,
  speedup_thu = speedup_mo;

-- 3. 기존 컬럼 제거
ALTER TABLE players DROP COLUMN IF EXISTS speedup_vp;
ALTER TABLE players DROP COLUMN IF EXISTS speedup_mo;
