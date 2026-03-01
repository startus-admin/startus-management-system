-- ============================================================
-- 教室マスタに巡回者（patrol_coach）カラムを追加
-- Supabase SQL エディタで実行してください
-- ============================================================

ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS patrol_coach TEXT DEFAULT '';
