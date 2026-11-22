# 📚 درس من — School Class Hub

A cute, pastel-themed single-page class hub for a school class: the weekly timetable is the centerpiece, with homework details, time-sensitive deadlines, and announcements around it. The student-facing interface is entirely in **Persian (فارسی)** with full RTL layout and Jalali dates.

Deployed on **Cloudflare Workers** (single Worker serving both the static frontend and the JSON API) with **Cloudflare D1** for persistence.

**Production (لینک اصلی — تأییدشده توسط خود کاربر در ایران):** https://school.gigaspaceturnip.workers.dev — ۸/۸ شبکه ایرانی ۲۰۰؛ بهینه برای اینترنت ضعیف (بارگذاری اول ~۱۱۶KB، بازدیدهای بعدی ~۲KB)
**جایگزین:** https://www.the-big-school.de5.net — ۷/۸ شبکه ایرانی ۲۰۰؛ ⚠️ برخی شبکه‌های ایران کل پسوند `de5.net` را بلاک می‌کنند — برای مخاطب عمومی ایران تضمین‌ناپذیر است، لینک اصلی نیست.

### بهینه‌سازی اینترنت ضعیف (آبان ۱۴۰۵ / Nov 2026)
- فونت‌ها زیرمجموعه‌سازی شدند: ۹ فایل ۳۲۸KB → ۴ فایل ۱۲۹KB خام (~۸۸KB compressed)
- کش مرورگر فعال شد: فونت `max-age=31536000, immutable`، CSS/JS `max-age=86400` (قبلاً `max-age=0` — هر بازدید همه‌چیز از نو دانلود می‌شد!)
- نتیجه: بارگذاری اول ~۱۱۶KB، بازدید بعدی فقط ~۲KB (HTML)

### نسخه تک‌فایلی + API یکجا (۲۰ نوامبر ۲۰۲۶ — رفع «نصفه باز شدن»)
علت واقعی نصفه‌ماندن صفحه روی اینترنت ضعیف نه DNS بود و نه حجم: **زنجیره‌ی ۱۰ درخواست**
(html → css → js → دو import → ۴ درخواست API موازی) بدون هیچ retry — روی شبکه‌ای که پکت
می‌اندازد، قطره‌شدن فقط یکی از آن‌ها یعنی بخشی از صفحه هرگز نمی‌آید.
راه‌حل (فقط تغییر افزدونی؛ دیتابیس دست‌نخورده):
- **صفحه دانش‌آموز تک‌فایلی شد**: CSS و JS (utils + schedule + app) داخل خود HTML اینلاین می‌شوند
  — `npm run build` → `scripts/build_singlefile.mjs` از روی `public/index.src.html` می‌سازدش.
  ۱۰ درخواست → **۵ درخواست** (۱ html + ۱ API + ۳ فونت)، و پوسته صفحه با کش مرورگر
  (`max-age=300, stale-while-revalidate`) بازدید بعدی را **صفر دانلود** می‌کند.
- **`GET /api/bootstrap`**: چهار اندپوینت عمومی در یک پاسخ یکی شد (schedule + tasks + announcements
  + settings) — یک رفت‌وبرگشت به‌جای چهارِ موازی.
- **fetch مقاوم**: هر مبدأ یک پنجره‌ی ~۱۰ثانیه‌ای کشف دارد (۳ تلاش داخلش)؛ اگر مسیر بسته
  باشد سریع مبدأ بعدی می‌رود، بعد یک دور با مهلت ۳۵ثانیه برای حالت «فقط کند».
  اگر داده نیامد بنر «🌐 شبکه کند است… / ⚠️ اتصال قطع شد» پایین صفحه می‌آید و هر ۸ ثانیه
  خودش دوباره تلاش می‌کند تا صفحه بی‌صدا کامل شود.
- نتیجه روی production: پوسته ~۲۷KB (compressed) در یک درخواست؛ داده‌ها ~۱KB در یک درخواست.

### وضعیت «بدون VPN» در ایران — لایه‌های نجات (۲۰ نوامبر ۲۰۲۶)
گزارش کاربر: با VPN کامل باز می‌شود؛ بدون VPN نه. پروب از ۸ نود ایران نشان داد همه‌ی
دامنه‌ها سالم‌اند → مشکل مسیر ISPِ خاصِ کاربران است (فیلترینگ DPI/تحدید نرخ). لایه‌ها:

