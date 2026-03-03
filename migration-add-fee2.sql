-- 教室マスタに fee2（月謝2）カラムを追加
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS fee2 integer;

-- fee2 にコメント
COMMENT ON COLUMN classrooms.fee2 IS '月謝2（副）';
