// راستی‌آزمایی: ۱) روز قبل ۲) برو به فردا ۳) تنظیمات تلگرام + مسیر آپلود
import { chromium } from 'playwright';
const API = 'https://school.gigaspaceturnip.workers.dev';
const TOKEN = (await import('node:fs')).readFileSync('/tmp/tok', 'utf8').trim();
const b = await chromium.launch();

// ---------- ۱+۲) ناوبری روزها ----------
const ps = await b.newPage({ viewport: { width: 1440, height: 900 } });
ps.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 200)));
await ps.goto(API + '/?nav=' + Math.random(), { waitUntil: 'networkidle' });
await ps.waitForTimeout(2000);
const nav0 = await ps.evaluate(() => ({
  goLabel: document.getElementById('todayBtn')?.textContent,
  fabLabel: document.getElementById('fabTodayLabel')?.textContent,
  firstCol: document.querySelector('.day-col .day-col__date')?.textContent,
  prevDisabled: document.getElementById('dayPrev')?.disabled,
  nextDisabled: document.getElementById('dayNext')?.disabled,
}));
console.log('۱+۲) اولیه:', JSON.stringify(nav0), '— عصر باید «برو به فردا» و ستون اول فردا باشد');

// روز قبل → ستون اول باید دیروز شود
await ps.click('#dayPrev');
await ps.waitForTimeout(700);
const nav1 = await ps.evaluate(() => ({
  firstCol: document.querySelector('.day-col .day-col__date')?.textContent,
  firstColName: document.querySelector('.day-col .day-col__name')?.textContent,
  goLabel: document.getElementById('todayBtn')?.textContent,
  prevDisabled: document.getElementById('dayPrev')?.disabled,
}));
console.log('   بعد از «روز قبل»:', JSON.stringify(nav1), '— ستون اول باید دیروز (۳۰ آبان) باشد');

// روز بعد دو بار → دو روز بعد
await ps.click('#dayNext'); await ps.waitForTimeout(500);
await ps.click('#dayNext'); await ps.waitForTimeout(500);
const nav2 = await ps.evaluate(() => ({ firstCol: document.querySelector('.day-col .day-col__date')?.textContent }));
console.log('   بعد از ۲× «روز بعد»:', JSON.stringify(nav2), '— باید ۲ روز جلوتر (۴ آذر) باشد');

// «برو به فردا» → برگشت به فردا
await ps.click('#todayBtn');
await ps.waitForTimeout(700);
const nav3 = await ps.evaluate(() => ({ firstCol: document.querySelector('.day-col .day-col__date')?.textContent }));
console.log('   بعد از «برو به فردا»:', JSON.stringify(nav3), '— باید دوباره فردا (۲ آذر) باشد');
await ps.close();

// ---------- ۳) پنل ادمین: تنظیمات تلگرام ----------
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const pa = await ctx.newPage();
pa.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 200)));
await pa.addInitScript((t) => localStorage.setItem('classhub_admin_token', t), TOKEN);
await pa.goto(API + '/admin/?tg=' + Math.random(), { waitUntil: 'networkidle' });
await pa.waitForTimeout(2500);
await pa.click('button[data-tab="settings"]');
await pa.waitForTimeout(800);
const tg0 = await pa.evaluate(() => ({
  cardVisible: !!document.getElementById('tgForm'),
  status: document.getElementById('tgStatus')?.textContent,
  limitNote: document.getElementById('hwLimitNote')?.textContent,
}));
console.log('۳) کارت تلگرام:', JSON.stringify(tg0, null, 1));

// توکن نامعتبر → خطای فارسی
await pa.fill('#tgToken', 'invalid-token');
await pa.click('#tgForm button[type="submit"]');
await pa.waitForTimeout(1200);
const err = await pa.evaluate(() => document.querySelector('#toasts, .toast, [class*="toast"]')?.textContent?.slice(0, 120));
console.log('   توکن نامعتبر →', err || '(toast خوانده نشد)');

// توکن معتبر-شکل ولی ساختگی → تست discover باید خطای «/start بزنید» یا توکن نامعتبر بدهد
await pa.fill('#tgToken', '123456789:AAEfakefakefakeAAAAAAAAAAAAAAAAAAAAA');
await pa.click('#tgDiscover');
await pa.waitForTimeout(2500);
const err2 = await pa.evaluate(() => document.querySelector('#toasts, .toast, [class*="toast"]')?.textContent?.slice(0, 150));
console.log('   discover با توکن ساختگی →', err2);

