-- =============================================
-- classrooms テーブル拡張マイグレーション
-- SharePoint ClassList（教室マスタ）のカラムを追加
-- =============================================

ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '';
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS day_of_week TEXT[] DEFAULT '{}';
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS time_slot TEXT DEFAULT '';
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS venue TEXT DEFAULT '';
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS main_coach TEXT DEFAULT '';
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS capacity INTEGER;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS fee INTEGER;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS calendar_tag TEXT DEFAULT '';
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS furikae_group TEXT DEFAULT '';
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS target TEXT DEFAULT '';
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS class_code TEXT DEFAULT '';
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS memo TEXT DEFAULT '';
