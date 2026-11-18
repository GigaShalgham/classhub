// کلاس‌هاب — اپلیکیشن دانش‌آموزی (نسخه ۲)
import {
  faDigits, formatJalali, formatJalaliDateTime, faTime, countdown,
  WEEK_DAY_NAMES, iranDayIndex, KIND_LABELS, KIND_ICONS, PRIORITY_LABELS,
} from './utils.js';
import { periodsPerDay } from './schedule.js';

const $ = (sel) => document.querySelector(sel);

// ایموجی اختصاصی هر درس (با نام درس تطبیق می‌شود)
const SUBJECT_EMOJI = [
  ['ریاضی', '📐'], ['فیزیک', '🧲'], ['شیمی', '⚗️'], ['زیست', '🌿'], ['ادبیات', '📖'],
  ['فارسی', '📖'], ['انگلیسی', '🗣️'], ['عربی', '🕌'], ['تاریخ', '🏺'], ['جغرافیا', '🗺️'],
  ['دینی', '🕊️'], ['ورزش', '⚽'], ['هنر', '🎨'], ['کارگاه', '🔧'], ['نجوم', '🔭'],
  ['اقتصاد', '💰'], ['فلسفه', '🤔'], ['روان', '🧠'], ['کامپیوتر', '💻'], ['برنامه', '💻'],
];
function subjectEmoji(name) {
  if (!name) return '📚';
  for (const [key, emoji] of SUBJECT_EMOJI) {
    if (name.includes(key)) return emoji;
  }
  return '📚';
}

const state = {
  days: [],
  subjects: [],
  tasks: { active: [], expired: [] },
  announcements: [],
  settings: {},
};

// ---------- API ----------
async function api(path) {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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

// تاریخ روزِ index هفته ایران در جاری‌ترین هفته
function dateOfIranDay(dayIdx) {
  const now = new Date();
  const today = iranDayIndex(now);
  const d = new Date(now);
  d.setDate(now.getDate() + (dayIdx - today));
  return d;
}

/** درس بعدیِ امروز را پیدا می‌کند (بر اساس ساعت فعلی تهران) */
function nextLessonToday() {
  const todayIdx = iranDayIndex(new Date());
  const lessons = (state.days[todayIdx] || [])
    .filter((l) => l.period <= (periodsPerDay(todayIdx) || 12)); // دوشنبه ۳ زنگ، جمعه تعطیل
  if (!lessons.length) return null;
  const now = new Date();
  const tehran = new Date(now.getTime() + 3.5 * 3600_000);
  const hhmm = `${String(tehran.getUTCHours()).padStart(2, '0')}:${String(tehran.getUTCMinutes()).padStart(2, '0')}`;
  return lessons.find((l) => l.start_time > hhmm) ?? null;
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
  const now = new Date();
  const tehran = new Date(now.getTime() + 3.5 * 3600_000);
  const hh = String(tehran.getUTCHours()).padStart(2, '0');
  const mm = String(tehran.getUTCMinutes()).padStart(2, '0');
  $('#brandClock').textContent = faDigits(`${hh}:${mm}`);
}

// ---------- هیرو ----------
function renderHero() {
  const maxPeriods = (d) => periodsPerDay(d) || 12;
  const dayLessons = (d) => (state.days[d] ?? []).filter((l) => l.period <= maxPeriods(d));
  const totalLessons = state.days.reduce((s, _, d) => s + dayLessons(d).length, 0);
  const totalHw = state.days.reduce((s, _, d) => s + dayLessons(d).filter((l) => l.homework).length, 0);
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
    ' درس در هفته'));
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
function lessonCard(lesson) {
  const hw = lesson.homework;
  const card = el('button', {
    class: `lesson-card sub-${lesson.color_key}`,
    type: 'button',
    onclick: () => openLesson(lesson.id),
    'aria-label': `${lesson.subject_name}، زنگ ${faDigits(lesson.period)}، ${faTime(lesson.start_time)} تا ${faTime(lesson.end_time)}${hw ? `، تکلیف: ${hw.title}` : ''}`,
  });

  const top = el('div', { class: 'lesson-card__top' },
    el('span', { class: 'lesson-card__period', text: faDigits(lesson.period), 'aria-hidden': 'true' }),
    el('span', { class: 'lesson-card__emoji', text: subjectEmoji(lesson.subject_name), 'aria-hidden': 'true' }),
    el('span', { class: 'lesson-card__subject', text: lesson.subject_name }),
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

function renderTimetable() {
  const grid = $('#ttGrid');
  grid.textContent = '';
  const todayIdx = iranDayIndex(new Date());
  let anyLessons = false;

  for (let d = 0; d < 7; d++) {
    const lessons = state.days[d] || [];
    anyLessons = anyLessons || lessons.length > 0;
    const col = el('div', {
      class: `day-col${d === todayIdx ? ' day-col--today' : ''}`,
      'data-day': d,
      'aria-label': `روز ${WEEK_DAY_NAMES[d]}`,
    });
    const head = el('div', { class: 'day-col__head' },
      el('span', { class: 'day-col__name', text: WEEK_DAY_NAMES[d] }),
      d === todayIdx ? el('span', { class: 'day-col__today-tag', text: 'امروز' }) : null,
    );
    head.append(el('span', { class: 'day-col__date', text: formatJalali(dateOfIranDay(d), { withYear: false }) }));
    col.append(head);

    if (!lessons.length) {
      col.append(el('div', { class: 'day-empty' },
        el('span', { class: 'face', text: d === 6 ? '🛌' : '☁️' }),
        el('div', { text: d === 6 ? 'تعطیل آخر هفته' : 'کلاسی نیست؛ نفس بکش!' }),
      ));
    } else {
      // فقط زنگ‌های مجاز روز (دوشنبه ۳ زنگ، جمعه تعطیل) — اضافه‌ها نادیده گرفته می‌شوند
      const maxP = periodsPerDay(d) || 12;
      for (const lesson of lessons.filter((l) => l.period <= maxP)) col.append(lessonCard(lesson));
    }
    grid.append(col);
  }

  if (!anyLessons) {
    $('#heroSub').textContent = 'هنوز برنامه‌ای ثبت نشده است؛ به‌زودی توسط سرِ کلاس تکمیل می‌شود.';
  }
  $('#updatedAt').textContent = faDigits(new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }));
  renderDots();
  updateScrollState();
}

