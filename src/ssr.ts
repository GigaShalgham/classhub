// کلاس‌هاب — رندر سمت سرور (SSR)
// هدف: «همان HTML» که app.js می‌سازد، در خود پاسخ اولیه تولید شود.
// روی اینترنت اختلال‌دار، اگر فقط HTML برسد (بدون CSS/JS) برنامه کامل و خوانا دیده می‌شود.
// وقتی app.js اجرا شود، دقیقاً همین ساختار را دوباره می‌سازد (کلاس‌ها یکسان‌اند)
// پس جایگزینی بدون پرش/فلش انجام می‌شود.
// منطق این فایل باید با public/js/app.js و utils.js هم‌خوان بماند (resolveSubject،
// periodsPerDay، ایموجی درس‌ها، پنجره غلتان ۷ روزه).

import type { Env } from './index';
import type { Lesson, Task, Announcement } from './types';
import { bootstrapPayload } from './routes/public';

// ---------- ثابت‌های مشترک (آینه‌ی public/js) ----------

const WEEK_DAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];
const KIND_LABELS: Record<string, string> = {
  research: 'پژوهش', project: 'پروژه', presentation: 'ارائه',
  exam: 'آزمون', quiz: 'کوئیز', submission: 'تحویل',
};
const KIND_ICONS: Record<string, string> = {
  research: '🔬', project: '🧩', presentation: '🎤',
  exam: '📝', quiz: '❓', submission: '📥',
};
const SUBJECT_EMOJI: [string, string][] = [
  ['کارگاه', '🔧'], ['ریاضی', '📐'], ['هندسه', '📐'], ['فیزیک', '🧲'], ['شیمی', '⚗️'],
  ['زیست', '🌿'], ['ادبیات', '📖'], ['فارسی', '📖'], ['نگارش', '✍️'], ['انگلیسی', '🗣️'],
  ['عربی', '🕌'], ['تاریخ', '🏺'], ['جغرافیا', '🗺️'], ['دینی', '🕊️'], ['ورزش', '⚽'],
  ['هنر', '🎨'], ['دفاعی', '🛡️'], ['آزمایشگاه', '🧪'], ['نجوم', '🔭'], ['اقتصاد', '💰'],
  ['فلسفه', '🤔'], ['روان', '🧠'], ['کامپیوتر', '💻'], ['برنامه', '💻'],
];
// مبنا: شنبه ۱۴۰۵/۰۹/۰۱ — با app.js یکی باشد
const ROTATION_EPOCH_MS = Date.UTC(2026, 10, 21);

