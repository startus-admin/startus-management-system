-- =============================================
-- 教室名の統一マイグレーション
-- 会員データ・申請データの旧教室名を教室マスタに合わせる
-- =============================================

-- マッピング:
--   かけっこ塾              → かけっこ塾（ホップ・ステップ・ジャンプ）
--   キッズチアリーディング     → キッズチアリーディング(金)泉野
--   バドミントン高尾台        → バドミントン高尾台（ジュニア）
--   陸上西部キッズ           → 陸上西部（キッズ）
--   陸上西部ジュニア          → 陸上西部（ジュニア）

-- =============================================
-- 1. 会員テーブル（members.classes TEXT[]）
-- =============================================

UPDATE members SET classes = array_replace(classes, 'かけっこ塾', 'かけっこ塾（ホップ・ステップ・ジャンプ）')
WHERE 'かけっこ塾' = ANY(classes);

UPDATE members SET classes = array_replace(classes, 'キッズチアリーディング', 'キッズチアリーディング(金)泉野')
WHERE 'キッズチアリーディング' = ANY(classes);

UPDATE members SET classes = array_replace(classes, 'バドミントン高尾台', 'バドミントン高尾台（ジュニア）')
WHERE 'バドミントン高尾台' = ANY(classes);

UPDATE members SET classes = array_replace(classes, '陸上西部キッズ', '陸上西部（キッズ）')
WHERE '陸上西部キッズ' = ANY(classes);

UPDATE members SET classes = array_replace(classes, '陸上西部ジュニア', '陸上西部（ジュニア）')
WHERE '陸上西部ジュニア' = ANY(classes);

-- =============================================
-- 2. 申請テーブル（applications.form_data JSONB）
--    form_data->'desired_classes' を更新
-- =============================================

UPDATE applications
SET form_data = jsonb_set(
  form_data,
  '{desired_classes}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN elem = 'かけっこ塾' THEN 'かけっこ塾（ホップ・ステップ・ジャンプ）'
        WHEN elem = 'キッズチアリーディング' THEN 'キッズチアリーディング(金)泉野'
        WHEN elem = 'バドミントン高尾台' THEN 'バドミントン高尾台（ジュニア）'
        WHEN elem = '陸上西部キッズ' THEN '陸上西部（キッズ）'
        WHEN elem = '陸上西部ジュニア' THEN '陸上西部（ジュニア）'
        ELSE elem
      END
    )
    FROM jsonb_array_elements_text(form_data->'desired_classes') AS elem
  )
)
WHERE form_data->'desired_classes' IS NOT NULL
  AND jsonb_typeof(form_data->'desired_classes') = 'array'
  AND (
    form_data->'desired_classes' @> '"かけっこ塾"'
    OR form_data->'desired_classes' @> '"キッズチアリーディング"'
    OR form_data->'desired_classes' @> '"バドミントン高尾台"'
    OR form_data->'desired_classes' @> '"陸上西部キッズ"'
    OR form_data->'desired_classes' @> '"陸上西部ジュニア"'
  );

-- =============================================
-- 3. 旧名の教室マスタレコードを削除（重複防止）
--    ※ 新名で既にレコードがある場合のみ安全に削除
-- =============================================

DELETE FROM classrooms
WHERE name IN ('かけっこ塾', 'キッズチアリーディング', 'バドミントン高尾台', '陸上西部キッズ', '陸上西部ジュニア')
  AND name NOT IN (SELECT name FROM classrooms WHERE name IN (
    'かけっこ塾（ホップ・ステップ・ジャンプ）',
    'キッズチアリーディング(金)泉野',
    'バドミントン高尾台（ジュニア）',
    '陸上西部（キッズ）',
    '陸上西部（ジュニア）'
  ));
