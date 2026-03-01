-- 申請/体験の編集履歴を記録するため activity_log に application_id カラムを追加
ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS application_id UUID REFERENCES applications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_activity_log_application
  ON activity_log (application_id, created_at DESC);
