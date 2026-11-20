#!/usr/bin/env python3
# اتصال the-big-school.de5.net به Worker کلاس‌هاب از طریق DNSHE
#
# پیش‌نیاز (فقط یک چیز): کلید API دامنه آزاد DNSHE
#   پنل: https://my.dnshe.com → Free Domain Management → API Management → Create API Key
#   قالب: X-API-Key: cfsd_...  و  X-API-Secret: ...
#   دسترسی لازم: records:write (پیش‌فرض کلید، شامل همین می‌شود)
#
# اجرا:
#   DNSHE_KEY='cfsd_...' DNSHE_SECRET='...' python3 setup_dnshe.py
#
# کاری که می‌کند:
#   1. subdomain_id مربوط به the-big-school.de5.net را پیدا می‌کند
#   2. دو رکورد A روی خود دامنه می‌گذارد (round-robin):
#        @  A  104.21.42.18
#        @  A  172.67.155.28
#      (این دو IP، IPهای anycast کلادفلر هستند که همین حالا
#       school.gigaspaceturnip.workers.dev روی آن‌ها سرو می‌شود.)
#   3. کار را گزارش می‌کند؛ ادامه‌ی کار (کلادفلر) خودم انجام می‌دهم.

import json
import os
import sys
import urllib.parse
import urllib.request

BASE = "https://api005.dnshe.com/index.php?m=domain_hub"
DOMAIN = "the-big-school.de5.net"
# IPهای anycast کلادفلر — A رکوردهای فعلی school.gigaspaceturnip.workers.dev
IPS = ["104.21.42.18", "172.67.155.28"]

KEY = os.environ.get("DNSHE_KEY", "").strip()
SECRET = os.environ.get("DNSHE_SECRET", "").strip()
if not KEY or not SECRET:
    sys.exit("خطا: DNSHE_KEY و DNSHE_SECRET تنظیم نشده.\n"
             "از پنل my.dnshe.com → Free Domain Management → API Management → Create API Key بگیرید.")


def call(action, endpoint, params=None, body=None):
    qs = {"endpoint": endpoint, "action": action}
    qs.update({k: v for k, v in (params or {}).items() if v is not None})
    url = BASE + "&" + urllib.parse.urlencode(qs)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if body is not None else "GET", headers={
        "X-API-Key": KEY,
        "X-API-Secret": SECRET,
        "Accept": "application/json",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}
    except Exception as e:
        return 0, {"error": str(e)}


def main():
    # 1) پیدا کردن subdomain_id
    status, res = call("list", "subdomains", params={"search": "the-big-school", "per_page": 50})
    if status != 200:
        sys.exit(f"خطا در لیست زیردامنه‌ها (HTTP {status}): {json.dumps(res, ensure_ascii=False)[:300]}")
    subs = res.get("subdomains") or res.get("data") or []
    if isinstance(subs, dict):
        subs = list(subs.values())
    sub = next((s for s in subs if s.get("full_domain") == DOMAIN or s.get("subdomain", "").endswith("the-big-school")), None)
    if not sub:
        sys.exit(f"دامنه {DOMAIN} در حساب DNSHE شما پیدا نشد.\n"
                 f"پاسخ API: {json.dumps(res, ensure_ascii=False)[:300]}")
    sid = sub.get("id")
    print(f"پیدا شد: {sub.get('full_domain')} (subdomain_id={sid}, status={sub.get('status')})")

    # 2) رکوردهای موجود
    status, res = call("list", "dns_records", params={"subdomain_id": sid})
    existing = res.get("records") or [] if status == 200 else []
    have = {(r.get("name"), r.get("type"), r.get("content")) for r in existing}
    if existing:
        print("رکوردهای فعلی:")
        for r in existing:
            print(f"  {r.get('name')} {r.get('type')} {r.get('content')} (id={r.get('id')})")

    # 3) ساخت رکوردهای A
    ok = fail = 0
    for ip in IPS:
        if (DOMAIN, "A", ip) in have:
            print(f"  از قبل هست: {DOMAIN} A {ip}")
            ok += 1
            continue
        status, res = call("create", "dns_records", body={
            "subdomain_id": sid, "type": "A", "name": "@", "content": ip, "ttl": 600,
        })
        if status == 200 and res.get("success"):
            print(f"  ساخته شد: {DOMAIN} A {ip}")
            ok += 1
        else:
            print(f"  خطا در {DOMAIN} A {ip} (HTTP {status}): {json.dumps(res, ensure_ascii=False)[:250]}")
            fail += 1

    print(f"\nخلاصه: {ok} رکورد آماده، {fail} خطا.")
    if fail == 0:
        print("DNS آماده است؛ ادامه‌ی کار در کلادفلر را عامل انجام می‌دهد.")


if __name__ == "__main__":
    main()
