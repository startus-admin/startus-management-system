-- ============================================================
-- AI フィードバック テーブル
-- AIアシスタントが職員から収集した改善要望・不具合報告を保存
-- ============================================================
-- 実行方法: bash scripts/run-sql.sh migration-ai-feedback.sql
-- 注意: このファイルは一度だけ実行してください

CREATE TABLE IF NOT EXISTS ai_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  staff_name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'improvement'
    CHECK (category IN ('bug', 'improvement', 'question')),
  summary TEXT NOT NULL,
  screen TEXT DEFAULT '',
  details TEXT DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewed', 'in_progress', 'resolved', 'wontfix')),
  admin_note TEXT DEFAULT '',
  conversation JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_ai_feedback_status ON ai_feedback(status);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_category ON ai_feedback(category);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_created ON ai_feedback(created_at DESC);

-- RLS
ALTER TABLE ai_feedback ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは全操作可能
CREATE POLICY ai_feedback_auth_all ON ai_feedback
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_ai_feedback_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_feedback_updated
  BEFORE UPDATE ON ai_feedback
  FOR EACH ROW EXECUTE FUNCTION update_ai_feedback_timestamp();

-- 完了メッセージ
DO $$
BEGIN
  RAISE NOTICE 'ai_feedback テーブルを作成しました';
END $$;
