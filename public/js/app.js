// درس من — اپلیکیشن دانش‌آموزی (نسخه ۵)
import {
  faDigits, formatJalali, formatJalaliDateTime, jalaliDateOnly, faTime, countdown,
  WEEK_DAY_NAMES, JALALI_MONTHS, iranDayIndex, KIND_LABELS, PRIORITY_LABELS,
  tehranHHMM, toJalaliParts, weekWindow, weekOffsetBounds, tehranDateISO, weekParity, tehranDayIndex, tehranDayNumber, tehranLocalDate,
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
  hwRange: null, // بازه‌ی تاریخ‌هایی که تکلیفشان از API لود شده: { from, to }
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

// ---------- آیکون‌های خطی ----------
// آیکون از مجموعه‌ی <symbol> بالای صفحه — یک زبان بصری یکدست به‌جای ایموجی‌های رابط.
// (ایموجی فقط برای «درس‌ها» می‌ماند: نمادِ محتوایی که دانش‌آموز با آن درس را می‌شناسد.)
const SVG_NS = 'http://www.w3.org/2000/svg';
function icon(name, cls = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', cls ? `i ${cls}` : 'i');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

/** آیکون هر نوع مهلت (پروژه، تحقیق، ارائه، امتحان، آزمونک، تحویل) */
const KIND_ICON_NAMES = {
  project: 'layers', research: 'search', presentation: 'mic', exam: 'file', quiz: 'zap', submission: 'download',
};
const kindIcon = (kind) => icon(KIND_ICON_NAMES[kind] || 'bookmark');

/** آیکون نوع فایل بر اساس MIME (جزوه‌ها و پیوست‌ها) */
function fileIconName(mime) {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m === 'application/pdf') return 'file';
  if (m.startsWith('video/')) return 'film';
  if (m.startsWith('audio/')) return 'music';
  if (m.includes('zip') || m.includes('rar') || m.includes('7z') || m.includes('compressed')) return 'archive';
  return 'book';
}

/** سربرگِ یک بلوک در پنل جزئیات: آیکون خطی + برچسب */
function detailBlockTitle(iconName, text) {
  return el('p', { class: 'detail-block__title' },
    el('span', { class: 'detail-block__icon' }, icon(iconName)),
    el('span', { text }));
}

/** درس‌های مجازِ یک روزِ هفته: فقط زنگ‌هایی که در برنامه‌ی زنگ‌های آن روز هست
    (دوشنبه ۳ زنگ). روزی که زنگی ندارد، بدون درس است. */
function dayLessonsOf(dayIdx) {
  const maxP = periodsPerDay(dayIdx);
  return maxP ? (state.days[dayIdx] ?? []).filter((l) => l.period <= maxP) : [];
}

/** اجزای تاریخ شمسی از «YYYY-MM-DD» (تاریخِ تقویمِ تهران) — مستقل از منطقه‌ی
    زمانی مرورگر: تاریخِ هفته از API به شکل رشته است و نباید با ساعتِ محلی
    (که در منطقه‌های غربی یک روز جابه‌جا می‌شود) خوانده شود. */
function jalaliPartsOfISO(iso) {
  const [gy, gm, gd] = iso.split('-').map(Number);
  return toJalaliParts(gy, gm, gd);
}

/** «۷ آذر» برای یک تاریخِ تقویمِ تهران («YYYY-MM-DD») */
function dayLabel(iso, { withYear = false } = {}) {
  const { jy, jm, jd } = jalaliPartsOfISO(iso);
  return `${faDigits(jd)} ${JALALI_MONTHS[jm - 1]}${withYear ? ` ${faDigits(jy)}` : ''}`;
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
  $('#brandName').title = name;
  $('#footerName').textContent = name;
  document.title = `${name} | برنامه هفتگی کلاس`;
  // پیام خوش‌آمدِ سرِ کلاس: بالای هیرو (نه یک حباب جدا در هدر)
  const wm = (state.settings.welcome_message || '').trim();
  $('#heroEyebrowText').textContent = wm || 'به کلاس خوش آمدید';
  $('#heroEyebrow').title = wm;
  const note = state.settings.admin_note;
  if (note) $('#footerNote').textContent = note;
  tickClock();
  if (!clockTimer) clockTimer = setInterval(tickClock, 30_000);
}

function tickClock() {
  $('#brandClock').textContent = faDigits(tehranHHMM(Date.now()));
}

/** نامِ هفته نسبت به هفته‌ی جاریِ تقویم: این هفته / هفته‌ی بعد / ۲ هفته بعد … */
function weekLabel(offset) {
  if (offset === 0) return 'این هفته';
  if (offset === 1) return 'هفته‌ی بعد';
  if (offset === -1) return 'هفته‌ی قبل';
  return offset > 0 ? `${faDigits(offset)} هفته بعد` : `${faDigits(-offset)} هفته قبل`;
}

/** کاشی آمارِ هیرو: عدد درشت + واحد، و یک برچسب زیرش. برچسبِ کوتاه روی موبایل
    (عرض کاشی کم است) و برچسب کامل روی بقیه‌ی سایزها دیده می‌شود. */
function statTile({ iconName, value, unit = '', label, labelShort = label }) {
  return el('div', { class: 'stat-tile' },
    el('span', { class: 'stat-tile__top' },
      el('span', { class: 'stat-tile__icon' }, icon(iconName)),
      el('span', { class: 'stat-tile__value' },
        el('b', { text: value }),
        unit ? el('span', { class: 'stat-tile__unit', text: unit }) : null)),
    el('span', { class: 'stat-tile__label' },
      el('span', { class: 'stat-tile__full', text: label }),
      el('span', { class: 'stat-tile__short', text: labelShort })));
}

// ---------- هیرو ----------
// انیمیشنِ ورودِ کاشی‌ها فقط در نخستین رندر اجرا می‌شود؛ رندرهای بعدی
// (پولِ ۳۰ ثانیه‌ای، جابه‌جایی هفته) نباید دوباره «جا زدن» را تکرار کنند
let heroEntered = false;

function renderHero() {
  const focus = focusDay();
  const enter = !heroEntered;
  heroEntered = true;

  // آمار روی همان پنجره‌ی نمایش (یک هفته) — با چیزی که دانش‌آموز می‌بیند هم‌خوان
  let totalLessons = 0;
  let totalHw = 0;
  for (const { dayIdx, dateISO } of displayWindow()) {
    const lessons = dayLessonsOf(dayIdx);
    totalLessons += lessons.length;
    totalHw += lessons.filter((l) => l.hwByDate?.[dateISO]).length;
  }
  const stats = $('#heroStats');
  stats.textContent = '';
  stats.classList.toggle('hero-stats--enter', enter);

  // تمرکز روی روزِ به‌دست‌آمده: امروز (هنوز کلاس داریم)، فردا، یا روز درسی بعد
  const dayName = WEEK_DAY_NAMES[focus.dayIdx];
  const when = focus.offset === 0 ? 'امروز' : focus.offset === 1 ? 'فردا' : `${faDigits(focus.offset)} روز دیگر`;
  const weekName = weekLabel(ttWeek);
  stats.append(statTile({
    iconName: focus.offset === 0 ? 'sun' : 'calendar',
    value: faDigits(focus.lessons.length),
    unit: 'زنگ',
    label: `${when}، ${dayName}`,
    labelShort: when,
  }));
  stats.append(statTile({ iconName: 'book', value: faDigits(totalLessons), unit: 'درس', label: weekName }));
  stats.append(statTile({ iconName: 'edit', value: faDigits(totalHw), unit: 'تکلیف', label: weekName }));

  // درس بعدی: امروزِ در جریان؛ وگرنه اولین زنگِ روزِ تمرکز.
  // واحدِ این کاشی «کی» است (درس بعدی / اولین زنگ / فردا / نامِ روز) و برچسبش
  // فقط نامِ درس — تا در کاشیِ باریک هم بدون «…» جا شود.
  let next = nextLessonToday();
  let nextWhen = 'درس بعدی';
  if (!next && focus.lessons.length) {
    const first = [...focus.lessons].sort((a, b) => a.period - b.period)[0];
    const subj = resolveSubject(first, Date.now() + focus.offset * 86_400_000);
    next = { ...first, subject_name: subj.subject_name };
    nextWhen = focus.offset === 0 ? 'اولین زنگ' : focus.offset === 1 ? 'فردا' : dayName;
  }
  if (next) {
    stats.append(statTile({
      iconName: 'clock',
      value: faTime(next.start_time),
      unit: nextWhen,
      label: `${subjectEmoji(next.subject_name)} ${next.subject_name}`,
    }));
  }
}

// ---------- جدول هفتگی ----------
function lessonCard(lesson, dateMs) {
  const subj = resolveSubject(lesson, dateMs);
  // تکلیفِ همان تاریخِ همین زنگ — نه همه‌ی هفته‌ها (تفکیک هفته‌ها)
  const hw = lesson.hwByDate?.[tehranDateISO(dateMs)] ?? null;
  // ساعت از زنگِ پیکربندی‌شده می‌آید (منبع حقیقت)؛ فقط اگر نبود، از ردیف درس
  const bt = periodTimes(lesson.day, lesson.period) ?? [lesson.start_time, lesson.end_time];
  const files = Number(lesson.attachment_count) || 0;
  const period = `زنگ ${faDigits(lesson.period)}`;
  const card = el('button', {
    class: `lesson-card sub-${subj.color_key}`,
    type: 'button',
    onclick: () => openLesson(lesson.id, dateMs),
    title: `${subj.subject_name} · ${period}${hw ? ` · تکلیف: ${hw.title}` : ''}`,
    'aria-label': `${subj.subject_name}، ${period}، ${faTime(bt[0])} تا ${faTime(bt[1])}${hw ? `، تکلیف: ${hw.title}` : '، تکلیفی ثبت نشده'}`,
  });
  card.append(
    el('span', { class: 'lesson-card__head' },
      el('span', { class: 'lesson-card__emoji', text: subjectEmoji(subj.subject_name), 'aria-hidden': 'true' }),
      el('span', { class: 'lesson-card__subject', text: subj.subject_name }),
      // شمار پیوست‌ها، کنار نام درس (نه یک ردیف جدا که پایین کارت‌ها را نامیزان می‌کرد)
      files
        ? el('span', { class: 'lesson-card__files' }, icon('paperclip'), el('span', { text: faDigits(files) }))
        : null),
    el('span', { class: 'lesson-card__meta' },
      el('span', { class: 'lesson-card__period', text: period }),
      // دو زمان جدا تا در چیدمان راست‌به‌چپ همیشه «شروع – پایان» از راست خوانده شود
      el('span', { class: 'lesson-card__time' },
        el('span', { text: faTime(bt[0]) }),
        el('span', { class: 'lesson-card__dash', text: '–' }),
        el('span', { text: faTime(bt[1]) }))),
    hw
      ? el('span', { class: 'lesson-card__hw', title: hw.title }, icon('edit'), el('span', { class: 'lesson-card__hw-text', text: hw.title }))
      : el('span', { class: 'lesson-card__hw lesson-card__hw--none' },
        icon('check'), el('span', { class: 'lesson-card__hw-text', text: 'تکلیفی ثبت نشده' })),
  );
  return card;
}

// پنجره‌ی نمایش: یک هفته‌ی کامل (۷ روز) در هر اسلاید — با «هفته قبل/بعد»
// هفته‌به‌هفته جابه‌جا می‌شود. قبلاً دو هفته در دو ردیف نشان داده می‌شد که
// در سایز لپ‌تاپ فشرده بود؛ حالا هر اسلاید فقط یک هفته است و موبایل مثل
// قبل اسکرول افقی روزهای همان هفته را دارد.
// نکته‌ی آخرِ هفته: پنجشنبه/جمعه که دیگر کلاسی نمانده، روزِ تمرکز
// «شنبه‌ی هفته‌ی بعد» است — پس اسلایدِ پیش‌فرض هم همان هفته‌ی بعد است،
// نه هفته‌ی جاریِ رو به اتمام. بوت و دکمه‌ی «برو به …» هر دو همین را
// رعایت می‌کنند (focusWeekOffset).
let ttWeek = 0;
// بازه‌ی مجاز ttWeek؛ بعد از اولین لود از hwRangeی که API می‌دهد دقیق می‌شود
let ttWeekBounds = { min: -2, max: 4 };
// اسکرولِ اولیه فقط یک‌بار (در بوت) انجام می‌شود؛ پول ۳۰ثانیه‌ای نباید
// اسکرول دستی کاربر را بی‌احترام برمی‌گرداند.
let firstLoadDone = false;

/** روزهای پنجره‌ی در حال نمایش: [{ date, dayIdx, dayNum, dateISO }] */
function displayWindow() {
  return weekWindow(ttWeek);
}

/** هفته‌ای که روزِ تمرکز (امروزِ هنوز-در-جریان، فردا یا اولین روزِ درسیِ
    بعد) داخلش است: روزهای کاری → هفته‌ی جاری (۰)؛ پنجشنبه/جمعه و عصرِ
    آخرین روزِ درسی → هفته‌ی بعد (۱). اسلایدِ پیش‌فرضِ بوت و دکمه‌ی
    «برو به …» هر دو از این مقدار پیروی می‌کنند. */
function focusWeekOffset() {
  const todayNum = tehranDayNumber();
  const thisSat = todayNum - ((todayNum + 5) % 7);
  return Math.floor((todayNum + focusDay().offset - thisSat) / 7);
}

/** نگه‌داشتن ttWeek داخل بازه‌ی تکالیفِ لودشده — فقط در اولین لود به
    هفته‌ی روزِ تمرکز می‌رود (پنجشنبه/جمعه → اسلایدِ هفته‌ی بعد). */
let booted = false;
function clampWeek() {
  ttWeekBounds = weekOffsetBounds(state.hwRange);
  if (!booted) {
    ttWeek = focusWeekOffset();
    booted = true;
  }
  ttWeek = Math.max(ttWeekBounds.min, Math.min(ttWeekBounds.max, ttWeek));
}

// متنِ پیش‌فرضِ زیرِ عنوان هیرو (برای وقتی که برنامهِ خالیِ آینه بعداً پر می‌شود)
let heroSubDefault = null;

function renderTimetable() {
  const grid = $('#ttGrid');
  grid.textContent = '';
  // پنجره از شنبه‌ی همین هفته شروع می‌شود و یک هفته (۷ روز) را می‌گیرد:
  // تکلیفِ ثبت‌شده برای هر روزِ همین هفته دیده می‌شود — حتی پنجشنبه/جمعه
  // و عصرِ بعد از آخرین زنگ که روزِ تمرکز «روزِ درسیِ بعد» است. هفته‌ی بعد
  // اسلایدِ بعدی است، نه ردیفِ دومِ همین جدول.
  const focus = focusDay();
  const windowDays = displayWindow();
  const todayDayNum = tehranDayNumber();
  const focusDayNum = todayDayNum + focus.offset;
  const colIsEmpty = [];
  updateWeekNav(focus);

  windowDays.forEach(({ date, dayIdx, dayNum, dateISO }) => {
    // شماره‌ی روزِ تهران — مستقل از منطقه‌ی زمانی مرورگر (VPN)
    const isToday = dayNum === todayDayNum;
    const isFocus = !isToday && dayNum === focusDayNum;
    const lessons = dayLessonsOf(dayIdx);
    const empty = !lessons.length;
    colIsEmpty.push(empty);
    const col = el('div', {
      class: 'day-col'
        + (dayNum < todayDayNum ? ' day-col--past' : '')
        + (empty ? ' day-col--empty' : '')
        + (isToday ? ' day-col--today' : '') + (isFocus ? ' day-col--focus' : ''),
      'data-day': dayIdx,
      'data-daynum': dayNum,
      'data-date': dateISO,
      'aria-label': `روز ${WEEK_DAY_NAMES[dayIdx]}، ${dayLabel(dateISO)}${empty ? '، بدون کلاس' : `، ${faDigits(lessons.length)} زنگ`}`,
    });
    // سربرگ ستون: نام روز + تاریخ؛ برچسب فقط برای امروز و نزدیک‌ترین روزِ درسی
    // (برچسبِ «هفته‌ی بعد» روی هر هفت ستون تکرارِ بی‌فایده بود — نام هفته در ناوبری بالای جدول است)
    const head = el('div', { class: 'day-col__head' },
      el('span', { class: 'day-col__id' },
        el('span', { class: 'day-col__name', text: WEEK_DAY_NAMES[dayIdx] }),
        el('span', { class: 'day-col__date', text: dayLabel(dateISO) })));
    if (isToday) head.append(el('span', { class: 'day-col__tag day-col__tag--today', text: 'امروز' }));
    else if (isFocus) head.append(el('span', { class: 'day-col__tag', text: focus.offset === 1 ? 'فردا' : 'روز بعد' }));
    col.append(head);

    if (empty) {
      const weekend = dayIdx === 5 || dayIdx === 6;
      col.append(el('div', { class: 'day-empty' },
        el('span', { class: 'day-empty__icon' }, icon(weekend ? 'coffee' : 'cloud')),
        el('span', { class: 'day-empty__text', text: weekend ? 'تعطیل آخر هفته' : 'کلاسی نیست' })));
    } else {
      // dateMs = نیمه‌شبِ UTC همان تاریخِ تهران: کلید تکلیف و پاریتی گردش از آن بیرون می‌آید
      const dateMs = dayNum * 86_400_000;
      for (const lesson of lessons) col.append(lessonCard(lesson, dateMs));
    }
    grid.append(col);
  });

  // نمای هفت‌روزه (بدون اسکرول): ستون‌های بی‌کلاس باریک می‌شوند تا روزهای درسی جا بگیرند
  const hasLessons = colIsEmpty.some((e) => !e);
  const hasEmpty = colIsEmpty.some((e) => e);
  grid.style.setProperty('--tt-cols',
    hasLessons && hasEmpty
      ? colIsEmpty.map((e) => (e ? '0.42fr' : '1fr')).join(' ')
      : 'repeat(7, minmax(0, 1fr))');

  if (!hasLessons) {
    $('#heroSub').textContent = 'هنوز برنامه‌ای ثبت نشده است؛ به‌زودی توسط سرِ کلاس تکمیل می‌شود.';
  } else if (heroSubDefault === null) {
    heroSubDefault = $('#heroSub').textContent;
  } else {
    $('#heroSub').textContent = heroSubDefault;
  }
  $('#updatedAt').textContent = faDigits(tehranHHMM(Date.now()));
  renderDayStrip();
  updateScrollState();
}

// ---------- نوار روزها (نمای اسکرولی: تبلت و موبایل) ----------
const DAY_ABBR = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

/** هفت دکمه‌ی روزِ هفته بالای جدولِ اسکرولی: پرش سریع به هر روز و نشان‌دادنِ
    روزهایی که الان در دید هستند. امروز (یا روزِ تمرکز) با تُن پررنگ جدا می‌شود. */
function renderDayStrip() {
  const strip = $('#ttDots');
  strip.textContent = '';
  const todayNum = tehranDayNumber();
  const focusNum = todayNum + focusDay().offset;
  for (const { dayIdx, dayNum, dateISO } of displayWindow()) {
    const isToday = dayNum === todayNum;
    const isFocus = !isToday && dayNum === focusNum;
    const dateFa = dayLabel(dateISO);
    strip.append(el('button', {
      class: 'day-chip'
        + (isToday ? ' day-chip--today' : isFocus ? ' day-chip--focus' : '')
        + (dayLessonsOf(dayIdx).length ? '' : ' day-chip--empty'),
      type: 'button',
      'data-day': dayIdx,
      'aria-label': `${WEEK_DAY_NAMES[dayIdx]} ${dateFa}${isToday ? '، امروز' : isFocus ? '، نزدیک‌ترین روزِ کلاس' : ''}`,
      onclick: () => scrollToDay(dayIdx),
    },
    el('span', { class: 'day-chip__abbr', text: DAY_ABBR[dayIdx], 'aria-hidden': 'true' }),
    el('span', { class: 'day-chip__name', text: WEEK_DAY_NAMES[dayIdx] }),
    el('span', { class: 'day-chip__num', text: faDigits(jalaliPartsOfISO(dateISO).jd) })));
  }
  updateDots();
}

// ---------- نوار روزها: وضعیتِ دید و اسکرول ----------
function updateDots() {
  const scroll = $('#ttScroll');
  const chips = document.querySelectorAll('.day-chip');
  if (!scroll || !chips.length) return;
  const sRect = scroll.getBoundingClientRect();
  // ستون‌هایی که دست‌کم ۶۰٪ عرضشان داخل دیدِ اسکرولر است روی نوار روزها روشن می‌شوند
  const inView = new Set();
  for (const col of document.querySelectorAll('.day-col')) {
    const r = col.getBoundingClientRect();
    const visible = Math.min(r.right, sRect.right) - Math.max(r.left, sRect.left);
    if (visible > r.width * 0.6) inView.add(col.dataset.day);
  }
  for (const chip of chips) chip.classList.toggle('day-chip--inview', inView.has(chip.dataset.day));
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
}

/** اسکرول افقی تا ستونِ داده‌شده در وسطِ دید بیفتد (قابل‌اعتماد در RTL) */
function centerColumn(col, smooth = true) {
  const scroll = $('#ttScroll');
  if (!col || !scroll) return;
  // delta = فاصله ستون از مرکز (مثبت: ستون سمت راست است)؛
  // اسکرول لازم همان delta است (اگر ستون راست‌تر است، به چپ یعنی منفی می‌رویم).
  const rect = col.getBoundingClientRect();
  const sRect = scroll.getBoundingClientRect();
  const delta = (rect.left + rect.width / 2) - (sRect.left + scroll.clientWidth / 2);
  scroll.scrollBy({ left: delta, behavior: smooth ? 'smooth' : 'auto' });
}

function scrollToDay(dayIdx, smooth = true) {
  // هر روزِ هفته یک ستون دارد (پنجره تک‌هفته‌ای) — همان در مرکز دید می‌آید
  centerColumn(document.querySelector(`.day-col[data-day="${dayIdx}"]`), smooth);
}

function scrollToToday(smooth = true) {
  // بازگشت به روزِ تمرکز (ستونِ امروز/فردا — نه اولین ستون پنجره که شنبه است)
  const focus = focusDay();
  const focusNum = tehranDayNumber() + focus.offset;
  const col = document.querySelector(`.day-col[data-daynum="${focusNum}"]`)
    ?? document.querySelector(`.day-col[data-daynum="${tehranDayNumber()}"]`)
    ?? document.querySelector('.day-col');
  centerColumn(col, smooth);
}

/** جابه‌جایی پنجره یک هفته (−۱ / +۱) و رندر مجدد */
function shiftWeek(delta) {
  ttWeek = Math.max(ttWeekBounds.min, Math.min(ttWeekBounds.max, ttWeek + delta));
  renderWeek();
  scrollToToday(false);
}

/** رندر همه‌ی بخش‌هایی که به هفته‌ی در حال نمایش وابسته‌اند: هیرو، جدول و چکیده
    (چکیده قبلاً با عوض‌شدن هفته به‌روز نمی‌شد و تکالیفِ هفته‌ی قبل را نشان می‌داد). */
function renderWeek() {
  renderHero();
  renderTimetable();
  renderDigest();
}

/** دکمه‌های ناوبری هفته + برچسب بازه + برچسبِ دکمه‌ی «برو به …» بر اساس روزِ تمرکز */
function updateWeekNav(focus) {
  const prev = $('#weekPrev');
  const next = $('#weekNext');
  if (prev) prev.disabled = ttWeek <= ttWeekBounds.min;
  if (next) next.disabled = ttWeek >= ttWeekBounds.max;
  // برچسبِ اسلایدِ باز: نامِ هفته نسبت به هفته‌ی جاریِ تقویم + بازه‌ی تاریخِ همان یک هفته
  const win = displayWindow();
  const label = $('#ttRangeLabel');
  const dates = $('#ttRangeDates');
  if (label) label.textContent = weekLabel(ttWeek);
  if (dates) dates.textContent = `${dayLabel(win[0].dateISO)} تا ${dayLabel(win[6].dateISO)}`;
  // دکمه‌ی «برو به …» فقط وقتی لازم است که پنجره از هفته‌ی روزِ تمرکز جدا افتاده باشد
  const back = $('#weekToday');
  if (back) back.classList.toggle('hidden', ttWeek === focusWeekOffset());
  const backLabel = $('#weekTodayLabel');
  if (backLabel) backLabel.textContent = `برو به ${focusWeekOffset() === 0 ? 'این هفته' : weekLabel(focusWeekOffset())}`;
  // صبح (هنوز کلاس داریم) → «برو به امروز»؛ عصر/آخر هفته → «برو به فردا» یا روز بعد
  const goLabel = focus.offset === 0 ? 'برو به امروز' : focus.offset === 1 ? 'برو به فردا' : `برو به ${WEEK_DAY_NAMES[focus.dayIdx]}`;
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
    const data = await api(`/api/lessons/${id}?date=${tehranDateISO(dateMs)}`);
    renderLessonDetail(data.lesson, dateMs);
  } catch (err) {
    $('#detailBody').append(el('div', { class: 'error-state', text: `خطا در دریافت جزئیات: ${err.message}` }));
  }
}

