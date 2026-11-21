# دیاگرام معماری کامل کلاس‌هاب — Playwright + CSS
# خروجی: download/classhub-architecture.png
# لایه‌ها: کاربران → مسیرهای دسترسی (زنده CF + آینه گیت‌هاب) → Worker → D1
# قواعد: بدون هم‌پوشانی، پس‌زمینه‌ی کم‌اشباع + حاشیه‌ی اشباع، هم‌خانواده‌ی آبی-خاکستری

import asyncio
import os
from playwright.async_api import async_playwright

HTML = r'''<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --text: #111827; --text-sub: #6B7280; --text-muted: #9CA3AF;
    --bg: #FFFFFF; --surface: #F9FAFB; --border: #E5E7EB;
    --connector: #94A3B8; --accent: #4C6EF5;
  }
  body {
    font-family: 'Vazirmatn', 'Noto Sans SC', 'Segoe UI', system-ui, sans-serif;
    background: var(--bg); color: var(--text);
    -webkit-font-smoothing: antialiased;
  }
  #root { width: fit-content; min-width: 1480px; margin: 0 auto; padding: 48px 44px; background: #FFFFFF; }

  .arch-title { font-size: 26px; font-weight: 800; text-align: center; color: #1E293B; }
  .arch-subtitle { font-size: 14px; color: var(--text-sub); text-align: center; margin-top: 8px; margin-bottom: 36px; }

  /* ─── لایه‌ها ─── */
  .layer {
    border-radius: 14px; padding: 18px 22px 22px; margin-bottom: 0;
    border: 1.5px solid #E2E8F0;
  }
  .layer-label {
    font-size: 13px; font-weight: 700; color: #64748B; letter-spacing: .5px;
    margin-bottom: 14px; display: flex; align-items: center; gap: 8px;
  }
  .layer-label .dot { width: 9px; height: 9px; border-radius: 50%; background: #64748B; }
  .layer-1 { background: #FBFCFE; }
  .layer-2 { background: #F8FAFC; }
  .layer-3 { background: #F5F7FA; }

  .arrow-row { text-align: center; color: #94A3B8; font-size: 26px; line-height: 1; margin: 10px 0; }
  .arrow-note { font-size: 12px; color: var(--text-sub); margin-top: 2px; }

  /* ─── لایه ۱: کاربران ─── */
  .users-row { display: flex; gap: 24px; justify-content: center; }
  .user-card {
    background: #FFFFFF; border: 2px solid #94A3B8; border-radius: 12px;
    padding: 16px 26px; text-align: center; min-width: 340px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  .user-card .u-title { font-size: 16px; font-weight: 700; color: #334155; }
  .user-card .u-desc { font-size: 12.5px; color: var(--text-sub); margin-top: 5px; line-height: 1.7; }

  /* ─── لایه ۲: مسیر دسترسی ─── */
  .delivery-cols { display: flex; gap: 28px; align-items: stretch; }
  .col { flex: 1; border-radius: 12px; padding: 16px 18px; }
  .col-title { font-size: 15px; font-weight: 800; padding: 9px 14px; border-radius: 8px; margin-bottom: 14px; }
  .col-live, .col-mirror, .col-publish { background: #F0F4F8; border: 1.5px dashed #B9C8D8; }
  .col-live .col-title, .col-mirror .col-title, .col-publish .col-title {
    background: #E4EBF2; color: #1E3A5F; border-right: 4px solid #5B7A99;
  }

  .link-card {
    background: #FFFFFF; border: 1.5px solid #C4D0DC; border-radius: 9px;
    padding: 10px 14px; margin-bottom: 10px;
  }
  .link-card:last-child { margin-bottom: 0; }
  .link-name { font-size: 13.5px; font-weight: 700; color: #1E3A5F; direction: ltr; text-align: left; font-family: 'Segoe UI', system-ui, sans-serif; }
  .link-desc { font-size: 12px; color: var(--text-sub); margin-top: 3px; line-height: 1.65; }
  .link-desc.retired-note { color: #9CA3AF; text-decoration: line-through; }

  .mini-step { font-size: 12.5px; color: #374151; background: #FFFFFF; border: 1px solid var(--border); border-radius: 7px; padding: 9px 13px; margin-bottom: 8px; line-height: 1.7; }
  .mini-step:last-child { margin-bottom: 0; }
  .mini-step b { color: #1E3A5F; }
  .code { direction: ltr; unicode-bidi: embed; font-family: 'Segoe UI', Consolas, monospace; font-size: 11.5px; color: #475569; }

  /* ─── لایه ۳: Worker ─── */
  .worker-wrap { display: flex; gap: 28px; align-items: stretch; }
  .worker-main { flex: 1.6; background: #EFF6FF; border: 2px solid #3B82F6; border-radius: 12px; padding: 18px 22px; }
  .worker-title { font-size: 17px; font-weight: 800; color: #1E40AF; margin-bottom: 4px; }
  .worker-sub { font-size: 12.5px; color: #47569E; margin-bottom: 14px; }
  .route-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .route-box { background: #FFFFFF; border: 1.5px solid #B9CBEB; border-radius: 8px; padding: 10px 13px; }
  .route-box .r-name { font-size: 13px; font-weight: 700; color: #1E3A5F; direction: ltr; text-align: left; font-family: 'Segoe UI', monospace; }
  .route-box .r-desc { font-size: 11.5px; color: var(--text-sub); margin-top: 3px; line-height: 1.6; }

  .worker-side { flex: 1; display: flex; flex-direction: column; gap: 12px; }
  .side-card { background: #F8FAFC; border: 1.5px solid #94A3B8; border-radius: 10px; padding: 13px 16px; }
  .side-card .s-title { font-size: 13.5px; font-weight: 700; color: #334155; }
  .side-card .s-desc { font-size: 11.5px; color: var(--text-sub); margin-top: 4px; line-height: 1.65; }

  /* ─── D1 ─── */
  .db-card { background: #F0FDF4; border: 2px solid #10B981; border-radius: 12px; padding: 16px 22px; }
  .db-title { font-size: 16px; font-weight: 800; color: #065F46; margin-bottom: 3px; }
  .db-sub { font-size: 12px; color: #4D7C5F; margin-bottom: 12px; }
  .tables-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .table-chip { background: #FFFFFF; border: 1.5px solid #A7D8BC; border-radius: 7px; padding: 7px 13px; font-size: 12px; font-weight: 600; color: #065F46; direction: ltr; font-family: 'Segoe UI', monospace; }

  /* ─── پایین: جریان‌ها ─── */
  .flows-row { display: flex; gap: 24px; margin-top: 26px; }
  .flow-box { flex: 1; background: #F8FAFC; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 16px 20px; }
  .flow-box .f-title { font-size: 14px; font-weight: 800; color: #334155; margin-bottom: 10px; }
  .flow-line { font-size: 12.5px; color: #374151; line-height: 1.9; }
  .flow-line .step { display: inline-block; background: #E2E8F0; color: #475569; border-radius: 50%; width: 20px; height: 20px; line-height: 20px; text-align: center; font-size: 11px; font-weight: 700; margin-left: 6px; }

  .footer-note { margin-top: 26px; text-align: center; font-size: 12px; color: var(--text-muted); line-height: 1.8; }
</style>
</head>
<body>
<div id="root">
  <div class="arch-title">معماری کامل پروژه‌ی درس من</div>
  <div class="arch-subtitle">سایت زنده روی Cloudflare Workers + آینه‌ی استاتیک روی GitHub Pages — به‌روزرسانی آبان ۱۴۰۵ (نام جدید: درس من)</div>

  <!-- ═══ لایه ۱: کاربران ═══ -->
  <div class="layer layer-1">
    <div class="layer-label"><span class="dot"></span>لایه ۱ — کاربران</div>
    <div class="users-row">
      <div class="user-card">
        <div class="u-title">👨‍🎓 دانش‌آموزان کلاس (صفحه اصلی)</div>
        <div class="u-desc">برنامه هفتگی، تکالیف و مهلت‌ها، اطلاعیه‌ها و پیوست‌ها — بدون لاگین<br>سایت زنده یا آینه، هر کدام که فیلتر نباشد</div>
      </div>
      <div class="user-card">
        <div class="u-title">👨‍🏫 مدیر کلاس (سرِ کلاس)</div>
        <div class="u-desc">لاگین با نام کاربری/گذرواژه → ویرایش برنامه، ثبت تکلیف، اطلاعیه و آپلود پیوست<br>روی سایت زنده با کوکی، روی آینه با توکن Bearer</div>
      </div>
    </div>
  </div>

  <div class="arrow-row">↓<div class="arrow-note">دسترسی از مرورگر (کش ۱ ساعته + به‌روزرسانی پس‌زمینه)</div></div>

  <!-- ═══ لایه ۲: مسیرهای دسترسی ═══ -->
  <div class="layer layer-2">
    <div class="layer-label"><span class="dot"></span>لایه ۲ — مسیرهای دسترسی (۵ لینک فعال، دو شبکه‌ی مستقل)</div>
    <div class="delivery-cols">
      <div class="col col-live">
        <div class="col-title">🟢 سایت زنده — Cloudflare (شبکه‌ی CDN کلادفلر)</div>
        <div class="link-card">
          <div class="link-name">school.gigaspaceturnip.workers.dev</div>
          <div class="link-desc">لینک اصلی — تأییدشده روی ۸/۸ شبکه‌ی ایرانی؛ بهینه برای اینترنت ضعیف</div>
        </div>
        <div class="link-card">
          <div class="link-name">www.the-big-school.de5.net</div>
          <div class="link-desc">دامنه‌ی اختصاصی جایگزین (و آپکس بدون www) — اگر workers.dev فیلتر شد</div>
        </div>
        <div class="link-card">
          <div class="link-name retired-note">school.sigmababyboy.ccwu.cc</div>
          <div class="link-desc retired-note">بازنشسته شد (آبان ۱۴۰۵) — Worker Domain حذف شد؛ دیگر سرو نمی‌شود</div>
        </div>
        <div class="link-card">
          <div class="link-desc" style="margin-top:8px; background:#F8FAFC; border-radius:6px; padding:8px 10px;">⚙️ ECH هر دو زون خاموش است تا کروم جدید روی فیتر ایرانی فیلتر نشود · fallback خودکار بین مبدأها اگر یکی قطع باشد</div>
        </div>
      </div>
      <div class="col col-mirror">
        <div class="col-title">🪞 آینه‌ی استاتیک — GitHub Pages (شبکه‌ی Fastly)</div>
        <div class="link-card">
          <div class="link-name">gigashalgham.github.io/classhub/</div>
          <div class="link-desc">صفحه‌ی دانش‌آموز — داده‌ها داخل خود فایل بیک شده (تک‌فایلی ~۲۳۰KB با فونت)</div>
        </div>
        <div class="link-card">
          <div class="link-name">gigashalgham.github.io/classhub/admin/</div>
          <div class="link-desc">پنل ادمین آینه — ظاهر از گیت‌هاب، API به سایت زنده (توکن Bearer)</div>
        </div>
        <div class="link-card">
          <div class="link-name">cdn.jsdelivr.net/gh/GigaShalgham/classhub@gh-pages</div>
          <div class="link-desc">CDN جایگزین همان محتوا — مسیر سوم برای وقتی github.io قطع است</div>
        </div>
        <div class="link-card">
          <div class="link-desc" style="margin-top:8px; background:#F8FAFC; border-radius:6px; padding:8px 10px;">📌 مسیرها مستقل‌اند — آینه عکسِ داده‌ی روز انتشار است و با هر publish تازه می‌شود</div>
        </div>
      </div>
      <div class="col col-publish">
        <div class="col-title">🔄 انتشار (از sandbox توسعه)</div>
        <div class="mini-step"><b>deploy:</b> <span class="code">npm run deploy</span> → build تک‌فایلی + <span class="code">wrangler deploy</span> روی Worker زنده</div>
        <div class="mini-step"><b>mirror:</b> <span class="code">scripts/publish_mirror.py</span> → دریافت <span class="code">/api/bootstrap</span> از زنده، بیک‌کردن در HTML، push به شاخه‌ی <span class="code">gh-pages</span></div>
        <div class="mini-step"><b>build:</b> <span class="code">scripts/build_singlefile.mjs</span> → درون‌خطی‌کردن CSS/JS در <span class="code">index.src.html</span> و <span class="code">admin/index.src.html</span></div>
        <div class="mini-step"><b>سورس کد:</b> ریپوی <span class="code">GigaShalgham/classhub</span> (شاخه‌ی main) — کامیت و push از همین sandbox</div>
      </div>
    </div>
  </div>

  <div class="arrow-row">↓<div class="arrow-note">فقط سایت زنده به Worker وصل می‌شود — آینه‌ی ادمین هم API را به زنده می‌فرستد (CORS باز)</div></div>

  <!-- ═══ لایه ۳: Worker و دیتابیس ═══ -->
  <div class="layer layer-3">
    <div class="layer-label"><span class="dot"></span>لایه ۳ — بک‌اند (Cloudflare Worker «school» + D1)</div>
    <div class="worker-wrap">
      <div class="worker-main">
        <div class="worker-title">Worker — Hono + TypeScript (src/index.ts)</div>
        <div class="worker-sub">سرو فایل‌های استاتیک از public/ + API زیر /api/* — rate-limit و لاگ داخلی</div>
        <div class="route-grid">
          <div class="route-box"><div class="r-name">GET /api/bootstrap</div><div class="r-desc">همه‌چیز در یک پاسخ: برنامه + تکالیف + اطلاعیه‌ها + تنظیمات — کلید سرعت روی نت ضعیف</div></div>
          <div class="route-box"><div class="r-name">GET /api/{schedule,tasks,announcements,subjects,settings}</div><div class="r-desc">خواندن‌های جداگانه برای پنل ادمین (با تلاش مجدد و مهلت در سمت کلاینت)</div></div>
          <div class="route-box"><div class="r-name">/api/admin/auth/*</div><div class="r-desc">لاگین/خروج/status — کوکی httpOnly (زنده) یا توکن Bearer (آینه)، نشست ۱۲ ساعته در D1</div></div>
          <div class="route-box"><div class="r-name">/api/admin/{lessons,homework,tasks,announcements,attachments}</div><div class="r-desc">نوشتن‌ها — فقط با نشست مدیر؛ پیوست‌ها به‌صورت BLOB اعتبارسنجی‌شده در D1</div></div>
        </div>
      </div>
      <div class="worker-side">
        <div class="side-card">
          <div class="s-title">🔐 امنیت</div>
          <div class="s-desc">گذرواژه هش‌شده، توکن نشست هش‌شده در DB، rate-limit روی لاگین، اعتبارسنجی ورودی، CORS فقط برای هدرهای مجاز</div>
        </div>
        <div class="side-card">
          <div class="s-title">⚡ مقاوم‌سازی اینترنت ضعیف</div>
          <div class="s-desc">صفحات تک‌فایلی (۱ درخواست)، font-display: swap، مهلت و تلاش مجدد fetch، کش پوسته ۱ ساعت + stale-while-revalidate</div>
        </div>
        <div class="side-card">
          <div class="s-title">🧹 سرویس‌ورکر (sw.js)</div>
          <div class="s-desc">فقط «خاموش‌کن» — کش‌های نسخه‌های قدیمی را پاک و خودش را حذف می‌کند تا دستگاه‌ها به داده‌ی کهنه نچسبند</div>
        </div>
      </div>
    </div>

    <div class="arrow-row" style="margin:14px 0 10px;">↓<div class="arrow-note">SQLite مؤخره‌ای — یک دیتابیس مشترک بین هر دو دامنه‌ی زنده</div></div>

    <div class="db-card">
      <div class="db-title">D1 — school_class_db</div>
      <div class="db-sub">دیتابیس SQL بدون‌سرور Cloudflare — مهاجرت‌ها در migrations/ (سه نسخه تاکنون)</div>
      <div class="tables-row">
        <div class="table-chip">admins</div>
        <div class="table-chip">sessions</div>
        <div class="table-chip">subjects</div>
        <div class="table-chip">lessons</div>
        <div class="table-chip">homework</div>
        <div class="table-chip">tasks</div>
        <div class="table-chip">announcements</div>
        <div class="table-chip">attachments</div>
      </div>
    </div>
  </div>

  <!-- ═══ جریان‌های کلیدی ═══ -->
  <div class="flows-row">
    <div class="flow-box">
      <div class="f-title">👁 جریان دیدن سایت (دانش‌آموز)</div>
      <div class="flow-line"><span class="step">۱</span>باز کردن یکی از ۵ لینک (کش پوسته معمولاً فوری)</div>
      <div class="flow-line"><span class="step">۲</span>آینه: داده‌ها داخل خود صفحه — زنده: <span class="code">GET /api/bootstrap</span></div>
      <div class="flow-line"><span class="step">۳</span>رندر برنامه هفتگی + شمارش معکوس مهلت‌ها — بدون لاگین</div>
    </div>
    <div class="flow-box">
      <div class="f-title">✏️ جریان مدیریت (مدیر کلاس)</div>
      <div class="flow-line"><span class="step">۱</span>باز کردن /admin (زنده یا آینه — دکمه‌ی ⚙️ خودش می‌برد)</div>
      <div class="flow-line"><span class="step">۲</span>لاگین → کوکی httpOnly (زنده) یا توکن در localStorage (آینه)</div>
      <div class="flow-line"><span class="step">۳</span>هر تغییر → API زنده → D1 → دفعه‌ی بعد publish_mirror.py آینه را تازه می‌کند</div>
    </div>
    <div class="flow-box">
      <div class="f-title">🛡 جریان ضد-فیلترینگ</div>
      <div class="flow-line"><span class="step">۱</span>کلادفلر قطع؟ → آینه‌ی گیت‌هاب (شبکه‌ی Fastly)</div>
      <div class="flow-line"><span class="step">۲</span>گیت‌هاب قطع؟ → CDN جزدلیکر یا دو دامنه‌ی زنده</div>
      <div class="flow-line"><span class="step">۳</span>پنل ادمین آینه همیشه به API زنده وصل است — انتخاب سرور در فرم لاگین</div>
    </div>
  </div>

  <div class="footer-note">
    سورس: github.com/GigaShalgham/classhub (شاخه‌ی main = کد، شاخه‌ی gh-pages = خروجی آینه) · تست‌ها: ۱۹ ✅ · سرور: Cloudflare Workers · دیتابیس: D1
  </div>
</div>
</body>
</html>'''


