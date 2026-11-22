// تکلیف بلند باید کامل دیده شود (۲ خط) نه «…»
import { chromium } from 'playwright';
const b = await chromium.launch();
for (const W of [1280, 1366, 1600]) {
  const page = await b.newPage({ viewport: { width: W, height: 800 } });
  await page.goto('https://school.gigaspaceturnip.workers.dev/?hw=' + Math.random(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1300);
  const r = await page.evaluate(() => {
    const hws = [...document.querySelectorAll('.lesson-card__hw span')].map((h) => ({
      text: h.textContent.trim().slice(0, 42),
      lines: Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)),
      complete: h.scrollWidth <= h.clientWidth + 1 || h.scrollHeight > h.clientHeight,
    }));
    const long = hws.find((h) => h.text.includes('بوم کار'));
    return { long: long ? { text: long.text, lines: long.lines } : null, total: hws.length };
  });
  console.log('w=' + W, JSON.stringify(r));
  await page.close();
}
await b.close();