function renderLessonDetail(lesson, dateMs) {
  const subj = resolveSubject(lesson, dateMs);
  $('#detailTitle').textContent = `${subjectEmoji(subj.subject_name)} ${subj.subject_name}`;
  const body = $('#detailBody');
  body.textContent = '';

  const wrap = el('div', { class: 'detail-lesson fade-up' });

  wrap.append(el('div', { class: `detail-hero sub-${subj.color_key}` },
    el('div', { class: 'detail-hero__period', text: `زنگ ${faDigits(lesson.period)}` }),
    el('div', { class: 'detail-hero__text' },
      el('h3', { class: 'detail-hero__subject', text: subj.subject_name }),
      el('div', { class: 'detail-hero__meta' },
        el('span', { text: `${WEEK_DAY_NAMES[lesson.day]} · ${dayLabel(tehranDateISO(dateMs), { withYear: true })}` }),
        el('span', { class: 'detail-hero__dot', text: '·', 'aria-hidden': 'true' }),
        el('span', { text: `${faTime(lesson.start_time)} تا ${faTime(lesson.end_time)}` })))));

  const hw = lesson.homework;
  if (!hw) {
    wrap.append(el('div', { class: 'detail-block' },
      detailBlockTitle('edit', 'تکلیف'),
      el('p', { class: 'detail-block__text detail-block__text--muted', text: 'برای این درس تکلیفی ثبت نشده است.' })));
  } else {
    const hwBlock = el('div', { class: 'detail-block' },
      detailBlockTitle('edit', 'تکلیف'),
      el('p', { class: 'detail-block__text detail-block__text--lead', text: hw.title }));
    const dl = el('dl', { class: 'dl-list' });
    if (hw.textbook_pages) {
      dl.append(el('div', { class: 'dl-row' }, el('dt', { text: 'صفحات کتاب' }), el('dd', { text: hw.textbook_pages })));
    }
    if (dl.children.length) hwBlock.append(dl);
    wrap.append(hwBlock);
    if (hw.description) {
      wrap.append(el('div', { class: 'detail-block' },
        detailBlockTitle('book', 'توضیحات کامل'),
        el('p', { class: 'detail-block__text', text: hw.description })));
    }
    if (hw.instructions) {
      wrap.append(el('div', { class: 'detail-block' },
        detailBlockTitle('clipboard', 'دستورالعمل'),
        el('p', { class: 'detail-block__text', text: hw.instructions })));
    }
    if (hw.notes) {
      wrap.append(el('div', { class: 'detail-block' },
        detailBlockTitle('message', 'یادداشت سرِ کلاس'),
        el('p', { class: 'detail-block__text', text: hw.notes })));
    }
    if (lesson.attachments?.length) {
      wrap.append(el('div', { class: 'detail-block' },
        detailBlockTitle('paperclip', 'پیوست‌ها'),
        attachmentList(lesson.attachments)));
    }
  }
  body.append(wrap);
}