async def main():
    html_path = '/home/z/my-project/scripts/arch_diagram.html'
    with open(html_path, 'w') as f:
        f.write(HTML)

    out = '/home/z/my-project/download/classhub-architecture.png'
    os.makedirs(os.path.dirname(out), exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(
            viewport={'width': 1600, 'height': 900},
            device_scale_factor=2,
        )
        await page.goto(f'file://{html_path}', wait_until='networkidle')
        await page.wait_for_timeout(500)

        el = page.locator('#root')
        bbox = await el.bounding_box()
        if bbox:
            await page.set_viewport_size({
                'width': max(1600, int(bbox['width'] + 100)),
                'height': int(bbox['height'] + 100),
            })
            await page.wait_for_timeout(200)

        # چک هم‌پوشانی و بیرون‌زدگی
        issues = await page.evaluate('''() => {
            const issues = [];
            const root = document.getElementById('root');
            const rr = root.getBoundingClientRect();
            const cards = [...document.querySelectorAll('.user-card,.link-card,.route-box,.flow-box,.side-card,.db-card,.mini-step')];
            for (const el of cards) {
                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) issues.push('empty: ' + el.className);
                if (el.scrollWidth > el.clientWidth + 2) issues.push('h-overflow: ' + el.className);
                if (r.right > rr.right + 1 || r.left < rr.left - 1) issues.push('outside root: ' + el.className);
            }
            return issues;
        }''')
        print('overflow issues:', issues if issues else 'NONE ✓')

        await el.screenshot(path=out)
        await browser.close()

    print(f'✅ {out} ({os.path.getsize(out)/1024:.0f}KB)')


asyncio.run(main())
