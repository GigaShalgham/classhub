// درس من — اپلیکیشن دانش‌آموزی (نسخه ۳)
import {
  faDigits, formatJalali, formatJalaliDateTime, faTime, countdown,
  WEEK_DAY_NAMES, iranDayIndex, KIND_LABELS, KIND_ICONS, PRIORITY_LABELS,
  tehranHHMM, rollingWindow, weekParity, tehranDayIndex, tehranDayNumber, tehranLocalDate,
} from './utils.js';
import { periodsPerDay, periodTimes, setBells, getBells } from './schedule.js';

const $ = (sel) => document.querySelector(sel);

// ایموجی اختصاصی هر درس (با نام درس تطبیق می‌شود)
const SUBJECT_EMOJI = [
  ['کارگاه', '🔧'], ['ریاضی', '📐'], ['هندسه', '📐'], ['فیزیک', '🧲'], ['شیمی', '⚗️'],
  ['زیست', '🌿'], ['ادبیات', '📖'], ['فارسی', '📖'], ['نگارش', '✍️'], ['انگلیسی', '🗣️'],
  ['عربی', '🕌'], ['تاریخ', '🏺'], ['جغرافیا', '🗺️'], ['دینی', '🕊️'], ['ورزش', '⚽'],
  ['هنر', '🎨'], ['دفاعی', '🛡️'], ['آزمایشگاه', '🧪'], ['نجوم', '🔭'], ['اقتصاد', '💰'],
  ['فلسفه', '🤔'], ['روان', '🧠'], ['کامپیوتر', '💻'], ['برنامه', '💻'],
];
function subjectEmoji(name) {
  if (!name) return '📚';
  for (const [key, emoji] of SUBJECT_EMOJI) {
    if (name.includes(key)) return emoji;
  }
  return '📚';
}

/**
 * درس مؤثرِ یک زنگ در تاریخ مشخص.
 * زنگ‌های گردشی (alt_subject_id) هفته‌به‌هفته بین درس اصلی و درس دوم می‌چرخند.
 * مبنای چرخش (rotation_anchor) از تنظیمات سرور می‌آید: شنبه‌ی هفته‌ای که درسِ اصلی بوده.
 * مدیر می‌تواند مبنای هفته را از پنل جابه‌جا کند تا برنامه با واقعیت مدرسه بخواند.
 */
function resolveSubject(lesson, dateMs) {
  if (!lesson.alt_subject_id || !lesson.alt_subject_name) {
    return {
      subject_name: lesson.subject_name,
      color_key: lesson.color_key,
      rotating: false,
    };
  }
  const useAlt = weekParity(dateMs, state.settings.rotation_anchor) === 'alt';
  return {
    subject_name: useAlt ? lesson.alt_subject_name : lesson.subject_name,
    color_key: useAlt ? lesson.alt_color_key : lesson.color_key,
    rotating: true,
  };
}

const state = {
  days: [],
  subjects: [],
  tasks: { active: [], expired: [] },
  announcements: [],
  settings: {},
};

// ---------- API (مقاوم به شبکه ضعیف و فیلترینگ) ----------
// هر درخواست: مهلت زمانی + تلاش مجدد خودکار — روی شبکه‌ای که پکت می‌اندازد،
// یک fetch ساده ممکن است تا ابد معطل بماند و صفحه «نصفه» بماند.
// استراتژی: مبدأها را با پنجره‌ی کوتاه پشت‌سرهم امتحان می‌کنیم (مسیر بسته
// سریع کنار می‌رود)، بعد اگر همه فقط کند بودند، یک دور با مهلت بلند.
const RETRY_BACKOFF_MS = [800, 1_600, 3_200];