/** آیتم دانلود فایل — مشترک بین پیوست تکلیف/مهلت/اطلاعیه و کارت جزوه */
function fileItemEl(a, origin) {
  const link = el('a', {
    class: 'attachment-item', href: `${origin}/api/attachments/${a.id}`, download: a.filename, // روی mirror از مبدأ اصلی
  },
  el('span', { class: 'attachment-item__icon' }, icon(fileIconName(a.mime))),
  el('span', { class: 'attachment-item__name', text: a.filename }),
  el('span', { class: 'attachment-item__size', text: formatSize(a.size) }));
  return link;
}

function attachmentList(files) {
  const list = el('div', { class: 'attachment-list' });
  // روی آینه‌ی استاتیک، دانلود پیوست فقط از مبدأ اصلی ممکن است
  const origin = window.__IS_MIRROR__ ? (window.__LIVE_ORIGIN__ || '') : '';
  for (const a of files ?? []) {
    // پیوست «لینک»: فایل روی سرویس بیرونی (مثل گوگل‌درایو) — مستقیم همان‌جا باز می‌شود
    if (a.url) {
      let host = '';
      try { host = new URL(a.url).hostname.replace(/^www\./, ''); } catch { /* لینک معیوب */ }
      list.append(el('a', {
        class: 'attachment-item attachment-item--link', href: a.url, target: '_blank', rel: 'noopener noreferrer',
      },
      el('span', { class: 'attachment-item__icon' }, icon('link')),
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

/** برچسب نسبیِ تاریخِ تکلیف: امروز / فردا / n روز مانده / دیروز / n روز پیش */
function hwDateLabel(dayNum, todayNum) {
  const diff = dayNum - todayNum;
  if (diff === 0) return { text: 'امروز', cls: 'dl-today' };
  if (diff === 1) return { text: 'فردا', cls: 'dl-tomorrow' };
  if (diff === 2) return { text: 'پس‌فردا', cls: 'dl-tomorrow' };
  if (diff > 2) return { text: `${faDigits(diff)} روز مانده`, cls: 'dl-soon' };
  if (diff === -1) return { text: 'دیروز', cls: 'dl-past' };
  return { text: `${faDigits(-diff)} روز پیش`, cls: 'dl-past' };
}

/**
 * تکلیف‌های پنجره‌ی در حال نمایش (یک هفته)، مرتب: اول روزهای از امروز به بعد
 * (نزدیک‌ترین از بالا)، بعد روزهای گذشته‌ی همین هفته (تازه‌ترین از بالا).
 */
function homeworkInRange() {
  const todayNum = tehranDayNumber();
  const out = [];
  for (const { dayIdx, dayNum, dateISO } of displayWindow()) {
    const maxP = periodsPerDay(dayIdx) || 12;
    for (const lesson of state.days[dayIdx] ?? []) {
      if (lesson.period > maxP) continue;
      const hw = lesson.hwByDate?.[dateISO];
      if (hw) out.push({ lesson, hw, dayIdx, dayNum, dateISO });
    }
  }
  // گذشته: کلید ۵۰۰ + فاصله (تازه‌ترین اول)؛ آینده: کلید = فاصله
  const key = (d) => (d.dayNum >= todayNum ? d.dayNum - todayNum : 500 + (todayNum - d.dayNum));
  out.sort((a, b) => key(a) - key(b));
  return out;
}

/** یک ردیف چکیده: کاشیِ آیکونِ رنگی + دو خطِ متن (عنوان و توضیح) + برچسبِ زمان */
function digestRow({ tileClass = '', tileIcon = null, tileText = '', title, meta = '', label, high = false, onclick }) {
  return el('button', {
    class: `digest-row${high ? ' digest-row--high' : ''}`,
    type: 'button',
    onclick,
    title: meta ? `${title} — ${meta}` : title,
  },
  el('span', { class: `digest-row__icon${tileClass ? ` ${tileClass}` : ''}` },
    tileIcon, tileText ? el('span', { text: tileText, 'aria-hidden': 'true' }) : null),
  el('span', { class: 'digest-row__main' },
    el('span', { class: 'digest-row__title', text: title }),
    meta ? el('span', { class: 'digest-row__meta', text: meta }) : null),
  el('span', { class: `digest-row__label ${label.cls}`, text: label.text }));
}

/** یک ستونِ چکیده: سربرگ با آیکون و شمار، و ردیف‌های زیرش */
function digestCol(title, iconName, count, ...rows) {
  return el('section', { class: 'digest-col' },
    el('h3', { class: 'digest-col__title' },
      el('span', { class: 'digest-col__icon' }, icon(iconName)),
      el('span', { text: title }),
      el('span', { class: 'digest-col__count', text: faDigits(count) })),
    ...rows);
}

/** تاریخ کوتاهِ مهلت برای کارت: «۷ آذر، ۱۲:۳۰» (بدون سال) */
function dueShort(dueAt) {
  const parts = formatJalaliDateTime(dueAt).split('، ساعت ');
  return parts[1] ? `${jalaliDateOnly(dueAt)}، ${parts[1]}` : parts[0];
}

/** رفتن به جدول برنامه (از چکیده یا تب دیگر) و نشان‌دادنِ ستونِ یک روز */
function showDayInTimetable(dayIdx) {
  if (activeTab !== 'schedule') switchTab('schedule', { scroll: false });
  const head = document.querySelector('#panel-schedule .section__head');
  const chrome = (document.querySelector('.site-header')?.offsetHeight ?? 64) + ($('#stdTabs')?.offsetHeight ?? 60);
  const top = head.getBoundingClientRect().top + window.scrollY - chrome - 10;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  if (dayIdx !== undefined) scrollToDay(dayIdx);
}

// بیشینه‌ی تکلیف‌هایی که در چکیده لیست می‌شود (بقیه در خود جدول دیده می‌شوند)
const DIGEST_HW_MAX = 8;
// بیشینه‌ی مهلت‌هایی که در چکیده لیست می‌شود (بقیه در تب مهلت‌ها)
const DIGEST_TASK_MAX = 6;

function renderDigest() {
  const list = $('#digestList');
  if (!list) return;
  list.textContent = '';
  const todayNum = tehranDayNumber();
  const weekName = weekLabel(ttWeek);
  const meta = $('#digestMeta');
  if (meta) meta.textContent = `تکالیفِ ${weekName} و نزدیک‌ترین مهلت‌ها`;

  // ۱) تکلیف‌های ثبت‌شده‌ی هفته‌ی در حال نمایش — هر ردیف جزئیات همان درس در همان تاریخ را باز می‌کند
  const homework = homeworkInRange();
  const hwRows = homework.slice(0, DIGEST_HW_MAX).map(({ lesson, hw, dayIdx, dayNum }) => {
    const label = hwDateLabel(dayNum, todayNum);
    const subj = resolveSubject(lesson, dayNum * 86_400_000);
    return digestRow({
      tileClass: `sub-${subj.color_key}`,
      tileText: subjectEmoji(subj.subject_name),
      title: hw.title,
      meta: `${subj.subject_name} · ${WEEK_DAY_NAMES[dayIdx]}، زنگ ${faDigits(lesson.period)}`,
      label,
      onclick: () => openLesson(lesson.id, dayNum * 86_400_000),
    });
  });
  if (!homework.length) {
    hwRows.push(el('p', { class: 'digest-col__empty', text: `برای ${weekName} تکلیفی ثبت نشده است.` }));
  } else if (homework.length > DIGEST_HW_MAX) {
    hwRows.push(el('button', { class: 'digest-more', type: 'button', onclick: () => showDayInTimetable(homework[0].dayIdx) },
      el('span', { text: `${faDigits(homework.length - DIGEST_HW_MAX)} تکلیف دیگر در جدول برنامه` }),
      icon('arrow-left')));
  }
  list.append(digestCol('تکلیفِ درس‌ها', 'edit', homework.length, ...hwRows));

  // ۲) مهلت‌های فعال (از قبل بر اساس نزدیکی مرتب‌اند) — فقط ۶ مورد نخست
  const items = state.tasks?.active ?? [];
  const taskRows = items.slice(0, DIGEST_TASK_MAX).map((task) => digestRow({
    tileClass: task.color_key ? `sub-${task.color_key}` : '',
    tileIcon: kindIcon(task.kind),
    title: task.title,
    meta: `${KIND_LABELS[task.kind] || task.kind}${task.subject_name ? ` · ${task.subject_name}` : ''}`,
    label: dueLabelFa(task.due_at),
    high: task.priority === 'high',
    onclick: () => openTask(task.id),
  }));
  if (!items.length) {
    taskRows.push(el('p', { class: 'digest-col__empty', text: 'مهلت فعالی ثبت نشده است.' }));
  } else if (items.length > DIGEST_TASK_MAX) {
    taskRows.push(el('button', { class: 'digest-more', type: 'button', onclick: () => switchTab('tasks') },
      el('span', { text: `نمایش همه‌ی ${faDigits(items.length)} مهلت` }),
      icon('arrow-left')));
  }
  list.append(digestCol('مهلت‌های نزدیک', 'hourglass', items.length, ...taskRows));
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
      // تکلیف‌ها تاریخ‌محورند (hwByDate): تازه‌بودنِ هر کدام هم حساب می‌شود
      let ts = Math.max(Date.parse(l.updated_at ?? '') || 0, Date.parse(l.homework?.updated_at ?? '') || 0);
      for (const hw of Object.values(l.hwByDate ?? {})) {
        ts = Math.max(ts, Date.parse(hw.updated_at ?? '') || 0);
      }
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
  const high = task.priority === 'high';
  const files = Number(task.attachment_count) || 0;
  const card = el('button', {
    class: `task-card${high ? ' task-card--high' : ''}`, type: 'button',
    onclick: () => openTask(task.id),
  });
  const kind = el('span', { class: 'task-card__kind' },
    el('span', { class: 'task-card__kind-icon' }, kindIcon(task.kind)),
    el('span', { text: KIND_LABELS[task.kind] || task.kind }));
  if (task.subject_name) kind.append(el('span', { class: 'task-card__subject', text: `· ${task.subject_name}` }));
  card.append(kind, el('span', { class: 'task-card__title', text: task.title }));
  if (task.description) card.append(el('span', { class: 'task-card__desc', text: task.description }));
  const footer = el('span', { class: 'task-card__footer' },
    el('span', { class: `countdown-chip cd-${cd.state}` },
      icon(cd.state === 'passed' ? 'check' : 'clock'),
      el('span', { text: cd.text })),
    el('span', { class: 'task-card__due' }, icon('calendar'), el('span', { text: dueShort(task.due_at) })));
  if (high) footer.append(el('span', { class: 'task-card__flag' }, icon('alert'), el('span', { text: 'مهم' })));
  if (files) footer.append(el('span', { class: 'attach-chip' }, icon('paperclip'), el('span', { text: faDigits(files) })));
  card.append(footer);
  return card;
}

function renderTasks() {
  const grid = $('#tasksGrid');
  grid.textContent = '';
  const active = state.tasks.active;
  if (!active.length) {
    grid.append(emptyState('check-circle', 'فعلاً هیچ مهلت فوری وجود ندارد',
      'هرچه سرِ کلاس ثبت کند، همین‌جا و به ترتیبِ نزدیک‌ترین مهلت دیده می‌شود.'));
  } else {
    for (const t of active) grid.append(taskCard(t));
  }

  const exp = $('#expiredGrid');
  exp.textContent = '';
  for (const t of state.tasks.expired) {
    const card = taskCard(t);
    card.classList.add('task-card--expired');
    exp.append(card);
  }
  // دکمه‌ی آرشیو فقط وقتی چیزی برای نشان‌دادن هست (قبلاً حتی با آرشیوِ خالی دیده می‌شد)
  const toggle = $('#showExpiredBtn');
  if (toggle) {
    toggle.classList.toggle('hidden', !state.tasks.expired.length);
    $('#expiredCount').textContent = faDigits(state.tasks.expired.length);
  }
}

/** حالت خالیِ جمع‌وجور: آیکون در دایره‌ی رنگی + یک جمله + یک راهنمای کوتاه */
function emptyState(iconName, title, hint = '') {
  return el('div', { class: 'empty-state' },
    el('span', { class: 'empty-state__icon' }, icon(iconName)),
    el('p', { class: 'empty-state__title', text: title }),
    hint ? el('p', { class: 'empty-state__hint', text: hint }) : null);
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
  $('#detailTitle').textContent = task.title;
  const body = $('#detailBody');
  body.textContent = '';
  const cd = countdown(task.due_at);
  const wrap = el('div', { class: 'detail-lesson fade-up' });
  const hero = el('div', { class: `detail-hero sub-${task.color_key || 'lavender'}` },
    el('div', { class: 'detail-hero__period' }, kindIcon(task.kind)),
    el('div', { class: 'detail-hero__text' },
      el('h3', { class: 'detail-hero__subject', text: KIND_LABELS[task.kind] || task.kind }),
      el('div', { class: 'detail-hero__meta', text: task.subject_name ? `درس ${task.subject_name}` : 'مرتبط با کل کلاس' })));
  // شمارش معکوس، داخل خود کارتِ عنوان (نه یک ردیف جدا در پایین)
  hero.append(el('span', { class: `countdown-chip cd-${cd.state} detail-hero__chip` },
    icon(cd.state === 'passed' ? 'check' : 'clock'),
    el('span', { text: cd.text })));
  wrap.append(hero);
  if (task.description) {
    wrap.append(el('div', { class: 'detail-block' },
      detailBlockTitle('list', 'توضیحات'),
      el('p', { class: 'detail-block__text', text: task.description })));
  }
  const dl = el('dl', { class: 'dl-list' });
  dl.append(el('div', { class: 'dl-row' }, el('dt', { text: 'مهلت' }),
    el('dd', {}, `${formatJalaliDateTime(task.due_at)} (${cd.text})`)));
  dl.append(el('div', { class: 'dl-row' }, el('dt', { text: 'اولویت' }), el('dd', { text: PRIORITY_LABELS[task.priority] || task.priority })));
  if (task.archived) dl.append(el('div', { class: 'dl-row' }, el('dt', { text: 'وضعیت' }), el('dd', { text: 'بایگانی‌شده' })));
  wrap.append(el('div', { class: 'detail-block' }, detailBlockTitle('clock', 'زمان و وضعیت'), dl));
  if (task.attachments?.length) {
    wrap.append(el('div', { class: 'detail-block' },
      detailBlockTitle('paperclip', 'پیوست‌ها'),
      attachmentList(task.attachments)));
  }
  body.append(wrap);
}

// ---------- اطلاعیه‌ها ----------
function annCard(ann) {
  const files = Number(ann.attachment_count) || 0;
  const card = el('button', {
    class: `ann-card${ann.pinned ? ' ann-card--pinned' : ''}`,
    type: 'button',
    onclick: () => openAnnouncement(ann),
  });
  const head = el('span', { class: 'ann-card__head' });
  if (ann.pinned) head.append(el('span', { class: 'ann-card__pin' }, icon('bookmark'), el('span', { text: 'سنجاق‌شده' })));
  head.append(el('span', { class: 'ann-card__title', text: ann.title }));
  if (files) head.append(el('span', { class: 'attach-chip' }, icon('paperclip'), el('span', { text: faDigits(files) })));
  card.append(head);
  card.append(el('span', { class: 'ann-card__body', text: ann.body || '' }));
  card.append(el('span', { class: 'ann-card__date' }, icon('calendar'), el('span', { text: formatJalaliDateTime(ann.published_at) })));
  return card;
}

function renderAnnouncements() {
  const list = $('#annList');
  list.textContent = '';
  if (!state.announcements.length) {
    list.append(emptyState('megaphone', 'هنوز اطلاعیه‌ای منتشر نشده است',
      'اطلاعیه‌های سرِ کلاس، همین‌جا و جدیدترین در بالا دیده می‌شوند.'));
    return;
  }
  for (const a of state.announcements) list.append(annCard(a));
}

// ---------- جزوات ----------
// نماد نوع فایل‌ها: fileIconName (بالا، کنار helperهای آیکون)
let handoutsEntered = false;

function renderHandouts() {
  const list = $('#handoutList');
  list.textContent = '';
  const handouts = state.handouts ?? [];
  if (!handouts.length) {
    list.append(emptyState('book', 'هنوز جزوه یا تمرینی بارگذاری نشده است',
      'جزوه‌ها، پاسخنامه‌ها و فایل‌های تمرین که سرِ کلاس بفرستد، همین‌جا جمع می‌شوند.'));
    return;
  }
  // روی آینه‌ی استاتیک، دانلود پیوست فقط از مبدأ اصلی ممکن است
  const origin = window.__IS_MIRROR__ ? (window.__LIVE_ORIGIN__ || '') : '';
  // انیمیشنِ ورود فقط برای نخستین رندر — نه هر پولِ ۳۰ ثانیه‌ای
  const enter = !handoutsEntered;
  handoutsEntered = true;
  for (const h of handouts) {
    const card = el('article', { class: `handout-card${enter ? ' fade-up' : ''}` },
      el('div', { class: 'handout-card__head' },
        el('span', { class: 'handout-card__icon' }, icon('book')),
        el('h3', { class: 'handout-card__title', text: h.title }),
        h.subject_name
          ? el('span', { class: `handout-chip${h.color_key ? ` sub-${h.color_key}` : ''}` },
            el('span', { class: 'handout-chip__dot' }),
            el('span', { text: h.subject_name }))
          : null));
    if (h.description) card.append(el('p', { class: 'handout-card__desc', text: h.description }));
    if (h.attachments?.length) {
      const files = el('div', { class: 'handout-card__files' });
      for (const f of h.attachments) files.append(fileItemEl(f, origin));
      card.append(files);
    }
    card.append(el('span', { class: 'handout-card__date' }, icon('calendar'),
      el('span', { text: formatJalaliDateTime(h.updated_at || h.created_at) })));
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
  $('#detailTitle').textContent = detail.title;
  const body = $('#detailBody');
  body.textContent = '';
  const wrap = el('div', { class: 'detail-lesson fade-up' });
  if (detail.pinned) {
    wrap.append(el('span', { class: 'ann-card__pin ann-card__pin--detail' }, icon('bookmark'), el('span', { text: 'سنجاق‌شده' })));
  }
  wrap.append(el('div', { class: 'detail-block' },
    detailBlockTitle('megaphone', 'متن اطلاعیه'),
    el('p', { class: 'detail-block__text detail-block__text--lead', text: detail.body || '' })));
  const dl = el('dl', { class: 'dl-list' });
  dl.append(el('div', { class: 'dl-row' }, el('dt', { text: 'تاریخ انتشار' }),
    el('dd', { text: formatJalaliDateTime(detail.published_at) })));
  wrap.append(el('div', { class: 'detail-block' }, detailBlockTitle('calendar', 'زمان انتشار'), dl));
  if (detail.attachments?.length) {
    wrap.append(el('div', { class: 'detail-block' },
      detailBlockTitle('paperclip', 'پیوست‌ها'),
      attachmentList(detail.attachments)));
  }
  body.append(wrap);
  openOverlay(overlay);
  $('#detailClose').focus();
}

// ---------- اعلان‌ها ----------
// نشان «جدید» روی زنگ اعلان‌ها فقط برای مواردی است که هنوز دیده نشده‌اند:
// اعلانِ سنجاق‌شده و مهلتِ فوریِ تازه، هر کدام با کلید پایدار (نوع + id +
// آخرین ویرایش) در localStorage به‌عنوان «دیده‌شده» ثبت می‌شوند. باز‌کردنِ
// پنل — یا رفرش بعد از آن — نشان را تا وقتی آیتمِ واقعاً جدید نیامده پاک
// می‌کند.
const NOTIF_SEEN_KEY = 'classhub_notif_seen_v1';

function getNotifSeen() {
  try { return JSON.parse(localStorage.getItem(NOTIF_SEEN_KEY)) ?? {}; } catch { return {}; }
}

function notifItemKey(it) {
  return `${it.kind}#${it.id}#${it.rev}`;
}

function markNotifsSeen(items) {
  const seen = getNotifSeen();
  for (const it of items) seen[notifItemKey(it)] = Date.now();
  try { localStorage.setItem(NOTIF_SEEN_KEY, JSON.stringify(seen)); } catch { /* حالت خصوصی مرورگر */ }
}

/** آیتم‌های پنل اعلان: مهلت‌های فوری + اطلاعیه‌های سنجاق‌شده */
function urgentNotifItems() {
  const items = [];
  for (const t of state.tasks.active) {
    const cd = countdown(t.due_at);
    if (cd.state === 'today' || cd.state === 'soon' || (t.priority === 'high' && cd.state === 'tomorrow')) {
      items.push({
        kind: 'task',
        id: t.id,
        rev: Date.parse(t.updated_at ?? t.created_at ?? '') || 0,
        iconName: KIND_ICON_NAMES[t.kind] || 'clock',
        title: t.title,
        sub: `${KIND_LABELS[t.kind] || t.kind} · ${cd.text}`,
        action: () => openTask(t.id),
      });
    }
  }
  for (const a of state.announcements.filter((x) => x.pinned)) {
    items.push({
      kind: 'ann',
      id: a.id,
      rev: Date.parse(a.published_at ?? a.publishedAt ?? '') || 0,
      iconName: 'megaphone',
      title: a.title, sub: 'اطلاعیه سنجاق‌شده',
      action: () => openAnnouncement(a),
    });
  }
  return items;
}

function renderNotifications() {
  const panel = $('#notifPanel');
  const badge = $('#notifBadge');
  panel.textContent = '';
  const items = urgentNotifItems();
  // نشان فقط تعدادِ دیده‌نشده‌ها را می‌دهد — نه همه‌ی آیتم‌های پنل را
  const seen = getNotifSeen();
  const fresh = items.filter((it) => !seen[notifItemKey(it)]).length;
  panel.append(el('div', { class: 'notif-panel__head' },
    el('span', { class: 'notif-panel__title' }, icon('bell'), el('span', { text: 'اعلان‌های مهم' })),
    el('span', { class: 'notif-panel__hint', text: items.length ? `${faDigits(items.length)} مورد` : '' })));
  if (!items.length) {
    panel.append(el('div', { class: 'notif-empty' },
      el('span', { class: 'notif-empty__icon' }, icon('check')),
      el('p', { class: 'notif-empty__title', text: 'همه‌چیز مرتب است!' }),
      el('p', { class: 'notif-empty__hint', text: 'مهلت فوری یا اعلانِ سنجاق‌شده‌ای نداریم.' })));
  } else {
    for (const it of items) {
      panel.append(el('button', {
        class: `notif-item notif-item--${it.kind}`,
        type: 'button',
        onclick: () => { toggleNotif(false); it.action(); },
      },
      el('span', { class: 'notif-item__icon' }, icon(it.iconName)),
      el('span', { class: 'notif-item__text' },
        el('span', { class: 'notif-item__title', text: it.title }),
        el('span', { class: 'notif-item__sub', text: it.sub }))));
    }
  }
  badge.textContent = faDigits(fresh);
  badge.classList.toggle('hidden', fresh === 0);
  $('#notifBtn').setAttribute('aria-label', fresh ? `اعلان‌ها (${faDigits(fresh)} مورد جدید)` : 'اعلان‌ها');
}

function toggleNotif(force) {
  const panel = $('#notifPanel');
  const btn = $('#notifBtn');
  const open = force !== undefined ? force : panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !open);
  btn.setAttribute('aria-expanded', String(open));
  // باز‌کردنِ پنل یعنی «دیدم» — نشانِ جدید پاک می‌شود و بعد از رفرش هم
  // برنمی‌گردد (تا وقتی آیتمِ تازه یا ویرایش‌شده‌ی واقعاً تازه بیاید).
  if (open) {
    markNotifsSeen(urgentNotifItems());
    renderNotifications();
  }
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
    btn.tabIndex = on ? 0 : -1; // tabindex سرگردان: فقط سربرگِ فعال در ترتیبِ Tab می‌آید
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
  const tabs = [...document.querySelectorAll('.std-tab')];
  for (const btn of tabs) {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    // صفحه‌کلید: فلشِ چپ/راست بین سربرگ‌ها (الگوی استاندارد tablist)؛ در RTL
    // فلشِ چپ می‌رود به سربرگِ بعدی
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const dir = e.key === 'ArrowLeft' ? 1 : -1;
      const next = tabs[(tabs.indexOf(btn) + dir + tabs.length) % tabs.length];
      next.focus();
      switchTab(next.dataset.tab, { scroll: false });
      e.preventDefault();
    });
  }
  // وقتی نوار تب زیر هدر می‌چسبد، سایه می‌گیرد تا از محتوا جدا دیده شود
  const sentinel = $('#tabsSentinel');
  if (sentinel && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      $('#stdTabs').classList.toggle('is-stuck', !entry.isIntersecting && entry.boundingClientRect.top < 0);
    }).observe(sentinel);
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
    if (ttWeek !== focusWeekOffset()) { ttWeek = focusWeekOffset(); renderWeek(); }
    scrollToToday();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ---------- راه‌اندازی ----------
// بنرِ وضعیتِ اتصال برای شبکه‌ی ضعیف. پیامِ «شبکه کند است» فقط وقتی پدیدار
// می‌شود که پاسخ بیش از ۲٫۵ ثانیه طول کشیده باشد (در شبکه‌ی معمولی هیچ بنری
// دیده نمی‌شود)؛ و بنرِ خطا هرگز با پیامِ «در حال تلاش» بازنویسی نمی‌شود.
const CONN_SLOW_AFTER_MS = 2500;
let connBannerTimer = 0;

function setConnState(mode) {
  // mode: 'ok' | 'loading' | 'error'
  clearTimeout(connBannerTimer);
  const existing = document.getElementById('connBanner');
  if (mode === 'ok') { existing?.remove(); return; }

  if (mode === 'error') {
    const banner = existing ?? el('div', { id: 'connBanner', class: 'conn-banner conn-banner--error', role: 'status' });
    banner.className = 'conn-banner conn-banner--error';
    banner.textContent = '';
    banner.append(icon('alert'), 'اتصال قطع شد — دوباره تلاش می‌کنیم…');
    // لینک نجات: نسخه‌ی آینه روی GitHub Pages (شبکه‌ی غیر-کلادفلر، از ایران باز است)
    banner.append(el('a', {
      href: 'https://gigashalgham.github.io/school-s-stuff/',
      text: 'نسخه‌ی جایگزین را باز کنید',
    }));
    if (!banner.isConnected) document.body.append(banner);
    return;
  }

  // loading: بنرِ خطای موجود را نگه می‌داریم؛ بنرِ تازه هم با تأخیر ساخته می‌شود
  if (existing) return;
  connBannerTimer = setTimeout(() => {
    document.body.append(el('div', { id: 'connBanner', class: 'conn-banner', role: 'status' },
      icon('cloud'), 'شبکه کند است… در حال تلاش برای دریافت اطلاعات'));
  }, CONN_SLOW_AFTER_MS);
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
  state.hwRange = data.hwRange ?? null;
  clampWeek();

  renderHeader();
  renderHero();
  renderTimetable();
  renderDigest();
  renderTasks();
  renderAnnouncements();
  renderHandouts();
  renderNotifications();
  renderTabBadges();
  // اسکرول به روزِ تمرکز فقط در اولین لود (پس از آن layout ستون‌ها کامل شده است)؛
  // در پول‌های بعدی اسکرول دستی کاربر دست‌نخورده می‌ماند.
  if (!firstLoadDone && window.innerWidth < 1360) {
    firstLoadDone = true;
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
      state.hwRange = fresh.hwRange ?? state.hwRange;
      clampWeek();
      renderHeader(); renderHero(); renderTimetable(); renderDigest(); renderTasks(); renderAnnouncements(); renderHandouts(); renderNotifications(); renderTabBadges();
    }).catch(() => {
      // مسیر زنده بسته بود — فقط یادداشت کوچک «نسخه‌ی آفلاین» می‌ماند
      if (!document.querySelector('.mirror-note')) {
        const note = el('div', { class: 'mirror-note' });
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
$('#weekToday').addEventListener('click', () => { ttWeek = focusWeekOffset(); renderWeek(); scrollToToday(); });
$('#weekPrev').addEventListener('click', () => shiftWeek(-1));
$('#weekNext').addEventListener('click', () => shiftWeek(1));
$('#notifBtn').addEventListener('click', () => toggleNotif());
// فلش‌های چپ/راستِ کنار جدول حذف شدند (روی کارت‌ها می‌افتادند) — پیمایش با کشیدن
// و با نوار روزها انجام می‌شود
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
  const btn = $('#showExpiredBtn');
  const show = grid.style.display === 'none';
  grid.style.display = show ? '' : 'none';
  btn.classList.toggle('archive-toggle--open', show);
  btn.setAttribute('aria-expanded', String(show));
  $('#showExpiredLabel').textContent = show ? 'پنهان کردن آرشیو' : 'آرشیو موارد گذشته';
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
