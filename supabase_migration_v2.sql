-- Run in Supabase SQL Editor (batch assignment + nullable eliminated slots)

ALTER TABLE reservations ALTER COLUMN slot_id DROP NOT NULL;

ALTER TABLE preferences
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ DEFAULT now();
