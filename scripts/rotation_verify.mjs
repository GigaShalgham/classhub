// راستی‌آزمایی گردشی: سایت دانش‌آموز باید فقط درس واقعی هفته را نشان دهد
import { chromium } from 'playwright';
const b = await chromium.launch();

const readCards = async (url) => {
  const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.lesson-card')];
    const out = {};
    for (const c of cards) {
      const day = c.closest('.day-col')?.dataset.day;
      const period = c.querySelector('.lesson-card__period')?.textContent;
      const subj = c.querySelector('.lesson-card__subject')?.textContent;
      if (day === '1' || day === '3') out[`d${day}-p${period}`] = subj;
    }
    // مودال: باز کردن کارت دوشنبه زنگ ۴
    return { subjects: out, rotatingBlockInModal: null, title: document.title };
  });
  // مودال یک کارت گردشی را باز کن و متن بلوک‌ها را بگیر
  const cardBtn = await page.$('.day-col[data-day="1"] .lesson-card');
  if (cardBtn) {
    await cardBtn.click();
    await page.waitForTimeout(900);
    r.modal = await page.evaluate(() => ({
      title: document.getElementById('detailTitle')?.textContent,
      blocks: [...document.querySelectorAll('#detailBody .detail-block__title')].map((x) => x.textContent),
      hero: document.querySelector('#detailBody .detail-hero__subject')?.textContent,
    }));
    await page.keyboard.press('Escape');
  }
  await page.close();
  return r;
};

// ۱) وضعیت فعلی (مبنا = امروز → درس اصلی)
const before = await readCards('https://school.gigaspaceturnip.workers.dev/?rv=' + Math.random());
console.log('قبل از فلیپ:', JSON.stringify(before.subjects));
console.log('مودال:', JSON.stringify(before.modal));

// ۲) فلیپ از طریق API با توکن نشستِ ذخیره‌شده (localStorage مرورگر ادمین)
const API = 'https://school.gigaspaceturnip.workers.dev';
// نشست تست موقت: توکن تصادفی که هش SHA-256 آن قبلاً در جدول sessions درج شده
// (ساخته‌شده با wrangler از خارج؛ آخر کار پاک می‌شود)
const token = process.env.TEST_SESSION_TOKEN;
if (!token) { console.log('TEST_SESSION_TOKEN تنظیم نشده'); process.exit(1); }
const auth = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
const flip = await fetch(API + '/api/admin/rotation', {
  method: 'PUT', headers: auth,
  body: JSON.stringify({ mode: 'flip' }),
}).then((r) => r.json());
console.log('flip →', JSON.stringify(flip));

const after = await readCards(API + '/?rv=' + Math.random());
console.log('بعد از فلیپ:', JSON.stringify(after.subjects));
console.log('مودال بعد:', JSON.stringify(after.modal));

// ۳) فلیپ برگشتی — وضعیت اولیه برقرار بماند
const flip2 = await fetch(API + '/api/admin/rotation', {
  method: 'PUT', headers: auth,
  body: JSON.stringify({ mode: 'flip' }),
}).then((r) => r.json());
console.log('flip back →', JSON.stringify(flip2));
const restored = await readCards(API + '/?rv=' + Math.random());
console.log('بعد از فلیپ برگشتی:', JSON.stringify(restored.subjects));

// ۴) set با تاریخ غیرشنبه → نرمال‌سازی
const setRes = await fetch(API + '/api/admin/rotation', {
  method: 'PUT', headers: auth,
  body: JSON.stringify({ mode: 'set', anchor: '2026-11-25' }), // چهارشنبه → شنبه‌ی 21
}).then((r) => r.json());
console.log('set(2026-11-25) →', JSON.stringify(setRes), '(باید 2026-11-21 شود)');

// چک نهایی: equal؟
const ok1 = before.subjects['d1-p4'] === 'دفاعی' && before.subjects['d3-p4'] === 'زبان انگلیسی';
const ok2 = after.subjects['d1-p4'] === 'هندسه' && after.subjects['d3-p4'] === 'فیزیک';
const ok3 = restored.subjects['d1-p4'] === before.subjects['d1-p4'] && restored.subjects['d3-p4'] === before.subjects['d3-p4'];
const ok4 = setRes.anchor === '2026-11-21';
const modalOk = before.modal && !before.modal.blocks.some((t) => t.includes('گردشی')) && before.modal.hero === before.subjects['d1-p4'];
console.log('نتیجه: main=' + ok1 + ' alt=' + ok2 + ' restored=' + ok3 + ' setNormal=' + ok4 + ' modalClean=' + modalOk);
// پاکسازی: نشست تست حذف شود
await fetch(API + '/api/admin/auth/logout', { method: 'POST', headers: auth }).catch(() => {});
await b.close();
