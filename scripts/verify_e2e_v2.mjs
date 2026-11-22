// تست کامل مرورگری: پنل دانش‌آموز (دانلود) + پنل ادمین (بدون لینک، سقف ۲۰MB)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const TOKEN = readFileSync('/tmp/tok3', 'utf8').trim();
const b = await chromium.launch();

// ---------- ۱) دانش‌آموز — سایت زنده ----------
const ps = await b.newContext({ viewport: { width: 375, height: 740 } });
const p = await ps.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 150)));
await p.goto('https://school.gigaspaceturnip.workers.dev/', { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForSelector('.day-col', { timeout: 20000 });
// درس جغرافی (lesson 12، تکلیف ۹) — دکمه‌ی درس را پیدا کن
const lessonBtn = p.locator('.lesson-card, .day-col [class*=lesson]', { hasText: 'جغرافی' }).first();
if (await lessonBtn.count()) {
  await lessonBtn.click();
} else {
  // از تقویم شمسی: پیمایش ستون‌ها برای پیدا کردن کارت تکلیف
  await p.locator('.day-col').filter({ hasText: 'جغرافی' }).first().locator('[class*=lesson]').first().click();
}
await p.waitForTimeout(2500);
const sheet = await p.evaluate(() => ({
  title: document.getElementById('detailTitle')?.textContent,
  hasAtt: !!document.querySelector('#detailSheet .attachment-item, #detailBody .attachment-item'),
  attName: document.querySelector('#detailSheet .attachment-item__name, #detailBody .attachment-item__name')?.textContent,
  attHref: document.querySelector('#detailSheet .attachment-item, #detailBody .attachment-item')?.getAttribute('href'),
  attSize: document.querySelector('#detailSheet .attachment-item__size, #detailBody .attachment-item__size')?.textContent,
}));
console.log('۱) شیت درس:', JSON.stringify(sheet, null, 1));

// کلیک روی پیوست → رویداد دانلود
const [download] = await Promise.all([
  p.waitForEvent('download', { timeout: 20000 }),
  p.locator('#detailSheet .attachment-item, #detailBody .attachment-item').first().click(),
]);
const path = '/tmp/dl_browser.pdf';
await download.saveAs(path);
const fs = await import('node:fs');
const same = fs.readFileSync('/tmp/test5mb.pdf').equals(fs.readFileSync(path));
console.log('۲) دانلود مرورگر:', { suggested: download.suggestedFilename(), bytes: fs.statSync(path).size, identical: same });
await ps.close();

// ---------- ۲) ادمین — فرم‌ها بدون ورودی لینک + سقف ۲۰MB ----------
const pa = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await pa.addInitScript((t) => localStorage.setItem('classhub_admin_token', t), TOKEN);
await pa.goto('https://school.gigaspaceturnip.workers.dev/admin/', { waitUntil: 'networkidle', timeout: 60000 });
await pa.waitForTimeout(3500);
const noLinks = await pa.evaluate(() => ({
  linkAddInputs: document.querySelectorAll('#hwLinkUrl, #taskLinkUrl, #annLinkUrl, .link-add input').length,
  hwLimitNote: document.getElementById('hwLimitNote')?.textContent,
  tgCard: !!document.getElementById('tgForm'),
}));
console.log('۳) ادمین (بوت):', JSON.stringify(noLinks));
// فرم تکلیف: باز کردن یک درس با تکلیف → بررسی نبودن لینک
await pa.click('button[data-tab="lessons"]');
await pa.waitForTimeout(1500);
await pa.locator('[id*=lesson] .admin-row, .admin-list .admin-row').filter({ hasText: 'جغرافی' }).first().locator('button, [class*=edit]').first().click().catch(() => {});
await pa.waitForTimeout(2000);
const hwForm = await pa.evaluate(() => ({
  hwLinkInputs: document.querySelectorAll('#hwLinkUrl, #hwLinkTitle, #hwLinkAdd').length,
  hwAddFile: !!document.getElementById('hwAddFile'),
  limitNote: document.getElementById('hwLimitNote')?.textContent,
  visible: !!document.getElementById('hwOverlay')?.offsetParent,
}));
console.log('۴) فرم تکلیف:', JSON.stringify(hwForm));
await b.close();
