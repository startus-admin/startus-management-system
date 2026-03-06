-- ======================================================
-- スケジュール管理テーブル (member-manager Supabase)
-- 実行場所: https://jfsxywwufwdprqdkyxhr.supabase.co
-- SQL Editor > New query > 以下を貼り付けて Run
-- ======================================================

CREATE TABLE IF NOT EXISTS schedules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_name       text NOT NULL,
  class_id         uuid,
  coach_name       text,
  date             date NOT NULL,
  start_time       time,
  end_time         time,
  venue            text,
  status           text NOT NULL DEFAULT 'tentative'
                     CHECK (status IN ('tentative', 'confirmed', 'canceled')),
  is_published     boolean NOT NULL DEFAULT false,
  is_trial_ok      boolean NOT NULL DEFAULT true,
  group_id         uuid,
  batch_group_id   uuid,
  fiscal_year      integer NOT NULL,
  updated_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS schedules_fiscal_year_idx ON schedules (fiscal_year);
CREATE INDEX IF NOT EXISTS schedules_date_idx        ON schedules (date);
CREATE INDEX IF NOT EXISTS schedules_class_name_idx  ON schedules (class_name);
CREATE INDEX IF NOT EXISTS schedules_batch_group_idx ON schedules (batch_group_id);

-- RLS（Row Level Security）は既存テーブルに合わせて設定してください
-- 例: スタッフ全員が読み取り可能、書き込みはログイン済みユーザーのみ
-- ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "allow_read" ON schedules FOR SELECT USING (true);
-- CREATE POLICY "allow_write" ON schedules FOR ALL USING (auth.role() = 'authenticated');
