// پیدا کردن عناصری که ... شده‌اند (scrollWidth > clientWidth با ellipsis)
import { chromium } from 'playwright';
const b = await chromium.launch();
for (const W of [1280, 1366, 1440, 1600, 1920]) {
  const page = await b.newPage({ viewport: { width: W, height: 800 } });
  await page.goto('https://school.gigaspaceturnip.workers.dev/?ep=' + Math.random(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1300);
  const r = await page.evaluate(() => {
    const clipped = [];
    for (const el of document.querySelectorAll('.lesson-card *, .day-col *')) {
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 1 && cs.textOverflow === 'ellipsis') {
        clipped.push({
          cls: el.className.toString().slice(0, 36),
          text: el.textContent.trim().slice(0, 30),
          sw: el.scrollWidth, cw: el.clientWidth,
        });
      }
    }
    // گروه‌بندی بر اساس کلاس+متن
    const uniq = {};
    for (const c of clipped) uniq[c.cls + '|' + c.text] = c;
    return Object.values(uniq);
  });
  console.log('w=' + W + ':', r.length ? JSON.stringify(r.slice(0, 6)) : 'بدون … ✓');
  await page.close();
}
await b.close();
