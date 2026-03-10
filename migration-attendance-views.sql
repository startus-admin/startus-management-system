-- ========================================================
-- 出欠アプリビュー（attendance_app_views）
-- 複数教室をグループ化して出欠管理に表示するビュー設定
-- Supabase SQL Editor にコピペして実行してください
-- ========================================================

-- ========================================
-- 1. ビューテーブル
-- ========================================
CREATE TABLE IF NOT EXISTS attendance_app_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  classroom_tags TEXT[] DEFAULT '{}',
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_app_views_order
  ON attendance_app_views (display_order, name);

ALTER TABLE attendance_app_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_attendance_app_views" ON attendance_app_views
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS attendance_app_views_updated_at ON attendance_app_views;
CREATE TRIGGER attendance_app_views_updated_at
  BEFORE UPDATE ON attendance_app_views
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================================
-- 2. attendance_events に view_id カラム追加
-- ========================================
ALTER TABLE attendance_events
  ADD COLUMN IF NOT EXISTS view_id UUID REFERENCES attendance_app_views(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_events_view
  ON attendance_events (view_id)
  WHERE view_id IS NOT NULL;
