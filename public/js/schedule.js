// درس من — ساختور زنگ‌های کلاس (مشترک بین دانش‌آموز و مدیر)
// زنگ‌ها از این پس «داده» هستند: مدیر کلاس در تب «زنگ‌ها» ساعت‌های هر روز را
// می‌سازد و می‌چیند و این ماژول فقط همان را می‌خواند. هیچ چیزی هاردکد نیست —
// هر کلاسی با هر تعداد زنگ (۰ تا ۱۲ زنگ در روز) پشتیبانی می‌شود.

/** زنگ‌های دریافت‌شده از سرور (روی هر بار لود/رفرش دیتا setBells صدا می‌شود) */
let BELLS = [];
let BY_DAY = new Map();

export function setBells(list) {
  // هر دو سبک کلید (snake_case از دیتابیس / camelCase از API) نرمال می‌شوند
  BELLS = Array.isArray(list) ? list
    .filter((b) => b && Number.isInteger(Number(b.day)) && (b.start_time ?? b.startTime))
    .map((b) => ({
      day: Number(b.day),
      period: Number(b.period),
      start_time: b.start_time ?? b.startTime,
      end_time: b.end_time ?? b.endTime,
    })) : [];
  BY_DAY = new Map();
  for (const b of BELLS) {
    if (!BY_DAY.has(b.day)) BY_DAY.set(b.day, []);
    BY_DAY.get(b.day).push(b);
  }
  for (const arr of BY_DAY.values()) arr.sort((a, b) => a.period - b.period);
}

export function getBells() {
  return BELLS;
}

/** روزهای کلاس‌دار (روزهایی که دست‌کم یک زنگ دارند) */
export function classDays() {
  return [...BY_DAY.keys()].sort((a, b) => a - b);
}

/** تعداد زنگ‌های یک روز هفته (0=شنبه … 6=جمعه) */
export function periodsPerDay(day) {
  return BY_DAY.get(day)?.length ?? 0;
}

/** زنگ‌های یک روز، مرتب بر اساس شماره */
export function bellsOfDay(day) {
  return BY_DAY.get(day) ?? [];
}

/** بازه‌ی زمانی زنگ (day, period): [شروع, پایان] یا null اگر چنین زنگی نیست */
export function periodTimes(day, period) {
  const b = BY_DAY.get(day)?.find((x) => x.period === period);
  return b ? [b.start_time, b.end_time] : null;
}
