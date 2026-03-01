-- 事務局チェックリスト機能: applicationsテーブルにchecklistカラムを追加
-- Supabase SQLエディタで実行してください

ALTER TABLE applications ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT NULL;