**لایه ۱ — تنظیمات زون**: `security_level` هر دو زون `essentially_off`، بدون چالش و
Browser Check (`scripts/fix_security_level.sh`).

**لایه ۲ — fallback چند-مبدأ داخل خود صفحه** (`public/js/app.js` → `API_ORIGINS`):
اگر مبدأ جاری جواب ندهد، همان fetch به‌ترتیب می‌رود به: دو دامنه‌ی دیگر کلادفلر →
پورت ۸۴۴۳ (فیلترینگ پورت-محور را دور می‌زند) → HTTP ساده (بدون SNI). CORS روی
`/api/bootstrap` از هر سه مبدأ باز است. تست‌شده با شبیه‌سازی قطع کامل.

**لایه ۳ — آینه‌ی استاتیک روی GitHub Pages** (`scripts/publish_mirror.py`):
داده‌های زنده بیک می‌شوند داخل خود صفحه (`window.__BOOTSTRAP__`)، فونت‌ها data-URI،
و به شاخه‌ی gh-pages پوش می‌شود. روی شبکه‌ی Fastly — غیر-کلادفلر — میزبانی می‌شود:
- **https://gigashalgham.github.io/classhub/** ← لینک اصلی نجات (تست‌شده در مرورگر)
- **https://gigashalgham.github.io/classhub/admin/** ← آینه‌ی ادمین (API زنده، تست‌شده)
- نکته CDNها: jsDelivr فایل .html را `text/plain + nosniff` می‌دهد (متن خام!) و
  githack یک صفحه‌ی هشدار کلیکی («Open the page») نشان می‌دهد؛ statically هم به
  http سقوط می‌کند. هیچ‌کدام برای مرور مستقیم مناسب نیستند — آینه‌ی قابل‌مرور فقط
  GitHub Pages است. (لینک‌های CDN فقط برای دانلود فایل تک‌صفحه‌ای بدرد می‌خورند.)
اجرای دوباره بعد از هر تغییر داده: `python3 scripts/publish_mirror.py`
(اگر CDN نسخه‌ی کهنه داد: purge با اضافه‌کردن `?v=<تاریخ>` به URL).

**لایه ۴ — بنر نجات**: اگر همه‌ی مسیرها قطع باشند، بنر قرمز پایین صفحه لینک
مستقیم آینه را نشان می‌دهد؛ دوستان با یک کلیک وارد نسخه‌ی قابل‌مشاهده می‌شوند.

**ماتریس تست برای دوستان (به‌ترتیب امتحان کنند):**
۱. https://school.gigaspaceturnip.workers.dev
۲. https://www.the-big-school.de5.net
۳. https://gigashalgham.github.io/classhub/ ← تقریباً همیشه باز است
اگر هیچ‌کدام باز نشد، مشکل شبکه/دستگاه خودشان است (نه سایت).
⚠️ دامنه‌ی `school.sigmababyboy.ccwu.cc` در آبان ۱۴۰۵ بازنشسته شد (Worker Domain آن حذف شد) — لینک زنده نیست.
نکته DNS: Private DNS = `1.1.1.1` در اندروید (Settings → Network → Private DNS)
خیلی از بلاک‌های DNS سطح ISP را دور می‌زند؛ رایگان و بدون نصب.

**محدودیت صادقانه**: آینه فقط «خواندنیِ لحظه‌ی انتشار» است (تکلیف جدید = اجرای
دوباره‌ی publish یا باز کردن سایت زنده). ادمین هم همیشه روی سایت زنده انجام می‌شود.

---

## ✨ Features

### Student view (public, read-only)
- **Weekly timetable grid** — 7 day columns (شنبه…جمعه), chronological period cards, subject-specific pastel identities, today's column auto-highlighted, friendly empty states.
- **Interactive lesson details** — clicking a lesson opens a side panel (desktop) / bottom sheet (mobile) with the full homework description, textbook pages, instructions, rep notes, deadline countdown, and downloadable attachments. Escape-to-close, focus trapping, smooth animations.
- **Time-sensitive tasks** — research, projects, presentations, exams, quizzes, submissions; sorted by deadline; live countdown chips («امروز!», «فردا», «۳ روز مانده», «مهلت گذشته»); expired items archived but accessible; priority indicators; attachments.
- **Announcements** — pinned items on top, publication dates (Jalali), attachments.
- **Notification bell** — urgent deadlines and pinned announcements.
- Fully responsive (desktop / tablet / mobile with horizontal day scrolling), `prefers-reduced-motion` respected.

