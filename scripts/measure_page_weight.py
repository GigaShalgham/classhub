#!/usr/bin/env python3
# محاسبه وزن واقعی بارگذاری اول و بازدیدهای بعدی صفحه، بعد از بهینه‌سازی
# (با User-Agent مرورگر — Cloudflare درخواست‌های UA پایتون را 403 می‌کند)

import sys
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://school.gigaspaceturnip.workers.dev"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"

# منابعی که مرورگر برای صفحه‌ی اصلی می‌گیرد (نسخه تک‌فایلی: ۱ درخواست html)
RESOURCES = [
    "/",
    "/api/bootstrap",
    "/fonts/Vazirmatn-Regular.woff2",
    "/fonts/Vazirmatn-SemiBold.woff2",
    "/fonts/Vazirmatn-ExtraBold.woff2",
    "/fonts/Estedad-ExtraBold.woff2",
]

first_visit = 0
repeat_visit = 0  # آنچه بعد از کش شدن پوسته/فونت می‌ماند (فقط API تازه)

print(f"بارگذاری از {BASE}")
for r in RESOURCES:
    req = urllib.request.Request(BASE + r, headers={"Accept-Encoding": "br, gzip", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as resp:
        n = len(resp.read())
        cc = resp.headers.get("Cache-Control", "")
        first_visit += n
        # API هر بار تازه می‌آید؛ پوسته (max-age=300) و فونت‌ها از کش مرورگر
        if r.startswith("/api/") or "max-age=0" in cc:
            repeat_visit += n
        print(f"  {r:42s} {n/1024:7.1f} KB  cache-control: {cc[:48]}")

print(f"\nبارگذاری اول (همه compressed): {first_visit/1024:.1f} KB")
print(f"بازدید بعدی (فقط API): {repeat_visit/1024:.1f} KB")
print("قبلاً: ۱۰ درخواست زنجیره‌ای بدون retry + ~۱۱۶KB")
