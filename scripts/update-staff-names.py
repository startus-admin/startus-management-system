# -*- coding: utf-8 -*-
import json
import subprocess
import os
import sys

PROJECT_REF = "jfsxywwufwdprqdkyxhr"
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")

if not TOKEN:
    print("Error: SUPABASE_ACCESS_TOKEN not set")
    sys.exit(1)

sql = (
    "UPDATE staff SET name = '井元 浩' WHERE email = 'hiroshiinomoto@startus-kanazawa.org';"
    "UPDATE staff SET name = '松倉 純子' WHERE email = 'junkomatsukura@startus-kanazawa.org';"
    "UPDATE staff SET name = '竹井 早葉子' WHERE email = 'sayokotakei@startus-kanazawa.org';"
    "UPDATE staff SET name = '櫻井 明日花' WHERE email = 'asuka.sakurai@startus-kanazawa.org';"
    "SELECT name, email FROM staff ORDER BY email;"
)

payload = json.dumps({"query": sql})

result = subprocess.run(
    [
        "curl", "-s", "-X", "POST",
        f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
        "-H", f"Authorization: Bearer {TOKEN}",
        "-H", "Content-Type: application/json",
        "-d", payload,
    ],
    capture_output=True,
    text=True,
    encoding="utf-8",
)

print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr, file=sys.stderr)