### Admin panel (`/admin`, authorized users only)
- First-run **bootstrap** flow to create the class-representative account, then session login (PBKDF2-hashed passwords, HTTP-only cookies, server-side sessions in D1).
- Full CRUD for lessons (timetable), homework (with attachments, deadlines, instructions, rep notes), standalone tasks, announcements (pin/unpin), subjects (with pastel color), and site settings (class name, welcome message).
- File uploads (images / PDF / Office, ≤ 1.5 MB each, MIME whitelist) with confirm dialogs for destructive actions.

### Security
- Public API is strictly read-only; every mutation requires a valid admin session (checked server-side).
- Server-side input validation on every endpoint (types, ranges, enums, lengths).
- Rate limiting on login/bootstrap/upload endpoints.
- Uploads: MIME whitelist, filename sanitization, size caps, `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff` on download (no inline HTML/SVG rendering).
- No secrets in client code; passwords stored as PBKDF2-SHA256 (100k iterations, per-user salt); session tokens stored only as SHA-256 hashes.

---

## 🧱 Technology stack

| Layer | Technology |
| --- | --- |
| Runtime | Cloudflare Workers |
| API framework | [Hono](https://hono.dev) (TypeScript) |
| Database | Cloudflare D1 (SQLite) |
| Attachments | D1 BLOB storage (see note below) |
| Frontend | Vanilla JS ES modules, handcrafted CSS (no build step) |
| Font | [Vazirmatn](https://github.com/rastikerdar/vazirmatn) (OFL, self-hosted) |
| Tooling | Wrangler 4, TypeScript, jest (utils), GitHub Actions |

> **Attachment storage note:** the Cloudflare account in use does not have R2 enabled (the API returns *"Please enable R2 through the Cloudflare Dashboard"*), so attachments are stored as validated BLOB rows in D1 with strict limits (1.5 MB per file, 6 MB per item, safe types only). If R2 is enabled later, `src/attachments.ts` + the two attachment routes are the only places to swap.

---

## 📂 Project structure

```
├── wrangler.jsonc          # Worker config: assets, D1 binding, vars
├── migrations/             # D1 SQL migrations
│   ├── 0001_init.sql       # schema
│   └── 0002_homework_unique.sql
├── seed.sql                # initial demo/sample content (idempotent inserts)
├── src/                    # Worker backend (TypeScript, Hono)
│   ├── index.ts            # entrypoint, error handling, CORS
│   ├── auth.ts             # PBKDF2 password hashing, session tokens
│   ├── validation.ts       # input validation helpers
│   ├── ratelimit.ts        # per-instance rate limiter
│   ├── attachments.ts      # upload validation & safe download headers
│   ├── types.ts            # shared types
│   └── routes/
│       ├── public.ts       # read-only student API
│       └── admin.ts        # authenticated admin API
├── public/                 # static frontend (served by the Worker)
│   ├── index.src.html      # student page source (edit this)
│   ├── index.html          # GENERATED single-file build (do not edit; run npm run build)
│   ├── admin/index.html    # admin panel
│   ├── css/style.css       # pastel design system
│   ├── js/utils.js         # Jalali calendar, Persian digits, countdowns
│   ├── js/app.js           # student app
│   ├── js/admin.js         # admin app
│   └── fonts/              # Vazirmatn woff2 + OFL license
└── .github/workflows/
    └── deploy.yml          # CI: typecheck → test → deploy to Workers
```

---

## 🔌 API overview

Public (read-only):

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | liveness probe |
| GET | `/api/bootstrap` | **all of the below in one payload** (weak-network fast path) |
| GET | `/api/schedule` | weekly timetable (7 day arrays) |
| GET | `/api/lessons/:id` | lesson detail incl. full homework + attachments |
| GET | `/api/tasks` | active + expired tasks |
| GET | `/api/tasks/:id` | task detail |
| GET | `/api/announcements` | announcement list (pinned first) |
| GET | `/api/announcements/:id` | announcement detail |
| GET | `/api/subjects` | subject catalog |
| GET | `/api/settings` | public site settings |
| GET | `/api/attachments/:id` | download attachment (as file) |

Admin (session cookie or `Authorization: Bearer <token>`):

`POST /api/admin/auth/status` · `bootstrap` · `login` · `logout` · `GET me`,
`POST/PUT/DELETE /api/admin/lessons`, `PUT/DELETE /api/admin/lessons/:id/homework`,
`POST/PUT/DELETE /api/admin/tasks`, `POST /api/admin/tasks/:id/archive`,
`POST/PUT/DELETE /api/admin/announcements`,
`POST /api/admin/attachments` (multipart), `DELETE /api/admin/attachments/:id`,
`POST /api/admin/subjects`, `PUT /api/admin/settings`.

---

## 🛠️ Local development

Requirements: Node.js ≥ 20.

```bash
npm install

# 1. local D1: apply migrations + sample content
npm run db:migrate:local
npm run db:seed:local

# 2. build the single-file student page (required after editing src.html / js / css)
npm run build

# 3. run the Worker + assets locally
npm run dev          # → http://127.0.0.1:8787
```

Other scripts:

```bash
npm run typecheck    # tsc --noEmit
npm test             # date/countdown utility tests
npm run db:migrate   # remote migrations (needs CLOUDFLARE_API_TOKEN)
npm run db:seed      # remote seed (needs CLOUDFLARE_API_TOKEN)
npm run deploy       # wrangler deploy (needs CLOUDFLARE_API_TOKEN)
```

First run on a fresh database: open `/admin` — the login card switches to a *create the admin account* form (bootstrap). This is only available while no admin exists.

---

## ☁️ Cloudflare resources

| Resource | Name | Notes |
| --- | --- | --- |
| Worker | `school` | serves API + static assets, `workers.dev` route enabled |
| D1 database | `school_class_db` | binding `DB`, 2 migrations |
| R2 | — | not enabled on this account; attachments stored in D1 (see note) |

### Environment variables / secrets

Plain vars are set in `wrangler.jsonc`:

| Var | Default | Description |
| --- | --- | --- |
| `APP_NAME` | `درس من` | display name |
| `rotation_anchor` | `2026-11-21` | مبنا زنگ‌های گردشی: شنبه‌ی هفته‌ای که درسِ اصلی بوده |
| `SESSION_TTL_HOURS` | `12` | admin session lifetime |

No secrets are required for the app itself: admin credentials live in D1 (created via the bootstrap flow). **Never** put Cloudflare API tokens in `wrangler.jsonc` or source files — they belong in CI secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).

### Database setup

```bash
npx wrangler d1 create school_class_db
# put the returned database_id into wrangler.jsonc

npx wrangler d1 migrations apply school_class_db --remote
npx wrangler d1 execute school_class_db --remote --file=./seed.sql -y   # optional sample content
```

### Deployment

```bash
export CLOUDFLARE_API_TOKEN=…   # token with Workers Scripts + D1 edit permissions
export CLOUDFLARE_ACCOUNT_ID=…
npx wrangler deploy
```

Or push to `main` and let GitHub Actions deploy (see below).

---

## 🤖 GitHub Actions

`.github/workflows/deploy.yml` runs on every push to `main`:

1. checkout → Node 22 + npm cache
2. `npm ci`
3. `npm run typecheck`
4. `npm test`
5. `npx wrangler d1 migrations apply school_class_db --remote` (keeps schema current)
6. `npx wrangler deploy`

Required repository secrets (Settings → Secrets and variables → Actions):

| Secret | Description |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | token with *Workers Scripts:Edit* and *D1:Edit* |
| `CLOUDFLARE_ACCOUNT_ID` | the Cloudflare account ID |

---

## 🧪 Testing

- `scripts/test_api.sh` — 50+ endpoint checks (public data, auth, CRUD, validation, uploads, security) against any running instance; point `BASE` at the deployed URL to smoke-test production.
- `scripts/test_utils.mjs` — Jalali conversion anchors, countdown states, Persian digit formatting.
- Manual UI checks: desktop 1440/1280, mobile 375 (timetable scroll, bottom sheet), keyboard navigation, reduced-motion.

## 📄 License

- Application code: MIT.
- Vazirmatn font: SIL OFL 1.1 (see `public/fonts/Vazirmatn-OFL.txt`).


## 🔄 زنگ‌های گردشی

زنگ‌هایی که هفته‌به‌هفته بین دو درس می‌چرخند (مثل هندسه ↔ دفاعی). در تب «برنامه»‌ی پنل ادمین، درس دوم را از فهرست «🔄 گردشی» همان خانه انتخاب کنید.

- **پاریتی هفته** از تنظیم `rotation_anchor` محاسبه می‌شود: شنبه‌ی هفته‌ای که درسِ *اصلی* بوده؛ هفته‌های بعد یک‌درمیان درس دوم نشان داده می‌شود.
- **جابه‌جایی هفته:** اگر برنامه‌ی واقعی مدرسه با سایت نمی‌خواند (تعطیلی، جابه‌جایی معلم و…)، در تب «تنظیمات» دکمه‌ی «🔄 هفته‌ی فعلی را جابه‌جا کن» وضعیت هفته‌ی جاری را برعکس می‌کند؛ چرخشِ آینده از همان‌جا به‌درستی ادامه می‌یابد.
- دانش‌آموزها فقط درسِ واقعی همان هفته را می‌بینند — نه دو نام و نه مفهوم «گردشی» را.
- API: `PUT /api/admin/rotation` با `{"mode":"flip"}` یا `{"mode":"set","anchor":"YYYY-MM-DD"}` (تاریخ غیرشنبه به شنبه‌ی همان هفته نرمال می‌شود).

## 🔗 پیوست‌های لینکی (فضای فایلِ بیشتر)

سقف پیوستِ مستقیم (ذخیره در D1) کوچک است (~۱.۵MB). برای فایل‌های حجیم — جزوه، ویدیو، PDFهای سنگین —
**پیوست لینکی** ساخته شد: فایل را روی سرویس دلخواه (گوگل‌درایو و…) می‌گذارید و لینکش را در
فرم تکلیف/مهلت/اطلاعیه می‌چسبانید. دانش‌آموز لینک را مستقیم باز می‌کند.

- API: `POST /api/admin/attachments/link` با `{parentType, parentId, url, title}`
- `GET /api/attachments/:id` برای ردیف‌های لینکی ۳۰۲ به URL می‌دهد (سازگاری با کلاینت‌های قدیمی)
- چرا آپلود مستقیم به درایو نه؟ نیاز به پروژه‌ی Google Cloud و OAuth دارد و از ایران هم بدون VPN باز نمی‌شود؛
  لینک اشتراکی همان کار را بدون هیچ راه‌اندازی انجام می‌دهد و روی هر سرویسی کار می‌کند که خودتان انتخاب کنید.
- R2 (ذخیره‌سازی آبجکت کلادفلر، ۱۰GB رایگان) روی این اکانت فعال نیست؛ اگر بعداً فعال شد، مسیر طبیعی
  ارتقاست — endpoint آپلود برای آن جدا می‌شود.

## ☁️ انبار فایل تلگرام (ذخیره‌سازی از راه دور)

پیوست‌ها می‌توانند به‌جای دیتابیس، در **چت خصوصی خودتان در تلگرام** ذخیره شوند: فایل با بات به چت
فرستاده می‌شود، فقط `file_id` در D1 می‌ماند، و دانلود موقع درخواست از سرورهای تلگرام استریم می‌شود —
هیچ بایتی روی سرور ذخیره نمی‌شود. سقف هر فایل از ۱.۵MB به **۲۰MB** می‌رسد (سقف getFile بات‌ها).

راه‌اندازی (پنل ادمین → تنظیمات → «انبار فایل تلگرام»):
۱) به @BotFather پیام `/newbot` بدهید و توکن بات را بردارید.
۲) به بات خودتان `/start` بزنید (لازم برای پیدا شدن chat id).
۳) توکن را در پنل بچسبانید → «دریافت chat id» → «ذخیره» → «تست اتصال».

- آپلود: `POST /api/attachments` (همان قبل) — سرور خودش به `sendDocument` تلگرام می‌فرستد.
- دانلود: `GET /api/attachments/:id` → `getFile` → استریم با Content-Disposition درست (اسم فارسی).
- تنظیمات در جدول settings (`tg_bot_token`, `tg_chat_id`) — فقط سمت سرور خوانده می‌شود؛
  پنل فقط نسخه‌ی ماسک‌شده می‌بیند. کلیدهای خالی = غیرفعال‌کردن (دکمه «غیرفعال‌کردن»).
- حذف پیوست فقط ردیف D1 را پاک می‌کند؛ فایل در چت شما می‌ماند (بات‌ها API حذف فایل ندارند).
- تست‌های واحد در `test/telegram.test.mjs` با fetch ساختگی.
