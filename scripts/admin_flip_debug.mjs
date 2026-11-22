// چرا بعد از فلیپ در UI، سایت هنوز main است؟ مراحل را دنبال کن
import { chromium } from 'playwright';
const API = 'https://school.gigaspaceturnip.workers.dev';
const TOKEN = process.env.TEST_SESSION_TOKEN;
const b = await chromium.launch();
const ctx = await b.newContext();
const page = await ctx.newPage();
await page.addInitScript((t) => localStorage.setItem('classhub_admin_token', t), TOKEN);
await page.goto(API + '/admin/?fd=' + Math.random(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
// درخواست‌های شبکه را ببین
page.on('response', (r) => { if (r.url().includes('rotation')) console.log('NET:', r.status(), r.url()); });
await page.click('button[data-tab="settings"]');
await page.waitForTimeout(500);
console.log('قبل:', await page.evaluate(() => [...document.querySelectorAll('#rotationList .cal-day-lesson__time')].map((x) => x.textContent)));
const resp = await page.evaluate(async () => {
  const r = await fetch('/api/admin/rotation', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('classhub_admin_token') },
    body: JSON.stringify({ mode: 'flip' }),
  });
  return { status: r.status, body: await r.json() };
});
console.log('flip response:', JSON.stringify(resp));
// حالا تنظیمات سرور
const s = await page.evaluate(() => fetch('/api/settings').then((r) => r.json()));
console.log('settings بعد از فلیپ:', s.settings.rotation_anchor);
// فلیپ برگشتی
await page.evaluate(() => fetch('/api/admin/rotation', {
  method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('classhub_admin_token') },
  body: JSON.stringify({ mode: 'flip' }),
}));
console.log('settings بعد از برگشت:', (await page.evaluate(() => fetch('/api/settings').then((r) => r.json()))).settings.rotation_anchor);
await ctx.close(); await b.close();
