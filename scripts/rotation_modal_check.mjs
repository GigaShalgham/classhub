// مودال جزئیات: باز کردن کارت گردشی یکشنبه — باید درس واقعی همین هفته + بدون بلوک «زنگ گردشی»
import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('https://school.gigaspaceturnip.workers.dev/?mc=' + Math.random(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
// کارت زنگ ۴ یکشنبه (دفاعی — گردشی)
const cards = await page.$$('.day-col[data-day="1"] .lesson-card');
await cards[3].click(); // زنگ ۴
await page.waitForTimeout(1200);
const modal = await page.evaluate(() => ({
  title: document.getElementById('detailTitle')?.textContent,
  hero: document.querySelector('#detailBody .detail-hero__subject')?.textContent,
  blocks: [...document.querySelectorAll('#detailBody .detail-block__title')].map((x) => x.textContent),
  hasRotateBlock: [...document.querySelectorAll('#detailBody .detail-block__title')].some((x) => x.textContent.includes('گردشی')),
}));
console.log('مودال زنگ ۴ یکشنبه:', JSON.stringify(modal, null, 1));
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
// کارت غیرگردشی برای مقایسه: زنگ ۱ یکشنبه (ادبیات)
const cards2 = await page.$$('.day-col[data-day="1"] .lesson-card');
await cards2[0].click();
await page.waitForTimeout(1200);
const modal2 = await page.evaluate(() => ({
  hero: document.querySelector('#detailBody .detail-hero__subject')?.textContent,
}));
console.log('مودال زنگ ۱ (غیرگردشی):', JSON.stringify(modal2));
await b.close();