// زنجیره‌ی مبداهای جایگزین برای وقتی فیلترینگ ISP مسیر اصلی را می‌بندد:
// ۱) همین مبدأ (نرمال) ۲) دو دامنه‌ی دیگر کلادفلر روی ۴۴۳
// ۳) پورت جایگزین TLS (فیلترینگ پورت-محور را دور می‌زند) ۴) HTTP ساده (بدون SNI).
// فقط برای خواندن داده‌ها؛ نوشتن/ادمین همیشه روی مبدأ خود سایت انجام می‌شود.
const API_ORIGINS = (() => {
  const self = ''; // مبدأ جاری
  const alts = [
    'https://school.gigaspaceturnip.workers.dev',
    'https://www.the-big-school.de5.net',
  ].filter((o) => o !== location.origin);
  // پورت جایگزین و http فقط وقتی معنا دارد که خودم روی کلادفلر باشم
  if (location.protocol === 'https:') {
    alts.push(`${location.origin}:8443`);
    alts.push(location.origin.replace('https://', 'http://'));
  }
  return [self, ...alts];
})();

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchOnce(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// مبدأِ زنده برای دانلود پیوست‌های آینه (github.io خودش /api ندارد).
// اول از حافظه‌ی قبلی، وگرنه از اولین فراخوانی موفق api() به‌روز می‌شود.
const LIVE_ORIGIN_KEY = 'classhub_dl_origin';
(function seedLiveOrigin() {
  if (!window.__IS_MIRROR__) return;
  if (window.__LIVE_ORIGIN__) return; // مقدار تزریق‌شده‌ی ناشر آینه معتبر است
  let saved = '';
  try { saved = localStorage.getItem(LIVE_ORIGIN_KEY) || ''; } catch { /* private mode */ }
  const fallback = API_ORIGINS.find((o) => o) || '';
  window.__LIVE_ORIGIN__ = saved || fallback;
})();
function noteLiveOrigin(origin) {
  if (!window.__IS_MIRROR__ || !origin) return;
  if (window.__LIVE_ORIGIN__ === origin) return;
  window.__LIVE_ORIGIN__ = origin;
  try { localStorage.setItem(LIVE_ORIGIN_KEY, origin); } catch { /* private mode */ }
  // پیوست‌های رندرشده با مبدأ قدیمی را با مبدأ درست دوباره بکشیم
  document.querySelectorAll(`a.attachment-item[href^="/api/attachments/"]`).forEach((a) => {
    a.setAttribute('href', origin + a.getAttribute('href'));
  });
}

async function api(path) {
  let lastErr;
  // برای هر مبدأ: یک مهلت کوتاه «کشف» (۱۰ثانیه) — اگر مبدأ فقط کند است، مهلت‌های
  // بلندتر بعد از یک پاسخ موفق فعال می‌شوند؛ اگر مبدأ بسته است، سریع مبدأ بعدی می‌رویم.
  for (const origin of API_ORIGINS) {
    let deadline = Date.now() + 10_000; // پنجره‌ی کل برای یک مبدأ
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      try {
        const res = await fetchOnce(origin + path, remaining);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        noteLiveOrigin(origin);
        return await res.json();
      } catch (err) {
        lastErr = err;
        // فقط خطای شبکه/مهلت را دوباره امتحان می‌کنیم، نه پاسخ‌های معتبر سرور را
        const retryable = err.name === 'AbortError' || err.name === 'TypeError';
        if (!retryable) break;               // خطای HTTP واقعی: مبدأ بعدی
        await sleep(RETRY_BACKOFF_MS[attempt] ?? 3_200);
      }
    }
  }
  // دور دوم: شاید همه‌ی مسیرها فقط «کند» بودند نه بسته — با مهلت بلند، دوباره
  for (const origin of API_ORIGINS) {
    try {
      const res = await fetchOnce(origin + path, 35_000);
      if (res.ok) return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// ---------- ابزار DOM ----------
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(child);
  }
  return node;
}

function toast(msg, type = 'info') {
  const t = el('div', { class: `toast toast--${type}`, text: msg });
  $('#toastRegion').append(t);
  setTimeout(() => {
    t.style.transition = 'opacity .4s, transform .4s';
    t.style.opacity = '0';
    t.style.transform = 'translateY(10px)';
    setTimeout(() => t.remove(), 400);
  }, 3200);
}

function formatSize(bytes) {
  if (bytes >= 1_048_576) return `${faDigits((bytes / 1_048_576).toFixed(1))} مگابایت`;
  if (bytes >= 1024) return `${faDigits(Math.round(bytes / 1024))} کیلوبایت`;
  return `${faDigits(bytes)} بایت`;
}

/** درس بعدیِ امروز را پیدا می‌کند (بر اساس ساعت فعلی تهران) */
function nextLessonToday() {
  const todayIdx = tehranDayIndex();
  const lessons = (state.days[todayIdx] || [])
    .filter((l) => l.period <= (periodsPerDay(todayIdx) || 12));
  if (!lessons.length) return null;
  const hhmm = tehranHHMM(Date.now());
  const resolved = lessons.map((l) => ({ lesson: l, subj: resolveSubject(l, Date.now()) }));
  const next = resolved.find((r) => r.lesson.start_time > hhmm);
  return next ? { ...next.lesson, subject_name: next.subj.subject_name } : null;
}

/**
 * روزِ تمرکز: امروز تا وقتی زنگی باقی مانده؛ بعد از آخرین زنگِ امروز
 * (یا روزهای بی‌کلاس مثل جمعه)، تمرکز می‌رود روی اولین روزِ درسیِ بعد.
 * دانش‌آموزِ عصرِ بعدازمدرسه دنبال «فردا» است، نه امروزِ گذشته.
 */
function focusDay() {
  const now = Date.now();
  const todayIdx = tehranDayIndex(now);
  const maxP = (d) => periodsPerDay(d) || 12;
  const lessonsOf = (d) => (state.days[d] || []).filter((l) => l.period <= maxP(d));
  const todayLessons = lessonsOf(todayIdx);
  if (todayLessons.length) {
    const hhmm = tehranHHMM(now);
    const lastEnd = todayLessons.reduce((mx, l) => (l.end_time > mx ? l.end_time : mx), '');
    if (hhmm < lastEnd) return { offset: 0, dayIdx: todayIdx, lessons: todayLessons };
  }
  for (let k = 1; k <= 6; k++) {
    const idx = (todayIdx + k) % 7;
    const ls = lessonsOf(idx);
    if (ls.length) return { offset: k, dayIdx: idx, lessons: ls };
  }
  return { offset: 0, dayIdx: todayIdx, lessons: todayLessons };
}

// ---------- هدر ----------
let clockTimer = null;

function renderHeader() {
  $('#brandDate').textContent = formatJalali(tehranLocalDate(), { withWeekday: true });
  const name = state.settings.class_name || 'درس من';
  $('#brandName').textContent = name;
  $('#footerName').textContent = name;
  document.title = `${name} | برنامه هفتگی کلاس`;
  const wm = state.settings.welcome_message;
  if (wm) $('#welcomeBubble').textContent = wm;
  const note = state.settings.admin_note;
  if (note) $('#footerNote').textContent = note;
  tickClock();
  if (!clockTimer) clockTimer = setInterval(tickClock, 30_000);
}

function tickClock() {
  $('#brandClock').textContent = faDigits(tehranHHMM(Date.now()));
}

// ---------- هیرو ----------
function renderHero() {
  const maxPeriods = (d) => periodsPerDay(d) || 12;
  const dayLessons = (d) => (state.days[d] ?? []).filter((l) => l.period <= maxPeriods(d));
  const focus = focusDay();

  // آمار روی پنجره غلتان (۷ روز از روزِ تمرکز)، نه هفته تقویمی
  const win = rollingWindow(7, Date.now() + focus.offset * 86_400_000);
  const seen = new Set();
  let totalLessons = 0;
  let totalHw = 0;
  for (const { dayIdx, date } of win) {
    if (seen.has(date.toDateString())) continue;
    seen.add(date.toDateString());
    totalLessons += dayLessons(dayIdx).length;
    totalHw += dayLessons(dayIdx).filter((l) => l.homework).length;
  }
  const stats = $('#heroStats');
  stats.textContent = '';

  // ترکیز روی روزِ به‌دست‌آمده: امروز (هنوز کلاس داریم)، فردا، یا روز درسی بعد
  const dayName = WEEK_DAY_NAMES[focus.dayIdx];
  const focusLabel = focus.offset === 0 ? `امروز (${dayName})` : focus.offset === 1 ? `فردا (${dayName})` : `${dayName} (${faDigits(focus.offset)} روز دیگر)`;
  stats.append(el('div', { class: 'stat-chip' },
    el('span', { text: focus.offset === 0 ? '🗓️' : '🌙' }),
    `${focusLabel}، `,
    el('b', { text: faDigits(focus.lessons.length) }),
    ' زنگ'));
  stats.append(el('div', { class: 'stat-chip' },
    el('span', { text: '📚' }),
    el('b', { text: faDigits(totalLessons) }),
    ' درس در ۷ روز آینده'));
  stats.append(el('div', { class: 'stat-chip' },
    el('span', { text: '📝' }),
    el('b', { text: faDigits(totalHw) }),
    ' تکلیف ثبت‌شده'));

  // درس بعدی: امروزِ در جریان؛ وگرنه اولین زنگِ روزِ تمرکز
  let next = nextLessonToday();
  let nextPrefix = 'درس بعدی';
  if (!next && focus.lessons.length) {
    const first = [...focus.lessons].sort((a, b) => a.period - b.period)[0];
    const subj = resolveSubject(first, Date.now() + focus.offset * 86_400_000);
    next = { ...first, subject_name: subj.subject_name };
    nextPrefix = focus.offset === 0 ? 'اولین زنگ' : 'اولین زنگ فردا';
  }
  if (next) {
    stats.append(el('div', { class: 'stat-chip' },
      el('span', { text: '⏰' }),
      `${nextPrefix}: `,
      el('b', { text: `${subjectEmoji(next.subject_name)} ${next.subject_name}` }),
      ` (${faTime(next.start_time)})`));
  }
}

// ---------- جدول هفتگی ----------
function lessonCard(lesson, dateMs) {
  const subj = resolveSubject(lesson, dateMs);
  const hw = lesson.homework;
  const card = el('button', {
    class: `lesson-card sub-${subj.color_key}`,
    type: 'button',
    onclick: () => openLesson(lesson.id, dateMs),
    'aria-label': `${subj.subject_name}، زنگ ${faDigits(lesson.period)}، ${faTime(lesson.start_time)} تا ${faTime(lesson.end_time)}${hw ? `، تکلیف: ${hw.title}` : ''}`,
  });

  const top = el('div', { class: 'lesson-card__top' },
    el('span', { class: 'lesson-card__period', text: faDigits(lesson.period), 'aria-hidden': 'true' }),
    el('span', { class: 'lesson-card__emoji', text: subjectEmoji(subj.subject_name), 'aria-hidden': 'true' }),
    el('span', { class: 'lesson-card__subject', text: subj.subject_name }),
    (() => {
      // ساعت از زنگِ پیکربندی‌شده می‌آید (منبع حقیقت)؛ فقط اگر نبود، از ردیف درس
      const bt = periodTimes(lesson.day, lesson.period) ?? [lesson.start_time, lesson.end_time];
      return el('span', { class: 'lesson-card__time', text: `${faTime(bt[0])}–${faTime(bt[1])}` });
    })(),
  );
  card.append(top);

  if (hw) {
    const hwLine = el('div', { class: 'lesson-card__hw' },
      el('span', { text: `📝 ${hw.title}` }),
    );
    card.append(hwLine);
  } else {
    card.append(el('div', { class: 'lesson-card__hw lesson-card__hw--none', text: 'تکلیفی ثبت نشده' }));
  }
  if (lesson.attachment_count > 0) {
    card.append(el('span', {
      class: 'attach-chip', text: `📎 ${faDigits(lesson.attachment_count)}`,
      style: 'margin-top:6px;align-self:flex-start;',
    }));
  }
  return card;
}

// پنجره نمایش: تعداد روزهای نشان‌داده‌شده (از روزِ تمرکز به بعد)
const WINDOW_DAYS = 7;
// جابه‌جایی دستی پنجره (گشت‌وگذار روزهای گذشته/آینده نسبت به روزِ تمرکز)
let ttOffset = 0;
const TT_OFFSET_MIN = -7;  // تا یک هفته گذشته
const TT_OFFSET_MAX = 14;  // تا دو هفته آینده

function renderTimetable() {
  const grid = $('#ttGrid');
  grid.textContent = '';
  // پنجره از روزِ تمرکز (+ جابه‌جاییِ دستی کاربر) شروع می‌شود:
  // عصرِ بعدازمدرسه اولین ستون «فردا» است؛ با «روز قبل» می‌توان به گذشته هم برگشت.
  const focus = focusDay();
  const windowDays = rollingWindow(WINDOW_DAYS, Date.now() + (focus.offset + ttOffset) * 86_400_000);
  const todayDayNum = tehranDayNumber();
  let anyLessons = false;
  updateDayNav(focus);

  for (const { date, dayIdx } of windowDays) {
    const dateMs = date.getTime();
    // مقایسه با شماره‌ی روزِ تهران — مستقل از منطقه‌ی زمانی مرورگر (VPN)
    const isToday = tehranDayNumber(dateMs) === todayDayNum;
    const lessons = state.days[dayIdx] || [];
    anyLessons = anyLessons || lessons.length > 0;
    const col = el('div', {
      class: `day-col${isToday ? ' day-col--today' : ''}`,
      'data-day': dayIdx,
      'data-date': date.toISOString().slice(0, 10),
      'aria-label': `روز ${WEEK_DAY_NAMES[dayIdx]}`,
    });
    const head = el('div', { class: 'day-col__head' },
      el('span', { class: 'day-col__name', text: WEEK_DAY_NAMES[dayIdx] }),
      isToday ? el('span', { class: 'day-col__today-tag', text: 'امروز' }) : null,
    );
    head.append(el('span', { class: 'day-col__date', text: formatJalali(date, { withYear: false }) }));
    col.append(head);

    if (!lessons.length || periodsPerDay(dayIdx) === 0) {
      const off = dayIdx === 5 || dayIdx === 6;
      col.append(el('div', { class: 'day-empty' },
        el('span', { class: 'face', text: off ? '🛌' : '☁️' }),
        el('div', { text: off ? 'تعطیل آخر هفته' : 'کلاسی نیست؛ نفس بکش!' }),
      ));
    } else {
      // فقط زنگ‌های مجاز روز (دوشنبه ۳ زنگ) — اضافه‌ها نادیده گرفته می‌شوند
      const maxP = periodsPerDay(dayIdx) || 12;
      for (const lesson of lessons.filter((l) => l.period <= maxP)) col.append(lessonCard(lesson, dateMs));
    }
    grid.append(col);
  }

  if (!anyLessons) {
    $('#heroSub').textContent = 'هنوز برنامه‌ای ثبت نشده است؛ به‌زودی توسط سرِ کلاس تکمیل می‌شود.';
  }
  $('#updatedAt').textContent = faDigits(tehranHHMM(Date.now()));
  renderDots(windowDays, todayDayNum);
  updateScrollState();
}

// ---------- نقطه‌های راهنما و فلش‌ها ----------
function renderDots(windowDays, todayDayNum) {
  const dots = $('#ttDots');
  dots.textContent = '';
  for (const { date, dayIdx } of windowDays) {
    // همان مقایسه‌ی تهران‌محور ستون‌ها (null = روز تمرکز فرداست و «امروز» نداریم)
    const isToday = todayDayNum !== null && tehranDayNumber(date.getTime()) === todayDayNum;
    dots.append(el('button', {
      class: `tt-dot${isToday ? ' tt-dot--today' : ''}`,
      type: 'button',
      'data-day': dayIdx,
      'data-date': date.toISOString().slice(0, 10),
      'aria-label': WEEK_DAY_NAMES[dayIdx],
      onclick: () => scrollToDay(dayIdx, date.toISOString().slice(0, 10)),
    }));
  }
  updateDots();
}

function updateDots() {
  const scroll = $('#ttScroll');
  const cols = [...document.querySelectorAll('.day-col')];
  if (!cols.length) return;
  const center = scroll.scrollLeft + scroll.clientWidth / 2;
  let closest = null;
  let closestDist = Infinity;
  for (const col of cols) {
    const c = col.offsetLeft + col.offsetWidth / 2;
    const dist = Math.abs(c - center);
    if (dist < closestDist) { closestDist = dist; closest = col; }
  }
  const closestDay = closest?.dataset.day ?? '0';
  const closestDate = closest?.dataset.date ?? '';
  for (const dot of document.querySelectorAll('.tt-dot')) {
    dot.classList.toggle('tt-dot--active', dot.dataset.day === closestDay && dot.dataset.date === closestDate);
  }
}

function updateScrollState() {
  const wrap = $('#ttWrap');
  const scroll = $('#ttScroll');
  const scrollable = scroll.scrollWidth > scroll.clientWidth + 4;
  wrap.classList.toggle('tt-wrap--scrollable', scrollable);
  // در RTL مقدار scrollLeft از 0 تا منفی می‌رود (استاندارد جدید مرورگرها)
  const pos = Math.abs(scroll.scrollLeft);
  const max = scroll.scrollWidth - scroll.clientWidth;
  const atStart = pos <= 4;
  const atEnd = pos >= max - 4;
  wrap.classList.toggle('tt-wrap--at-start', atStart);
  wrap.classList.toggle('tt-wrap--at-end', atEnd);
  $('#ttPrev').disabled = atStart;
  $('#ttNext').disabled = atEnd;
}

function scrollToDay(dayIdx, dateKey, smooth = true) {
  const scroll = $('#ttScroll');
  const sel = dateKey
    ? `.day-col[data-day="${dayIdx}"][data-date="${dateKey}"]`
    : `.day-col[data-day="${dayIdx}"]`;
  const col = document.querySelector(sel);
  if (!col || !scroll) return;
  // با getBoundingClientRect (قابل‌اعتماد در RTL): ستون باید به وسط دید بیاید.
  // در RTL مقادیر scrollLeft از 0 (راست) تا منفی (چپ) می‌رود.
  // delta = فاصله ستون از مرکز (مثبت: ستون سمت راست است)؛
  // اسکرول لازم همان delta است (اگر ستون راست‌تر است، به چپ یعنی منفی می‌رویم).
  const rect = col.getBoundingClientRect();
  const sRect = scroll.getBoundingClientRect();
  const delta = (rect.left + rect.width / 2) - (sRect.left + scroll.clientWidth / 2);
  scroll.scrollBy({ left: delta, behavior: smooth ? 'smooth' : 'auto' });
}

function scrollToToday(smooth = true) {
  // بازگشت به روزِ تمرکز (اولین ستون پنجره): صبح «امروز»، عصر «فردا»
  const scroll = $('#ttScroll');
  if (!scroll) return;
  const col = scroll.querySelector('.day-col');
  if (!col) return;
  const rect = col.getBoundingClientRect();
  const sRect = scroll.getBoundingClientRect();
  const delta = (rect.left + rect.width / 2) - (sRect.left + scroll.clientWidth / 2);
  scroll.scrollBy({ left: delta, behavior: smooth ? 'smooth' : 'auto' });
}

/** جابه‌جایی پنجره‌ی روزها (−۱ روز / +۱ روز) و رندر مجدد */
function shiftWindow(delta) {
  ttOffset = Math.max(TT_OFFSET_MIN, Math.min(TT_OFFSET_MAX, ttOffset + delta));
  renderTimetable();
  scrollToToday(false);
}

/** دکمه‌های ناوبری روز + برچسبِ دکمه‌ی «برو به …» بر اساس روز تمرکز */
function updateDayNav(focus) {
  const prev = $('#dayPrev');
  const next = $('#dayNext');
  if (prev) prev.disabled = ttOffset <= TT_OFFSET_MIN;
  if (next) next.disabled = ttOffset >= TT_OFFSET_MAX;
  // صبح (هنوز کلاس داریم) → «برو به امروز»؛ عصر/آخر هفته → «برو به فردا» یا روز بعد
  const goLabel = focus.offset === 0 ? 'برو به امروز' : focus.offset === 1 ? 'برو به فردا' : `برو به ${WEEK_DAY_NAMES[focus.dayIdx]}`;
  const todayBtn = $('#todayBtn');
  if (todayBtn) todayBtn.textContent = goLabel;
  const fabLabel = $('#fabTodayLabel');
  if (fabLabel) fabLabel.textContent = goLabel;
}

// ---------- پنل جزئیات ----------
let lastFocused = null;

function openOverlay(overlay) {
  lastFocused = document.activeElement;
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('overlay--open'));
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', overlayKeydown, true);
}

