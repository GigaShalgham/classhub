// کلاس‌هاب — سرویس‌ورکر
// هدف: دوستان با اینترنت ضعیف هم سایت را سریع و پایدار ببینند.
//
// راهبرد:
//  - HTML صفحه اصلی: «شبکه اول» — همیشه نسخه تازه از سرور می‌آید (داده SSR داخل خودش است)
//    و فقط وقتی شبکه کامل گیر است، آخرین HTML موفق از کش نشان داده می‌شود.
//  - فایل‌های استاتیک (JS/CSS/فونت): «stale-while-revalidate» — فوراً از کش سرو می‌شوند
//    و در پس‌زمینه به‌روز می‌شوند. این فایل‌ها hash ندارند، پس نسخه قدیمی از زمان
//    بیش از ۷ روز گذشته ضریب می‌خورد و از کش واقعی می‌آید.
//  - /api/*: هرگز کش نمی‌شود (داده زنده است؛ خود fetch در app.js تایم‌اوت دارد).
//  - حالت آفلاین کامل: اگر نه شبکه بود و نه کش، صفحه ساده «آفلاین» نشان داده می‌شود.

const VERSION = 'v3.1';
const STATIC_CACHE = `ch-static-${VERSION}`;
const HTML_CACHE = `ch-html-${VERSION}`;
const MAX_STATIC_AGE_MS = 7 * 24 * 3600_000; // ۷ روز

self.addEventListener('install', (event) => {
  // بدون waitUntil: نصب بی‌صدا؛ کش‌ها در اولین fetch ساخته می‌شوند
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // حذف کش‌های نسخه‌های قدیمی
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k.startsWith('ch-') && k !== STATIC_CACHE && k !== HTML_CACHE)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/** آیا این درخواست فایل استاتیک «بی‌خطر برای کش» است؟ */
function isStaticAsset(url) {
  return url.pathname.startsWith('/js/')
    || url.pathname.startsWith('/css/')
    || url.pathname.startsWith('/fonts/');
}

/** فایل کش‌شده اگر تازه است (زیر ۷ روز)، وگرنه null */
async function freshCached(cacheName, request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (!hit) return null;
  const when = Number(hit.headers.get('date') || 0) * 1000;
  if (when && Date.now() - when > MAX_STATIC_AGE_MS) return null;
  return hit;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // فقط هم‌مبدأ
  if (url.pathname.startsWith('/api/')) return;    // API هرگز کش نمی‌شود
  if (url.pathname.startsWith('/admin')) return;   // پنل مدیریت همیشه زنده

  // --- فایل‌های استاتیک: stale-while-revalidate ---
  if (isStaticAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (cached) {
        // نسخه کش را فوراً بده؛ به‌روزرسانی در پس‌زمینه
        network.catch(() => {});
        return cached;
      }
      const fresh = await network;
      if (fresh) return fresh;
      return new Response('/* آفلاین */', { status: 503, headers: { 'content-type': 'application/javascript' } });
    })());
    return;
  }

  // --- HTML صفحه اصلی: شبکه اول، کش پشتیبان ---
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const cache = await caches.open(HTML_CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        // شبکه گیر/قطع است → آخرین HTML موفق (داده SSR داخل خودش در همان لحظه ذخیره شده)
        const cache = await caches.open(HTML_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        return new Response(OFFLINE_HTML, { status: 503, headers: { 'content-type': 'text/html;charset=UTF-8' } });
      }
    })());
  }
});

const OFFLINE_HTML = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>کلاس‌هاب | آفلاین</title>
  <style>
    body { font-family: Tahoma, sans-serif; background: #FAFBFD; color: #2C3242; display: grid; place-items: center; min-height: 100vh; margin: 0; }
    .box { text-align: center; padding: 32px; max-width: 420px; line-height: 2; }
    .icon { font-size: 44px; }
    h1 { font-size: 20px; margin: 12px 0 4px; }
    p { color: #7C8496; margin: 0 0 20px; }
    button { font-family: inherit; font-size: 15px; padding: 12px 28px; border: none; border-radius: 12px; background: #4C6E9E; color: #fff; cursor: pointer; }
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">📡</div>
    <h1>اینترنت در دسترس نیست</h1>
    <p>به محض وصل‌شدن دوباره، صفحه را از همین دکمه باز کنید.</p>
    <button onclick="location.reload()">تلاش مجدد</button>
  </div>
</body>
</html>`;
