// نمایش پیوست لینکی در مودالِ مهلت برای دانش‌آموز + پاک‌سازی
import { chromium } from 'playwright';
const API = 'https://school.gigaspaceturnip.workers.dev';
const TOKEN = (await import('node:fs')).readFileSync('/tmp/tok', 'utf8').trim();
const b = await chromium.launch();

// ساخت مهلت تستی با لینک
const ctx = await b.newContext();
const pa = await ctx.newPage();
await pa.addInitScript((t) => localStorage.setItem('classhub_admin_token', t), TOKEN);
await pa.goto(API + '/admin/', { waitUntil: 'domcontentloaded' });
await pa.waitForTimeout(2500);
const made = await pa.evaluate(async () => {
  const res = await fetch('/api/admin/tasks', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('classhub_admin_token') },
    body: JSON.stringify({ kind: 'research', title: 'تست نمایش لینک (خودکار)', subjectId: null, description: '', dueAt: '2026-11-25T04:30:00Z', priority: 'low' }),
  }).then((r) => r.json());
  await fetch('/api/admin/attachments/link', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('classhub_admin_token') },
    body: JSON.stringify({ parentType: 'task', parentId: res.id, url: 'https://drive.google.com/drive/folders/TESTF', title: 'پوشه جزوه‌های درایو' }),
  });
  return res.id;
});
console.log('مهلت تستی id:', made);
await ctx.close();

// سایت دانش‌آموز: مودال مهلت
const ps = await b.newPage({ viewport: { width: 1440, height: 900 } });
await ps.goto(API + '/?sl=' + Math.random(), { waitUntil: 'networkidle' });
await ps.waitForTimeout(1800);
// روی آیتم مهلت کلیک کن — کلاس‌ها را ببین
const clicked = await ps.evaluate(() => {
  const items = [...document.querySelectorAll('.task-item, .deadline-item, [class*="task"] button, [class*="deadline"]')];
  return items.length;
});
// مستقیم API مودال را شبیه‌سازی کن: detail endpoint دارد attachments
const det = await ps.evaluate(async (tid) => (await fetch(`/api/tasks/${tid}`).then((r) => r.json())).task.attachments, made);
console.log('پیوست API:', JSON.stringify(det));
// مودال را با کلیک روی آیتم باز کن (اولین مهلتِ فعال همان تست است چون مهلت‌ها بر اساس due_at مرتب می‌شوند؟)
const ok = await ps.evaluate(() => {
  const btn = document.querySelector('#tasksList button, .task-row button, .card button');
  return !!btn;
});
console.log('آیتم مهلتی در UI:', ok);
await b.close();
