// تست واقعی انبار تلگرام: آپلود → چت خصوصی → file_id → دانلود استریم
import { readFileSync } from 'node:fs';
const TOK = readFileSync('/tmp/tok2', 'utf8').trim();
const API = 'https://school.gigaspaceturnip.workers.dev';

// ۱) وضعیت
const st = await fetch(`${API}/api/admin/telegram`, { headers: { Authorization: `Bearer ${TOK}` } }).then((r) => r.json());
console.log('۱) وضعیت:', JSON.stringify(st));

// ۲) تسک موقت + آپلود فایل واقعی (فایل باید به چت تلگرام برود)
const task = await fetch(`${API}/api/admin/tasks`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOK}` },
  body: JSON.stringify({ kind: 'quiz', title: 'تست انبار تلگرام (خودکار — حذف می‌شود)', dueAt: '2026-11-29T04:30:00Z', priority: 'low' }),
}).then((r) => r.json());

const content = 'سلام از انبار تلگرام! این فایل تست خودکار است.';
const fd = new FormData();
fd.append('parentType', 'task'); fd.append('parentId', String(task.id));
fd.append('file', new File([content], 'تست-انبار-تلگرام.txt', { type: 'text/plain' }));
const up = await fetch(`${API}/api/admin/attachments`, { method: 'POST', headers: { Authorization: `Bearer ${TOK}` }, body: fd }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
console.log('۲) آپلود:', up.status, JSON.stringify({ storage: up.storage, filename: up.filename, size: up.size }));

// ۳) دانلود از سرور (استریم از تلگرام) — اسم فارسی هم باید درست باشد
const dl = await fetch(`${API}/api/attachments/${up.id}`);
const txt = await dl.text();
const cd = dl.headers.get('content-disposition');
console.log('۳) دانلود:', dl.status, '| محتوا درست:', txt === content, '| نوع:', dl.headers.get('content-type'), '| نام فارسی:', decodeURIComponent((cd || '').match(/filename\*=UTF-8''([^;]+)/)?.[1] || '??'));

// ۴) حذف تسک (پیوست هم کشcade حذف می‌شود؛ فایل در چت شما می‌ماند)
const del = await fetch(`${API}/api/admin/tasks/${task.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${TOK}` } }).then((r) => r.status);
console.log('۴) پاک‌سازی تسک:', del, '(فایل تست در چت تلگرام شما می‌ماند — می‌توانید دستی پاکش کنید)');
