// کلاس‌هاب — اپلیکیشن دانش‌آموزی (نسخه ۳)
import {
  faDigits, formatJalali, formatJalaliDateTime, faTime, countdown,
  WEEK_DAY_NAMES, iranDayIndex, KIND_LABELS, KIND_ICONS, PRIORITY_LABELS,
  tehranHHMM, rollingWindow,
} from './utils.js';
import { periodsPerDay } from './schedule.js';

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
 * زنگ‌های گردشی (alt_subject_id) بر اساس تعداد هفته‌های گذشته از نقطه مبنا
 * هفته‌به‌هفته بین درس اصلی و درس دوم عوض می‌شوند.
 */
const ROTATION_EPOCH_MS = Date.UTC(2026, 10, 21); // مبنا: شنبه ۱۴۰۵/۰۹/۰۱ — زنگ اولِ هفته
function resolveSubject(lesson, dateMs) {
  if (!lesson.alt_subject_id || !lesson.alt_subject_name) {
    return {
      subject_name: lesson.subject_name,
      color_key: lesson.color_key,
      rotating: false,
    };
  }
  const week = Math.floor((dateMs - ROTATION_EPOCH_MS) / (7 * 86_400_000));
  const useAlt = week % 2 === 1;
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

// ---------- API (مقاوم به شبکه ضعیف) ----------
// هر درخواست: مهلت زمانی + تلاش مجدد خودکار — روی شبکه‌ای که پکت می‌اندازد،
// یک fetch ساده ممکن است تا ابد معطل بماند و صفحه «نصفه» بماند.
// مهلت و فاصله‌ی تلاش‌ها پیش‌رونده است: شبکه‌ی خیلی کند فرصت بیشتری می‌گیرد
// (تایم‌اوت کوتاه ثابت روی خطِ شش-کیلوبیت-بر-ثانیه خودش عامل شکست می‌شود).
const API_TIMEOUT_SCHEDULE = [10_000, 20_000, 35_000, 60_000];
const RETRY_BACKOFF_MS = [800, 1_600, 3_200];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchOnce(path, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(path, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function api(path) {
  let lastErr;
  const attempts = API_TIMEOUT_SCHEDULE.length;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetchOnce(path, API_TIMEOUT_SCHEDULE[attempt]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      // فقط خطای شبکه/مهلت را دوباره امتحان می‌کنیم، نه پاسخ‌های معتبر سرور را
      const retryable = err.name === 'AbortError' || err.name === 'TypeError';
      if (attempt < attempts - 1 && retryable) {
        await sleep(RETRY_BACKOFF_MS[attempt] ?? 3_200);
        continue;
      }
      throw lastErr;
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
  const todayIdx = iranDayIndex(new Date());
  const lessons = (state.days[todayIdx] || [])
    .filter((l) => l.period <= (periodsPerDay(todayIdx) || 12));
  if (!lessons.length) return null;
  const hhmm = tehranHHMM(Date.now());
  const resolved = lessons.map((l) => ({ lesson: l, subj: resolveSubject(l, Date.now()) }));
  const next = resolved.find((r) => r.lesson.start_time > hhmm);
  return next ? { ...next.lesson, subject_name: next.subj.subject_name } : null;
}

// ---------- هدر ----------
let clockTimer = null;

function renderHeader() {
  const now = new Date();
  $('#brandDate').textContent = formatJalali(now, { withWeekday: true });
  const name = state.settings.class_name || 'کلاس‌هاب';
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
  // آمار روی پنجره غلتان (۷ روز از امروز)، نه هفته تقویمی
  const win = rollingWindow(7);
  const seen = new Set();
  let totalLessons = 0;
  let totalHw = 0;
  for (const { dayIdx, date } of win) {
    if (seen.has(date.toDateString())) continue;
    seen.add(date.toDateString());
    totalLessons += dayLessons(dayIdx).length;
    totalHw += dayLessons(dayIdx).filter((l) => l.homework).length;
  }
  const next = nextLessonToday();
  const stats = $('#heroStats');
  stats.textContent = '';

  const todayIdx = iranDayIndex(new Date());
  const todayName = WEEK_DAY_NAMES[todayIdx];
  stats.append(el('div', { class: 'stat-chip' },
    el('span', { text: '🗓️' }),
    `${todayName}، `,
    el('b', { text: faDigits(dayLessons(todayIdx).length) }),
    ' زنگ'));
  stats.append(el('div', { class: 'stat-chip' },
    el('span', { text: '📚' }),
    el('b', { text: faDigits(totalLessons) }),
    ' درس در ۷ روز آینده'));
  stats.append(el('div', { class: 'stat-chip' },
    el('span', { text: '📝' }),
    el('b', { text: faDigits(totalHw) }),
    ' تکلیف ثبت‌شده'));
  if (next) {
    stats.append(el('div', { class: 'stat-chip' },
      el('span', { text: '⏰' }),
      'درس بعدی: ',
      el('b', { text: `${subjectEmoji(next.subject_name)} ${next.subject_name}` }),
      ` (${faTime(next.start_time)})`));
  } else if (dayLessons(todayIdx).length) {
    stats.append(el('div', { class: 'stat-chip' }, el('span', { text: '🌙' }), 'کلاس‌های امروز تمام شد'));
  }
}

// ---------- جدول هفتگی ----------
function lessonCard(lesson, dateMs) {
  const subj = resolveSubject(lesson, dateMs);
  const hw = lesson.homework;
  const card = el('button', {
    class: `lesson-card sub-${subj.color_key}`,
    type: 'button',
    onclick: () => openLesson(lesson.id),
    'aria-label': `${subj.subject_name}، زنگ ${faDigits(lesson.period)}، ${faTime(lesson.start_time)} تا ${faTime(lesson.end_time)}${hw ? `، تکلیف: ${hw.title}` : ''}`,
  });

  const top = el('div', { class: 'lesson-card__top' },
    el('span', { class: 'lesson-card__period', text: faDigits(lesson.period), 'aria-hidden': 'true' }),
    el('span', { class: 'lesson-card__emoji', text: subjectEmoji(subj.subject_name), 'aria-hidden': 'true' }),
    el('span', { class: 'lesson-card__subject', text: subj.subject_name }),
    el('span', { class: 'lesson-card__time', text: `${faTime(lesson.start_time)}–${faTime(lesson.end_time)}` }),
  );
  card.append(top);

  if (hw) {
    const cd = hw.due_at ? countdown(hw.due_at) : null;
    const hwLine = el('div', { class: 'lesson-card__hw' },
      el('span', { text: `📝 ${hw.title}` }),
    );
    if (cd && cd.state !== 'passed') {
      hwLine.append(el('span', {
        class: 'lesson-card__time', text: cd.text,
        style: 'flex-shrink:0;font-weight:700;color:var(--cream-deep);',
      }));
    }
    card.append(hwLine);
    if (cd && (cd.state === 'today' || cd.state === 'soon')) {
      card.append(el('span', { class: 'lesson-card__badge', text: cd.state === 'today' ? 'امروز!' : 'نزدیک!' }));
    }
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

// پنجره نمایش: تعداد روزهای نشان‌داده‌شده (از امروز به بعد)
const WINDOW_DAYS = 7;

function renderTimetable() {
  const grid = $('#ttGrid');
  grid.textContent = '';
  const windowDays = rollingWindow(WINDOW_DAYS);
  const todayKey = new Date().toDateString();
  let anyLessons = false;

  for (const { date, dayIdx } of windowDays) {
    const dateMs = date.getTime();
    const isToday = date.toDateString() === todayKey;
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
  $('#updatedAt').textContent = faDigits(new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }));
  renderDots(windowDays, todayKey);
  updateScrollState();
}

// ---------- نقطه‌های راهنما و فلش‌ها ----------
function renderDots(windowDays, todayKey) {
  const dots = $('#ttDots');
  dots.textContent = '';
  for (const { date, dayIdx } of windowDays) {
    const isToday = date.toDateString() === todayKey;
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
  // اولین ستونِ «امروز» (اولین ستون پنجره)
  const scroll = $('#ttScroll');
  if (!scroll) return;
  const col = scroll.querySelector('.day-col');
  if (!col) return;
  const rect = col.getBoundingClientRect();
  const sRect = scroll.getBoundingClientRect();
  const delta = (rect.left + rect.width / 2) - (sRect.left + scroll.clientWidth / 2);
  scroll.scrollBy({ left: delta, behavior: smooth ? 'smooth' : 'auto' });
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

async function openLesson(id) {
  const overlay = $('#detailOverlay');
  $('#detailBody').textContent = '';
  $('#detailTitle').textContent = 'جزئیات درس';
  openOverlay(overlay);
  $('#detailClose').focus();
  try {
    const data = await api(`/api/lessons/${id}`);
    renderLessonDetail(data.lesson);
  } catch (err) {
    $('#detailBody').append(el('div', { class: 'error-state', text: `خطا در دریافت جزئیات: ${err.message}` }));
  }
}

function renderLessonDetail(lesson) {
  const subj = resolveSubject(lesson, Date.now());
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

  if (subj.rotating) {
    wrap.append(el('div', { class: 'detail-block detail-block--rotate', style: 'border-style:dashed;' },
      el('p', { class: 'detail-block__title', text: '🔄 زنگ گردشی' }),
      el('p', { class: 'detail-block__text', text: `این زنگ هفته‌به‌هفته بین «${lesson.subject_name}» و «${lesson.alt_subject_name}» می‌چرخد؛ این هفته: ${subj.subject_name}.` }),
    ));
  }

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
    if (hw.due_at) {
      const cd = countdown(hw.due_at);
      dl.append(el('div', { class: 'dl-row' },
        el('dt', { text: 'مهلت تحویل' }),
        el('dd', {}, `${formatJalaliDateTime(hw.due_at)} (${cd.text})`)));
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

function attachmentList(files) {
  const list = el('div', { class: 'attachment-list' });
  for (const a of files) {
    list.append(el('a', {
      class: 'attachment-item', href: `/api/attachments/${a.id}`, download: a.filename,
    },
    el('span', { class: 'attachment-item__icon', text: '📎' }),
    el('span', { class: 'attachment-item__name', text: a.filename }),
    el('span', { class: 'attachment-item__size', text: formatSize(a.size) })));
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

// ---------- FAB «برو به امروز» ----------
function setupFab() {
  const fab = $('#fabToday');
  const tt = document.querySelector('.section[aria-label="برنامه هفتگی"]');
  const onScroll = () => {
    const rect = tt.getBoundingClientRect();
    const past = rect.top < 80;
    const scrolledFar = window.scrollY > 400;
    fab.classList.toggle('fab-today--visible', past && scrolledFar && window.innerWidth < 1360);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  fab.addEventListener('click', () => {
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
  banner.textContent = mode === 'loading'
    ? '🌐 شبکه کند است… در حال تلاش برای دریافت اطلاعات'
    : '⚠️ اتصال قطع شد — دوباره تلاش می‌کنیم…';
  banner.style.background = mode === 'loading' ? '#8a6d3b' : '#a94442';
}

async function loadAll() {
  setConnState('loading');
  let data = null;
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
  setConnState('ok');

  state.days = data.days ?? [];
  state.tasks = { active: data.tasks?.active ?? [], expired: data.tasks?.expired ?? [] };
  state.announcements = data.announcements ?? [];
  state.settings = data.settings ?? {};

  renderHeader();
  renderHero();
  renderTimetable();
  renderTasks();
  renderAnnouncements();
  renderNotifications();
  // اسکرول به امروز بعد از آنکه layout ستون‌ها کامل شد
  if (window.innerWidth < 1360) {
    requestAnimationFrame(() => requestAnimationFrame(() => scrollToToday(false)));
  }
}

// اتصال رویدادها
$('#detailClose').addEventListener('click', () => closeOverlay($('#detailOverlay')));
$('#detailOverlay').addEventListener('mousedown', (e) => {
  if (e.target === $('#detailOverlay')) closeOverlay($('#detailOverlay'));
});
$('#todayBtn').addEventListener('click', () => scrollToToday());
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

setupSheetDrag();
setupFab();

// به‌روزرسانی شمارش معکوس هر دقیقه
setInterval(() => {
  renderTasks();
  renderNotifications();
  renderHero();
}, 60_000);

loadAll();
