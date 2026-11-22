// راستی‌آزمایی زنده‌ی ۴ درخواست: ۱) تمرکز فردا ۲) تاریخ تهران‌محور ۳) پیکر شمسی ۴) پیوست لینک
import { chromium } from 'playwright';
const API = 'https://school.gigaspaceturnip.workers.dev';
const TOKEN = (await import('node:fs')).readFileSync('/tmp/tok', 'utf8').trim();
const b = await chromium.launch();

// ---------- ۱+۲) سایت دانش‌آموز در حالت عصر + مرورگر با منطقه‌ی زمانی UTC+14 ----------
const exotic = await b.newContext({ timezoneId: 'Pacific/Kiritimati' }); // UTC+14: تاریخ محلی = فردا!
const p1 = await exotic.newPage();
await p1.goto(API + '/?v4=' + Math.random(), { waitUntil: 'networkidle' });
await p1.waitForTimeout(1800);
const student = await p1.evaluate(() => {
  const cols = [...document.querySelectorAll('.day-col')].slice(0, 2).map((c) => ({
    d: c.dataset.day, date: c.dataset.date, head: c.querySelector('.day-col__date')?.textContent,
    today: c.classList.contains('day-col--today'), todayTag: !!c.querySelector('.day-col__today-tag'),
  }));
  return {
    brandDate: document.getElementById('brandDate')?.textContent,
    heroStats: document.getElementById('heroStats')?.textContent,
    cols,
  };
});
console.log('۱) هدر (مرورگر UTC+14!):', student.brandDate, '— باید «یکشنبه ۱ آذر» باشد نه ۲ آذر');
console.log('   هیرو:', student.heroStats);
console.log('   ستون‌ها:', JSON.stringify(student.cols));
await exotic.close();

// همان صفحه با تایم‌زون عادی — سازگاری
const p2 = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p2.goto(API + '/?v4b=' + Math.random(), { waitUntil: 'networkidle' });
await p2.waitForTimeout(1500);
const s2 = await p2.evaluate(() => ({
  brandDate: document.getElementById('brandDate')?.textContent,
  firstCol: document.querySelector('.day-col .day-col__date')?.textContent,
  heroStats: document.getElementById('heroStats')?.textContent,
}));
console.log('   (مرورگر UTC):', s2.brandDate, '|', s2.firstCol, '|', s2.heroStats);

// ---------- ۳+۴) پنل ادمین ----------
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const pa = await ctx.newPage();
pa.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERR:', m.text().slice(0, 150)); });
await pa.addInitScript((t) => localStorage.setItem('classhub_admin_token', t), TOKEN);
await pa.goto(API + '/admin/?v4=' + Math.random(), { waitUntil: 'networkidle' });
await pa.waitForTimeout(2500);

// ۳) پیکر شمسی فرم مهلت (در تب مهلت‌ها)
await pa.click('button[data-tab="tasks"]');
await pa.waitForTimeout(600);
const picker = await pa.evaluate(() => ({
  taskDueFieldShown: document.querySelector('#taskDueField .jdate-field__input')?.value,
  taskTime: document.querySelector('#taskDueField .jdate-field__time')?.value,
  hasCalBtn: !!document.querySelector('#taskDueField .jdate-field__row button[aria-label="انتخاب تاریخ"]'),
}));
console.log('۳) فیلد مهلت شمسی:', JSON.stringify(picker), '— باید فردا ۱۴۰۵/۰۹/۰۲ ساعت ۰۸:۰۰ باشد');

// پاپ‌آور تقویم را باز کن و روزی انتخاب کن
await pa.click('#taskDueField button[aria-label="انتخاب تاریخ"]');
await pa.waitForTimeout(500);
const popInfo = await pa.evaluate(() => {
  const pop = document.querySelector('#taskDueField .jdate-pop');
  return {
    visible: pop && !pop.hidden,
    title: pop?.querySelector('.jdate-pop__title')?.textContent,
    dayCount: pop ? pop.querySelectorAll('.jdate-pop__day').length : 0,
    hasToday: !!pop?.querySelector('.jdate-pop__day--today'),
  };
});
console.log('   پاپ‌آور:', JSON.stringify(popInfo));
// روز ۱۵ را انتخاب کن
const dayBtn = pa.locator('#taskDueField .jdate-pop__day', { hasText: '۱۵' }).first();
await dayBtn.click();
await pa.waitForTimeout(300);
console.log('   بعد از انتخاب روز ۱۵:', await pa.evaluate(() => document.querySelector('#taskDueField .jdate-field__input')?.value));

