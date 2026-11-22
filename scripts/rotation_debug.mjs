// دیباگ: resolveSubject با داده‌ی واقعی و تاریخ امروز — چرا پاریتی 'main' اعمال نمی‌شود؟
import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('https://school.gigaspaceturnip.workers.dev/?dbg=' + Math.random(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const r = await page.evaluate(async () => {
  const data = await fetch('/api/bootstrap').then((r) => r.json());
  const u = await import('/js/utils.js');
  // بازسازی همان کاری که app.js می‌کند
  const anchor = data.settings.rotation_anchor;
  const today = Date.now();
  const sat = u.saturdayDayNumOf(today);
  const iso = u.isoDayNum(anchor);
  const parity = u.weekParity(today, anchor);
  // درس دوشنبه زنگ ۴ از داده
  const d1p4 = (data.days[1] || []).find((l) => l.period === 4);
  return {
    anchor, satToday: sat, isoAnchor: iso, parity,
    lesson: { subj: d1p4?.subject_name, alt: d1p4?.alt_subject_name },
    settingsKeys: Object.keys(data.settings),
  };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