function closeOverlay(overlay) {
  overlay.classList.remove('overlay--open');
  document.body.style.overflow = '';
  document.removeEventListener('keydown', overlayKeydown, true);
  setTimeout(() => { overlay.hidden = true; }, 360);
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}

function overlayKeydown(e) {
  if (e.key === 'Escape') {
    closeOverlay($('#detailOverlay'));
  }
  if (e.key === 'Tab') {
    const overlay = $('#detailOverlay');
    const focusables = overlay.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

async function openLesson(id, dateMs = Date.now()) {
  const overlay = $('#detailOverlay');
  $('#detailBody').textContent = '';
  $('#detailTitle').textContent = 'جزئیات درس';
  openOverlay(overlay);
  $('#detailClose').focus();
  try {
    const data = await api(`/api/lessons/${id}`);
    renderLessonDetail(data.lesson, dateMs);
  } catch (err) {
    $('#detailBody').append(el('div', { class: 'error-state', text: `خطا در دریافت جزئیات: ${err.message}` }));
  }
}

function renderLessonDetail(lesson, dateMs) {
  const subj = resolveSubject(lesson, dateMs);
  $('#detailTitle').textContent = `${subjectEmoji(subj.subject_name)} ${subj.subject_name} — ${WEEK_DAY_NAMES[lesson.day]}`;
  const body = $('#detailBody');
  body.textContent = '';

  const wrap = el('div', { class: 'detail-lesson fade-up' });

  wrap.append(el('div', { class: `detail-hero sub-${subj.color_key}` },
    el('div', { class: 'detail-hero__period', text: `زنگ ${faDigits(lesson.period)}` }),
    el('div', {},
      el('h3', { class: 'detail-hero__subject', text: subj.subject_name }),
      el('div', { class: 'detail-hero__meta', text: `${WEEK_DAY_NAMES[lesson.day]} · ${faTime(lesson.start_time)} تا ${faTime(lesson.end_time)}` }),
    ),
  ));

  const hw = lesson.homework;
  if (!hw) {
    wrap.append(el('div', { class: 'detail-block' },
      el('p', { class: 'detail-block__title', text: '📝 تکلیف' }),
      el('p', { class: 'detail-block__text detail-block__text--muted', text: 'برای این درس تکلیفی ثبت نشده است. همین‌طور نفس بکش! 😌' }),
    ));
  } else {
    wrap.append(el('div', { class: 'detail-block' },
      el('p', { class: 'detail-block__title', text: '📝 تکلیف' }),
      el('p', { class: 'detail-block__text', text: hw.title }),
    ));
    if (hw.description) {
      wrap.append(el('div', { class: 'detail-block' },
        el('p', { class: 'detail-block__title', text: '📖 توضیحات کامل' }),
        el('p', { class: 'detail-block__text', text: hw.description }),
      ));
    }
    const dl = el('dl', { style: 'margin:0;' });
    if (hw.textbook_pages) {
      dl.append(el('div', { class: 'dl-row' }, el('dt', { text: 'صفحات کتاب' }), el('dd', { text: hw.textbook_pages })));
    }
    if (dl.children.length) wrap.append(el('div', { class: 'detail-block' }, dl));
    if (hw.instructions) {
      wrap.append(el('div', { class: 'detail-block' },
        el('p', { class: 'detail-block__title', text: '📋 دستورالعمل' }),
        el('p', { class: 'detail-block__text', text: hw.instructions }),
      ));
    }
    if (hw.notes) {
      wrap.append(el('div', { class: 'detail-block' },
        el('p', { class: 'detail-block__title', text: '💬 یادداشت سرِ کلاس' }),
        el('p', { class: 'detail-block__text', text: hw.notes }),
      ));
    }
    if (lesson.attachments && lesson.attachments.length) {
      wrap.append(el('div', { class: 'detail-block' },
        el('p', { class: 'detail-block__title', text: '📎 پیوست‌ها' }),
        attachmentList(lesson.attachments)));
    }
  }
  body.append(wrap);
}

/** آیتم دانلود فایل — مشترک بین پیوست تکلیف/مهلت/اطلاعیه و کارت جزوه */
function fileItemEl(a, origin) {
  return el('a', {
    class: 'attachment-item', href: `${origin}/api/attachments/${a.id}`, download: a.filename, // روی mirror از مبدأ اصلی
  },
  el('span', { class: 'attachment-item__icon', text: '📎' }),
  el('span', { class: 'attachment-item__name', text: a.filename }),
  el('span', { class: 'attachment-item__size', text: formatSize(a.size) }));
}

function attachmentList(files) {
  const list = el('div', { class: 'attachment-list' });
  // روی آینه‌ی استاتیک، دانلود پیوست فقط از مبدأ اصلی ممکن است
  const origin = window.__IS_MIRROR__ ? (window.__LIVE_ORIGIN__ || '') : '';
  for (const a of files) {
    // پیوست «لینک»: فایل روی سرویس بیرونی (مثل گوگل‌درایو) — مستقیم همان‌جا باز می‌شود
    if (a.url) {
      let host = '';
      try { host = new URL(a.url).hostname.replace(/^www\./, ''); } catch { /* لینک معیوب */ }
      list.append(el('a', {
        class: 'attachment-item attachment-item--link', href: a.url, target: '_blank', rel: 'noopener noreferrer',
      },
      el('span', { class: 'attachment-item__icon', text: '🔗' }),
      el('span', { class: 'attachment-item__name', text: a.filename }),
      el('span', { class: 'attachment-item__size', text: host || 'لینک' })));
      continue;
    }
    list.append(fileItemEl(a, origin));
  }
  return list;
}

// ---------- درگ بات‌شیت (موبایل) ----------
function setupSheetDrag() {
  const grip = $('#detailGrip');
  const sheet = $('#detailSheet');
  const overlay = $('#detailOverlay');
  let startY = 0;
  let dragging = false;
  let curY = 0;

  function onStart(e) {
    if (window.innerWidth > 768) return;
    dragging = true;
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    sheet.classList.add('sheet--dragging');
  }
  function onMove(e) {
    if (!dragging) return;
    curY = (e.touches ? e.touches[0].clientY : e.clientY) - startY;
    if (curY < 0) curY = 0;
    sheet.style.transform = `translateY(${curY}px)`;
    overlay.style.opacity = String(Math.max(0.25, 1 - curY / 400));
  }
  function onEnd() {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('sheet--dragging');
    sheet.style.transform = '';
    overlay.style.opacity = '';
    if (curY > 110) closeOverlay(overlay);
  }
  grip.addEventListener('touchstart', onStart, { passive: true });
  grip.addEventListener('touchmove', onMove, { passive: true });
  grip.addEventListener('touchend', onEnd);
  grip.addEventListener('mousedown', onStart);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onEnd);
}

// ---------- چکیده تکالیف (زیر تقویم هفتگی) ----------
/** برچسب نسبیِ مهلت: امروز / فردا / پس‌فردا / n روز مانده / تاریخ شمسی */
function dueLabelFa(dueAt) {
  const dueMs = new Date(dueAt).getTime();
  const diff = tehranDayNumber(dueMs) - tehranDayNumber(Date.now());
  if (diff === 0) return { text: 'امروز', cls: 'dl-today' };
  if (diff === 1) return { text: 'فردا', cls: 'dl-tomorrow' };
  if (diff === 2) return { text: 'پس‌فردا', cls: 'dl-tomorrow' };
  if (diff > 2 && diff <= 6) return { text: `${faDigits(diff)} روز مانده`, cls: 'dl-soon' };
  return { text: formatJalali(new Date(dueMs), { withYear: false }), cls: 'dl-later' };
}

function renderDigest() {
  const list = $('#digestList');
  if (!list) return;
  list.textContent = '';
  // مهلت‌های فعال از قبل بر اساس نزدیکی مرتب‌اند؛ فقط ۶ مورد نخست
  const items = (state.tasks?.active ?? []).slice(0, 6);
  if (!items.length) {
    list.append(el('div', { class: 'digest-empty', text: 'مهلت نزدیکی نداریم — نفس بکش! 🌿' }));
    return;
  }
  for (const task of items) {
    const label = dueLabelFa(task.due_at);
    const row = el('button', {
      class: `digest-row${task.priority === 'high' ? ' digest-row--high' : ''}`,
      type: 'button',
      onclick: () => openTask(task.id),
      title: task.title,
    });
    if (task.subject_name) {
      row.append(el('span', {
        class: 'digest-row__dot',
        style: `background: var(--${task.color_key ?? 'lavender'});`,
        'aria-hidden': 'true',
      }));
    }
    row.append(
      el('span', { class: 'digest-row__icon', text: KIND_ICONS[task.kind] || '📌', 'aria-hidden': 'true' }),
      el('span', { class: 'digest-row__title', text: `${task.subject_name ? task.subject_name + ' — ' : ''}${task.title}` }),
      el('span', { class: `digest-row__label ${label.cls}`, text: label.text }),
    );
    list.append(row);
  }
  if (state.tasks.active.length > 6) {
    list.append(el('button', {
      class: 'digest-more', type: 'button', text: `نمایش همه‌ی ${faDigits(state.tasks.active.length)} مهلت ←`,
      onclick: () => switchTab('tasks'),
    }));
  }
}

// ---------- نشان «دیده‌نشده» روی سربرگ تب‌ها ----------
const SEEN_KEY = 'classhub_seen_v1';

function getSeen() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY)); } catch { return null; }
}

