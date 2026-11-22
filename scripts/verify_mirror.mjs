// راستی‌آزمایی آینه‌ی ادمین: کارت تلگرام + فراخوانی API زنده از دامنه‌ی آینه
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const TOKEN = readFileSync('/tmp/tok2', 'utf8').trim();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const pa = await ctx.newPage();
pa.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 200)));
pa.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 150)); });
await pa.addInitScript((t) => {
  localStorage.setItem('classhub_admin_token', t);
  localStorage.setItem('classhub_live_origin', 'https://school.gigaspaceturnip.workers.dev');
}, TOKEN);
await pa.goto('https://gigashalgham.github.io/classhub/admin/?m=' + Math.random(), { waitUntil: 'networkidle' });
await pa.waitForTimeout(3000);

const login = await pa.evaluate(() => ({
  loggedIn: !document.getElementById('loginCard')?.offsetParent,
  brand: document.querySelector('.admin-brand__title, .brand__title, h1')?.textContent?.slice(0, 40),
}));
console.log('آینه ادمین — ورود:', JSON.stringify(login));

await pa.click('button[data-tab="settings"]');
await pa.waitForTimeout(1500);
const tg = await pa.evaluate(() => ({
  cardVisible: !!document.getElementById('tgForm')?.offsetParent,
  status: document.getElementById('tgStatus')?.textContent,
  limitNote: document.getElementById('hwLimitNote')?.textContent,
  buttons: ['tgDiscover', 'tgTest', 'tgDisable'].map((id) => !!document.getElementById(id)),
}));
console.log('کارت تلگرام در آینه:', JSON.stringify(tg, null, 1));

// رفت‌وبرگشت واقعی به API زنده از دامنه‌ی آینه: discover بدون توکن → خطای فارسی
await pa.click('#tgDiscover');
await pa.waitForTimeout(2500);
const toasts = await pa.evaluate(() => {
  const el = document.querySelector('#toasts, .toast, [class*="toast"]');
  return el ? el.textContent.trim().slice(0, 160) : '(toast پیدا نشد)';
});
console.log('discover بدون توکن (از آینه به API زنده):', toasts);

// تنظیمات ظاهر سایت هم از آینه بخواند (فرم پر شود)
const settingsForm = await pa.evaluate(() => ({
  className: document.getElementById('setClassName')?.value,
  note: document.getElementById('setNote')?.value,
}));
console.log('فرم تنظیمات (از API زنده):', JSON.stringify(settingsForm));

await ctx.close(); await b.close();
