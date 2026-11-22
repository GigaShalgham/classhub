// Persian (Jalali) calendar utilities — dependency-free conversion.
// Algorithm: the standard jalali_to_gregorian / gregorian_to_jalali pair
// used widely (based on the work by Kazimierz M. Borkowski / jalaali-js logic,
// re-implemented here so the bundle stays tiny).

export const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** Convert Latin digits to Persian digits. */
export function faDigits(input) {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/** Convert Persian/Arabic digits back to Latin for <input> parsing. */
export function toLatinDigits(input) {
  return input
    .replace(/[\u06F0-\u06F9]/g, (ch) => String(ch.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - 0x0660));
}

function div(a, b) {
  return Math.floor(a / b);
}

/** Gregorian y/m/d numbers -> Jalali (timezone-safe core) */
export function toJalaliParts(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  const gy2 = gy <= 1600 ? gy - 621 : gy - 1600;
  const gm2 = gm > 2 ? 1 : 0;
  let days = (365 * gy2) + div(gy2 + 3, 4) - div(gy2 + 99, 100)
    + div(gy2 + 399, 400) - 80 + gd + g_d_m[gm - 1];
  days += (((gy2 % 4 === 0 && gy2 % 100 !== 0) || gy2 % 400 === 0) && gm > 2) ? 1 : 0;
  let jy2 = jy + 33 * div(days, 12053);
  days %= 12053;
  jy2 += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    jy2 += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
  jy = jy2;
  return { jy, jm, jd };
}

/** Gregorian -> Jalali */
export function toJalali(date) {
  return toJalaliParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Jalali -> Gregorian (returns a Date at local noon for safety) */
export function fromJalali(jy, jm, jd) {
  let gy = jy <= 979 ? 621 : 1600;
  const jy2 = jy <= 979 ? jy : jy - 979;
  let days = (365 * jy2) + div(jy2, 33) * 8 + div((jy2 % 33) + 3, 4)
    + 78 + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
  gy += 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * div(--days, 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    gy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const sal_a = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 1; gm <= 12; gm++) {
    if (gd <= sal_a[gm]) break;
    gd -= sal_a[gm];
  }
  const d = new Date(gy, gm - 1, gd, 12, 0, 0);
  return d;
}

export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

// Iran week: Saturday=0 ... Friday=6 (JS: Sunday=0 ... Saturday=6)
export const WEEK_DAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

/** Convert JS getDay() (Sun=0) to Iran day index (Sat=0). */
export function iranDayIndex(date) {
  return (date.getDay() + 1) % 7;
}

/* ---------- زنگ‌های گردشی (هفته‌به‌هفته بین دو درس) ---------- */

/** شماره‌ی روز ISO از رشته‌ی «YYYY-MM-DD» (بدون وابستگی به منطقه‌ی زمانی) */
export function isoDayNum(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** شماره‌ی شنبه‌ی همان هفته‌ی تقویمی Tehran-time «امروز» (ایران: هفته از شنبه) */
export function saturdayDayNumOf(ms = Date.now()) {
  const t = tehranDayNumber(ms);
  // نگاشت ثابت تقویمی: شنبه ⇔ dayNum % 7 === 2 (روز صفر یونیکس پنجشنبه است)
  return t - ((t + 5) % 7);
}

/**
 * پاریتی هفته نسبت به مبنای گردش.
 * خروجی: 'alt' = این هفته درس دوم، 'main' = درس اصلی، null = بدون مبنا (درس اصلی).
 * مبنا (anchor) = تاریخ شنبه‌ی هفته‌ای که درس «اصلی» بوده؛ هفته‌های بعد یک‌درمیان.
 */
export function weekParity(dateMs, anchorStr) {
  if (!anchorStr) return null;
  let anchor = isoDayNum(anchorStr);
  anchor -= (anchor + 5) % 7; // نرمال به شنبه‌ی همان هفته (شنبه ⇔ %7===2)
  const saturday = saturdayDayNumOf(dateMs);
  if (!Number.isFinite(anchor) || saturday < anchor) return null;
  return ((saturday - anchor) / 7) % 2 === 1 ? 'alt' : 'main';
}

/* ---------- زمان تهران (UTC+3:30، بدون ساعت تابستانی از ۲۰۲۲) ---------- */

/** y/m/d در تقویم تهران برای یک لحظه‌ی زمانی */
export function tehranYMD(ms) {
  const t = new Date(ms + 3.5 * 3600_000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** شماره‌ی روز تهران (روز سپری‌شده از epoch به وقت تهران) */
export function tehranDayNumber(ms = Date.now()) {
  const { y, m, d } = tehranYMD(ms);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** ساعت تهران «HH:MM» برای یک لحظه‌ی زمانی */
export function tehranHHMM(ms) {
  const t = new Date(ms + 3.5 * 3600_000);
  return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * «امروزِ تهران» به‌شکل Date نونِ محلی.
 * اجزای تقویمی این Date (سال/ماه/روز) دقیقاً تاریخِ تهران است — مستقل از
 * منطقه‌ی زمانی مرورگر (کاربر پشت VPN هم تاریخ درست می‌بیند).
 */
export function tehranLocalDate(ms = Date.now()) {
  const { y, m, d } = tehranYMD(ms);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/** شاخص روزِ جاری تهران (شنبه=۰)، مستقل از منطقه‌ی زمانی مرورگر */
export function tehranDayIndex(ms = Date.now()) {
  return (tehranDayNumber(ms) + 5) % 7; // شنبه ⇔ dayNum % 7 === 2
}

/** امروزِ تهران به تاریخ جلالی */
export function todayJalali(ms = Date.now()) {
  const { y, m, d } = tehranYMD(ms);
  return toJalaliParts(y, m, d);
}

/**
 * پنجره‌ی غلتان n روزه از «امروزِ تهران».
 * همیشه از امروز شروع می‌شود و هرگز روز گذشته نشان نمی‌دهد.
 * خروجی: آرایه‌ای از { date, dayIdx } — date نونِ روز محلی است.
 */
export function rollingWindow(n, now = Date.now()) {
  const { y, m, d } = tehranYMD(now);
  const out = [];
  for (let i = 0; i < n; i++) {
    const date = new Date(y, m - 1, d + i, 12, 0, 0); // نونِ محلی: امن برای DST نبودن
    out.push({ date, dayIdx: iranDayIndex(date) });
  }
  return out;
}

/** Format a Jalali date like «۱۸ آبان ۱۴۰۵». */
export function formatJalali(date, opts = {}) {
  const { jy, jm, jd } = toJalali(date);
  const parts = [];
  if (opts.withWeekday) parts.push(WEEK_DAY_NAMES[iranDayIndex(date)]);
  parts.push(faDigits(jd), JALALI_MONTHS[jm - 1]);
  if (opts.withYear !== false) parts.push(faDigits(jy));
  return parts.join(' ');
}

/** Format an ISO datetime for Tehran timezone, Jalali. */
export function formatJalaliDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const tehran = new Date(d.getTime() + (3.5 * 3600_000));
  const { jy, jm, jd } = toJalali(tehran);
  const hh = String(tehran.getUTCHours()).padStart(2, '0');
  const mm = String(tehran.getUTCMinutes()).padStart(2, '0');
  return `${faDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${faDigits(jy)}، ساعت ${faDigits(hh + ':' + mm)}`;
}

/** فقط بخش تاریخ شمسی یک ISO به وقت تهران: «۱۸ آبان» */
export function jalaliDateOnly(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const { jy, jm, jd } = toJalali(new Date(d.getTime() + 3.5 * 3600_000));
  return `${faDigits(jd)} ${JALALI_MONTHS[jm - 1]}`;
}

/** Format HH:MM with Persian digits. */
export function faTime(hhmm) {
  if (!hhmm) return '—';
  return faDigits(hhmm);
}

/** Relative countdown in Persian: «۳ روز مانده», «امروز», «فردا», «گذشته» … */
export function countdown(iso) {
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diff = target - now;
  if (diff < 0) return { text: 'مهلت گذشته', state: 'passed' };
  // Tehran day number (UTC+3:30, no DST since 2022): shift then floor to days
  const tehranDay = (ms) => Math.floor((ms + 3.5 * 3600_000) / 86_400_000);
  const daysAhead = tehranDay(target) - tehranDay(now);
  if (daysAhead === 0) return { text: 'امروز!', state: 'today' };
  if (daysAhead === 1) return { text: 'فردا', state: 'tomorrow' };
  const hours = diff / 3600_000;
  if (hours < 1) return { text: `${faDigits(Math.max(1, Math.round(hours * 60)))} دقیقه مانده`, state: 'soon' };
  if (hours < 24) return { text: `${faDigits(Math.round(hours))} ساعت مانده`, state: 'soon' };
  return { text: `${faDigits(daysAhead)} روز مانده`, state: 'future' };
}

export const KIND_LABELS = {
  project: 'پروژه',
  research: 'تحقیق',
  presentation: 'ارائه',
  exam: 'امتحان',
  quiz: 'آزمونک',
  submission: 'تحویل',
};

export const KIND_ICONS = {
  project: '🧩',
  research: '🔎',
  presentation: '🎤',
  exam: '📝',
  quiz: '⚡',
  submission: '📥',
};

export const PRIORITY_LABELS = {
  low: 'اولویت کم',
  normal: 'معمولی',
  high: 'مهم',
};
