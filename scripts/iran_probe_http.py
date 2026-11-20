#!/usr/bin/env python3
# پروب متمرکز: فقط HTTP برای سه دامنه (نتایج DNS و workers.dev از پروب کامل قبلی موجود است)

import json
import sys
import time
import urllib.parse
import urllib.request

BASE = "https://check-host.net"
HDRS = {"Accept": "application/json", "User-Agent": "Mozilla/5.0 (compatible; classhub-probe)"}


def get(path):
    req = urllib.request.Request(BASE + path, headers=HDRS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


try:
    hosts = get("/nodes/hosts")
except Exception as e:
    sys.exit(f"خطا در دسترسی به check-host.net: {e}")

nodes = hosts.get("nodes", hosts) or {}
ir_nodes = sorted(n for n in nodes if n.lower().startswith("ir"))
if not ir_nodes:
    sys.exit("نود ایرانی پیدا نشد")

JOBS = [
    ("the-big-school.de5.net", "https://the-big-school.de5.net/"),
    ("www.the-big-school.de5.net", "https://www.the-big-school.de5.net/"),
    ("school.sigmababyboy.ccwu.cc", "https://school.sigmababyboy.ccwu.cc/"),
]

jobs = []
for label, target in JOBS:
    q = urllib.parse.urlencode({"host": target, "node": ir_nodes}, doseq=True)
    try:
        d = get("/check-http?" + q)
        jobs.append((label, d.get("request_id", "")))
        print(f"ثبت شد: {label}", flush=True)
    except Exception as e:
        print(f"خطا در ثبت {label}: {e}", flush=True)
    time.sleep(2)

time.sleep(60)  # انتظار برای اجرای تست‌ها

for label, rid in jobs:
    print(f"\n--- HTTP | {label} ---", flush=True)
    try:
        res = get(f"/check-result/{rid}")
    except Exception as e:
        print(f"  خطا: {e}", flush=True)
        continue
    for node, vals in sorted((res or {}).items()):
        v = vals[0] if vals else None
        if isinstance(v, list) and len(v) >= 3:
            ok = v[1]
            print(f"  {node}: {'OK ' + str(v[3]) + ' (' + str(v[4]) + ')' if ok else 'FAIL ' + str(v[2])}", flush=True)
        else:
            print(f"  {node}: در حال اجرا/بدون پاسخ", flush=True)