/** تبدیل تاریخ میلادی به جلالی (الگوریتم استاندارد jalaali-js) */
function toJalali(gy: number, gm: number, gd: number): { jy: number; jm: number; jd: number } {
  const gDaysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let jy = gy <= 1600 ? 0 : 979;
  const gy2 = gy <= 1600 ? gy - 621 : gy - 1600;
  const gy3 = gm > 2 ? gy : gy - 1;
  let days =
    365 * gy2 +
    Math.floor((gy3 + 3) / 4) -
    Math.floor((gy3 + 99) / 100) +
    Math.floor((gy3 + 399) / 400) - 80;
  for (let i = 0; i < gm - 1; i++) days += gDaysInMonth[i];
  if (gm > 2 && ((gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0)) days += 1;
  days += gd;
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

function faDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

function faTime(hhmm: string | null): string {
  return hhmm ? faDigits(hhmm) : '—';
}

function formatJalaliNoYear(ms: number): string {
  // وقت محلی مرورگر کاربر مهم نیست؛ نمایش سرور با نونِ تهران UTC+3:30
  const t = new Date(ms + 3.5 * 3600_000);
  const { jm, jd } = toJalali(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  return `${faDigits(jd)} ${JALALI_MONTHS[jm - 1]}`;
}

function formatJalaliDateTimeTehran(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const t = new Date(d.getTime() + 3.5 * 3600_000);
  const { jy, jm, jd } = toJalali(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  const hh = String(t.getUTCHours()).padStart(2, '0');
  const mm = String(t.getUTCMinutes()).padStart(2, '0');
  return `${faDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${faDigits(jy)}، ساعت ${faDigits(hh + ':' + mm)}`;
}

function countdown(iso: string | null): { text: string; state: string } {
  if (!iso) return { text: '—', state: 'none' };
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diff = target - now;
  if (diff < 0) return { text: 'مهلت گذشته', state: 'passed' };
  const tehranDay = (ms: number) => Math.floor((ms + 3.5 * 3600_000) / 86_400_000);
  const daysAhead = tehranDay(target) - tehranDay(now);
  if (daysAhead === 0) return { text: 'امروز!', state: 'today' };
  if (daysAhead === 1) return { text: 'فردا', state: 'tomorrow' };
  const hours = diff / 3600_000;
  if (hours < 1) return { text: `${faDigits(Math.max(1, Math.round(hours * 60)))} دقیقه مانده`, state: 'soon' };
  return { text: `${faDigits(daysAhead)} روز مانده`, state: 'future' };
}

function subjectEmoji(name: string | null): string {
  if (!name) return '📚';
  for (const [key, emoji] of SUBJECT_EMOJI) {
    if (name.includes(key)) return emoji;
  }
  return '📚';
}

/** درس مؤثر یک زنگ (زنگ گردشی) — با app.js یکی باشد */
function resolveSubject(lesson: Lesson, dateMs: number): { name: string; colorKey: string } {
  if (!lesson.alt_subject_id || !lesson.alt_subject_name) {
    return { name: lesson.subject_name, colorKey: lesson.color_key };
  }
  const week = Math.floor((dateMs - ROTATION_EPOCH_MS) / (7 * 86_400_000));
  const useAlt = week % 2 === 1;
  return {
    name: (useAlt ? lesson.alt_subject_name : lesson.subject_name) as string,
    colorKey: ((useAlt ? lesson.alt_color_key : lesson.color_key) || 'lavender') as string,
  };
}

function periodsPerDay(day: number): number {
  if (day === 2) return 3;  // دوشنبه
  if (day === 5 || day === 6) return 0; // پنجشنبه و جمعه
  return 4;
}

/** پنجره غلتان n روزه از امروزِ تهران (نونِ تهران، محکم در برابر منطقه‌زمانی) */
function rollingWindow(n: number, now = Date.now()): { date: Date; dayIdx: number }[] {
  const t = new Date(now + 3.5 * 3600_000); // به وقت تهران
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  const d = t.getUTCDate();
  const out: { date: Date; dayIdx: number }[] = [];
  for (let i = 0; i < n; i++) {
    const date = new Date(Date.UTC(y, m, d + i, 8, 30, 0)); // 12:00 تهران همان روز
    const dayIdx = (date.getUTCDay() + 1) % 7; // شنبه=0 … جمعه=6
    out.push({ date, dayIdx });
  }
  return out;
}

// ---------- escape و ساخت DOM ----------

function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------- رندر اجزا (آینه‌ی app.js) ----------

function lessonCard(lesson: Lesson, dateMs: number): string {
  const subj = resolveSubject(lesson, dateMs);
  const hw = lesson.homework;
  const aria = esc(`${subj.name}، زنگ ${faDigits(lesson.period)}، ${faTime(lesson.start_time)} تا ${faTime(lesson.end_time)}${hw ? `، تکلیف: ${hw.title}` : ''}`);
  let out = `<button class="lesson-card sub-${esc(subj.colorKey)}" type="button" aria-label="${aria}">`;
  out += `<div class="lesson-card__top">`
    + `<span class="lesson-card__period" aria-hidden="true">${faDigits(lesson.period)}</span>`
    + `<span class="lesson-card__emoji" aria-hidden="true">${subjectEmoji(subj.name)}</span>`
    + `<span class="lesson-card__subject">${esc(subj.name)}</span>`
    + `<span class="lesson-card__time">${faTime(lesson.start_time)}–${faTime(lesson.end_time)}</span>`
    + `</div>`;
  if (hw) {
    const cd = hw.due_at ? countdown(hw.due_at) : null;
    out += `<div class="lesson-card__hw"><span>📝 ${esc(hw.title)}</span>`;
    if (cd && cd.state !== 'passed') {
      out += `<span class="lesson-card__time" style="flex-shrink:0;font-weight:700;color:var(--cream-deep);">${esc(cd.text)}</span>`;
    }
    out += `</div>`;
    if (cd && (cd.state === 'today' || cd.state === 'soon')) {
      out += `<span class="lesson-card__badge">${cd.state === 'today' ? 'امروز!' : 'نزدیک!'}</span>`;
    }
  } else {
    out += `<div class="lesson-card__hw lesson-card__hw--none">تکلیفی ثبت نشده</div>`;
  }
  if (lesson.attachment_count > 0) {
    out += `<span class="attach-chip" style="margin-top:6px;align-self:flex-start;">📎 ${faDigits(lesson.attachment_count)}</span>`;
  }
  return out + `</button>`;
}

function renderTimetable(days: (Lesson[] | null)[]): string {
  const now = Date.now();
  const todayKey = new Date(now + 3.5 * 3600_000).toDateString();
  const win = rollingWindow(7, now);
  let cols = '';
  for (const { date, dayIdx } of win) {
    const dateMs = date.getTime();
    const isToday = new Date(dateMs + 3.5 * 3600_000).toDateString() === todayKey;
    const lessons = days[dayIdx] || [];
    const maxP = periodsPerDay(dayIdx) || 12;
    let inner = `<div class="day-col__head">`
      + `<span class="day-col__name">${WEEK_DAY_NAMES[dayIdx]}</span>`
      + (isToday ? `<span class="day-col__today-tag">امروز</span>` : '')
      + `<span class="day-col__date">${formatJalaliNoYear(dateMs)}</span>`
      + `</div>`;
    if (!lessons.length || periodsPerDay(dayIdx) === 0) {
      const off = dayIdx === 5 || dayIdx === 6;
      inner += `<div class="day-empty"><span class="face">${off ? '🛌' : '☁️'}</span><div>${off ? 'تعطیل آخر هفته' : 'کلاسی نیست؛ نفس بکش!'}</div></div>`;
    } else {
      for (const lesson of lessons.filter((l) => l.period <= maxP)) {
        inner += lessonCard(lesson, dateMs);
      }
    }
    cols += `<div class="day-col${isToday ? ' day-col--today' : ''}" data-day="${dayIdx}" data-date="${date.toISOString().slice(0, 10)}" aria-label="روز ${WEEK_DAY_NAMES[dayIdx]}">${inner}</div>`;
  }
  // نقطه‌های راهنما
  let dots = '';
  for (const { date, dayIdx } of win) {
    const isToday = new Date(date.getTime() + 3.5 * 3600_000).toDateString() === todayKey;
    dots += `<button class="tt-dot${isToday ? ' tt-dot--today' : ''}" type="button" data-day="${dayIdx}" data-date="${date.toISOString().slice(0, 10)}" aria-label="${WEEK_DAY_NAMES[dayIdx]}"></button>`;
  }
  return `<div class="tt-scroll" id="ttScroll" tabindex="0" role="region" aria-label="جدول هفتگی — برای مرور روزها به چپ و راست بکشید"><div class="tt-grid" id="ttGrid">${cols}</div></div>${dots ? `<div class="tt-dots" id="ttDots" role="tablist" aria-label="پیمایش روزها">${dots}</div>` : ''}`;
}

function taskCard(task: Task): string {
  const cd = countdown(task.due_at);
  let out = `<button class="task-card${task.priority === 'high' ? ' task-card--high' : ''}" type="button">`;
  out += `<div class="task-card__kind"><span>${KIND_ICONS[task.kind] || '📌'}</span><span>${esc(KIND_LABELS[task.kind] || task.kind)}</span>`;
  if (task.subject_name) out += `<span style="color:var(--sub);font-weight:500;">· ${esc(task.subject_name)}</span>`;
  out += `</div><h3 class="task-card__title">${esc(task.title)}</h3>`;
  if (task.description) {
    out += `<p class="task-card__subject" style="margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(task.description)}</p>`;
  }
  out += `<div class="task-card__footer">`
    + `<span class="countdown-chip cd-${cd.state}">⏰ ${esc(cd.text)}</span>`
    + `<span class="task-card__due">${formatJalaliDateTimeTehran(task.due_at)}</span>`;
  if (task.priority === 'high') out += `<span class="priority-dot priority-high"></span>`;
  if (task.attachment_count > 0) out += `<span class="attach-chip">📎 ${faDigits(task.attachment_count)}</span>`;
  return out + `</div></button>`;
}

function renderTasks(tasks: { active: Task[]; expired: Task[] }): { grid: string; expired: string } {
  let grid: string;
  if (!tasks.active.length) {
    grid = `<div class="empty-state" style="grid-column: 1 / -1;"><span class="face">🌈</span><div>فعلاً هیچ مهلت فوری وجود ندارد؛ خیالتان راحت!</div></div>`;
  } else {
    grid = tasks.active.map(taskCard).join('');
  }
  const expired = tasks.expired
    .map((t) => taskCard(t).replace('class="task-card', 'style="opacity:0.62;filter:saturate(0.6);" class="task-card'))
    .join('');
  return { grid, expired };
}

function annCard(ann: Announcement): string {
  let out = `<button class="ann-card${ann.pinned ? ' ann-card--pinned' : ''}" type="button">`;
  out += `<div class="ann-card__head">`;
  if (ann.pinned) out += `<span class="ann-card__pin">📌 سنجاق‌شده</span>`;
  out += `<h3 class="ann-card__title">${esc(ann.title)}</h3>`;
  if (ann.attachment_count > 0) out += `<span class="attach-chip">📎 ${faDigits(ann.attachment_count)}</span>`;
  out += `</div><p class="ann-card__body">${esc(ann.body)}</p><span class="ann-card__date">${formatJalaliDateTimeTehran(ann.published_at)}</span></button>`;
  return out;
}

/**
 * HTML نهایی صفحه اصلی: قالب index.html + محتوای رندرشده سمت سرور.
 * مارک‌های <!--TT--> و … در قالب با خروجی SSR جایگزین می‌شوند.
 */
export async function renderSSRIndex(env: Env): Promise<string | null> {
  const assetRes = await env.ASSETS.fetch(new Request('https://local/index.html'));
  if (!assetRes.ok) return null;
  let html = await assetRes.text();

  let boot: Awaited<ReturnType<typeof bootstrapPayload>>;
  try {
    boot = await bootstrapPayload(env.DB);
  } catch {
    return null; // دیتابیس جواب نداد — صفحه خام (app.js خودش fetch می‌کند)
  }

  const tt = renderTimetable(boot.days);
  const { grid, expired } = renderTasks(boot.tasks);
  const annList = boot.announcements.length
    ? boot.announcements.map(annCard).join('')
    : `<div class="empty-state"><span class="face">🕊️</span><div>هنوز اطلاعیه‌ای منتشر نشده است.</div></div>`;

  const className = boot.settings.class_name || 'کلاس‌هاب';
  const welcome = boot.settings.welcome_message || 'امروز هم روز خوبی داشته باشیم!';

  html = html
    .replace('<!--__BOOT__-->', `<script id="__BOOT__" type="application/json">${jsonSafe(boot)}</script>`)
    .replace(/<!--TT-->[\s\S]*?<!--\/TT-->/, tt)
    .replace(/<!--TASKS-->[\s\S]*?<!--\/TASKS-->/, grid)
    .replace(/<!--ANN-->[\s\S]*?<!--\/ANN-->/, annList);

  html = html
    .replace('id="brandName">کلاس‌هاب<', `id="brandName">${esc(className)}<`)
    .replace('id="welcomeBubble">امروز هم روز خوبی داشته باشیم!<', `id="welcomeBubble">${esc(welcome)}<`)
    .replace('id="footerNote"', `id="footerNote"`) // متن پیش‌فرض می‌ماند؛ app.js تنظیمات را اعمال می‌کند
    .replace('<div id="footerName">کلاس‌هاب</div>', `<div id="footerName">${esc(className)}</div>`);

  return html;
}

/** escape کردن </script> داخل JSON */
function jsonSafe(obj: unknown): string {
  return JSON.stringify(obj).replace(/<\/script/g, '<\\/script');
}
