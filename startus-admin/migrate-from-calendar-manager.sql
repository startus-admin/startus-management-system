-- ============================================================
-- calendar-manager → member-manager スケジュールデータ移行
-- ============================================================
-- calendar-manager Supabase : https://vmnwxackvpxbgtexcsmv.supabase.co
-- member-manager  Supabase  : https://jfsxywwufwdprqdkyxhr.supabase.co
--
-- ■ 手順
--   1. calendar-manager の SQL Editor で STEP 1 を実行（確認）
--   2. calendar-manager の SQL Editor で STEP 2 を実行
--      → 結果パネル右上の「↓」(Download CSV) をクリックしてCSV保存
--      → CSV を開き insert_sql 列の全行テキストをコピー
--   3. member-manager の SQL Editor に貼り付けて実行
--   4. member-manager の SQL Editor で STEP 3 を実行して件数確認
--   5. member-manager の SQL Editor で STEP 4 を実行（class_id / coach_name 付与）
--
-- ■ スキーマ差異（自動変換済み）
--   fiscal_year  : TEXT '2025' → INTEGER 2025
--   group_id     : TEXT（批移行対象外 / batch_group_id は NULL のまま）
--   is_trial_ok  : 新列（すべて true で設定）
--   class_id     : STEP 4 で classrooms テーブルと自動紐づけ
--   coach_name   : STEP 4 で classrooms.main_coach と自動紐づけ
-- ============================================================


-- ============================================================
-- STEP 1: [calendar-manager] 移行データ確認
-- ▶ https://vmnwxackvpxbgtexcsmv.supabase.co
--   SQL Editor > New query に貼り付けて Run
-- ============================================================
SELECT
  fiscal_year,
  COUNT(*)                                                 AS 合計,
  SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END)   AS 確定,
  SUM(CASE WHEN status = 'tentative' THEN 1 ELSE 0 END)   AS 暫定,
  SUM(CASE WHEN status = 'canceled'  THEN 1 ELSE 0 END)   AS キャンセル
FROM schedules
GROUP BY fiscal_year
ORDER BY fiscal_year;


-- ============================================================
-- STEP 2: [calendar-manager] INSERT文の一括生成
-- ▶ 同じく calendar-manager SQL Editor で実行
--   結果パネル右上「↓ Download」でCSV保存 →
--   insert_sql 列の全テキストを member-manager SQL Editor に貼り付け
-- ============================================================
SELECT
  format(
    'INSERT INTO schedules (class_name, date, start_time, end_time, venue, status, is_published, fiscal_year, is_trial_ok) VALUES (%L, %L, %L, %L, %L, %L, %s, %s, true);',
    class_name,
    date::text,
    start_time::text,
    end_time::text,
    venue,
    status,
    is_published,
    (fiscal_year)::integer
  ) AS insert_sql
FROM schedules
ORDER BY fiscal_year, date, class_name;

-- ■ メモ: format('%L', NULL) は NULL（クォートなし）になるため
--   start_time / end_time / venue が NULL でも正しく INSERT されます


-- ============================================================
-- STEP 3: [member-manager] 移行結果の確認
-- ▶ https://jfsxywwufwdprqdkyxhr.supabase.co
--   SQL Editor で実行し、STEP 1 と件数が一致するか確認
-- ============================================================
SELECT
  fiscal_year,
  COUNT(*)                                                 AS 合計,
  SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END)   AS 確定,
  SUM(CASE WHEN status = 'tentative' THEN 1 ELSE 0 END)   AS 暫定,
  SUM(CASE WHEN status = 'canceled'  THEN 1 ELSE 0 END)   AS キャンセル
FROM schedules
GROUP BY fiscal_year
ORDER BY fiscal_year;


-- ============================================================
-- STEP 4: [member-manager] class_id / coach_name の自動付与
-- ▶ 同じく member-manager SQL Editor で実行
--   classrooms.name と schedules.class_name を突き合わせて更新
-- ============================================================

UPDATE schedules s
SET
  class_id   = c.id,
  coach_name = c.main_coach
FROM classrooms c
WHERE s.class_name = c.name
  AND s.class_id IS NULL;

-- 紐づけ確認: 件数が多い場合は class_name のスペルを確認してください
SELECT
  class_name,
  COUNT(*) AS 件数,
  '★ classrooms.name と不一致のため class_id が NULL' AS 注記
FROM schedules
WHERE class_id IS NULL
GROUP BY class_name
ORDER BY class_name;


-- ============================================================
-- STEP 5: [member-manager] class_name の修正（必要な場合のみ）
-- class_id が付与されなかった教室名をcalendarと揃える場合に使用
-- ============================================================

-- 例: calendar-manager では「大人マラソン」だが
--     member-manager classrooms では「マラソン（大人）」の場合
-- UPDATE schedules
-- SET class_name = '正しい教室名'
-- WHERE class_name = '古い教室名';

-- 修正後、STEP 4 を再実行してください


-- ============================================================
-- STEP 6: [member-manager] 既存データの削除（再移行時のみ）
-- ※ 移行済みデータをやり直す場合にのみ実行
-- ※ 取り消しできないので十分確認してから実行すること
-- ============================================================

-- 現在のデータ件数確認
-- SELECT COUNT(*) AS 現在件数 FROM schedules;

-- 全削除（本当に必要な場合のみ、コメントを外して実行）
-- DELETE FROM schedules;
