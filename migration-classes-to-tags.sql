-- Migration: members.classes / staff.classes from classroom names to calendar_tag
-- Run once only after deploying the new JS code

-- Step 1: Fix duplicate calendar_tags
UPDATE classrooms SET calendar_tag = 'kakekojyuku-approach'
  WHERE calendar_tag = 'kakekojyuku-rikujo'
    AND name LIKE '%\u30A2\u30D7\u30ED\u30FC\u30C1%';

UPDATE classrooms SET calendar_tag = 'kakekojyuku-hsj'
  WHERE calendar_tag = 'kakekojyuku-rikujo'
    AND name LIKE '%\u30DB\u30C3\u30D7%';

UPDATE classrooms SET calendar_tag = 'badminton-takaodai-jr'
  WHERE calendar_tag = 'badminton-takaodai'
    AND name LIKE '%\u30B8\u30E5\u30CB\u30A2%';

UPDATE classrooms SET calendar_tag = 'badminton-takaodai-bg'
  WHERE calendar_tag = 'badminton-takaodai'
    AND name LIKE '%\u30D3\u30AE\u30CA\u30FC%';

-- Step 2: Fill empty calendar_tag (ice skating)
UPDATE classrooms SET calendar_tag = 'ice-skating'
  WHERE name LIKE '%\u30A2\u30A4\u30B9\u30B9\u30B1\u30FC\u30C8%'
    AND (calendar_tag IS NULL OR calendar_tag = '');

-- Step 3: Fill any remaining empty calendar_tags with a generated value
UPDATE classrooms SET calendar_tag = 'class-' || SUBSTRING(id::text, 1, 8)
  WHERE calendar_tag IS NULL OR calendar_tag = '';

-- Step 4: Add UNIQUE constraint
ALTER TABLE classrooms
  ADD CONSTRAINT classrooms_calendar_tag_unique UNIQUE (calendar_tag);

-- Step 5: Convert members.classes from classroom names to calendar_tags
UPDATE members SET classes = (
  SELECT ARRAY(
    SELECT CASE
      WHEN c.calendar_tag IS NOT NULL AND c.calendar_tag != '' THEN c.calendar_tag
      ELSE elem
    END
    FROM unnest(members.classes) AS elem
    LEFT JOIN classrooms c ON c.name = elem
  )
)
WHERE classes IS NOT NULL AND array_length(classes, 1) > 0;

-- Step 6: Convert staff.classes from classroom names to calendar_tags
UPDATE staff SET classes = (
  SELECT ARRAY(
    SELECT CASE
      WHEN c.calendar_tag IS NOT NULL AND c.calendar_tag != '' THEN c.calendar_tag
      ELSE elem
    END
    FROM unnest(staff.classes) AS elem
    LEFT JOIN classrooms c ON c.name = elem
  )
)
WHERE classes IS NOT NULL AND array_length(classes, 1) > 0;