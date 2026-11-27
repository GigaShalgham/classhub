// درس من — admin panel logic
import { faDigits, formatJalali, formatJalaliDateTime, countdown, WEEK_DAY_NAMES, KIND_LABELS, KIND_ICONS, JALALI_MONTHS, toJalali, toJalaliParts, fromJalali, iranDayIndex, rollingWindow, weekParity, tehranLocalDate, todayJalali, tehranDayIndex, tehranHHMM, tehranDateISO } from './utils.js'
import { createJalaliField } from './jdate.js';
import { periodsPerDay, periodTimes, setBells, getBells, classDays, bellsOfDay } from './schedule.js';

// آینه‌ی گیت‌هاب صفحه‌ی ادمین را هم دارد؛ فراخوانی‌های API همیشه به سایت
// زنده می‌روند. __API_BASE__ / __IS_MIRROR__ فقط در نسخه‌ی آینه
// (publish_mirror.py) تزریق می‌شوند.
const API_BASE = window.__API_BASE__ || '';
const IS_MIRROR = Boolean(window.__IS_MIRROR__);
const LIVE_ORIGINS = [
  'https://school.gigaspaceturnip.workers.dev',
  'https://www.the-big-school.de5.net',
];

// توکن نشست: در نسخه‌ی زنده کوکی httpOnly کار می‌کند؛ در آینه کوکی
// کراس‌سایتی ارسال نمی‌شود (SameSite=Lax)، پس توکن لاگین را نگه می‌داریم
// و با هدر Authorization می‌فرستیم. سرور هر دو را می‌پذیرد.
const TOKEN_KEY = 'classhub_admin_token';
function storedToken() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
function storeToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } }

// ایموجی اختصاصی هر درس (همان نگاشت صفحه دانش‌آموز)
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

const $ = (sel) => document.querySelector(sel);

// تاریخِ امروز تهران به شکل YYYY-MM-DD
function tehranTodayISO() {
  return new Date(Date.now() + 3.5 * 3600_000).toISOString().slice(0, 10);
}