function markTabSeen(tab, when = Date.now()) {
  const s = getSeen() ?? {};
  s[tab] = when;
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch { /* حالت خصوصی مرورگر */ }
}

/** چند موردِ تازه (آیتم‌هایی که بعد از آخرین بازدید تغییر کرده‌اند) برای هر تب */
function tabFreshCounts() {
  const seen = getSeen();
  if (!seen) return { schedule: 0, tasks: 0, handouts: 0, announcements: 0 };
  const counts = { schedule: 0, tasks: 0, handouts: 0, announcements: 0 };
  for (const lessons of state.days ?? []) {
    for (const l of lessons ?? []) {
      const ts = Math.max(Date.parse(l.updated_at ?? '') || 0, Date.parse(l.homework?.updated_at ?? '') || 0);
      if (ts > (seen.schedule ?? 0)) counts.schedule += 1;
    }
  }
  for (const task of [...(state.tasks?.active ?? []), ...(state.tasks?.expired ?? [])]) {
    const ts = Math.max(Date.parse(task.created_at ?? '') || 0, Date.parse(task.updated_at ?? '') || 0);
    if (ts > (seen.tasks ?? 0)) counts.tasks += 1;
  }
  for (const h of state.handouts ?? []) {
    if ((Date.parse(h.updated_at ?? '') || 0) > (seen.handouts ?? 0)) counts.handouts += 1;
  }
  for (const a of state.announcements ?? []) {
    if ((Date.parse(a.published_at ?? a.publishedAt ?? '') || 0) > (seen.announcements ?? 0)) counts.announcements += 1;
  }
  return counts;
}

