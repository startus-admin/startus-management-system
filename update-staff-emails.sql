-- スタッフのメールアドレスを正しい Google Calendar ID に更新
UPDATE staff SET email = 'hiroshiinomoto@startus-kanazawa.org' WHERE name LIKE '%井元%' AND email = 'imoto@startus-kanazawa.org';
UPDATE staff SET email = 'hisashimatsui@startus-kanazawa.org' WHERE name LIKE '%松井%' AND email = 'matsui@startus-kanazawa.org';
UPDATE staff SET email = 'junkomatsukura@startus-kanazawa.org' WHERE name LIKE '%松倉%' AND email = 'matsukura@startus-kanazawa.org';
UPDATE staff SET email = 'sayokotakei@startus-kanazawa.org' WHERE name LIKE '%竹井%' AND email = 'takei@startus-kanazawa.org';
UPDATE staff SET email = 'asuka.sakurai@startus-kanazawa.org' WHERE name LIKE '%櫻井%' AND email = 'sakurai@startus-kanazawa.org';
