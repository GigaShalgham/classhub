// lines را درست حساب کن: بررسی بصری ارتفاع خط اول/دوم
import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1366, height: 800 } });
await page.goto('https://school.gigaspaceturnip.workers.dev/?ln=' + Math.random(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1300);
const r = await page.evaluate(() => {
  const h = [...document.querySelectorAll('.lesson-card__hw span')].find((x) => x.textContent.includes('بوم کار'));
  if (!h) return null;
  const cs = getComputedStyle(h);
  const rect = h.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(h);
  const lineCount = Math.round(range.getClientRects().length ? rect.height / (parseFloat(cs.lineHeight) || 18) : 0);
  return {
    text: h.textContent.trim(),
    h: Math.round(rect.height),
    lineH: cs.lineHeight,
    approxLines: +(rect.height / parseFloat(cs.lineHeight)).toFixed(1),
    fullTextVisible: h.textContent.trim().length > 0 && !h.textContent.includes('…'),
  };
});
console.log(JSON.stringify(r, null, 1));
// اسکرین‌شات همان کارت برای بررسی چشمی
const card = await page.evaluateHandle(() => [...document.querySelectorAll('.lesson-card')].find((c) => c.textContent.includes('بوم کار')));
await card.asElement().screenshot({ path: '/tmp/render/hw-card-1366.png' });
await b.close();