function renderTabBadges() {
  const counts = tabFreshCounts();
  for (const btn of document.querySelectorAll('.std-tab')) {
    const tab = btn.dataset.tab;
    let badge = btn.querySelector('.std-tab__badge');
    const n = tab === activeTab ? 0 : (counts[tab] ?? 0);
    if (n > 0) {
      if (!badge) {
        badge = el('span', { class: 'std-tab__badge' });
        btn.append(badge);
      }
      badge.textContent = faDigits(Math.min(n, 99));
    } else if (badge) {
      badge.remove();
    }
  }
}

// ---------- مهلت‌ها ----------
function taskCard(task) {
  const cd = countdown(task.due_at);
  const card = el('button', {
    class: `task-card${task.priority === 'high' ? ' task-card--high' : ''}`, type: 'button',
    onclick: () => openTask(task.id),
  });
  const head = el('div', { class: 'task-card__kind' },
    el('span', { text: KIND_ICONS[task.kind] || '📌' }),
    el('span', { text: KIND_LABELS[task.kind] || task.kind }),
  );
  if (task.subject_name) head.append(el('span', { text: `· ${task.subject_name}`, style: 'color:var(--sub);font-weight:500;' }));
  card.append(head, el('h3', { class: 'task-card__title', text: task.title }));
  if (task.description) {
    card.append(el('p', {
      class: 'task-card__subject', text: task.description,
      style: 'margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;',
    }));
  }
  const footer = el('div', { class: 'task-card__footer' },
    el('span', { class: `countdown-chip cd-${cd.state}`, text: `⏰ ${cd.text}` }),
    el('span', { class: 'task-card__due', text: formatJalaliDateTime(task.due_at) }),
  );
  if (task.priority === 'high') {
    footer.append(el('span', { class: 'priority-dot priority-high', title: PRIORITY_LABELS[task.priority] }));
  }
  if (task.attachment_count > 0) {
    footer.append(el('span', { class: 'attach-chip', text: `📎 ${faDigits(task.attachment_count)}` }));
  }
  card.append(footer);
  return card;
}

