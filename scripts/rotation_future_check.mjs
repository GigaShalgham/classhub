// ظرافت: کارت یکشنبه/چهارشنبه این هفته باید درسِ همین هفته را نشان دهدند حتی بعد از فلیپ
import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('https://school.gigaspaceturnip.workers.dev/?fc=' + Math.random(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const r = await page.evaluate(() => {
  const out = [];
  for (const col of document.querySelectorAll('.day-col')) {
    const d = col.dataset.day;
    const date = col.dataset.date;
    const subjects = [...col.querySelectorAll('.lesson-card__subject')].map((s) => s.textContent);
    out.push({ d, date, subjects: subjects.join('،') });
  }
  return { days: out, today: new Date().toISOString().slice(0, 10) };
});
console.log('امروز:', r.today);
for (const d of r.days) console.log(`روز ${d.d} (${d.date}): ${d.subjects}`);
// همه‌ی روزهای این هفته باید دفاعی/زبان انگلیسی باشند (main) و هفته‌ی بعد نداریم چون پنجره ۷ روزه است
await b.close();
