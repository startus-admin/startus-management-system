-- =============================================
-- 教室名の不一致を検出する診断クエリ
-- 会員・申請データの教室名と教室マスタを比較
-- =============================================

-- 1. 教室マスタに登録されている教室名一覧
SELECT '=== 教室マスタ ===' AS section;
SELECT name FROM classrooms ORDER BY display_order;

-- 2. 会員データで使われている教室名のうち、教室マスタに存在しないもの
SELECT '=== 会員データの不一致 ===' AS section;
SELECT DISTINCT unnest(classes) AS class_name
FROM members
WHERE classes IS NOT NULL AND array_length(classes, 1) > 0
EXCEPT
SELECT name FROM classrooms
ORDER BY class_name;

-- 3. 申請データ（form_data.desired_classes）で使われている教室名のうち、教室マスタに存在しないもの
SELECT '=== 申請データの不一致 ===' AS section;
SELECT DISTINCT jsonb_array_elements_text(form_data->'desired_classes') AS class_name
FROM applications
WHERE form_data->'desired_classes' IS NOT NULL
  AND jsonb_typeof(form_data->'desired_classes') = 'array'
EXCEPT
SELECT name FROM classrooms
ORDER BY class_name;