function renderTasks() {
  const grid = $('#tasksGrid');
  grid.textContent = '';
  const active = state.tasks.active;
  if (!active.length) {
    grid.append(el('div', { class: 'empty-state', style: 'grid-column: 1 / -1;' },
      el('span', { class: 'face', text: '🌈' }),
      el('div', { text: 'فعلاً هیچ مهلت فوری وجود ندارد؛ خیالتان راحت!' })));
  } else {
    for (const t of active) grid.append(taskCard(t));
  }

  const exp = $('#expiredGrid');
  exp.textContent = '';
  for (const t of state.tasks.expired) {
    const card = taskCard(t);
    card.style.opacity = '0.62';
    card.style.filter = 'saturate(0.6)';
    exp.append(card);
  }
}

async function openTask(id) {
  const overlay = $('#detailOverlay');
  $('#detailBody').textContent = '';
  $('#detailTitle').textContent = 'جزئیات مورد';
  openOverlay(overlay);
  $('#detailClose').focus();
  try {
    const data = await api(`/api/tasks/${id}`);
    renderTaskDetail(data.task);
  } catch (err) {
    $('#detailBody').append(el('div', { class: 'error-state', text: `خطا: ${err.message}` }));
  }
}

function renderTaskDetail(task) {
  $('#detailTitle').textContent = `${KIND_ICONS[task.kind] || '📌'} ${task.title}`;
  const body = $('#detailBody');
  body.textContent = '';
  const cd = countdown(task.due_at);
  const wrap = el('div', { class: 'detail-lesson fade-up' });
  wrap.append(el('div', { class: `detail-hero sub-${task.color_key || 'lavender'}` },
    el('div', { class: 'detail-hero__period', text: KIND_ICONS[task.kind] || '📌' }),
    el('div', {},
      el('h3', { class: 'detail-hero__subject', text: KIND_LABELS[task.kind] || task.kind }),
      el('div', { class: 'detail-hero__meta', text: task.subject_name ? `درس ${task.subject_name}` : 'مرتبط با کل کلاس' }),
    ),
  ));
  if (task.description) {
    wrap.append(el('div', { class: 'detail-block' },
      el('p', { class: 'detail-block__title', text: '📖 توضیحات' }),
      el('p', { class: 'detail-block__text', text: task.description }),
    ));
  }
  const dl = el('dl', { style: 'margin:0;' });
  dl.append(el('div', { class: 'dl-row' }, el('dt', { text: 'مهلت' }),
    el('dd', {}, `${formatJalaliDateTime(task.due_at)} (${cd.text})`)));
  dl.append(el('div', { class: 'dl-row' }, el('dt', { text: 'اولویت' }), el('dd', { text: PRIORITY_LABELS[task.priority] || task.priority })));
  if (task.archived) dl.append(el('div', { class: 'dl-row' }, el('dt', { text: 'وضعیت' }), el('dd', { text: 'بایگانی‌شده' })));
  wrap.append(el('div', { class: 'detail-block' }, dl));
  if (task.attachments && task.attachments.length) {
    wrap.append(el('div', { class: 'detail-block' },
      el('p', { class: 'detail-block__title', text: '📎 پیوست‌ها' }),
      attachmentList(task.attachments)));
  }
  body.append(wrap);
}

// ---------- اطلاعیه‌ها ----------
function annCard(ann) {
  const card = el('button', {
    class: `ann-card${ann.pinned ? ' ann-card--pinned' : ''}`,
    type: 'button',
    onclick: () => openAnnouncement(ann),
  });
  const head = el('div', { class: 'ann-card__head' });
  if (ann.pinned) head.append(el('span', { class: 'ann-card__pin', text: '📌 سنجاق‌شده' }));
  head.append(el('h3', { class: 'ann-card__title', text: ann.title }));
  if (ann.attachment_count > 0) head.append(el('span', { class: 'attach-chip', text: `📎 ${faDigits(ann.attachment_count)}` }));
  card.append(head);
  card.append(el('p', { class: 'ann-card__body', text: ann.body }));
  card.append(el('span', { class: 'ann-card__date', text: formatJalaliDateTime(ann.published_at) }));
  return card;
}

function renderAnnouncements() {
  const list = $('#annList');
  list.textContent = '';
  if (!state.announcements.length) {
    list.append(el('div', { class: 'empty-state' },
      el('span', { class: 'face', text: '🕊️' }), el('div', { text: 'هنوز اطلاعیه‌ای منتشر نشده است.' })));
    return;
  }
  for (const a of state.announcements) list.append(annCard(a));
}

// ---------- جزوات ----------
const HANDOUT_EMOJI = { pdf: '📄', image: '🖼️', zip: '🗂️', media: '🎬', audio: '🎧', doc: '📘' };
function handoutFileEmoji(mime) {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return HANDOUT_EMOJI.image;
  if (m === 'application/pdf') return HANDOUT_EMOJI.pdf;
  if (m.startsWith('video/')) return HANDOUT_EMOJI.media;
  if (m.startsWith('audio/')) return HANDOUT_EMOJI.audio;
  if (m.includes('zip') || m.includes('rar') || m.includes('7z') || m.includes('compressed')) return HANDOUT_EMOJI.zip;
  return HANDOUT_EMOJI.doc;
}

function renderHandouts() {
  const list = $('#handoutList');
  list.textContent = '';
  if (!state.handouts?.length) {
    list.append(el('div', { class: 'empty-state' },
      el('span', { class: 'face', text: '📚' }), el('div', { text: 'هنوز جزوه یا تمرینی بارگذاری نشده است.' })));
    return;
  }
  const origin = window.__IS_MIRROR__ ? (window.__LIVE_ORIGIN__ || '') : '';
  for (const h of state.handouts) {
    const card = el('article', { class: 'handout-card fade-up' },
      el('div', { class: 'handout-card__head' },
        el('h3', { class: 'handout-card__title', text: h.title }),
        h.subject_name ? el('span', { class: 'handout-chip' },
          el('span', { class: 'handout-chip__dot', style: h.color_key ? `background:var(--${h.color_key}-deep, var(--lavender-deep));` : '' }),
          el('span', { text: h.subject_name })) : null));
    if (h.description) card.append(el('p', { class: 'handout-card__desc', text: h.description }));
    if (h.attachments?.length) {
      const files = el('div', { class: 'handout-card__files' });
      for (const f of h.attachments) {
        const item = fileItemEl(f, origin);
        item.querySelector('.attachment-item__icon').textContent = handoutFileEmoji(f.mime);
        files.append(item);
      }
      card.append(files);
    }
    card.append(el('span', { class: 'handout-card__date', text: formatJalaliDateTime(h.updated_at || h.created_at) }));
    list.append(card);
  }
}

