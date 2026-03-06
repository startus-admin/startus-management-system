-- staffテーブルで '在籍' のステータスを直接確認
SELECT name, email, status, octet_length(status) as bytes, length(status) as chars
FROM staff
WHERE status = '在籍'
LIMIT 3;
