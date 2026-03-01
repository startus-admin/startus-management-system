-- ========================================================
-- 担当者（assigned_to）カラム追加マイグレーション
-- Supabase SQL Editor にコピペして実行してください
-- ========================================================

-- applications テーブルに担当者カラムを追加
-- スタッフ削除時は ON DELETE SET NULL で安全にクリア
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES staff(id) ON DELETE SET NULL;

-- 担当者検索用インデックス
CREATE INDEX IF NOT EXISTS idx_applications_assigned_to
  ON applications (assigned_to);