async function openAnnouncement(ann) {
  let detail = ann;
  try {
    const data = await api(`/api/announcements/${ann.id}`);
    detail = data.announcement;
  } catch { /* بازگشت به خلاصه */ }
  const overlay = $('#detailOverlay');
  $('#detailTitle').textContent = `📣 ${detail.title}`;
  const body = $('#detailBody');
  body.textContent = '';
  const wrap = el('div', { class: 'detail-lesson fade-up' });
  if (detail.pinned) {
    wrap.append(el('div', { class: 'countdown-chip cd-future', text: '📌 سنجاق‌شده', style: 'align-self:flex-start;' }));
  }
  wrap.append(el('div', { class: 'detail-block' },
    el('p', { class: 'detail-block__title', text: '📣 متن اطلاعیه' }),
    el('p', { class: 'detail-block__text', text: detail.body })));
  wrap.append(el('div', { class: 'detail-block' },
    el('dl', { style: 'margin:0;' },
      el('div', { class: 'dl-row' }, el('dt', { text: 'تاریخ انتشار' }),
        el('dd', { text: formatJalaliDateTime(detail.published_at) })))));
  if (detail.attachments && detail.attachments.length) {
    wrap.append(el('div', { class: 'detail-block' },
      el('p', { class: 'detail-block__title', text: '📎 پیوست‌ها' }),
      attachmentList(detail.attachments)));
  }
  body.append(wrap);
  openOverlay(overlay);
  $('#detailClose').focus();
}

// ---------- اعلان‌ها ----------
function renderNotifications() {
  const panel = $('#notifPanel');
  const badge = $('#notifBadge');
  panel.textContent = '';
  const items = [];
  for (const t of state.tasks.active) {
    const cd = countdown(t.due_at);
    if (cd.state === 'today' || cd.state === 'soon' || (t.priority === 'high' && cd.state === 'tomorrow')) {
      items.push({
        icon: KIND_ICONS[t.kind] || '⏰',
        title: t.title,
        sub: `${KIND_LABELS[t.kind]} · ${cd.text}`,
        action: () => openTask(t.id),
      });
    }
  }
  for (const a of state.announcements.filter((x) => x.pinned)) {
    items.push({
      icon: '📌', title: a.title, sub: 'اطلاعیه سنجاق‌شده',
      action: () => openAnnouncement(a),
    });
  }
  if (!items.length) {
    panel.append(el('div', { class: 'notif-item' },
      el('span', { class: 'notif-item__icon', text: '✨' }),
      el('div', {}, el('div', { class: 'notif-item__title', text: 'همه‌چیز مرتب است!' }),
        el('div', { class: 'notif-item__sub', text: 'هیچ مهلت فوری نداریم' }))));
  } else {
    for (const it of items) {
      panel.append(el('button', {
        class: 'notif-item', type: 'button',
        onclick: () => { toggleNotif(false); it.action(); },
      },
      el('span', { class: 'notif-item__icon', text: it.icon }),
      el('div', {}, el('div', { class: 'notif-item__title', text: it.title }),
        el('div', { class: 'notif-item__sub', text: it.sub }))));
    }
  }
  const n = items.length;
  badge.textContent = faDigits(n);
  badge.classList.toggle('hidden', n === 0);
  $('#notifBtn').setAttribute('aria-label', n ? `اعلان‌ها (${faDigits(n)} مورد)` : 'اعلان‌ها');
}

function toggleNotif(force) {
  const panel = $('#notifPanel');
  const btn = $('#notifBtn');
  const open = force !== undefined ? force : panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !open);
  btn.setAttribute('aria-expanded', String(open));
}

// ---------- تب‌های صفحه (برنامه / مهلت‌ها / جزوات و تمارین / اطلاعیه‌ها) ----------
const STUDENT_TABS = ['schedule', 'tasks', 'handouts', 'announcements'];
let activeTab = 'schedule';

/** ارتفاع هدر را به CSS بده تا نوار تب دقیقاً زیرش بچسبد */
function syncHeaderHeight() {
  const h = document.querySelector('.site-header')?.offsetHeight || 56;
  document.documentElement.style.setProperty('--header-h', `${h}px`);
}

function switchTab(name, opts = {}) {
  if (!STUDENT_TABS.includes(name)) name = 'schedule';
  activeTab = name;
  for (const btn of document.querySelectorAll('.std-tab')) {
    const on = btn.dataset.tab === name;
    btn.classList.toggle('std-tab--active', on);
    btn.setAttribute('aria-selected', String(on));
  }
  for (const panel of document.querySelectorAll('.panel')) {
    const on = panel.dataset.panel === name;
    panel.classList.toggle('hidden', !on);
    panel.setAttribute('aria-hidden', String(!on));
  }
  if (opts.updateHash !== false) history.replaceState(null, '', `#${name}`);
  markTabSeen(name); // با باز شدن تب، نشان «دیده‌نشده»‌اش پاک می‌شود
  renderTabBadges();
  if (opts.scroll !== false) {
    const tabs = $('#stdTabs');
    const top = tabs.getBoundingClientRect().top + window.scrollY - (document.querySelector('.site-header')?.offsetHeight ?? 56) - 6;
    if (Math.abs(window.scrollY - top) > 40) window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }
}

function setupTabs() {
  syncHeaderHeight();
  window.addEventListener('resize', syncHeaderHeight);
  for (const btn of document.querySelectorAll('.std-tab')) {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  }
  // باز شدن مستقیم تب از لینک (#handouts و مانند آن — قابل اشتراک در تلگرام)
  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#', '');
    if (STUDENT_TABS.includes(h) && h !== activeTab) switchTab(h, { updateHash: false });
  });
  const h = location.hash.replace('#', '');
  if (STUDENT_TABS.includes(h)) switchTab(h, { updateHash: false, scroll: false });
  // اولین بازدیدِ هر مرورگر: نشان نزنیم تا فقط مطالبِ بعد از این لحظه «تازه» باشند
  if (!getSeen()) for (const tab of STUDENT_TABS) markTabSeen(tab);
}