// شنبه‌ی هفته‌ای که تاریخِ داده‌شده در آن است (YYYY-MM-DD)
function saturdayOf(dateISO) {
  const d = new Date(dateISO + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0=Sunday…6=Saturday
  const back = (dow + 1) % 7; // شنبه‌محور: 0=شنبه
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

// شنبه‌ی جاری/مبنا + n هفته
function shiftSaturday(weeks) {
  // مبنا وقتی هفته‌ای انتخاب نشده، شنبه‌ی «هفته‌ی درسیِ فعال» است — نه خودِ امروز
  // (با امروزِ غیرشنبه، تاریخِ همه‌ی روزها ۶ روز جابه‌جا می‌شد)
  const base = viewSaturday();
  const d = new Date(base + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

/**
 * شنبه‌ی هفته‌ی تقویمیِ حاویِ امروزِ تهران — مرجعِ برچسب‌های پنل.
 * برچسب‌ها همیشه تقویم‌محورند («هفته‌ی جاری» = هفته‌ای که امروز در آن است)
 * تا با صفحه‌ی دانش‌آموز و تقویم یکی بماند.
 */
function calendarSaturday() {
  return saturdayOf(tehranTodayISO());
}

/**
 * شنبه‌ی «هفته‌ی درسیِ فعال»: تا وقتی زنگی از امروز باقی مانده، همان هفته‌ی
 * تقویمی؛ وگرنه هفته‌ی اولین روزِ درسیِ بعد. نمایِ پیش‌فرضِ پنل همین است —
 * پنجشنبه/جمعه و بعدِ آخرین زنگ، تکلیفِ جدید طبیعتاً برای هفته‌ی پیشِ رو ثبت
 * می‌شود و گرید/لیست هم از همان هفته تاریخ می‌گیرند؛ فقط برچسب‌ها تقویم‌محور
 * می‌مانند (focusWeekLabel) تا «هفته‌ی جاری» بی‌معنا نشود.
 */
function activeSchoolSaturday() {
  const todayIdx = tehranDayIndex();
  const lastEnd = bellsOfDay(todayIdx).reduce((mx, b) => (b.end_time > mx ? b.end_time : mx), '');
  if (lastEnd && tehranHHMM(Date.now()) < lastEnd) return calendarSaturday();
  for (let k = 1; k <= 6; k++) {
    const idx = (todayIdx + k) % 7;
    if (periodsPerDay(idx) > 0) return saturdayOf(tehranDateISO(Date.now() + k * 86_400_000));
  }
  return calendarSaturday();
}

// هفته‌ی در حال مرور: انتخابِ صریحِ مدیر، وگرنه «هفته‌ی درسیِ فعال»
function viewSaturday() {
  return state.focusSaturday ?? activeSchoolSaturday();
}

// شمسیِ یک تاریخِ «YYYY-MM-DD» (میلادیِ تهران) — با اجزای UTC، مستقل از منطقه‌ی زمانی مرورگر
function jalaliOfISO(dateISO) {
  const dt = new Date(dateISO + 'T00:00:00Z');
  return toJalaliParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

// «YYYY-MM-DD» + n روز
function shiftDateISO(dateISO, days) {
  const d = new Date(dateISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// «۷ آذر تا ۱۳ آذر» — بازه‌ی هفته‌ای که گرید برایش باز است
function focusWeekRangeLabel() {
  const a = jalaliOfISO(dateOfDayInFocus(0));
  const b = jalaliOfISO(dateOfDayInFocus(6));
  return `${faDigits(a.jd)} ${JALALI_MONTHS[a.jm - 1]} تا ${faDigits(b.jd)} ${JALALI_MONTHS[b.jm - 1]}`;
}

// تاریخِ روز d (0=شنبه) در هفته‌ی در حال مرور
function dateOfDayInFocus(d) {
  const base = new Date(viewSaturday() + 'T00:00:00Z');
  base.setUTCDate(base.getUTCDate() + d);
  return base.toISOString().slice(0, 10);
}

// برچسب شمسی هفته‌ی در حال مرور — نسبت به هفته‌ی تقویمیِ جاری (calendarSaturday)
function focusWeekLabel() {
  const sat = viewSaturday();
  const cur = calendarSaturday();
  if (sat === cur) return 'هفته‌ی جاری';
  if (sat < cur) {
    const wk = Math.round((new Date(cur) - new Date(sat)) / (7 * 86_400_000));
    return `${faDigits(wk)} هفته قبل`;
  }
  const wk = Math.round((new Date(sat) - new Date(cur)) / (7 * 86_400_000));
  return `${faDigits(wk)} هفته بعد`;
}

const state = {
  subjects: [],
  scheduleDays: [],
  bells: [],
  // هفته‌ای که گرید برنامه برایش باز است (تاریخِ شنبه‌ی آن، YYYY-MM-DD)؛
  // null = «هفته‌ی درسیِ فعال» (تا آخرین زنگِ امروز همین هفته، بعدش هفته‌ی پیشِ رو)
  focusSaturday: null,
  tasks: { active: [], expired: [] },
  announcements: [],
  settings: {},
  me: null,
  hwLessonId: null,   // lesson whose homework is being edited
  tg: { configured: false }, // انبار فایل تلگرام
  pendingUploads: [], // newly picked File objects for homework
  handouts: [],       // جزوات
  pendingHandoutFiles: [], // فایل‌های جدید جزوه
};

// ---------- api ----------
// مهلت + تلاش مجدد برای شبکه ضعیف: بدون این، fetch روی خطِ پکت‌انداز ممکن است
// تا ابد معطل بماند و پنل «نصفه» بماند. نوشتن‌ها (POST/PUT/DELETE) فقط یک‌بار
// امتحان می‌شوند تا عملیات دوبار ثبت نشود.
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchWithTimeout(path, opts, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(path, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function api(path, options = {}) {
  const opts = { headers: {}, ...options };
  if (opts.body && !(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  // در آینه: درخواست به سایت زنده + توکن (کوکی کراس‌سایتی ارسال نمی‌شود)
  const url = path.startsWith('http') ? path : (window.__API_BASE__ ?? API_BASE) + path;
  const token = storedToken();
  if (token && !opts.headers['Authorization']) opts.headers['Authorization'] = `Bearer ${token}`;
  const isRead = !opts.method || opts.method === 'GET';
  const timeouts = isRead ? [10_000, 20_000, 35_000] : [30_000];
  let lastErr;
  for (let attempt = 0; attempt < timeouts.length; attempt++) {
    try {
      const res = await fetchWithTimeout(url, opts, timeouts[attempt]);
      let data = {};
      try { data = await res.json(); } catch { /* empty body */ }
      if (!res.ok) {
        const err = new Error(data.error || `خطای ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return data;
    } catch (err) {
      lastErr = err;
      if (err.status) throw err; // خطای واقعی سرور: دوباره زدن بی‌فایده است
      const retryable = err.name === 'AbortError' || err.name === 'TypeError';
      if (!retryable || attempt === timeouts.length - 1) throw err;
      await sleep(1_200 * (attempt + 1));
    }
  }
  throw lastErr;
}

// ---------- dom helpers ----------
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
  }, 3400);
}

function confirmDialog(text) {
  return new Promise((resolve) => {
    $('#confirmText').textContent = text;
    const overlay = $('#confirmOverlay');
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('overlay--open'));
    const done = (val) => {
      overlay.classList.remove('overlay--open');
      setTimeout(() => { overlay.hidden = true; }, 250);
      $('#confirmYes').onclick = null;
      $('#confirmNo').onclick = null;
      resolve(val);
    };
    $('#confirmYes').onclick = () => done(true);
    $('#confirmNo').onclick = () => done(false);
  });
}

// ---------- overlays ----------
function openOverlay(overlay) {
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('overlay--open'));
  document.body.style.overflow = 'hidden';
}
function closeOverlay(overlay) {
  overlay.classList.remove('overlay--open');
  document.body.style.overflow = '';
  setTimeout(() => { overlay.hidden = true; }, 340);
}

// ---------- login ----------
async function checkAuth() {
  try {
    const data = await api('/api/admin/auth/me');
    state.me = data.admin;
    return true;
  } catch {
    return false;
  }
}

// در آینه، انتخاب سرور زنده (اگر یک دامنه فیلتر/قطع بود، بقیه امتحان شوند)
function selectedOrigin() { return localStorage.getItem('classhub_live_origin') || ''; }
function applyOrigin(origin) {
  try {
    origin ? localStorage.setItem('classhub_live_origin', origin) : localStorage.removeItem('classhub_live_origin');
  } catch { /* private mode */ }
  window.__API_BASE__ = origin;
}
function initMirrorOriginPicker() {
  if (!IS_MIRROR) return;
  const sub = $('#loginSub');
  if (!sub) return;
  const wrap = document.createElement('div');
  wrap.className = 'field';
  wrap.style.marginTop = '0.75rem';
  const label = document.createElement('label');
  label.className = 'field__label';
  label.htmlFor = 'mirrorOrigin';
  label.textContent = 'سرور متصل (سایت زنده‌ی درس من)';
  const select = document.createElement('select');
  select.className = 'input';
  select.id = 'mirrorOrigin';
  for (const o of LIVE_ORIGINS) {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o.replace('https://', '');
    if (o === (selectedOrigin() || LIVE_ORIGINS[0])) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => applyOrigin(select.value));
  wrap.append(label, select);
  sub.after(wrap);
  applyOrigin(selectedOrigin() || LIVE_ORIGINS[0]);
}

async function handleLoginInner() {
  const data = await api('/api/admin/auth/login', {
    method: 'POST',
    body: { username: $('#loginUser').value.trim(), password: $('#loginPass').value },
  });
  storeToken(data.token); // برای آینه: توکن نگه می‌داریم (کوکی کراس‌سایتی نیست)
  state.me = data.admin;
  toast('خوش آمدید! 🌸', 'success');
  showAdmin();
}

async function handleLogout() {
  try { await api('/api/admin/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  storeToken(null);
  state.me = null;
  location.reload();
}

function showAdmin() {
  $('#loginView').classList.add('hidden');
  $('#adminView').classList.remove('hidden');
  $('#adminName').textContent = state.me?.username || 'مدیر';
  refreshAll();
}

// ---------- بارگذاری فایل با نوار پیشرفت (XHR برای رویداد progress) ----------
let activeUploadXhr = null;

function setUploadProgress(loaded, total, processing = false) {
  const pct = total ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  const fill = $('#uploadBarFill');
  fill.style.width = (processing ? 100 : pct) + '%';
  fill.classList.toggle('upload-bar__fill--processing', processing);
  $('#uploadPct').textContent = processing ? 'در حال پردازش…' : `${faDigits(pct)}٪`;
  $('#uploadBytes').textContent = (total && !processing) ? `${formatSizeFa(loaded)} از ${formatSizeFa(total)}` : '';
}

function showUploadOverlay() {
  const ov = $('#uploadOverlay');
  ov.hidden = false;
  requestAnimationFrame(() => ov.classList.add('overlay--open'));
}

function hideUploadOverlay() {
  const ov = $('#uploadOverlay');
  ov.classList.remove('overlay--open');
  setTimeout(() => { ov.hidden = true; }, 250);
}

/** یک فایل را با رویداد پیشرفت بفرست — همان قرارداد api() اما با progress */
function uploadWithProgress(fd, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    activeUploadXhr = xhr;
    xhr.open('POST', `${window.__API_BASE__ ?? API_BASE}/api/admin/attachments`);
    const token = storedToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.timeout = 180_000; // فایل بزرگ روی شبکه ضعیف
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText || '{}'); } catch { /* بدنه‌ی خالی */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `خطای ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('اتصال به سرور برقرار نشد.'));
    xhr.ontimeout = () => reject(new Error('شبکه کند است — زمان بارگذاری تمام شد.'));
    xhr.onabort = () => { const e = new Error('لغو شد'); e.aborted = true; reject(e); };
    xhr.send(fd);
  });
}

/** چند فایل را پشت‌سرهم با نوار پیشرفت و امکان لغو بالا بفرست؛ تعداد موفق را برمی‌گرداند */
async function uploadFilesWithProgress(files, parentType, parentId) {
  if (!files.length) return 0;
  $('#uploadTitle').textContent = 'در حال بارگذاری فایل…';
  showUploadOverlay();
  let uploaded = 0;
  let aborted = false;
  for (const [i, file] of files.entries()) {
    $('#uploadFileName').textContent = file.name;
    $('#uploadCount').textContent = files.length > 1 ? `فایل ${faDigits(i + 1)} از ${faDigits(files.length)}` : '';
    setUploadProgress(0, file.size);
    try {
      const fd = new FormData();
      fd.append('parentType', parentType);
      fd.append('parentId', String(parentId));
      fd.append('file', file);
      await uploadWithProgress(fd, (loaded, total) => {
        setUploadProgress(loaded, total, loaded >= total); // انتها = فاز پردازش سرور
      });
      uploaded += 1;
    } catch (err) {
      if (err.aborted) { aborted = true; break; }
      toast(`آپلود «${file.name}» ناموفق: ${err.message}`, 'error');
    }
  }
  hideUploadOverlay();
  activeUploadXhr = null;
  if (aborted) toast(`بارگذاری لغو شد — ${faDigits(uploaded)} از ${faDigits(files.length)} فایل آپلود شد.`, 'error');
  return uploaded;
}

// ---------- تب زنگ‌ها (ساختار زنگ‌های هفته) ----------
// پیش‌نویسِ محلی: تا «ذخیره» چیزی روی سرور نمی‌رود
let bellsDraft = null;
let bellsDirty = false;

function renderBells() {
  const wrap = $('#bellsDays');
  if (!wrap) return;
  // پیش‌نویس از زنگ‌های نرمال‌شده‌ی schedule.js (نه پاسخ خام API با کلیدهای camelCase)
  if (!bellsDraft) bellsDraft = JSON.parse(JSON.stringify(getBells()));
  wrap.textContent = '';
  for (let d = 0; d < 7; d++) {
    const rows = bellsDraft.filter((b) => b.day === d).sort((a, b) => a.start_time.localeCompare(b.start_time));
    const card = el('div', { class: `bell-day${rows.length ? '' : ' bell-day--off'}` });
    const head = el('div', { class: 'bell-day__head' },
      el('span', { class: 'bell-day__name', text: WEEK_DAY_NAMES[d] }),
      el('span', { class: 'bell-day__count', text: rows.length ? `${faDigits(rows.length)} زنگ` : 'تعطیل / بدون زنگ' }),
    );
    card.append(head);
    const list = el('div', { class: 'bell-day__rows' });
    rows.forEach((b, i) => {
      const row = el('div', { class: 'bell-row' },
        el('span', { class: 'bell-row__n', text: `زنگ ${faDigits(i + 1)}` }),
      );
      const sIn = el('input', { class: 'input bell-row__time', type: 'time', value: b.start_time, 'aria-label': `شروع زنگ ${i + 1} ${WEEK_DAY_NAMES[d]}` });
      row.append(sIn, el('span', { class: 'bell-row__sep', text: 'تا' }));
      const eIn = el('input', { class: 'input bell-row__time', type: 'time', value: b.end_time, 'aria-label': `پایان زنگ ${i + 1} ${WEEK_DAY_NAMES[d]}` });
      row.append(eIn);
      // هر تغییر ورودی، همان لحظه در پیش‌نویس نوشته می‌شود
      const touch = () => {
        bellsDirty = true;
        $('#bellsStatus').textContent = 'تغییرات ذخیره نشده — «ذخیره‌ی زنگ‌ها» را بزنید.';
      };
      sIn.addEventListener('change', () => { if (sIn.value) { b.start_time = sIn.value; touch(); } });
      eIn.addEventListener('change', () => { if (eIn.value) { b.end_time = eIn.value; touch(); } });
      const del = el('button', { class: 'btn btn--danger btn--sm', type: 'button', title: 'حذف این زنگ', 'aria-label': `حذف زنگ ${i + 1} ${WEEK_DAY_NAMES[d]}` }, '🗑️');
      del.addEventListener('click', () => {
        bellsDraft = bellsDraft.filter((x) => x !== b);
        bellsDirty = true;
        renderBells();
      });
      row.append(del);
      list.append(row);
    });
    card.append(list);
    const add = el('button', { class: 'btn btn--ghost btn--sm bell-day__add', type: 'button' }, '＋ افزودن زنگ');
    add.addEventListener('click', () => {
      // زنگ جدید: شروع = پایانِ زنگِ قبلی + ۱۵ دقیقه تفریح؛ مدت ۷۵ دقیقه
      const lastEnd = rows.length ? rows[rows.length - 1].end_time : '07:45';
      const [h, m] = lastEnd.split(':').map(Number);
      const startMin = Math.min(h * 60 + m + 15, 22 * 60);
      const endMin = Math.min(startMin + 75, 23 * 60 + 45);
      const fmt = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
      bellsDraft.push({ day: d, period: rows.length + 1, start_time: fmt(startMin), end_time: fmt(endMin) });
      bellsDirty = true;
      renderBells();
    });
    card.append(add);
    wrap.append(card);
  }
  $('#bellsStatus').textContent = bellsDirty ? 'تغییرات ذخیره نشده — «ذخیره‌ی زنگ‌ها» را بزنید.' : '';
}

async function saveBells() {
  if (!bellsDraft) return;
  // مرتب‌سازی هر روز بر اساس ساعت شروع + شماره‌گذاری مجدد
  const out = [];
  for (let d = 0; d < 7; d++) {
    const rows = bellsDraft.filter((b) => b.day === d).sort((a, b) => a.start_time.localeCompare(b.start_time));
    rows.forEach((b, i) => out.push({ day: d, period: i + 1, start: b.start_time, end: b.end_time }));
  }
  try {
    await api('/api/admin/bells', { method: 'PUT', body: { bells: out } });
    bellsDirty = false;
    toast('زنگ‌ها ذخیره شد ✅', 'success');
    await refreshAll();
    renderGrid();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function bellsTemplate() {
  // الگوی رایج مدارس: شنبه تا چهارشنبه ۴ زنگِ ۷۵ دقیقه‌ای از ۰۷:۴۵
  const tpl = [['07:45', '09:00'], ['09:15', '10:30'], ['11:00', '12:15'], ['12:30', '13:45']];
  bellsDraft = [];
  for (let d = 0; d <= 4; d++) {
    tpl.forEach(([s, e], i) => bellsDraft.push({ day: d, period: i + 1, start_time: s, end_time: e }));
  }
  bellsDirty = true;
  renderBells();
  toast('الگو آماده شد — اگر مناسب است «ذخیره‌ی زنگ‌ها» را بزنید.', 'info');
}

// ---------- بنر راه‌اندازی برای نصب تازه ----------
function updateSetupBanner() {
  const banner = $('#setupBanner');
  if (!banner) return;
  const hasBells = getBells().length > 0;
  const hasSubjects = (state.subjects ?? []).length > 0;
  const hasLessons = (state.scheduleDays ?? []).some((d) => Array.isArray(d) && d.length > 0);
  if (hasBells && hasSubjects && hasLessons) {
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  banner.textContent = '';
  const step = (n, done, title, desc, btn) => el('div', { class: `setup-step${done ? ' setup-step--done' : ''}` },
    el('span', { class: 'setup-step__n', text: done ? '✅' : faDigits(n) }),
    el('div', { class: 'setup-step__body' },
      el('div', { class: 'setup-step__title', text: title }),
      el('div', { class: 'setup-step__desc', text: desc }),
      btn),
  );
  const goto = (tab, label) => {
    const b = el('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, label);
    b.addEventListener('click', () => {
      const tabBtn = document.querySelector(`.admin-tab[data-tab="${tab}"]`);
      tabBtn?.click();
    });
    return b;
  };
  banner.append(
    el('h3', { class: 'setup-banner__title', text: '🚀 راه‌اندازی پنل کلاس' }),
    step(1, hasBells, 'ساخت زنگ‌ها', 'ساعت شروع و پایان زنگ‌های هر روز هفته را تعیین کنید (یا از الگوی آماده استفاده کنید).', goto('bells', 'رفتن به زنگ‌ها')),
    step(2, hasSubjects, 'افزودن درس‌ها', 'فهرست درس‌های کلاس را با رنگ دلخواه بسازید.', goto('subjects', 'رفتن به درس‌ها')),
    step(3, hasLessons, 'چیدن برنامه‌ی هفتگی', 'در جدول برنامه، درسِ هر زنگ را انتخاب و ذخیره کنید. زنگ‌های گردشی هم همان‌جا تنظیم می‌شوند.', goto('lessons', 'رفتن به برنامه')),
  );
}

// ---------- data refresh ----------
async function refreshAll() {
  const [sched, tasks, anns, subjects, settings, tg, houts] = await Promise.allSettled([
    api('/api/schedule'), api('/api/tasks'), api('/api/announcements'), api('/api/subjects'), api('/api/settings'), api('/api/admin/telegram'), api('/api/admin/handouts'),
  ]);
  // وضعیت انبار تلگرام از ابتدای بوت لازم است: سقف فایل و برچسب‌ها به آن وابسته‌اند
  if (tg.status === 'fulfilled') { state.tg = tg.value; updateTgUi(); }
  if (sched.status === 'fulfilled') {
    state.scheduleDays = sched.value.days;
    state.bells = sched.value.bells ?? [];
    setBells(state.bells);
    renderBells();
  }
  if (tasks.status === 'fulfilled') state.tasks = { active: tasks.value.active, expired: tasks.value.expired };
  if (anns.status === 'fulfilled') state.announcements = anns.value.announcements;
  if (houts.status === 'fulfilled') state.handouts = houts.value.handouts ?? [];
  if (subjects.status === 'fulfilled') state.subjects = subjects.value.subjects;
  if (settings.status === 'fulfilled') state.settings = settings.value.settings;
  // کلیدهای API سبک‌اند — در refresh اصلی نمی‌آیند؛ موقع بازکردن تب بار می‌شوند
  if (!state.apiKeys) refreshApiKeys().catch(() => {});
  // بنر بعد از آماده‌شدن همه‌ی state (subjects/bells/lessons) ارزیابی می‌شود —
  // قبلاً subjects هنوز خالی بود و بنر هرگز پنهان نمی‌شد.
  updateSetupBanner();
  renderLessonsTab();
  renderTasksTab();
  renderAnnsTab();
  renderHandoutsTab();
  renderSubjectsTab();
  renderCalendar();
  fillSettingsForm();
  renderRotationCard();
}

// ---------- lessons tab: weekly grid editor ----------
// هر خانه گرید = (day, period). درس انتخابی با lessonهای سرور همگام می‌شود.
const grid = {
  cells: {},     // "d-p" -> { lessonId, subjectId, hwSet }
  dirty: new Set(),
};

function fillSelects() {
  const taskSubjSel = $('#taskSubject');
  taskSubjSel.textContent = '';
  taskSubjSel.append(el('option', { value: '', text: '— بدون درس —' }));
  for (const s of state.subjects) {
    taskSubjSel.append(el('option', { value: s.id, text: s.name }));
  }
}

function gridKey(day, period) { return `${day}-${period}`; }

function renderGrid() {
  const head = $('#gridHead');
  const body = $('#gridBody');
  head.textContent = '';
  body.textContent = '';

  // سرستون: زنگ + بازه زمانی — از زنگ‌های پیکربندی‌شده (بیشترین تعداد زنگ بین روزها)
  const days = classDays();
  const maxP = days.reduce((m, d) => Math.max(m, periodsPerDay(d)), 0);
  const hr = el('tr', {},
    el('th', { text: 'زنگ ↓', style: 'text-align:right;' }),
  );
  for (let p = 1; p <= maxP; p++) {
    // بازه‌ی زمانی هر ستون از اولین روزِ دارای این زنگ
    let range = '';
    for (const d of days) {
      const bt = periodTimes(d, p);
      if (bt) { range = `${bt[0]}–${bt[1]}`; break; }
    }
    hr.append(el('th', {}, `${faDigits(p)}`,
      el('span', { class: 'grid-day-sub', text: range })));
  }
  head.append(hr);

  // سلول‌ها از داده سرور — نشانگر 📝 از تکلیفِ همان روز در هفته‌ی در حال مرور
  grid.cells = {};
  for (let d = 0; d < 7; d++) {
    const hwDate = dateOfDayInFocus(d);
    for (const l of state.scheduleDays[d] || []) {
      grid.cells[gridKey(d, l.period)] = {
        lessonId: l.id, subjectId: l.subject_id, altSubjectId: l.alt_subject_id ?? null,
        hwSet: Boolean(l.hwByDate?.[hwDate]),
      };
    }
  }

  if (!days.length) {
    // هنوز زنگی ساخته نشده — راه‌اندازی تازه
    body.append(el('tr', {}, el('td', {
      class: 'grid-empty',
      colspan: String(maxP + 1),
      text: 'هنوز زنگی ساخته نشده است. از تب «🔔 زنگ‌ها» ساختار روزهای کلاس را بسازید.',
    })));
  }
  const todayISO = tehranTodayISO();
  for (const d of days) {
    const dayBells = bellsOfDay(d);
    const dayISO = dateOfDayInFocus(d);
    const j = jalaliOfISO(dayISO);
    // تاریخِ واقعیِ این روز در هفته‌ی در حال مرور، تا معلوم باشد تکلیف برای کدام تاریخ ثبت می‌شود
    const when = [`${faDigits(j.jd)} ${JALALI_MONTHS[j.jm - 1]}`];
    if (dayISO === todayISO) when.push('امروز');
    if (dayBells.length) when.push(`تا ${dayBells[dayBells.length - 1].end_time}`);
    const tr = el('tr', { class: 'grid-row' });
    tr.append(el('td', { class: 'grid-row__day' },
      WEEK_DAY_NAMES[d],
      el('small', { text: when.join(' · ') })));
    for (const b of dayBells) {
      tr.append(gridCellEl(d, b.period));
    }
    body.append(tr);
  }
  grid.dirty.clear();
  updateGridStatus();
}

function gridCellEl(day, period) {
  const bt = periodTimes(day, period) ?? ['--:--', '--:--'];
  const [t0, t1] = bt;
  const cellData = grid.cells[gridKey(day, period)];
  const td = el('td', { class: 'grid-cell' });

  const sel = el('select', { class: 'grid-cell__select', 'aria-label': `درس ${WEEK_DAY_NAMES[day]} زنگ ${faDigits(period)}` });
  sel.append(el('option', { value: '', text: '— خالی —' }));
  for (const s of state.subjects) {
    sel.append(el('option', { value: s.id, text: s.name }));
  }
  sel.value = cellData?.subjectId ?? '';
  if (!cellData?.subjectId) sel.classList.add('grid-cell__select--empty');

  // درس گردشی (دوم): زنگ‌هایی که هفته‌به‌هفته بین دو درس می‌چرخند
  const altSel = el('select', { class: 'grid-cell__select grid-cell__select--alt', 'aria-label': `درس گردشی ${WEEK_DAY_NAMES[day]} زنگ ${faDigits(period)}` });
  const rebuildAlt = () => {
    altSel.textContent = '';
    altSel.append(el('option', { value: '', text: '🔄 گردشی: ندارد' }));
    const mainId = Number(sel.value);
    for (const s of state.subjects) {
      if (Number(s.id) === mainId) continue;
      altSel.append(el('option', { value: s.id, text: `🔄 گردشی: ${s.name}` }));
    }
    // اگر درس اصلی تغییر کرده، انتخاب قبلی گردشی معتبر می‌ماند مگر همانِ اصلی شود
    const curVal = cellData && Number(sel.value) === Number(cellData.subjectId) ? cellData.altSubjectId : null;
    altSel.value = curVal ?? '';
    altSel.classList.toggle('grid-cell__select--hidden', !sel.value);
  };
  rebuildAlt();
  const onSelChange = () => {
    sel.classList.toggle('grid-cell__select--empty', !sel.value);
    td.classList.add('grid-cell--dirty');
    grid.dirty.add(gridKey(day, period));
    updateGridStatus();
  };
  sel.addEventListener('change', () => { onSelChange(); rebuildAlt(); });
  altSel.addEventListener('change', () => {
    td.classList.add('grid-cell--dirty');
    grid.dirty.add(gridKey(day, period));
    updateGridStatus();
  });

  const hwBtn = el('button', {
    class: `grid-cell__hw${cellData?.hwSet ? ' grid-cell__hw--set' : ''}`,
    type: 'button',
    title: cellData?.hwSet ? 'ویرایش تکلیف' : 'ثبت تکلیف',
    'aria-label': `تکلیف ${WEEK_DAY_NAMES[day]} زنگ ${faDigits(period)}`,
  }, '📝');
  hwBtn.addEventListener('click', () => {
    const cur = grid.cells[gridKey(day, period)];
    if (!cur?.subjectId) {
      toast('اول درس این خانه را انتخاب و برنامه را ذخیره کنید.', 'error');
      return;
    }
    if (!cur.lessonId) {
      toast('برای فعال‌شدن دکمه تکلیف، اول برنامه را ذخیره کنید.', 'error');
      return;
    }
    // درس از state سرور — تکلیف برای تاریخِ همین روز در هفته‌ی در حال مرور
    const lesson = (state.scheduleDays[day] || []).find((l) => l.period === period);
    if (lesson) openHwEditor(lesson, dateOfDayInFocus(day));
  });

  const meta = el('div', { class: 'grid-cell__meta' },
    el('span', { class: 'grid-cell__time', text: `${t0}–${t1}` }),
    hwBtn);

  td.append(sel, altSel, meta);
  return td;
}

function updateGridStatus() {
  const st = $('#gridStatus');
  if (grid.dirty.size) {
    st.className = 'field__hint grid-status--dirty';
    st.textContent = `${faDigits(grid.dirty.size)} خانه تغییر کرده — ذخیره نکنید از دست می‌رود!`;
  } else {
    st.className = 'field__hint grid-status--saved';
    st.textContent = 'همه تغییرات ذخیره شده ✓';
  }
}

async function saveGrid() {
  if (!grid.dirty.size) { toast('تغییری برای ذخیره نیست.', 'info'); return; }
  const btn = $('#gridSave');
  btn.disabled = true;
  let done = 0;
  const errors = [];
  try {
    for (const key of grid.dirty) {
      const [d, p] = key.split('-').map(Number);
      const cell = grid.cells[key] ?? { lessonId: null, subjectId: null, altSubjectId: null, hwSet: false };
      const tdSel = document.querySelector(`#gridEditor select[aria-label="درس ${WEEK_DAY_NAMES[d]} زنگ ${faDigits(p)}"]`);
      const tdAlt = document.querySelector(`#gridEditor select[aria-label="درس گردشی ${WEEK_DAY_NAMES[d]} زنگ ${faDigits(p)}"]`);
      const newSubject = tdSel ? Number(tdSel.value) : null;
      const newAlt = tdAlt && tdAlt.value ? Number(tdAlt.value) : null;
      // ساعت‌ها دیگر از کلاینت فرستاده نمی‌شوند — سرور آنها را از جدول زنگ‌ها می‌گیرد
      try {
        if (!newSubject) {
          // خالی‌کردن خانه
          if (cell.lessonId) {
            await api(`/api/admin/lessons/${cell.lessonId}`, { method: 'DELETE' });
          }
        } else if (cell.lessonId) {
          await api(`/api/admin/lessons/${cell.lessonId}`, {
            method: 'PUT',
            body: { day: d, period: p, subjectId: newSubject, altSubjectId: newAlt },
          });
        } else {
          await api('/api/admin/lessons', {
            method: 'POST',
            body: { day: d, period: p, subjectId: newSubject, altSubjectId: newAlt },
          });
        }
        done += 1;
      } catch (err) {
        errors.push(`${WEEK_DAY_NAMES[d]} زنگ ${faDigits(p)}: ${err.message}`);
      }
    }
    if (errors.length) {
      toast(`ذخیره ${faDigits(done)} خانه؛ ${faDigits(errors.length)} خطا:\n${errors.join('\n')}`, 'error');
    } else {
      toast(`برنامه ذخیره شد (${faDigits(done)} خانه) ✅`, 'success');
    }
    await refreshAll();
  } finally {
    btn.disabled = false;
  }
}

async function deleteLesson(lesson) {
  const ok = await confirmDialog(`حذف «${lesson.subject_name} — ${WEEK_DAY_NAMES[lesson.day]} زنگ ${faDigits(lesson.period)}»؟ تکالیف آن هم حذف می‌شود.`);
  if (!ok) return;
  try {
    await api(`/api/admin/lessons/${lesson.id}`, { method: 'DELETE' });
    toast('درس حذف شد.', 'success');
    refreshAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderLessonsTab() {
  fillSelects();
  renderGrid();
  updateWeekNav();
  const weekNote = $('#hwWeekNote');
  if (weekNote) weekNote.textContent = `${focusWeekLabel()} (${focusWeekRangeLabel()})`;
  const list = $('#lessonsList');
  list.textContent = '';
  let count = 0;
  for (let d = 0; d < 7; d++) {
    const lessons = state.scheduleDays[d] || [];
    for (const lesson of lessons) {
      count += 1;
      const hwDate = dateOfDayInFocus(d);
      const hw = lesson.hwByDate?.[hwDate] ?? null;
      const title = lesson.alt_subject_name
        ? `${subjectEmoji(lesson.subject_name)} ${lesson.subject_name} 🔄 ${subjectEmoji(lesson.alt_subject_name)} ${lesson.alt_subject_name} — ${WEEK_DAY_NAMES[lesson.day]}، زنگ ${faDigits(lesson.period)}`
        : `${subjectEmoji(lesson.subject_name)} ${lesson.subject_name} — ${WEEK_DAY_NAMES[lesson.day]}، زنگ ${faDigits(lesson.period)}`;
      const row = el('div', { class: 'admin-row' },
        el('div', { class: 'admin-row__main' },
          el('div', { class: 'admin-row__title', text: title }),
          el('div', { class: 'admin-row__sub', text: `${faDigits(lesson.start_time)}–${faDigits(lesson.end_time)} · ${hw ? `تکلیف: ${hw.title}` : 'بدون تکلیف'}` })),
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => openHwEditor(lesson, hwDate), text: '📝 تکلیف' }),
        el('button', { class: 'btn btn--danger btn--sm', type: 'button', onclick: () => deleteLesson(lesson), text: '🗑️' }),
      );
      list.append(row);
    }
  }
  if (!count) {
    list.append(el('div', { class: 'empty-state', text: 'هنوز درسی ثبت نشده است؛ از جدول بالا برنامه هفتگی را بچینید!' }));
  }
}

// ---------- ناوبری هفته (گرید و لیست تکالیف) ----------
function updateWeekNav() {
  const label = $('#weekLabel');
  if (!label) return;
  // کنار نامِ هفته، تاریخِ واقعی‌اش هم می‌آید: «هفته‌ی جاری · ۷ آذر تا ۱۳ آذر»
  label.textContent = `${focusWeekLabel()} · ${focusWeekRangeLabel()}`;
  const back = $('#weekPrev'), fwd = $('#weekNext'), today = $('#weekToday');
  if (!back || !fwd || !today) return;
  // «برو به هفته‌ی جاری» وقتی لازم است که هفته‌ی در حال مرور، هفته‌ی تقویمیِ
  // امروز نباشد (مثلاً جمعه که پنل روی هفته‌ی درسیِ پیشِ رو باز می‌شود)
  today.classList.toggle('hidden', viewSaturday() === calendarSaturday());
  renderWeekHint();
  // روی هفته‌های خیلی دور (۲ ماه) قفل نمی‌کنیم — بازه‌ی مرئی API از ۳ هفته قبل تا ~۶ هفته بعد است
}

function setFocusWeek(sat) {
  // null = «هفته‌ی درسیِ فعال» (پویا — با گذرِ زمان، مثلاً نیمه‌شبِ آخرین روزِ
  // درسی، خودش به هفته‌ی بعد می‌غلتد). هفته‌ی تقویمی همیشه با انتخابِ صریح
  // ثبت می‌شود تا دکمه‌ی «برو به هفته‌ی جاری» همان را نشان دهد.
  state.focusSaturday = sat === activeSchoolSaturday() ? null : sat;
  renderLessonsTab();
}

// راهنمای «هفته‌ی درسی تمام شده»: وقتی زنگ‌های هفته تمام شده و مدیر روی
// هفته‌ی تقویمیِ (در حالِ پایان) مرور می‌کند، یادآوری می‌کنیم که تکلیفِ جدید
// برای هفته‌ی پیشِ روست + دکمه‌ی میان‌بر.
function renderWeekHint() {
  const hint = $('#weekHint');
  if (!hint) return;
  const schoolOver = activeSchoolSaturday() !== calendarSaturday();
  const onCalendarWeek = viewSaturday() === calendarSaturday();
  hint.classList.toggle('hidden', !(schoolOver && onCalendarWeek));
}

// نوارِ تاریخ در ادیتورِ تکلیف: تاریخِ واقعی + پرشِ ±۷ روز. تاریخِ گذشته با
// ⚠️ قرمز مشخص می‌شود تا خطای «یک هفته عقب» (ثبتِ شنبه‌ی گذشته به‌جای شنبه‌ی
// پیشِ رو — باگی که تکالیفِ جمعه را یک هفته عقب می‌انداخت) دیگر بی‌صدا نماند.
function renderHwDateNote(hwDate) {
  const note = $('#hwDateNote');
  if (!note) return;
  note.textContent = '';
  note.classList.remove('hidden');
  const isPast = hwDate < tehranTodayISO();
  const dow = (new Date(hwDate + 'T00:00:00Z').getUTCDay() + 1) % 7; // شنبه=۰
  const j = jalaliOfISO(hwDate);
  const line = el('p', {
    class: 'field__hint' + (isPast ? ' hw-date-past' : ''),
    text: `${isPast ? '⚠️ تاریخِ این تکلیف گذشته است: ' : '📅 تاریخِ تکلیف: '}${WEEK_DAY_NAMES[dow]} ${faDigits(j.jd)} ${JALALI_MONTHS[j.jm - 1]}${isPast ? ' — اگر برای هفته‌ی بعد است، «هفته‌ی بعد ↷» را بزنید.' : ''} `,
  });
  line.append(
    el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => shiftHwDate(-7), text: '↶ هفته‌ی قبل' }),
    el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => shiftHwDate(7), text: 'هفته‌ی بعد ↷' }),
  );
  note.append(line);
}

// پرشِ تاریخِ ادیتورِ باز ±۷ روز — روزِ هفته حفظ می‌شود (سرور هم تطابق روزِ
// هفته را چک می‌کند) و محتوای تایپ‌شده تا جای ممکن نگه داشته می‌شود.
async function shiftHwDate(days) {
  if (!state.hwLessonId || !state.hwDate) return;
  const lesson = findLessonById(state.hwLessonId);
  if (!lesson) return;
  const draft = {
    title: $('#hwTitleInput').value,
    description: $('#hwDesc').value,
    pages: $('#hwPages').value,
    instructions: $('#hwInstructions').value,
    notes: $('#hwNotes').value,
  };
  await openHwEditor(lesson, shiftDateISO(state.hwDate, days));
  // اگر برای تاریخِ جدید تکلیفِ قبلی نبود، پیش‌نویس برمی‌گردد
  if (!$('#hwTitleInput').value && draft.title.trim()) {
    $('#hwTitleInput').value = draft.title;
    $('#hwDesc').value = draft.description;
    $('#hwPages').value = draft.pages;
    $('#hwInstructions').value = draft.instructions;
    $('#hwNotes').value = draft.notes;
  }
}

function findLessonById(id) {
  for (const day of state.scheduleDays) {
    for (const l of day || []) if (l.id === id) return l;
  }
  return null;
}

// ---------- homework editor ----------
async function openHwEditor(lesson, hwDate = tehranTodayISO()) {
  state.hwLessonId = lesson.id;
  state.hwDate = hwDate;
  state.pendingUploads = [];
  const j = jalaliOfISO(hwDate);
  $('#hwTitle').textContent = `تکلیف: ${subjectEmoji(lesson.subject_name)} ${lesson.subject_name} (${WEEK_DAY_NAMES[lesson.day]}، زنگ ${faDigits(lesson.period)} — ${faDigits(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${faDigits(j.jy)})`;
  renderHwDateNote(hwDate);
  $('#hwTitleInput').value = '';
  $('#hwDesc').value = '';
  $('#hwPages').value = '';
  $('#hwInstructions').value = '';
  $('#hwNotes').value = '';

  renderPendingUploads();
  $('#hwExistingFiles').textContent = '';

  const existing = lesson.hwByDate?.[hwDate] ?? null;
  $('#hwDelete').classList.toggle('hidden', !existing);
  if (existing) {
    // fetch full homework — همان تاریخ
    try {
      const data = await api(`/api/lessons/${lesson.id}?date=${hwDate}`);
      const hw = data.lesson.homework;
      if (hw) {
        $('#hwTitleInput').value = hw.title || '';
        $('#hwDesc').value = hw.description || '';
        $('#hwPages').value = hw.textbook_pages || '';
        $('#hwInstructions').value = hw.instructions || '';
        $('#hwNotes').value = hw.notes || '';

      }
      const files = data.lesson.attachments || [];
      renderExistingFiles(files);
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  openOverlay($('#hwOverlay'));
}

// فیلدهای تاریخ/ساعت شمسی (جایگزین datetime-local میلادی)
const taskDueField = createJalaliField($('#taskDueField'));
taskDueField.setDefault(); // فرم خالی: پیش‌فرضِ مفید (فردا ۰۸:۰۰)

function renderExistingFiles(files) {
  const list = $('#hwExistingFiles');
  list.textContent = '';
  for (const f of files) {
    const isLink = !!f.url;
    list.append(el('div', { class: 'admin-row' },
      el('span', { text: isLink ? '🔗' : '📎' }),
      el('div', { class: 'admin-row__main' },
        isLink
          ? el('div', { class: 'admin-row__title' }, el('a', { href: f.url, target: '_blank', rel: 'noopener', text: f.filename, dir: 'ltr' }))
          : el('div', { class: 'admin-row__title', text: f.filename }),
        el('div', { class: 'admin-row__sub', text: isLink ? 'لینک بیرونی' : f.telegram_file_id ? `☁️ تلگرام · ${formatSizeFa(f.size)}` : `${formatSizeFa(f.size)} · دیتابیس` })),
      el('button', {
        class: 'btn btn--danger btn--sm', type: 'button', text: '🗑️',
        onclick: async () => {
          const ok = await confirmDialog(`حذف پیوست «${f.filename}»؟`);
          if (!ok) return;
          try {
            await api(`/api/admin/attachments/${f.id}`, { method: 'DELETE' });
            toast('پیوست حذف شد.', 'success');
            f.deleted = true;
            f.el?.remove();
            renderExistingFiles(files.filter((x) => !x.deleted));
          } catch (err) { toast(err.message, 'error'); }
        },
      })));
  }
}

function renderPendingUploads() {
  const row = $('#hwUploadRow');
  row.textContent = '';
  for (const [i, file] of state.pendingUploads.entries()) {
    row.append(el('span', { class: 'file-chip' },
      el('span', { text: file.name }),
      el('button', {
        class: 'file-chip__x', type: 'button', text: '×', 'aria-label': `حذف ${file.name}`,
        onclick: () => { state.pendingUploads.splice(i, 1); renderPendingUploads(); },
      })));
  }
}


async function submitHomework(e) {
  e.preventDefault();
  const title = $('#hwTitleInput').value.trim();
  if (!title) { toast('عنوان تکلیف الزامی است.', 'error'); return; }
  const payload = {
    title,
    hwDate: state.hwDate,
    description: $('#hwDesc').value.trim(),
    textbookPages: $('#hwPages').value.trim(),
    instructions: $('#hwInstructions').value.trim(),
    notes: $('#hwNotes').value.trim(),
  };
  try {
    const res = await api(`/api/admin/lessons/${state.hwLessonId}/homework`, { method: 'PUT', body: payload });
    // آپلود پیوست‌ها با نوار پیشرفت
    const uploaded = await uploadFilesWithProgress(state.pendingUploads.splice(0), 'homework', res.id);
    toast(uploaded ? `تکلیف و ${faDigits(uploaded)} پیوست ذخیره شد ✅` : 'تکلیف ذخیره شد ✅', 'success');
    closeOverlay($('#hwOverlay'));
    refreshAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteHomework() {
  const ok = await confirmDialog('حذف کامل تکلیف این درس (به‌همراه پیوست‌ها)؟');
  if (!ok) return;
  try {
    await api(`/api/admin/lessons/${state.hwLessonId}/homework`, { method: 'DELETE', body: { hwDate: state.hwDate } });
    toast('تکلیف حذف شد.', 'success');
    closeOverlay($('#hwOverlay'));
    refreshAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ---------- tasks tab ----------
async function submitTask(e) {
  e.preventDefault();
  const id = $('#taskId').value;
  const subjectId = $('#taskSubject').value;
  const payload = {
    kind: $('#taskKind').value,
    title: $('#taskTitle').value.trim(),
    subjectId: subjectId ? Number(subjectId) : null,
    description: $('#taskDesc').value.trim(),
    dueAt: taskDueField.getISO(),
    priority: $('#taskPriority').value,
  };
  if (!payload.dueAt) { toast('مهلت الزامی است.', 'error'); return; }
  try {
    if (id) {
      await api(`/api/admin/tasks/${id}`, { method: 'PUT', body: payload });
      toast('مهلت به‌روزرسانی شد ✅', 'success');
    } else {
      const res = await api('/api/admin/tasks', { method: 'POST', body: payload });
      // attach pending file if any
      const file = state.taskFile;
      if (file) {
        state.taskFile = null;
        await uploadFilesWithProgress([file], 'task', res.id);
      }
      toast('مهلت جدید ایجاد شد ✅', 'success');
    }
    resetTaskForm();
    refreshAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function resetTaskForm() {
  $('#taskId').value = '';
  $('#taskTitle').value = '';
  $('#taskDesc').value = '';
  taskDueField.setDefault(); // پیش‌فرض: فردا ساعت ۰۸:۰۰
  $('#taskPriority').value = 'normal';
  $('#taskSubmit').textContent = 'ذخیره';
  state.taskFile = null;
}

function editTask(task) {
  $('#taskId').value = task.id;
  $('#taskKind').value = task.kind;
  $('#taskTitle').value = task.title;
  $('#taskDesc').value = task.description;
  $('#taskSubject').value = task.subject_id ?? '';
  taskDueField.setISO(task.due_at);
  $('#taskPriority').value = task.priority;
  $('#taskSubmit').textContent = 'به‌روزرسانی';
  $('#taskForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function deleteTask(task) {
  const ok = await confirmDialog(`حذف «${task.title}»؟`);
  if (!ok) return;
  try {
    await api(`/api/admin/tasks/${task.id}`, { method: 'DELETE' });
    toast('حذف شد.', 'success');
    refreshAll();
  } catch (err) { toast(err.message, 'error'); }
}

async function archiveTask(task) {
  try {
    await api(`/api/admin/tasks/${task.id}/archive`, { method: 'POST' });
    toast(task.archived ? 'از آرشیو خارج شد.' : 'بایگانی شد.', 'success');
    refreshAll();
  } catch (err) { toast(err.message, 'error'); }
}

function renderTasksTab() {
  const list = $('#tasksList');
  list.textContent = '';
  const all = [...state.tasks.active, ...state.tasks.expired];
  if (!all.length) {
    list.append(el('div', { class: 'empty-state', text: 'هنوز مهلتی ثبت نشده است.' }));
    return;
  }
  for (const t of all) {
    const cd = countdown(t.due_at);
    const row = el('div', { class: 'admin-row', style: t.archived ? 'opacity:.6;' : '' },
      el('div', { class: 'admin-row__main' },
        el('div', { class: 'admin-row__title', text: `${KIND_ICONS[t.kind]} ${t.title}${t.archived ? ' (بایگانی)' : ''}` }),
        el('div', { class: 'admin-row__sub', text: `${t.subject_name ? t.subject_name + ' · ' : ''}${formatJalaliDateTime(t.due_at)} · ${cd.text}` })),
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => editTask(t), text: '✏️' }),
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => archiveTask(t), text: t.archived ? '📤' : '📥' }),
      el('button', { class: 'btn btn--danger btn--sm', type: 'button', onclick: () => deleteTask(t), text: '🗑️' }),
    );
    list.append(row);
  }
}

// ---------- API keys tab (کلیدهای بیرونی: ربات تلگرام و…) ----------
const API_SCOPE_FA = { read: 'فقط خواندن', write: 'نوشتن' };

function renderApiKeysTab() {
  const list = $('#apiKeysList');
  list.textContent = '';
  if (!state.apiKeys?.length) {
    list.append(el('p', { class: 'admin-note', text: 'هنوز کلیدی ساخته نشده است. برای وصل‌کردن ربات یا برنامه‌ی دیگر، بالای همین تب کلید بسازید.' }));
    return;
  }
  for (const k of state.apiKeys) {
    const scopeFa = k.scopes.map((s) => API_SCOPE_FA[s] ?? s).join(' + ');
    const sub = [
      `شناسه: ${faDigits(k.id)} · ${k.key_prefix}… · ${scopeFa}`,
      k.requests ? `مصرف: ${faDigits(k.requests)} درخواست${k.last_used_at ? ' (آخرین: ' + formatJalaliDateTime(k.last_used_at) + ')' : ''}` : 'هنوز استفاده نشده',
    ].filter(Boolean).join(' · ');
    list.append(el('div', { class: 'admin-row', style: k.active ? '' : 'opacity:.55;' },
      el('div', { class: 'admin-row__main' },
        el('div', { class: 'admin-row__title', text: k.label + (k.active ? '' : ' (از کار افتاده)') }),
        el('div', { class: 'admin-row__sub', text: sub })),
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => toggleApiKey(k), text: k.active ? '⏸️' : '▶️', title: k.active ? 'از کار انداختن' : 'فعال‌کردن' }),
      el('button', { class: 'btn btn--danger btn--sm', type: 'button', onclick: () => deleteApiKey(k), text: '🗑️', title: 'حذف کلید' }),
    ));
  }
}

async function refreshApiKeys() {
  try {
    const res = await api('/api/v1/keys');
    state.apiKeys = res.keys ?? [];
  } catch { state.apiKeys = []; }
  renderApiKeysTab();
}

async function submitApiKeyForm(e) {
  e.preventDefault();
  const label = $('#apiKeyLabel').value.trim();
  if (!label) { toast('نام کلید را بنویسید.', 'error'); return; }
  const scopes = $('#apiKeyScopes').value.split(',');
  try {
    const res = await api('/api/v1/keys', { method: 'POST', body: { label, scopes } });
    $('#apiKeyLabel').value = '';
    const box = $('#apiKeyNew');
    box.classList.remove('hidden');
    box.textContent = '';
    // کلید خام فقط همین یک‌بار نشان داده می‌شود — بعدش فقط هش در دیتابیس است
    const input = el('input', { class: 'input', dir: 'ltr', readonly: '', value: res.key, style: 'font-family:monospace;font-size:12px;' });
    input.onclick = () => input.select();
    box.append(
      el('p', { class: 'admin-note', text: '🎉 کلید ساخته شد! همین یک‌بار نمایش داده می‌شود — کپی‌اش کنید:' }),
      input,
      el('div', { class: 'btn-row' },
        el('button', { class: 'btn btn--primary btn--sm', type: 'button', text: '📋 کپی', onclick: async () => {
          try { await navigator.clipboard.writeText(res.key); toast('کلید کپی شد ✅', 'success'); }
          catch { input.select(); document.execCommand('copy'); toast('کپی شد (قدیمی) ✅', 'success'); }
        } }),
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'بستن', onclick: () => { box.classList.add('hidden'); box.textContent = ''; } })),
    );
    toast('کلید API ساخته شد ✅', 'success');
    await refreshApiKeys();
  } catch (err2) {
    toast(err2.message, 'error');
  }
}

async function toggleApiKey(k) {
  try {
    await api(`/api/v1/keys/${k.id}/toggle`, { method: 'POST' });
    await refreshApiKeys();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteApiKey(k) {
  const okDel = await confirmDialog(`کلید «${k.label}» حذف شود؟ برنامه‌ای که با آن وصل شده از کار می‌افتد.`);
  if (!okDel) return;
  try {
    await api(`/api/v1/keys/${k.id}`, { method: 'DELETE' });
    toast('کلید حذف شد.', 'success');
    await refreshApiKeys();
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- announcements tab ----------
async function submitAnn(e) {
  e.preventDefault();
  const id = $('#annId').value;
  const payload = {
    title: $('#annTitle').value.trim(),
    body: $('#annBody').value.trim(),
    pinned: $('#annPinned').checked,
  };
  try {
    if (id) {
      await api(`/api/admin/announcements/${id}`, { method: 'PUT', body: payload });
      toast('اطلاعیه به‌روزرسانی شد ✅', 'success');
    } else {
      const res = await api('/api/admin/announcements', { method: 'POST', body: payload });
      const file = state.annFile;
      if (file) {
        state.annFile = null;
        await uploadFilesWithProgress([file], 'announcement', res.id);
      }
      toast('اطلاعیه منتشر شد ✅', 'success');
    }
    resetAnnForm();
    refreshAll();
  } catch (err) { toast(err.message, 'error'); }
}

function resetAnnForm() {
  $('#annId').value = '';
  $('#annTitle').value = '';
  $('#annBody').value = '';
  $('#annPinned').checked = false;
  $('#annSubmit').textContent = 'انتشار';
}

function editAnn(ann) {
  $('#annId').value = ann.id;
  $('#annTitle').value = ann.title;
  $('#annBody').value = ann.body;
  $('#annPinned').checked = ann.pinned;
  $('#annSubmit').textContent = 'به‌روزرسانی';
  $('#annForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function deleteAnn(ann) {
  const ok = await confirmDialog(`حذف اطلاعیه «${ann.title}»؟`);
  if (!ok) return;
  try {
    await api(`/api/admin/announcements/${ann.id}`, { method: 'DELETE' });
    toast('حذف شد.', 'success');
    refreshAll();
  } catch (err) { toast(err.message, 'error'); }
}

function renderAnnsTab() {
  const list = $('#annsList');
  list.textContent = '';
  if (!state.announcements.length) {
    list.append(el('div', { class: 'empty-state', text: 'هنوز اطلاعیه‌ای منتشر نشده است.' }));
    return;
  }
  for (const a of state.announcements) {
    const row = el('div', { class: 'admin-row' },
      el('div', { class: 'admin-row__main' },
        el('div', { class: 'admin-row__title', text: `${a.pinned ? '📌 ' : ''}${a.title}` }),
        el('div', { class: 'admin-row__sub', text: `${formatJalaliDateTime(a.published_at)}${a.attachment_count ? ` · 📎 ${faDigits(a.attachment_count)} پیوست` : ''}` })),
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => editAnn(a), text: '✏️' }),
      el('button', { class: 'btn btn--danger btn--sm', type: 'button', onclick: () => deleteAnn(a), text: '🗑️' }),
    );
    list.append(row);
  }
}

// ---------- handouts tab ----------
function renderHandoutsTab() {
  const list = $('#handoutsList');
  list.textContent = '';
  if (!state.handouts.length) {
    list.append(el('div', { class: 'empty-state', text: 'هنوز جزوه یا تمرینی بارگذاری نشده است.' }));
    return;
  }
  for (const h of state.handouts) {
    list.append(el('div', { class: 'admin-row' },
      el('span', { text: '📚' }),
      el('div', { class: 'admin-row__main' },
        el('div', { class: 'admin-row__title', text: h.subject_name ? `${h.title} — ${h.subject_name}` : h.title }),
        el('div', { class: 'admin-row__sub', text: `${formatJalaliDateTime(h.updated_at)}${h.attachment_count ? ` · 📎 ${faDigits(h.attachment_count)} فایل` : ''}` })),
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => editHandout(h), text: '✏️' }),
      el('button', { class: 'btn btn--danger btn--sm', type: 'button', onclick: () => deleteHandout(h), text: '🗑️' })));
  }
  fillHandoutSubjectOptions();
}

function fillHandoutSubjectOptions() {
  const sel = $('#handoutSubject');
  const cur = sel.value;
  sel.textContent = '';
  sel.append(el('option', { value: '', text: '— بدون درس —' }));
  for (const s of state.subjects) {
    sel.append(el('option', { value: String(s.id), text: s.name }));
  }
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

function renderHandoutPending() {
  const row = $('#handoutUploadRow');
  row.textContent = '';
  for (const [i, file] of state.pendingHandoutFiles.entries()) {
    row.append(el('span', { class: 'file-chip' },
      el('span', { text: `📎 ${file.name}` }),
      el('button', {
        class: 'file-chip__x', type: 'button', text: '×', 'aria-label': `حذف ${file.name}`,
        onclick: () => { state.pendingHandoutFiles.splice(i, 1); renderHandoutPending(); },
      })));
  }
}

function renderHandoutExisting(files) {
  const list = $('#handoutExistingFiles');
  list.textContent = '';
  for (const f of files) {
    list.append(el('div', { class: 'admin-row' },
      el('span', { text: '📎' }),
      el('div', { class: 'admin-row__main' },
        el('a', { class: 'admin-row__title', href: `${window.__API_BASE__ ?? API_BASE}/api/attachments/${f.id}`, download: f.filename, text: f.filename, style: 'color:inherit;text-decoration:none;' }),
        el('div', { class: 'admin-row__sub', text: f.telegram_file_id ? `☁️ تلگرام · ${formatSizeFa(f.size)}` : `${formatSizeFa(f.size)} · دیتابیس` })),
      el('button', {
        class: 'btn btn--danger btn--sm', type: 'button', text: '🗑️',
        onclick: async () => {
          const ok = await confirmDialog(`حذف فایل «${f.filename}»؟`);
          if (!ok) return;
          try {
            await api(`/api/admin/attachments/${f.id}`, { method: 'DELETE' });
            toast('فایل حذف شد.', 'success');
            renderHandoutExisting(files.filter((x) => x.id !== f.id));
            const h = state.handouts.find((x) => x.id === Number($('#handoutId').value));
            if (h) { h.attachments = h.attachments.filter((x) => x.id !== f.id); h.attachment_count = h.attachments.length; renderHandoutsTab(); }
          } catch (err) { toast(err.message, 'error'); }
        },
      })));
  }
}

function resetHandoutForm() {
  $('#handoutId').value = '';
  $('#handoutTitle').value = '';
  $('#handoutDesc').value = '';
  $('#handoutSubject').value = '';
  $('#handoutFormTitle').textContent = '➕ افزودن جزوه/تمرین';
  state.pendingHandoutFiles.splice(0);
  renderHandoutPending();
  $('#handoutExistingFiles').textContent = '';
}

function editHandout(h) {
  $('#handoutId').value = String(h.id);
  $('#handoutTitle').value = h.title;
  $('#handoutDesc').value = h.description || '';
  $('#handoutSubject').value = h.subject_id ? String(h.subject_id) : '';
  $('#handoutFormTitle').textContent = `✏️ ویرایش: ${h.title}`;
  state.pendingHandoutFiles.splice(0);
  renderHandoutPending();
  renderHandoutExisting(h.attachments ?? []);
  switchTab('handouts');
  $('#handoutTitle').focus();
}

async function submitHandout(e) {
  e.preventDefault();
  const title = $('#handoutTitle').value.trim();
  if (!title) { toast('عنوان جزوه الزامی است.', 'error'); return; }
  const payload = {
    title,
    description: $('#handoutDesc').value.trim(),
    subjectId: $('#handoutSubject').value || null,
  };
  try {
    let id = Number($('#handoutId').value);
    if (id) {
      await api(`/api/admin/handouts/${id}`, { method: 'PUT', body: payload });
    } else {
      const res = await api('/api/admin/handouts', { method: 'POST', body: payload });
      id = res.id;
    }
    const uploaded = await uploadFilesWithProgress(state.pendingHandoutFiles.splice(0), 'handout', id);
    toast(uploaded ? `جزوه و ${faDigits(uploaded)} فایل ذخیره شد ✅` : 'جزوه ذخیره شد ✅', 'success');
    resetHandoutForm();
    refreshAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteHandout(h) {
  const ok = await confirmDialog(`حذف جزوه «${h.title}» و همه‌ی فایل‌هایش؟`);
  if (!ok) return;
  try {
    await api(`/api/admin/handouts/${h.id}`, { method: 'DELETE' });
    toast('جزوه حذف شد.', 'success');
    if (Number($('#handoutId').value) === h.id) resetHandoutForm();
    refreshAll();
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- subjects tab ----------
async function submitSubject(e) {
  e.preventDefault();
  try {
    await api('/api/admin/subjects', {
      method: 'POST',
      body: { name: $('#subjectName').value.trim(), colorKey: $('#subjectColor').value },
    });
    toast('درس جدید اضافه شد ✅', 'success');
    $('#subjectName').value = '';
    refreshAll();
  } catch (err) { toast(err.message, 'error'); }
}

function renderSubjectsTab() {
  const list = $('#subjectsList');
  list.textContent = '';
  for (const s of state.subjects) {
    list.append(el('div', { class: 'admin-row' },
      el('span', { style: `width:22px;height:22px;border-radius:8px;background:var(--${s.colorKey});border:1px solid var(--border-strong);`, 'aria-hidden': 'true' }),
      el('div', { class: 'admin-row__main' },
        el('div', { class: 'admin-row__title', text: s.name }),
        el('div', { class: 'admin-row__sub', text: `شناسه: ${faDigits(s.id)}` }))));
  }
}

// ---------- settings tab: زنگ‌های گردشی ----------
// فهرست زنگ‌های گردشی + درسِ واقعی همین هفته + دکمه‌ی جابه‌جایی هفته
function renderRotationCard() {
  const box = $('#rotationList');
  if (!box) return;
  const anchor = state.settings.rotation_anchor || null;
  const parity = weekParity(Date.now(), anchor); // 'main' | 'alt' | null
  const slots = [];
  for (let d = 0; d < 7; d++) {
    for (const l of state.scheduleDays[d] || []) {
      if (l.alt_subject_name) slots.push(l);
    }
  }
  box.textContent = '';
  if (!slots.length) {
    box.append(el('p', { class: 'admin-note', text: 'هنوز زنگ گردشی‌ای ثبت نشده است. در تب «برنامه»، درس دوم هر خانه را از فهرست «🔄 گردشی» انتخاب کنید.' }));
    return;
  }
  const list = el('div', { class: 'cal-day-lessons' });
  for (const l of slots) {
    const useAlt = parity === 'alt';
    const now = useAlt ? l.alt_subject_name : l.subject_name;
    const next = useAlt ? l.subject_name : l.alt_subject_name;
    list.append(el('div', { class: 'cal-day-lesson' },
      el('span', { class: 'cal-day-lesson__p', text: faDigits(l.period) }),
      el('span', { class: 'cal-day-lesson__name', text: `${WEEK_DAY_NAMES[l.day]}: ${l.subject_name} ↔ ${l.alt_subject_name}` }),
      el('span', { class: 'cal-day-lesson__time', style: 'font-weight:700;', text: `این هفته: ${now} → هفته‌ی بعد: ${next}` }),
    ));
  }
  box.append(list);
  if (!anchor) {
    box.append(el('p', { class: 'admin-note', style: 'margin-top:8px;', text: '⚠️ مبنا هنوز تنظیم نشده؛ فعلاً درس اصلی همه‌ی هفته‌ها نشان داده می‌شود. یک بار جابه‌جایی یا ذخیره‌ی تنظیمات، مبنا را می‌سازد.' }));
  }
}

async function flipRotation() {
  const btn = $('#rotationFlip');
  btn.disabled = true;
  try {
    const res = await api('/api/admin/rotation', { method: 'PUT', body: { mode: 'flip' } });
    state.settings.rotation_anchor = res.anchor;
    toast('چرخش هفته‌ی جاری جابه‌جا شد ✅', 'success');
    renderRotationCard();
  } catch (err) { toast(err.message, 'error'); }
  btn.disabled = false;
}

function formatSizeFa(bytes) {
  if (bytes >= 1_048_576) return `${faDigits((bytes / 1_048_576).toFixed(1))} مگابایت`;
  if (bytes >= 1024) return `${faDigits(Math.round(bytes / 1024))} کیلوبایت`;
  return `${faDigits(bytes)} بایت`;
}

function fillSettingsForm() {
  $('#setClassName').value = state.settings.class_name || '';
  $('#setWelcome').value = state.settings.welcome_message || '';
  $('#setNote').value = state.settings.admin_note || '';
  loadTgStatus();
}

/** به‌روزرسانی UI از روی state.tg: وضعیت + برچسب سقف فایل‌ها */
function updateTgUi() {
  const st = state.tg || { configured: false };
  const chatInput = $('#tgChat');
  if (chatInput && st.chatId && !chatInput.value) chatInput.value = st.chatId;
  const note = $('#tgStatus');
  if (note) {
    note.textContent = st.configured
      ? (st.bot
        ? `✅ فعال — بات @${st.bot} (توکن ${st.maskedToken})؛ سقف هر فایل ۲۰ مگابایت.`
        : `⚠️ توکن ذخیره شده ولی بات پاسخ نداد — دوباره تست بگیرید.`)
      : 'غیرفعال — فایل‌ها در دیتابیس (سقف ۱.۵ مگابایت) ذخیره می‌شوند.';
  }
  const limit = $('#hwLimitNote');
  if (limit) limit.textContent = st.configured ? 'هر فایل تا ۲۰ مگابایت (انبار تلگرام)' : 'هر فایل تا ۱.۵ مگابایت (با انبار تلگرام تا ۲۰)';
  const hlimit = $('#handoutLimitNote');
  if (hlimit) hlimit.textContent = limit ? limit.textContent : '';
}

/** وضعیت انبار تلگرام: دریافت + به‌روزرسانی UI */
async function loadTgStatus() {
  try {
    state.tg = await api('/api/admin/telegram');
  } catch { /* آفلاین/بدون نشست — بی‌صدا */ }
  updateTgUi();
}

async function submitTgForm(e) {
  e.preventDefault();
  const body = {};
  const token = $('#tgToken').value.trim();
  const chat = $('#tgChat').value.trim();
  if (token) body.tg_bot_token = token;
  if (chat !== '') body.tg_chat_id = chat;
  if (!Object.keys(body).length) { toast('چیزی برای ذخیره نیست.', 'error'); return; }
  try {
    await api('/api/admin/settings', { method: 'PUT', body });
    toast('تنظیمات انبار ذخیره شد ✅', 'success');
    $('#tgToken').value = '';
    await loadTgStatus();
  } catch (err) { toast(err.message, 'error'); }
}

async function tgDiscover() {
  try {
    // توکن خالی → سرور از توکنِ ذخیره‌شده استفاده می‌کند
    const st = await api('/api/admin/telegram/chatid', { method: 'POST', body: { token: $('#tgToken').value.trim() } });
    $('#tgChat').value = st.chatId;
    toast(`chat id پیدا شد: ${st.chatId} — «ذخیره» را بزنید.`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function tgDisable() {
  try {
    await api('/api/admin/settings', { method: 'PUT', body: { tg_bot_token: '', tg_chat_id: '' } });
    toast('انبار تلگرام غیرفعال شد — پیوست‌ها به دیتابیس برمی‌گردند.', 'success');
    $('#tgToken').value = ''; $('#tgChat').value = '';
    await loadTgStatus();
  } catch (err) { toast(err.message, 'error'); }
}

async function tgTest() {
  try {
    const r = await api('/api/admin/telegram/test', { method: 'POST', body: {} });
    toast(`اتصال برقرار است ✅ بات @${r.bot}`, 'success');
    await loadTgStatus();
  } catch (err) { toast(err.message, 'error'); }
}

async function submitSettings(e) {
  e.preventDefault();
  try {
    await api('/api/admin/settings', {
      method: 'PUT',
      body: {
        class_name: $('#setClassName').value.trim(),
        welcome_message: $('#setWelcome').value.trim(),
        admin_note: $('#setNote').value.trim(),
      },
    });
    toast('تنظیمات ذخیره شد ✅', 'success');
    renderRotationCard();
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- calendar tab (monthly) ----------
// مدیر می‌تواند هر ماه شمسی را ببیند و برای هر روز مهلت/امتحان ثبت کند.
const cal = {
  jy: 0, jm: 0,   // ماه در حال نمایش
};

function jalaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  // اسفند: کبیسه؟ — سال کبیسه جلالی اگر باقیمانده سال به ۳۳ در این مجموعه باشد
  const remainders = [1, 5, 9, 13, 17, 22, 26, 30];
  return remainders.includes(jy % 33) ? 30 : 29;
}

function initCalendar() {
  const { jy, jm } = todayJalali(); // امروزِ تهران — مستقل از منطقه‌ی زمانی مرورگر
  cal.jy = jy; cal.jm = jm;
  $('#calPrev').addEventListener('click', () => {
    cal.jm -= 1;
    if (cal.jm < 1) { cal.jm = 12; cal.jy -= 1; }
    renderCalendar();
  });
  $('#calNext').addEventListener('click', () => {
    cal.jm += 1;
    if (cal.jm > 12) { cal.jm = 1; cal.jy += 1; }
    renderCalendar();
  });
  $('#calToday').addEventListener('click', () => {
    const t = todayJalali();
    cal.jy = t.jy; cal.jm = t.jm;
    renderCalendar();
  });
}

/** مهلت‌های یک روز مشخص (به وقت تهران) */
function tasksOnJalaliDay(jy, jm, jd) {
  // از fromJalali نونِ روز محلی می‌سازیم؛ بازه تهران روز = [03:30 UTC, +24h]
  const local = fromJalali(jy, jm, jd);         // نون محلی
  const startUtc = Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()) - 3.5 * 3600_000;
  const endUtc = startUtc + 86_400_000;
  const all = [...state.tasks.active, ...state.tasks.expired];
  return all.filter((t) => {
    const ts = new Date(t.due_at).getTime();
    return ts >= startUtc && ts < endUtc;
  });
}

function renderCalendar() {
  $('#calTitle').textContent = `${JALALI_MONTHS[cal.jm - 1]} ${faDigits(cal.jy)}`;
  const cells = $('#calGrid');
  cells.textContent = '';

  const today = todayJalali();
  const monthLen = jalaliMonthLength(cal.jy, cal.jm);
  // روز هفته‌ی روز اول ماه: از fromJalali
  const first = fromJalali(cal.jy, cal.jm, 1);
  const firstDow = iranDayIndex(first); // 0=شنبه

  // سلول‌های خالی ابتدای ماه
  for (let i = 0; i < firstDow; i++) cells.append(el('div', { class: 'cal-cell cal-cell--pad' }));

  for (let jd = 1; jd <= monthLen; jd++) {
    const isToday = today.jy === cal.jy && today.jm === cal.jm && today.jd === jd;
    const date = fromJalali(cal.jy, cal.jm, jd);
    const dayIdx = iranDayIndex(date);
    const isOff = dayIdx === 5 || dayIdx === 6;
    const dayTasks = tasksOnJalaliDay(cal.jy, cal.jm, jd);
    const nP2 = periodsPerDay(dayIdx);
    const dateISO = date.toISOString().slice(0, 10);
    const dayHW = nP2
      ? (state.scheduleDays[dayIdx] || []).filter((l) => l.period <= (nP2 || 12))
          .reduce((n, l) => n + (l.hwByDate?.[dateISO] ? 1 : 0), 0)
      : 0;
    const nLessons = nP2;

    const cell = el('button', {
      class: `cal-cell${isToday ? ' cal-cell--today' : ''}${isOff ? ' cal-cell--off' : ''}`,
      type: 'button',
      'aria-label': `${WEEK_DAY_NAMES[dayIdx]} ${faDigits(jd)} ${JALALI_MONTHS[cal.jm - 1]}`,
      onclick: () => openCalDay(jy0(), jm0(), jd),
    },
      el('span', { class: 'cal-cell__num', text: faDigits(jd) }),
      el('span', { class: 'cal-cell__dots' },
        nLessons ? el('i', { class: 'cal-dot cal-dot--lesson', title: `${faDigits(nLessons)} زنگ` }) : null,
        dayHW ? el('i', { class: 'cal-dot cal-dot--hw', title: `${faDigits(dayHW)} تکلیف در این روز` }) : null,
        ...dayTasks.slice(0, 3).map((t) => el('i', {
          class: `cal-dot cal-dot--task${t.priority === 'high' ? ' cal-dot--high' : ''}`,
          title: `${KIND_LABELS[t.kind] || t.kind}: ${t.title}`,
        })),
        dayTasks.length > 3 ? el('i', { class: 'cal-dot cal-dot--more' }) : null,
      ),
    );
    cells.append(cell);
  }

  // لیست مهلت‌های ماه
  const list = $('#calMonthTasks');
  list.textContent = '';
  const all = [...state.tasks.active, ...state.tasks.expired]
    .filter((t) => {
      const d = toJalali(new Date(new Date(t.due_at).getTime() + 3.5 * 3600_000));
      return d.jy === cal.jy && d.jm === cal.jm;
    })
    .sort((a, b) => a.due_at.localeCompare(b.due_at));
  if (!all.length) {
    list.append(el('div', { class: 'empty-state', text: 'در این ماه مهلتی ثبت نشده است.' }));
  } else {
    for (const t of all) {
      const cd = countdown(t.due_at);
      list.append(el('div', { class: 'admin-row' },
        el('div', { class: 'admin-row__main' },
          el('div', { class: 'admin-row__title', text: `${KIND_ICONS[t.kind]} ${t.title}` }),
          el('div', { class: 'admin-row__sub', text: `${t.subject_name ? t.subject_name + ' · ' : ''}${formatJalaliDateTime(t.due_at)} · ${cd.text}` })),
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => editTask(t), text: '✏️' }),
        el('button', { class: 'btn btn--danger btn--sm', type: 'button', onclick: () => deleteTask(t), text: '🗑️' })));
    }
  }
}

// مقادیر جاری ماه برای openCalDay (کلوژر تمیزتر)
function jy0() { return cal.jy; }
function jm0() { return cal.jm; }

/** شیت جزئیات یک روز: زنگ‌ها + مهلت‌ها + افزودن سریع مهلت */
function openCalDay(jy, jm, jd) {
  const date = fromJalali(jy, jm, jd);
  const dayIdx = iranDayIndex(date);
  state.calDateISO = date.toISOString().slice(0, 10);
  $('#dayTitle').textContent = `${WEEK_DAY_NAMES[dayIdx]} ${faDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${faDigits(jy)}`;
  const body = $('#dayBody');
  body.textContent = '';

  // تاریخ برای datetime-local (پیش‌فرض ۸ صبح تهران)
  const defaultLocal = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T08:00`;

  const wrap = el('div', { class: 'detail-lesson' });

  // زنگ‌های روز
  const nP = periodsPerDay(dayIdx);
  const lessons = (state.scheduleDays[dayIdx] || []).filter((l) => l.period <= (nP || 12));
  const dayISO = state.calDateISO;
  const lessonsBlock = el('div', { class: 'detail-block' },
    el('p', { class: 'detail-block__title', text: `🗓️ زنگ‌های این روز (${faDigits(lessons.length)})` }));
  if (!lessons.length) {
    lessonsBlock.append(el('p', { class: 'detail-block__text detail-block__text--muted', text: 'این روز کلاسی نیست — تعطیل.' }));
  } else {
    const lList = el('div', { class: 'cal-day-lessons' });
    for (const l of lessons) {
      // برای زنگ گردشی، درسِ واقعیِ همان هفته (نه «این هفته») مشخص شود
      let name = l.subject_name;
      if (l.alt_subject_name) {
        const useAlt = weekParity(date.getTime(), state.settings.rotation_anchor) === 'alt';
        name = useAlt ? l.alt_subject_name : l.subject_name;
        name = `${name} (گردشی)`;
      }
      const hw = l.hwByDate?.[dayISO];
      lList.append(el('div', { class: 'cal-day-lesson' },
        el('span', { class: 'cal-day-lesson__p', text: faDigits(l.period) }),
        el('span', { class: 'cal-day-lesson__name', text: name }),
        el('span', { class: 'cal-day-lesson__time', text: `${faDigits(l.start_time)}–${faDigits(l.end_time)}` }),
        el('span', { class: 'cal-day-lesson__hw', text: hw ? `📝 ${hw.title}` : '' }),
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', title: hw ? 'ویرایش تکلیف این روز' : 'ثبت تکلیف برای این روز', text: '📝', onclick: () => { closeOverlay($('#dayOverlay')); openHwEditor(l, dayISO); } })));
    }
    lessonsBlock.append(lList);
  }
  wrap.append(lessonsBlock);

  // مهلت‌های روز
  const dayTasks = tasksOnJalaliDay(jy, jm, jd);
  const tasksBlock = el('div', { class: 'detail-block' },
    el('p', { class: 'detail-block__title', text: `⏳ مهلت‌های این روز (${faDigits(dayTasks.length)})` }));
  if (!dayTasks.length) {
    tasksBlock.append(el('p', { class: 'detail-block__text detail-block__text--muted', text: 'برای این روز چیزی ثبت نشده است.' }));
  } else {
    const tList = el('div', { class: 'admin-list' });
    for (const t of dayTasks) {
      tList.append(el('div', { class: 'admin-row' },
        el('div', { class: 'admin-row__main' },
          el('div', { class: 'admin-row__title', text: `${KIND_ICONS[t.kind]} ${t.title}` }),
          el('div', { class: 'admin-row__sub', text: `${formatJalaliDateTime(t.due_at)} · ${countdown(t.due_at).text}` })),
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '✏️', onclick: () => { closeOverlay($('#dayOverlay')); editTask(t); } }),
        el('button', { class: 'btn btn--danger btn--sm', type: 'button', text: '🗑️', onclick: () => { closeOverlay($('#dayOverlay')); deleteTask(t); } })));
    }
    tasksBlock.append(tList);
  }
  wrap.append(tasksBlock);

  // افزودن سریع مهلت
  wrap.append(el('div', { class: 'detail-block' },
    el('p', { class: 'detail-block__title', text: '➕ افزودن مهلت به همین روز' }),
    el('form', { id: 'dayQuickTask', onsubmit: async (e) => {
      e.preventDefault();
      const title = $('#dayQtTitle').value.trim();
      const time = $('#dayQtTime').value || '08:00';
      if (!title) { toast('عنوان را بنویسید.', 'error'); return; }
      // ساعت انتخابی به وقت تهران فرض می‌شود؛ تاریخ همان روز است
      const localDate = defaultLocal.slice(0, 10);
      const fakeLocal = `${localDate}T${time}:00`;
      const utc = new Date(new Date(`${fakeLocal}Z`).getTime() - 3.5 * 3600_000);
      try {
        await api('/api/admin/tasks', {
          method: 'POST',
          body: {
            kind: $('#dayQtKind').value,
            title,
            subjectId: $('#dayQtSubject').value ? Number($('#dayQtSubject').value) : null,
            dueAt: utc.toISOString().slice(0, 19) + 'Z',
            priority: $('#dayQtPriority').value,
          },
        });
        toast('مهلت اضافه شد ✅', 'success');
        await refreshAll();
        openCalDay(jy, jm, jd); // بازکردن مجدد شیت با داده تازه
      } catch (err) { toast(err.message, 'error'); }
    } },
      el('div', { class: 'form-grid' },
        el('div', { class: 'field' },
          el('label', { class: 'field__label', for: 'dayQtKind', text: 'نوع' }),
          el('select', { class: 'select', id: 'dayQtKind' },
            el('option', { value: 'exam', text: 'امتحان' }),
            el('option', { value: 'quiz', text: 'آزمونک' }),
            el('option', { value: 'submission', text: 'تحویل' }),
            el('option', { value: 'project', text: 'پروژه' }),
            el('option', { value: 'research', text: 'تحقیق' }),
            el('option', { value: 'presentation', text: 'ارائه' }))),
        el('div', { class: 'field' },
          el('label', { class: 'field__label', for: 'dayQtSubject', text: 'درس (اختیاری)' }),
          (() => { const s = el('select', { class: 'select', id: 'dayQtSubject' }); s.append(el('option', { value: '', text: '— بدون درس —' })); for (const sub of state.subjects) s.append(el('option', { value: sub.id, text: sub.name })); return s; })()),
        el('div', { class: 'field', style: 'grid-column: 1/-1;' },
          el('label', { class: 'field__label', for: 'dayQtTitle', text: 'عنوان' }),
          el('input', { class: 'input', id: 'dayQtTitle', maxlength: '200', placeholder: 'مثلاً: امتحان فصل ۳' })),
        el('div', { class: 'field' },
          el('label', { class: 'field__label', for: 'dayQtTime', text: 'ساعت (تهران)' }),
          el('input', { class: 'input input--time', id: 'dayQtTime', type: 'time', value: '08:00' })),
        el('div', { class: 'field' },
          el('label', { class: 'field__label', for: 'dayQtPriority', text: 'اولویت' }),
          el('select', { class: 'select', id: 'dayQtPriority' },
            el('option', { value: 'low', text: 'کم' }),
            el('option', { value: 'normal', text: 'معمولی', selected: '' }),
            el('option', { value: 'high', text: 'مهم' })))),
      el('div', { class: 'btn-row', style: 'margin-top:4px;' },
        el('button', { class: 'btn btn--primary', type: 'submit', text: 'افزودن' })))));

  body.append(wrap);
  openOverlay($('#dayOverlay'));
  $('#dayClose').focus();
}

// ---------- tabs ----------
function switchTab(name) {
  for (const btn of document.querySelectorAll('.admin-tab')) {
    const active = btn.dataset.tab === name;
    btn.classList.toggle('admin-tab--active', active);
    btn.setAttribute('aria-selected', String(active));
  }
  for (const panel of document.querySelectorAll('.admin-panel')) {
    panel.classList.toggle('hidden', panel.id !== `tab-${name}`);
  }
  // کلیدها هر بار موقع ورود به تب تازه می‌شوند (مصرف/آخرین استفاده)
  if (name === 'apikeys') refreshApiKeys().catch(() => {});
}

// ---------- boot ----------
async function boot() {
  $('#brandDate').textContent = formatJalali(tehranLocalDate(), { withWeekday: true });
  initMirrorOriginPicker();
  // روی آینه، دکمه‌ی 🏠 باید به صفحه‌ی دانش‌آموزِ خودِ آینه برگردد نه /
  // (روی github.io ریشه‌ی / مال نام کاربری است و ۴۰۴ می‌شود).
  if (IS_MIRROR && $('#homeLink')) {
    $('#homeLink').href = '../';
  }
  const authed = await checkAuth();
  if (authed) showAdmin();
  else {
    // check if bootstrap needed (no admin exists yet)
    try {
      const need = await api('/api/admin/auth/status');
      if (need.bootstrapRequired) {
        $('#loginSub').textContent = 'نخستین بار: حساب مدیر کلاس را بسازید';
        $('#loginSubmit').textContent = 'ساخت حساب مدیر';
        $('#loginForm').dataset.mode = 'bootstrap';
        $('#loginUser').setAttribute('autocomplete', 'new-username');
        $('#loginPass').setAttribute('autocomplete', 'new-password');
        const hint = $('#loginHint');
        hint.textContent = 'نام کاربری و گذرواژه (حداقل ۸ نویسه) انتخاب کنید.';
      }
    } catch { /* default login mode */ }
  }
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#loginSubmit');
  btn.disabled = true;
  try {
    if ($('#loginForm').dataset.mode === 'bootstrap') {
      await api('/api/admin/auth/bootstrap', {
        method: 'POST',
        body: { username: $('#loginUser').value.trim(), password: $('#loginPass').value },
      });
    }
    await handleLoginInner();
  } catch (err) {
    toast(err.message, 'error');
    $('#loginHint').textContent = err.message;
  } finally { btn.disabled = false; }
});

// wire events
$('#logoutBtn').addEventListener('click', handleLogout);
$('#gridSave').addEventListener('click', saveGrid);
$('#bellsSave').addEventListener('click', saveBells);
$('#weekPrev')?.addEventListener('click', () => setFocusWeek(shiftSaturday(-1)));
$('#weekNext')?.addEventListener('click', () => setFocusWeek(shiftSaturday(1)));
$('#weekToday')?.addEventListener('click', () => setFocusWeek(calendarSaturday()));
$('#weekHintGo')?.addEventListener('click', () => setFocusWeek(shiftSaturday(1)));
$('#bellsTemplate').addEventListener('click', bellsTemplate);
$('#bellsReset').addEventListener('click', () => { bellsDraft = null; bellsDirty = false; renderBells(); });
$('#taskForm').addEventListener('submit', submitTask);
$('#taskReset').addEventListener('click', resetTaskForm);
$('#annForm').addEventListener('submit', submitAnn);
$('#annReset').addEventListener('click', resetAnnForm);
$('#subjectForm').addEventListener('submit', submitSubject);
$('#apiKeyForm').addEventListener('submit', submitApiKeyForm);
$('#settingsForm').addEventListener('submit', submitSettings);
$('#tgForm').addEventListener('submit', submitTgForm);
$('#tgDiscover').addEventListener('click', tgDiscover);
$('#tgTest').addEventListener('click', tgTest);
$('#tgDisable').addEventListener('click', tgDisable);
$('#hwForm').addEventListener('submit', submitHomework);
$('#hwDelete').addEventListener('click', deleteHomework);
$('#hwClose').addEventListener('click', () => closeOverlay($('#hwOverlay')));
$('#dayClose').addEventListener('click', () => closeOverlay($('#dayOverlay')));
$('#dayOverlay').addEventListener('mousedown', (e) => {
  if (e.target === $('#dayOverlay')) closeOverlay($('#dayOverlay'));
});
$('#hwOverlay').addEventListener('mousedown', (e) => {
  if (e.target === $('#hwOverlay')) closeOverlay($('#hwOverlay'));
});
$('#hwAddFile').addEventListener('click', () => $('#hwFile').click());
// سقف فایل: با انبار تلگرام ۲۰ مگ، بدون آن ۱.۵ مگ (دیتابیس) — پویا از state.tg
$('#hwFile').addEventListener('change', () => {
  const maxBytes = state.tg?.configured ? 20 * 1024 * 1024 : 1_500_000;
  const maxLabel = state.tg?.configured ? '۲۰ مگابایت' : '۱.۵ مگابایت';
  for (const f of $('#hwFile').files) {
    if (f.size > maxBytes) { toast(`«${f.name}» بزرگ‌تر از ${maxLabel} است.`, 'error'); continue; }
    state.pendingUploads.push(f);
  }
  $('#hwFile').value = '';
  renderPendingUploads();
});

$('#handoutForm').addEventListener('submit', submitHandout);
$('#uploadCancel').addEventListener('click', () => activeUploadXhr?.abort());
$('#handoutReset').addEventListener('click', resetHandoutForm);
$('#handoutAddFile').addEventListener('click', () => $('#handoutFile').click());
// سقف فایل جزوه: با انبار تلگرام ۲۰ مگ، بدون آن ۱.۵ مگ — پویا از state.tg
$('#handoutFile').addEventListener('change', () => {
  const maxBytes = state.tg?.configured ? 20 * 1024 * 1024 : 1_500_000;
  const maxLabel = state.tg?.configured ? '۲۰ مگابایت' : '۱.۵ مگابایت';
  for (const f of $('#handoutFile').files) {
    if (f.size > maxBytes) { toast(`«${f.name}» بزرگ‌تر از ${maxLabel} است.`, 'error'); continue; }
    state.pendingHandoutFiles.push(f);
  }
  $('#handoutFile').value = '';
  renderHandoutPending();
});

for (const btn of document.querySelectorAll('.admin-tab')) {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
}

$('#rotationFlip').addEventListener('click', flipRotation);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('#hwOverlay').hidden) closeOverlay($('#hwOverlay'));
    if (!$('#dayOverlay').hidden) closeOverlay($('#dayOverlay'));
    if (!$('#confirmOverlay').hidden) $('#confirmNo').click();
  }
});

initCalendar();
boot();
