-- Verify the function works correctly
SELECT chr(22312) || chr(31821) as target_status;

-- Check if any staff match with the new function logic
SELECT name, email, status,
  CASE WHEN status = chr(22312) || chr(31821) THEN 'MATCH' ELSE 'NO MATCH' END as check_result
FROM staff;
