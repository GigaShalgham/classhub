// سرویس‌ورکر خاموش‌کن (نسخه‌ی نهایی)
// نسخه‌های قبلی (v3.x) روی گوشی کاربران ثبت شده‌اند؛ بدون این فایل، دستگاههای
// بازدیدکرده ممکن است به کش قدیمی بچسبند. این فایل فقط یک‌بار اجرا می‌شود:
// همه کش‌ها را پاک می‌کند و خودش را unregister می‌کند. هیچ fetch-handler و
// کشی ندارد، پس هیچ درخواستی را قطع یا دیر نمی‌کند.
const VERSION = 'kill';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.registration.unregister()
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll())
      .then((clients) => {
        for (const client of clients) client.navigate(client.url);
      }),
  );
});
