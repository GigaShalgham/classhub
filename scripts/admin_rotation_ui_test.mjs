// تست UI کامل: لاگین با نشست موقت → کارت زنگ‌های گردشی → فلیپ → سایت دانش‌آموز → فلیپ برگشتی
import { chromium } from 'playwright';
const API = 'https://school.gigaspaceturnip.workers.dev';
const TOKEN = process.env.TEST_SESSION_TOKEN;

const readSubjects = async (b) => {
  const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(API + '/?uit=' + Math.random(), { waitUntil: 'networkidle' });
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

const b = await chromium.launch();
const before = await readSubjects(b);
console.log('۱) دانش‌آموز (main):', before['d1-p۴'], '/', before['d3-p۴']);

// پنل ادمین با توکن در localStorage
const ctx = await b.newContext();
const page = await ctx.newPage();
await page.addInitScript((t) => localStorage.setItem('classhub_admin_token', t), TOKEN);
await page.goto(API + '/admin/?uit=' + Math.random(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// برو به تب تنظیمات
await page.click('button[data-tab="settings"]');
await page.waitForTimeout(600);
const card = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#rotationList .cal-day-lesson')].map((r) => r.textContent.trim());
  const btn = !!document.getElementById('rotationFlip');
  return { rows, btn };
});
console.log('۲) کارت گردشی:', JSON.stringify(card.rows), '| دکمه:', card.btn);

// فلیپ!
await page.click('#rotationFlip');
await page.waitForTimeout(2000);
const afterFlip = await page.evaluate(() =>
  [...document.querySelectorAll('#rotationList .cal-day-lesson__time')].map((r) => r.textContent.trim()));
console.log('۳) بعد از فلیپ (ادمین):', JSON.stringify(afterFlip));
const anchorFromServer = await page.evaluate(() => fetch('/api/settings').then((r) => r.json()).then((d) => d.settings.rotation_anchor));
console.log('   anchor روی سرور:', anchorFromServer);

// سایت دانش‌آموز باید درس دوم را نشان دهد
const after = await readSubjects(b);
console.log('۴) دانش‌آموز (alt):', after['d1-p۴'], '/', after['d3-p۴']);

// فلیپ برگشتی
await page.click('#rotationFlip');
await page.waitForTimeout(2000);
console.log('   anchor بعد از برگشت:', await page.evaluate(() => fetch('/api/settings').then((r) => r.json()).then((d) => d.settings.rotation_anchor)));
const restored = await readSubjects(b);
console.log('۵) دانش‌آموز (برگشت):', restored['d1-p۴'], '/', restored['d3-p۴']);

const ok = card.rows.length === 2 && card.btn
  && before['d1-p۴'] === 'دفاعی' && after['d1-p۴'] === 'هندسه'
  && before['d3-p۴'] === 'زبان انگلیسی' && after['d3-p۴'] === 'فیزیک'
  && restored['d1-p۴'] === 'دفاعی' && restored['d3-p۴'] === 'زبان انگلیسی';
console.log('نتیجه نهایی UI:', ok ? '✓ همه چیز درست' : '✗ خطا');
await ctx.close();
await b.close();
process.exit(ok ? 0 : 1);
