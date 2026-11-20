#!/usr/bin/env python3
# ساخت و انتشار «نسخه‌ی آینه» (mirror) صفحه‌ی دانش‌آموز:
#   ۱) bootstrap زنده را از production می‌گیرد
#   ۲) public/index.html تک‌فایلی را با window.__BOOTSTRAP__ بیک می‌کند
#      (فونت‌ها هم data-URI می‌شوند تا آینه کاملاً خودکفا باشد)
#   ۳) شاخه‌ی gh-pages را از نو می‌سازد و push می‌کند
#   ۴) GitHub Pages را از شاخه‌ی gh-pages فعال می‌کند
# نتیجه: دو لینک جدید روی شبکه‌های غیر-کلادفلر (Fastly):
#   https://gigashalgham.github.io/school-s-stuff/
#   https://cdn.jsdelivr.net/gh/GigaShalgham/school-s-stuff@gh-pages/index.html
# اجرا: python3 scripts/publish_mirror.py

import base64
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / 'public'
REPO = 'GigaShalgham/school-s-stuff'
LIVE = 'https://school.gigaspaceturnip.workers.dev'
GH_TOKEN = None

# ---------- توکن گیت‌هاب از فایل توکن‌ها ----------
for line in (ROOT / 'upload' / 'tokens.txt').read_text().splitlines():
    m = re.search(r'(github_pat_[A-Za-z0-9_]+)', line)
    if m:
        GH_TOKEN = m.group(1)
        break
if not GH_TOKEN:
    sys.exit('توکن گیت‌هاب پیدا نشد')


def gh_api(method, path, body=None, accept='application/vnd.github+json'):
    req = urllib.request.Request(
        f'https://api.github.com{path}',
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={
            'Authorization': f'Bearer {GH_TOKEN}',
            'Accept': accept,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'classhub-mirror-publisher',
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            txt = r.read().decode()
            return r.status, (json.loads(txt) if txt else {})
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or '{}')


# ---------- ۱) bootstrap زنده ----------
print('۱) دریافت /api/bootstrap از production…')
req = urllib.request.Request(f'{LIVE}/api/bootstrap', headers={'User-Agent': 'Mozilla/5.0 (compatible; classhub-mirror)'})
with urllib.request.urlopen(req, timeout=30) as r:
    data = json.loads(r.read().decode())
n_lessons = sum(len(d or []) for d in data.get('days', []))
n_tasks = len(data.get('tasks', {}).get('active', [])) + len(data.get('tasks', {}).get('expired', []))
n_ann = len(data.get('announcements', []))
print(f'   درس‌ها: {n_lessons}، تکالیف/کارها: {n_tasks}، اطلاعیه‌ها: {n_ann}')

# ---------- ۲) بیک کردن در index.html ----------
print('۲) بیک کردن داده‌ها در صفحه…')
html = (PUB / 'index.html').read_text()

snapshot = {
    '__BOOTSTRAP__': data,
    '__LIVE_ORIGIN__': LIVE,
    '__MIRROR_DATE__': __import__('datetime').date.today().isoformat(),
}
inject = '<script>\nwindow.__BOOTSTRAP__ = ' + json.dumps(data, ensure_ascii=False) + ';\n' \
      + 'window.__LIVE_ORIGIN__ = ' + json.dumps(LIVE) + ';\n' \
      + "window.__MIRROR_DATE__ = '" + snapshot['__MIRROR_DATE__'] + "';\n</script>\n"

# تزریق قبل از اسکریپت اصلی (اولین <script> در body)
marker = re.search(r'<script>\n', html)
if not marker:
    sys.exit('marker اسکریپت در index.html پیدا نشد')
html = html[:marker.start()] + inject + html[marker.start():]

# فونت‌ها → data-URI تا آینه به هیچ فایل خارجی وابسته نباشد
for font in ['Vazirmatn-Regular', 'Vazirmatn-SemiBold', 'Vazirmatn-ExtraBold', 'Estedad-ExtraBold']:
    f = PUB / 'fonts' / f'{font}.woff2'
    if not f.exists():
        continue
    b64 = base64.b64encode(f.read_bytes()).decode()
    html = html.replace(f"url('/fonts/{font}.woff2')", f"url(data:font/woff2;base64,{b64})")
    html = re.sub(r'<link rel="preload" href="/fonts/' + font + r'\.woff2"[^>]*>\n?', '', html)

# ابروی preload فونت باقی‌مانده را هم پاک کن (چهارمین فونت بالا نیست ولی اگر بود)
html = re.sub(r'<link rel="preload" href="/fonts/[^"]+"[^>]*>\n?', '', html)

out = ROOT / 'mirror_out' / 'index.html'
out.parent.mkdir(exist_ok=True)
out.write_text(html)
kb = out.stat().st_size / 1024
print(f'   mirror/index.html: {kb:.1f}KB (با فونت و داده)')

# ---------- ۳) ساخت شاخه‌ی gh-pages و push ----------
print('۳) ساخت شاخه‌ی gh-pages و push…')
work = ROOT / 'mirror_out' / 'repo'
if work.exists():
    subprocess.run(['rm', '-rf', str(work)], check=True)
work.mkdir(parents=True)
subprocess.run(['git', 'clone', '--quiet', f'https://x-access-token:{GH_TOKEN}@github.com/{REPO}.git', str(work)], check=True)
subprocess.run(['git', '-C', str(work), 'checkout', '--orphan', 'gh-pages'], check=True)
subprocess.run(['git', '-C', str(work), 'rm', '-rf', '--quiet', '.'], check=True)
(work / 'index.html').write_text(html)
(work / '.nojekyll').write_text('')
subprocess.run(['git', '-C', str(work), 'add', '-A'], check=True)
subprocess.run(['git', '-C', str(work), '-c', 'user.name=Z.ai Mirror Bot',
                '-c', 'user.email=noreply@z.ai',
                'commit', '--quiet', '-m',
                f'mirror: snapshot {snapshot["__MIRROR_DATE__"]} — نسخه‌ی آینه برای دسترسی بدون-VPN'], check=True)
subprocess.run(['git', '-C', str(work), 'push', '--force', 'origin', 'gh-pages'], check=True)
print('   push شد ✓')

# ---------- ۴) فعال‌سازی Pages ----------
print('۴) فعال‌سازی GitHub Pages از شاخه gh-pages…')
status, body = gh_api('POST', f'/repos/{REPO}/pages',
                      {'source': {'branch': 'gh-pages', 'path': '/'}})
if status in (201, 200):
    print(f'   Pages فعال شد: {body.get("html_url")}')
elif status == 409:
    print('   Pages از قبل فعال بود')
else:
    print(f'   هشدار: {status} {json.dumps(body)[:200]}')

# اگر از قبل فعال بوده ولی شاخه‌ی دیگری، به gh-pages برگردانیم
if status == 409:
    status2, body2 = gh_api('GET', f'/repos/{REPO}/pages')
    if status2 == 200 and body2.get('source', {}).get('branch') != 'gh-pages':
        s3, b3 = gh_api('PUT', f'/repos/{REPO}/pages',
                        {'source': {'branch': 'gh-pages', 'path': '/'}})
        print(f'   تغییر source به gh-pages: {"OK" if s3 == 200 else f"{s3} {b3}"}')

print('\nلینک‌های آینه (چند دقیقه بعد از انتشار CDN فعال می‌شوند):')
print(f'  A) https://gigashalgham.github.io/school-s-stuff/')
print(f'  B) https://cdn.jsdelivr.net/gh/{REPO}@gh-pages/index.html')
