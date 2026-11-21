// اگر parity=main است و دوشنبه زنگ۴ دفاعی است → سایت درست کار می‌کند!
// «main» یعنی درس اصلی = دفاعی. اسکریپت قبلی ok1 را غلط چک کرده بود.
import { chromium } from 'playwright';
const b = await chromium.launch();

const readSubjects = async (url) => {
  const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const out = {};
    for (const c of document.querySelectorAll('.lesson-card')) {
      const d = c.closest('.day-col')?.dataset.day;
      const p = c.querySelector('.lesson-card__period')?.textContent;
      if (d === '1' || d === '3') out[`d${d}-p${p}`] = c.querySelector('.lesson-card__subject')?.textContent;
    }
    return out;
  });
  await page.close();
  return r;
};

const before = await readSubjects('https://school.gigaspaceturnip.workers.dev/?v1=' + Math.random());
console.log('وضعیت main (مبنا=امروز):', JSON.stringify(before));
// انتظار: d1-p۴ = دفاعی (اصلی)، d3-p۴ = زبان انگلیسی (اصلی) — این یعنی درست!
const mainOk = before['d1-p۴'] === 'دفاعی' && before['d3-p۴'] === 'زبان انگلیسی';
console.log('main درست؟', mainOk, '(d1-p۴ =', before['d1-p۴'], '| d3-p۴ =', before['d3-p۴'] + ')');
await b.close();
