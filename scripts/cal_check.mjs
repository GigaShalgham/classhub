// بررسی زنده‌ی تقویم ادمین: تعداد سلول‌های آبان، ۳۰ آبان، و رفتن به آذر
import { chromium } from 'playwright';
const TOKEN = (await import('node:fs')).readFileSync('/tmp/tok', 'utf8').trim();
const b = await chromium.launch();
const ctx = await b.newContext();
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('ERR:', m.text().slice(0, 120)); });
await page.addInitScript((t) => localStorage.setItem('classhub_admin_token', t), TOKEN);
await page.goto('https://school.gigaspaceturnip.workers.dev/admin/?cc=' + Math.random(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const read = () => page.evaluate(() => {
  const cells = [...document.querySelectorAll('#calGrid .cal-cell:not(.cal-cell--pad)')];
  return {
    title: document.getElementById('calTitle')?.textContent,
    cellCount: cells.length,
    nums: cells.map((c) => c.querySelector('.cal-cell__num')?.textContent),
    padCount: document.querySelectorAll('#calGrid .cal-cell--pad').length,
    taskItems: document.querySelectorAll('#calMonthTasks .admin-row').length,
  };
});
console.log('ماه جاری:', JSON.stringify(await read(), null, 1));

// برو به تب تقویم
await page.click('button[data-tab="calendar"]');
await page.waitForTimeout(500);
console.log('تب تقویم فعال شد');
// ماه قبل (باید آبان ۱۴۰۵ = ۳۰ روز)
await page.click('#calPrev');
await page.waitForTimeout(400);
const aban = await read();
console.log('آبان:', JSON.stringify({title: aban.title, cellCount: aban.cellCount, last3: aban.nums.slice(-3), padCount: aban.padCount}));
// ماه بعدِ بعد — دی (۳۰)
await page.click('#calNext'); await page.waitForTimeout(300);
await page.click('#calNext'); await page.waitForTimeout(300);
const dey = await read();
console.log('دی:', JSON.stringify({title: dey.title, cellCount: dey.cellCount, last2: dey.nums.slice(-2)}));
// اسفند ۱۴۰۵ (کبیسه؟ باقیمانده 1405%33=8 → 29 روز طبق فرمول)
await page.click('#calNext'); await page.waitForTimeout(300);
await page.click('#calNext'); await page.waitForTimeout(300);
const esf = await read();
console.log('اسفند:', JSON.stringify({title: esf.title, cellCount: esf.cellCount, last2: esf.nums.slice(-2)}));
// یک روز آبان را باز کن — openCalDay
await page.click('#calToday'); await page.waitForTimeout(300);
await page.click('#calPrev'); await page.waitForTimeout(300);
const cell30 = page.locator('#calGrid .cal-cell:not(.cal-cell--pad)').nth(29);
await cell30.click();
await page.waitForTimeout(800);
const dayDetail = await page.evaluate(() => ({
  title: document.getElementById('dayTitle')?.textContent,
  dateShown: document.getElementById('dayDate')?.textContent,
  lessons: document.querySelectorAll('#dayLessons .cal-day-lesson').length,
}));
console.log('جزئیات ۳۰ آبان:', JSON.stringify(dayDetail));
await ctx.close(); await b.close();