// ---------- FAB «برو به امروز» ----------
function setupFab() {
  const fab = $('#fabToday');
  const tt = $('#panel-schedule');
  const onScroll = () => {
    const rect = tt.getBoundingClientRect();
    const past = rect.top < 80;
    const scrolledFar = window.scrollY > 400;
    fab.classList.toggle('fab-today--visible', past && scrolledFar && window.innerWidth < 1360);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  fab.addEventListener('click', () => {
    if (activeTab !== 'schedule') switchTab('schedule', { scroll: false });
    if (ttOffset !== 0) { ttOffset = 0; renderTimetable(); }
    scrollToToday();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ---------- راه‌اندازی ----------
function setConnState(mode) {
  // mode: 'ok' | 'loading' | 'error' — بنر کوچک وضعیت اتصال برای شبکه ضعیف
  let banner = document.getElementById('connBanner');
  if (mode === 'ok') { if (banner) banner.remove(); return; }
  if (!banner) {
    banner = el('div', { id: 'connBanner', role: 'status' });
    banner.style.cssText = 'position:fixed;inset-inline:0;bottom:0;z-index:60;text-align:center;'
      + 'padding:10px 16px;font-size:14px;font-weight:600;color:#fff;background:#8a6d3b;'
      + 'box-shadow:0 -2px 12px rgba(0,0,0,.15);';
    document.body.append(banner);
  }
  if (mode === 'loading') {
    banner.textContent = '🌐 شبکه کند است… در حال تلاش برای دریافت اطلاعات';
    banner.style.background = '#8a6d3b';
  } else {
    banner.textContent = '';
    banner.style.background = '#a94442';
    banner.append('⚠️ اتصال قطع شد — دوباره تلاش می‌کنیم…');
    // لینک نجات: نسخه‌ی آینه روی GitHub Pages (شبکه‌ی غیر-کلادفلر، از ایران باز است)
    const alt = el('a', {
      href: 'https://gigashalgham.github.io/school-s-stuff/',
      text: 'نسخه‌ی جایگزین را باز کنید',
    });
    alt.style.cssText = 'color:#fff;text-decoration:underline;margin-inline-start:8px;';
    banner.append(alt);
  }
}

// رفرش دوره‌ی دیتا — نشان «دیده‌نشده» و مطالب تازه بدون رفرش صفحه می‌آیند
let pollScheduled = false;
function schedulePoll() {
  if (pollScheduled) return;
  pollScheduled = true;
  setInterval(() => {
    if (document.visibilityState === 'visible') loadAll();
  }, 30_000);
}

async function loadAll() {
  setConnState('loading');
  let data = null;
  // mirror استاتیک (gh-pages روی github.io): داده‌ها داخل خود صفحه بیک‌شده‌اند؛
  // همان را فوری نمایش می‌دهیم و در پس‌زمینه تازه می‌کنیم.
  if (window.__BOOTSTRAP__) {
    data = window.__BOOTSTRAP__;
  } else {
    try {
      // یک درخواست واحد به‌جای ۴ درخواست جدا — نصف شدن صفحه روی شبکه ضعیف
      // معمولاً از قطره‌شدن یکی از درخواست‌های موازی بود.
      data = await api('/api/bootstrap');
    } catch (err) {
      setConnState('error');
      // تلاش مجدد خودکار هر ۸ ثانیه تا وقتی جواب بیاید
      setTimeout(loadAll, 8_000);
      return;
    }
  }
  setConnState('ok');

  state.days = data.days ?? [];
  state.bells = data.bells ?? [];
  setBells(state.bells);
  state.tasks = { active: data.tasks?.active ?? [], expired: data.tasks?.expired ?? [] };
  state.announcements = data.announcements ?? [];
  state.handouts = data.handouts ?? [];
  state.settings = data.settings ?? {};

  renderHeader();
  renderHero();
  renderTimetable();
  renderDigest();
  renderTasks();
  renderAnnouncements();
  renderHandouts();
  renderNotifications();
  renderTabBadges();
  // اسکرول به امروز بعد از آنکه layout ستون‌ها کامل شد
  if (window.innerWidth < 1360) {
    requestAnimationFrame(() => requestAnimationFrame(() => scrollToToday(false)));
  }

  // اگر داده‌ی bake‌شده‌ی mirror را نشان دادیم، در پس‌زمینه تازه‌اش کنیم
  // (اگر مسیر زنده باز باشد). و اگر باز نبود، بگوییم داده تا کی تازه است.
  if (window.__BOOTSTRAP__) {
    api('/api/bootstrap').then((fresh) => {
      window.__BOOTSTRAP__ = null;
      if (!fresh || !Array.isArray(fresh.days)) return;
      state.days = fresh.days ?? state.days;
      state.bells = fresh.bells ?? state.bells;
      setBells(state.bells);
      state.tasks = { active: fresh.tasks?.active ?? state.tasks.active, expired: fresh.tasks?.expired ?? state.tasks.expired };
      state.announcements = fresh.announcements ?? state.announcements;
      state.handouts = fresh.handouts ?? state.handouts;
      state.settings = fresh.settings ?? state.settings;
      renderHeader(); renderHero(); renderTimetable(); renderDigest(); renderTasks(); renderAnnouncements(); renderHandouts(); renderNotifications(); renderTabBadges();
    }).catch(() => {
      // مسیر زنده بسته بود — فقط یادداشت کوچک «نسخه‌ی آفلاین» می‌ماند
      if (!document.querySelector('.mirror-note')) {
        const note = el('div', { class: 'mirror-note' });
        note.style.cssText = 'text-align:center;font-size:12px;color:#6b7280;padding:6px 12px;';
        note.textContent = `📦 نسخه‌ی آینه‌ی ${faDigits(String(window.__MIRROR_DATE__ || ''))} — برای اطلاعات لحظه‌ای VPN لازم است`;
        document.querySelector('footer')?.prepend(note);
      }
    });
  }
  // از این به بعد هر ۳۰ ثانیه (وقتی تب مرورگر باز است) دیتا تازه می‌شود
  schedulePoll();
}

// اتصال رویدادها
$('#detailClose').addEventListener('click', () => closeOverlay($('#detailOverlay')));
$('#detailOverlay').addEventListener('mousedown', (e) => {
  if (e.target === $('#detailOverlay')) closeOverlay($('#detailOverlay'));
});
$('#todayBtn').addEventListener('click', () => { ttOffset = 0; renderTimetable(); scrollToToday(); });
$('#dayPrev').addEventListener('click', () => shiftWindow(-1));
$('#dayNext').addEventListener('click', () => shiftWindow(1));
$('#notifBtn').addEventListener('click', () => toggleNotif());
$('#ttPrev').addEventListener('click', () => {
  const scroll = $('#ttScroll');
  scroll.scrollBy({ left: scroll.clientWidth * 0.8, behavior: 'smooth' });
});
$('#ttNext').addEventListener('click', () => {
  const scroll = $('#ttScroll');
  scroll.scrollBy({ left: -scroll.clientWidth * 0.8, behavior: 'smooth' });
});
$('#ttScroll').addEventListener('scroll', () => {
  updateScrollState();
  updateDots();
}, { passive: true });
window.addEventListener('resize', () => {
  updateScrollState();
  updateDots();
}, { passive: true });
document.addEventListener('click', (e) => {
  const panel = $('#notifPanel');
  if (!panel.classList.contains('hidden')
      && !panel.contains(e.target) && e.target !== $('#notifBtn') && !$('#notifBtn').contains(e.target)) {
    toggleNotif(false);
  }
});
$('#showExpiredBtn').addEventListener('click', () => {
  const grid = $('#expiredGrid');
  const show = grid.style.display === 'none';
  grid.style.display = show ? '' : 'none';
  $('#showExpiredBtn').textContent = show ? 'پنهان کردن آرشیو' : 'آرشیو موارد گذشته';
});

// روی آینه‌ی استاتیک، دکمه‌ی ادمین به پنل ادمینِ خودِ آینه می‌رود
// (آینه هم نسخه‌ی ادمین را دارد که به API زنده وصل می‌شود).
if (window.__BOOTSTRAP__ && $('#adminLink')) {
  $('#adminLink').href = 'admin/';
}

setupSheetDrag();
setupTabs();
setupFab();

// به‌روزرسانی شمارش معکوس هر دقیقه
setInterval(() => {
  renderTasks();
  renderDigest();
  renderNotifications();
  renderHero();
  renderTabBadges();
}, 60_000);

loadAll();