// ذخیره‌ی توکن ساختگی → سپس آپلود باید خطای «ارسال به تلگرام ناموفق» بدهد
await pa.click('#tgForm button[type="submit"]');
await pa.waitForTimeout(1500);
const up = await pa.evaluate(async () => {
  // تسک موقت + آپلود فایل کوچک — با تلگرامِ خراب باید خطای تلگرام بیاید
  const res = await fetch('/api/admin/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('classhub_admin_token') }, body: JSON.stringify({ kind: 'quiz', title: 'تست تلگرام (خودکار)', dueAt: '2026-11-26T04:30:00Z', priority: 'low' }) }).then((r) => r.json());
  const fd = new FormData();
  fd.append('parentType', 'task'); fd.append('parentId', String(res.id));
  fd.append('file', new File([new Uint8Array([104, 105])], 'hi.txt', { type: 'text/plain' }));
  const r = await fetch('/api/admin/attachments', { method: 'POST', headers: { Authorization: 'Bearer ' + localStorage.getItem('classhub_admin_token') }, body: fd });
  return { status: r.status, body: (await r.json()).error, taskId: res.id };
});
console.log('   آپلود با تلگرام خراب →', JSON.stringify(up.body), '(باید خطای تلگرام باشد)');

// پاک‌سازی: حذف تسک + خالی‌کردن توکن/chat
await pa.evaluate(async (tid) => {
  await fetch(`/api/admin/tasks/${tid}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + localStorage.getItem('classhub_admin_token') } });
  await fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('classhub_admin_token') }, body: JSON.stringify({ tg_bot_token: '', tg_chat_id: '' }) });
}, up.taskId);
await pa.waitForTimeout(1200);
const cleared = await pa.evaluate(async () => (await fetch('/api/admin/telegram', { headers: { Authorization: 'Bearer ' + localStorage.getItem('classhub_admin_token') } }).then((r) => r.json())).configured);
console.log('   پاک‌سازی تلگرام →', cleared, '(باید false باشد)');

// بعد از پاک‌سازی: آپلود D1 دوباره کار می‌کند؟
const up2 = await pa.evaluate(async () => {
  const res = await fetch('/api/admin/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('classhub_admin_token') }, body: JSON.stringify({ kind: 'quiz', title: 'تست D1 (خودکار)', dueAt: '2026-11-27T04:30:00Z', priority: 'low' }) }).then((r) => r.json());
  const fd = new FormData();
  fd.append('parentType', 'task'); fd.append('parentId', String(res.id));
  fd.append('file', new File([new Uint8Array([104, 105])], 'hi.txt', { type: 'text/plain' }));
  const r = await fetch('/api/admin/attachments', { method: 'POST', headers: { Authorization: 'Bearer ' + localStorage.getItem('classhub_admin_token') }, body: fd });
  const j = await r.json();
  // دانلودش هم تست کن
  const d = await fetch(`/api/attachments/${j.id}`);
  const txt = await d.text();
  return { storage: j.storage, size: j.size, download: `${d.status}:${txt}`, taskId: res.id, attId: j.id };
});
console.log('   آپلود بدون تلگرام →', JSON.stringify(up2), '(باید storage=db و download=200:hi باشد)');

// پاک‌سازی نهایی
await pa.evaluate(async (t) => {
  await fetch(`/api/admin/tasks/${t.taskId}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + localStorage.getItem('classhub_admin_token') } });
}, up2);
await pa.evaluate(async () => {
  // اطمینان: هیچ کلید tg باقی نماند
  await fetch('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('classhub_admin_token') }, body: JSON.stringify({ tg_bot_token: '', tg_chat_id: '' }) });
});
console.log('   پاک‌سازی نهایی انجام شد');

// موبایل ۳۷۵px: ناوبری
const mob = await b.newPage({ viewport: { width: 375, height: 740 } });
await mob.goto(API + '/?navm=' + Math.random(), { waitUntil: 'networkidle' });
await mob.waitForTimeout(1800);
const mobNav = await mob.evaluate(() => ({
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  prevVisible: !!document.getElementById('dayPrev')?.offsetParent,
  goLabel: document.getElementById('todayBtn')?.textContent,
}));
console.log('موبایل ناوبری:', JSON.stringify(mobNav));
await mob.close();
await ctx.close(); await b.close();
