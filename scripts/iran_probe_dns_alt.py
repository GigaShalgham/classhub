#!/usr/bin/env python3
# پروب مرحله ۲: تشخیص واقعی حالت «بدون VPN» برای کاربران ایرانی.
# الف) DNS از نودهای ایران برای هر ۳ دامنه (آیا پاسخ پوسیده/فیلترشده برمی‌گردد؟)
# ب) HTTP از نودهای ایران برای میزبان‌های جایگزین (github.io / jsdelivr / vercel)
#    تا بفهمیم کدام شبکه از ایران قابل دسترسی است.

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
print(f"نودهای ایران: {len(ir_nodes)}", flush=True)

# (label, kind, target)
JOBS = [
    # --- DNS برای دامنه‌های خودمان (سمت چپ check-host برای DNS نام دامنه می‌خواهد) ---
    ("DNS workers.dev", "dns", "school.gigaspaceturnip.workers.dev"),
    ("DNS ccwu.cc", "dns", "school.sigmababyboy.ccwu.cc"),
    ("DNS de5.net", "dns", "www.the-big-school.de5.net"),
    # --- HTTP برای میزبان‌های جایگزین شبکه‌ی غیر-کلادفلر ---
    ("HTTP github.io", "http", "https://gigashalgham.github.io/"),
    ("HTTP jsdelivr-gh", "http", "https://cdn.jsdelivr.net/gh/GigaShalgham/school-s-stuff@main/public/index.html"),
    ("HTTP vercel", "http", "https://vercel.com"),
]

jobs = []
for label, kind, target in JOBS:
    q = urllib.parse.urlencode({"host": target, "node": ir_nodes}, doseq=True)
    try:
        d = get(f"/check-{kind}?" + q)
        jobs.append((label, kind, d.get("request_id", "")))
        print(f"ثبت شد: {label}", flush=True)
    except Exception as e:
        print(f"خطا در ثبت {label}: {e}", flush=True)
    time.sleep(2)

time.sleep(75)  # انتظار برای اجرای تست‌ها

for label, kind, rid in jobs:
    print(f"\n--- {label} ---", flush=True)
    try:
        res = get(f"/check-result/{rid}")
    except Exception as e:
        print(f"  خطا: {e}", flush=True)
        continue
    for node, vals in sorted((res or {}).items()):
        v = vals[0] if vals else None
        if isinstance(v, list) and len(v) >= 3:
            if kind == "http":
                ok = v[1]
                line = f"  {node}: {'OK ' + str(v[3]) + ' (' + str(v[4]) + ')' if ok else 'FAIL ' + str(v[2])}"
            else:  # dns
                ok = v[1]
                a = v[3] if len(v) > 3 else None
                line = f"  {node}: {'OK ' + str(a) if ok else 'FAIL ' + str(v[2])}"
            print(line, flush=True)
        else:
            print(f"  {node}: در حال اجرا/بدون پاسخ", flush=True)
