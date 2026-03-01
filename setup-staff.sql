-- ========================================================
-- スタッフ・コーチ管理テーブル セットアップSQL
-- Supabase SQL Editor にコピペして実行してください
-- ========================================================

-- ========================================
-- 1. スタッフテーブル作成
-- ========================================
CREATE TABLE IF NOT EXISTS staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  furigana TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'スタッフ',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  classes TEXT[] DEFAULT '{}',
  note TEXT DEFAULT '',
  photo_url TEXT DEFAULT '',
  is_jimukyoku BOOLEAN DEFAULT false,
  status TEXT DEFAULT '在籍',
  joined_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_role ON staff (role);
CREATE INDEX IF NOT EXISTS idx_staff_status ON staff (status);

-- ========================================
-- 2. RLS ポリシー
-- ========================================
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_staff" ON staff
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ========================================
-- 3. updated_at 自動更新トリガー
--    (update_updated_at 関数は setup-all.sql で作成済み)
-- ========================================
DROP TRIGGER IF EXISTS staff_updated_at ON staff;
CREATE TRIGGER staff_updated_at
  BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================================
-- 4. ダミーデータ
-- ========================================
INSERT INTO staff (name, furigana, role, email, phone, classes, note, is_jimukyoku, status, joined_date) VALUES
  ('井元 太郎', 'イモト タロウ', '指導者', 'imoto@startus-kanazawa.org', '090-1111-0001', '{"かけっこ塾","陸上西部キッズ","陸上西部ジュニア"}', '陸上競技指導歴15年', false, '在籍', '2020-04-01'),
  ('松井 久志', 'マツイ ヒサシ', 'スタッフ', 'matsui@startus-kanazawa.org', '090-1111-0002', '{"インクルーシブ陸上","かけっこ塾"}', '代表・総務担当', true, '在籍', '2019-04-01'),
  ('松倉 恵子', 'マツクラ ケイコ', '指導者', 'matsukura@startus-kanazawa.org', '090-1111-0003', '{"キッズダンス","キッズチアリーディング"}', 'ダンスインストラクター', false, '在籍', '2021-06-01'),
  ('竹井 健二', 'タケイ ケンジ', '指導者', 'takei@startus-kanazawa.org', '090-1111-0004', '{"バドミントン高尾台"}', 'バドミントン指導歴10年', false, '在籍', '2020-09-01'),
  ('櫻井 真理子', 'サクライ マリコ', 'スタッフ', 'sakurai@startus-kanazawa.org', '090-1111-0005', '{"キンボールスポーツ","インクルーシブ陸上"}', '会計担当', true, '在籍', '2022-01-15');
