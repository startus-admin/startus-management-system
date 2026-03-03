# -*- coding: utf-8 -*-
"""Update staff names in Supabase and verify results."""
import json
import subprocess
import os
import sys
import tempfile

PROJECT_REF = "jfsxywwufwdprqdkyxhr"
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")

if not TOKEN:
    print("Error: SUPABASE_ACCESS_TOKEN not set")
    sys.exit(1)

# First, let's just SELECT to check current state without updating
sql_check = "SELECT name, email FROM staff ORDER BY email;"
payload_check = json.dumps({"query": sql_check})

with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, encoding="utf-8") as f:
    f.write(payload_check)
    tmpfile = f.name

outfile = tmpfile + ".out"

try:
    subprocess.run(
        [
            "curl", "-s", "-X", "POST",
            f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
            "-H", f"Authorization: Bearer {TOKEN}",
            "-H", "Content-Type: application/json",
            "-d", f"@{tmpfile}",
            "-o", outfile,
        ],
    )

    # Read raw bytes
    with open(outfile, "rb") as f:
        raw = f.read()

    print(f"Raw bytes length: {len(raw)}")
    print(f"First 200 bytes hex: {raw[:200].hex()}")
    print()

    # Try decoding as UTF-8
    try:
        text_utf8 = raw.decode("utf-8")
        print("UTF-8 decode: OK")
        data = json.loads(text_utf8)
        for row in data:
            print(f"  {row['name']} | {row['email']}")
    except UnicodeDecodeError as e:
        print(f"UTF-8 decode FAILED: {e}")

        # Try as Shift_JIS
        try:
            text_sjis = raw.decode("shift_jis")
            print("Shift_JIS decode:")
            data = json.loads(text_sjis)
            for row in data:
                print(f"  {row['name']} | {row['email']}")
        except Exception as e2:
            print(f"Shift_JIS also failed: {e2}")

finally:
    for f in [tmpfile, outfile]:
        try:
            os.unlink(f)
        except:
            pass
