// راستی‌آزمایی نهایی: نام جدید + متن‌های کامل + ارتفاع کارت‌ها
import { chromium } from 'playwright';
const b = await chromium.launch();
for (const W of [1280, 1366, 1600]) {
  const page = await b.newPage({ viewport: { width: W, height: 800 } });
  await page.goto('https://school.gigaspaceturnip.workers.dev/?fv=' + Math.random(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1300);
  const r = await page.evaluate(() => {
    const title = document.title;
    const brand = document.getElementById('brandName')?.textContent;
    const footer = document.getElementById('footerName')?.textContent;
    const cards = [...document.querySelectorAll('.lesson-card')];
    // هر زمان و عنوان تکلیف باید کامل باشد (scroll == client)
    let clippedTime = 0, clippedHw = 0, spill = 0;
    for (const c of cards) {
      const cr = c.getBoundingClientRect();
      for (const t of c.querySelectorAll('.lesson-card__time')) {
        const tr = t.getBoundingClientRect();
        if (t.scrollWidth > t.clientWidth + 1) clippedTime++;
        if (tr.right > cr.right + 1 || tr.left < cr.left - 1) spill++;
      }
      for (const h of c.querySelectorAll('.lesson-card__hw span')) {
        if (h.scrollWidth > h.clientWidth + 1 && h.scrollHeight <= h.clientHeight + 1 && h.clientHeight < 30) {
          // تک‌خطی مانده در حالی که متن جا نشده = قیچی بدون خط دوم
          if (getComputedStyle(h).webkitLineClamp === '2' && h.scrollHeight > h.clientHeight) clippedHw++;
        }
      }
    }
    const hs = cards.map((c) => Math.round(c.getBoundingClientRect().height));
    return { title, brand, footer, cards: cards.length, clippedTime, clippedHw, spill, minH: Math.min(...hs), maxH: Math.max(...hs) };
  });
  console.log('w=' + W, JSON.stringify(r, null, 0));
  await page.close();
}
await b.close();
