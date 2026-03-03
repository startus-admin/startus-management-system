# -*- coding: utf-8 -*-
import json
import urllib.request
import os
import sys

PROJECT_REF = "jfsxywwufwdprqdkyxhr"
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")

if not TOKEN:
    print("Error: SUPABASE_ACCESS_TOKEN not set")
    sys.exit(1)

sql = """
UPDATE staff SET name = '井元 浩' WHERE email = 'hiroshiinomoto@startus-kanazawa.org';
UPDATE staff SET name = '松倉 純子' WHERE email = 'junkomatsukura@startus-kanazawa.org';
UPDATE staff SET name = '竹井 早葉子' WHERE email = 'sayokotakei@startus-kanazawa.org';
UPDATE staff SET name = '櫻井 明日花' WHERE email = 'asuka.sakurai@startus-kanazawa.org';
SELECT name, email FROM staff ORDER BY email;
"""

payload = json.dumps({"query": sql}).encode("utf-8")
req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
    data=payload,
    headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json; charset=utf-8",
    },
    method="POST",
)

try:
    resp = urllib.request.urlopen(req)
    result = resp.read().decode("utf-8")
    data = json.loads(result)
    for row in data:
        print(f"  {row['name']} | {row['email']}")
except Exception as e:
    print(f"Error: {e}")