// ---------- نقطه‌های راهنما و فلش‌ها ----------
function renderDots() {
  const dots = $('#ttDots');
  dots.textContent = '';
  const todayIdx = iranDayIndex(new Date());
  for (let d = 0; d < 7; d++) {
    dots.append(el('button', {
      class: `tt-dot${d === todayIdx ? ' tt-dot--today' : ''}`,
      type: 'button',
      'data-day': d,
      'aria-label': WEEK_DAY_NAMES[d],
      onclick: () => scrollToDay(d),
    }));
  }
  updateDots();
}

function updateDots() {
  const scroll = $('#ttScroll');
  const cols = [...document.querySelectorAll('.day-col')];
  if (!cols.length) return;
  const center = scroll.scrollLeft + scroll.clientWidth / 2;
  let closest = 0;
  let closestDist = Infinity;
  for (const col of cols) {
    const c = col.offsetLeft + col.offsetWidth / 2;
    const dist = Math.abs(c - center);
    if (dist < closestDist) { closestDist = dist; closest = Number(col.dataset.day); }
  }
  for (const dot of document.querySelectorAll('.tt-dot')) {
    dot.classList.toggle('tt-dot--active', Number(dot.dataset.day) === closest);
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

function scrollToDay(dayIdx, smooth = true) {
  const scroll = $('#ttScroll');
  const col = document.querySelector(`.day-col[data-day="${dayIdx}"]`);
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
  scrollToDay(iranDayIndex(new Date()), smooth);
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
  $('#detailTitle').textContent = `${subjectEmoji(lesson.subject_name)} ${lesson.subject_name} — ${WEEK_DAY_NAMES[lesson.day]}`;
  const body = $('#detailBody');
  body.textContent = '';

  const wrap = el('div', { class: 'detail-lesson fade-up' });

  wrap.append(el('div', { class: `detail-hero sub-${lesson.color_key}` },
    el('div', { class: 'detail-hero__period', text: `زنگ ${faDigits(lesson.period)}` }),
    el('div', {},
      el('h3', { class: 'detail-hero__subject', text: lesson.subject_name }),
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
async function loadAll() {
  const results = await Promise.allSettled([
    api('/api/schedule'), api('/api/tasks'), api('/api/announcements'), api('/api/settings'),
  ]);
  const [sched, tasks, anns, settings] = results;
  if (sched.status === 'fulfilled') state.days = sched.value.days;
  if (tasks.status === 'fulfilled') state.tasks = { active: tasks.value.active, expired: tasks.value.expired };
  if (anns.status === 'fulfilled') state.announcements = anns.value.announcements;
  if (settings.status === 'fulfilled') state.settings = settings.value.settings;

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length === 4) toast('اتصال به سرور برقرار نشد.', 'error');
  else if (failed.length) toast('بخشی از اطلاعات بارگذاری نشد.', 'error');

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
