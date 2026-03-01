-- ============================================================
-- 体験→入会 転換トラッキング: applications テーブル拡張
-- Supabase SQL エディタで実行してください
-- ============================================================

-- 1. 紐付けカラム: 体験申請と入会申請をリンク
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS linked_application_id UUID REFERENCES applications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_applications_linked
  ON applications (linked_application_id);

-- 2. フォローアップ日: 体験後の入会フォロー期限
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS follow_up_date DATE DEFAULT NULL;