// ۴) پیوست لینکی روی تکلیفِ اولین درس دوشنبه
// یک مهلت آزمایشی با لینک بساز
const testLink = 'https://drive.google.com/file/d/TEST123/view?usp=sharing';
await pa.fill('#taskTitle', 'تستِ لینک (خودکار)');
await pa.fill('#taskLinkUrl', testLink);
await pa.fill('#taskLinkTitle', 'جزوه تستی درایو');
await pa.click('#taskLinkAdd');
await pa.waitForTimeout(300);
const chip = await pa.evaluate(() => document.querySelector('#taskLinkChips .file-chip')?.textContent);
console.log('۴) چیپ لینک:', chip);
await pa.click('#taskSubmit');
await pa.waitForTimeout(2000);

// لینک در لیست مهلت‌ها → سرور چک
const check = await pa.evaluate(async () => {
  const tasks = await fetch('/api/tasks').then((r) => r.json());
  const t = tasks.active.find((x) => x.title === 'تستِ لینک (خودکار)');
  return t ? { id: t.id, att: t.attachment_count } : null;
});
console.log('   مهلت ساخته شد:', JSON.stringify(check), '(attachment_count باید ۱ باشد)');

// دانلود: ریدایرکت 302
if (check) {
  const resp = await pa.evaluate(async (tid) => {
    const r = await fetch(`/api/tasks/${tid}`);
    const d = await r.json();
    const a = d.task?.attachments?.[0];
    return { url: a?.url, filename: a?.filename };
  }, check.id);
  console.log('   پیوست از API:', JSON.stringify(resp));
  if (resp?.url) {
    const atts = await pa.evaluate(async (tid) => {
      const d = await fetch(`/api/tasks/${tid}`).then((r) => r.json());
      return d.task.attachments;
    }, check.id);
    const r = await ctx.request.get(`${API}/api/attachments/${atts[0].id}`, { maxRedirects: 0 });
    console.log('   /api/attachments/:id →', r.status(), r.headers().location?.slice(0, 60));
  }
}

// حذف: پاک‌سازی آزمایش
if (check) {
  await pa.evaluate(async (tid) => {
    const d = await fetch(`/api/tasks/${tid}`).then((r) => r.json());
    for (const a of d.task.attachments || []) {
      await fetch(`/api/admin/attachments/${a.id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + localStorage.getItem('classhub_admin_token') } });
    }
  }, check.id);
  // حذف خود مهلت با دکمه در UI یا API
  await pa.evaluate(async (tid) => {
    await fetch(`/api/admin/tasks/${tid}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + localStorage.getItem('classhub_admin_token') } });
  }, check.id);
  const after = await pa.evaluate(async () => (await fetch('/api/tasks').then((r) => r.json())).active.some((x) => x.title === 'تستِ لینک (خودکار)'));
  console.log('   پاک‌سازی شد؟', !after);
}

// موبایل: ردیف لینک و پاپ‌آور شمسی در ۳۷۵px
const mob = await b.newPage({ viewport: { width: 375, height: 740 } });
await mob.addInitScript((t) => localStorage.setItem('classhub_admin_token', t), TOKEN);
await mob.goto(API + '/admin/?m=' + Math.random(), { waitUntil: 'networkidle' });
await mob.waitForTimeout(2000);
const mobCheck = await mob.evaluate(() => {
  const row = document.querySelector('#taskLinkUrl');
  const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
  return { linkRowVisible: !!row, horizontalOverflow: overflow };
});
console.log('موبایل ۳۷۵px:', JSON.stringify(mobCheck));

await ctx.close(); await b.close();
