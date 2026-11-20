#!/bin/bash
# رفع security_level زون de5.net از medium به essentially_off —
# علت: روی medium، Cloudflare برای IPهای «مشکوک» (که IPهای ایران زیاد داخلش‌هاست)
# صفحه‌ی چالش/کپچا نشان می‌دهد؛ نتیجه: با VPN (IP تمیز خارجی) سایت باز می‌شود،
# بدون VPN (IP ایرانی) گیر چالش یا قطع می‌شود. زون ccwu.cc همین حالا essentially_off است
# و همین یکی از دلایل کارکردن بهترش بود.
set -u

MAIN_TOKEN=$(grep '^cloudflare' /home/z/my-project/upload/tokens.txt | cut -d: -f2- | tr -d ' \r')
API="https://api.cloudflare.com/client/v4"
NEW_ZONE="0314a729d56aa932d625219e9f33cc04"   # the-big-school.de5.net
OLD_ZONE="2b4f98dd90b2789cb4c0500bec130a7b"   # sigmababyboy.ccwu.cc
PG_WRITE="3030687196b94b638145a3953da2b699"    # Zone Settings Write
PG_READ="517b21aee92c4d89936c976ba6e4be55"     # Zone Settings Read

echo "=== 1) ساخت توکن کمکی ==="
CREATE=$(curl -s -m 20 -X POST "$API/user/tokens" \
  -H "Authorization: Bearer $MAIN_TOKEN" -H "Content-Type: application/json" \
  -d "{
    \"name\": \"z.ai security_level fix (auto-delete)\",
    \"policies\": [{
      \"effect\": \"allow\",
      \"resources\": {
        \"com.cloudflare.api.account.zone.$NEW_ZONE\": \"*\",
        \"com.cloudflare.api.account.zone.$OLD_ZONE\": \"*\"
      },
      \"permission_groups\": [{\"id\": \"$PG_WRITE\"}, {\"id\": \"$PG_READ\"}]
    }]
  }")
echo "$CREATE" > /tmp/token_create2.json
TOKEN_ID=$(python3 -c "import json;d=json.load(open('/tmp/token_create2.json'));print(d['result']['id'] if d.get('success') else '')")
if [ -z "$TOKEN_ID" ]; then
  echo "ساخت توکن ناموفق بود:"
  python3 -c "import json;print(json.dumps(json.load(open('/tmp/token_create2.json')).get('errors'),ensure_ascii=False)[:400])"
  exit 1
fi
TEMP_TOKEN=$(python3 -c "import json;print(json.load(open('/tmp/token_create2.json'))['result']['value'])")
echo "توکن کمکی ساخته شد: id=$TOKEN_ID"

echo "=== 2) security_level → essentially_off روی زون de5.net ==="
R=$(curl -s -m 20 -X PATCH "$API/zones/$NEW_ZONE/settings/security_level" \
  -H "Authorization: Bearer $TEMP_TOKEN" -H "Content-Type: application/json" \
  -d '{"value":"essentially_off"}')
echo "  security_level: $(echo "$R" | python3 -c "import sys,json;d=json.load(sys.stdin);print('OK → '+d['result']['value'] if d.get('success') else 'FAIL: '+json.dumps(d.get('errors'))[:200])")"

echo "=== 3) تأیید نهایی هر دو زون ==="
for Z in $NEW_ZONE $OLD_ZONE; do
  echo "--- زون ${Z:0:8} ---"
  for S in security_level browser_check http3 ipv6 ssl; do
    V=$(curl -s -m 15 "$API/zones/$Z/settings/$S" -H "Authorization: Bearer $TEMP_TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['result']['value'] if d.get('success') else 'ERR')")
    printf "  %-16s = %s\n" "$S" "$V"
  done
done

echo "=== 4) حذف توکن کمکی ==="
DEL=$(curl -s -m 20 -X DELETE "$API/user/tokens/$TOKEN_ID" -H "Authorization: Bearer $MAIN_TOKEN")
echo "حذف: $(echo "$DEL" | python3 -c "import sys,json;d=json.load(sys.stdin);print('OK' if d.get('success') else 'FAIL: '+json.dumps(d.get('errors'))[:150])")"
