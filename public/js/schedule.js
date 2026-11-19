// کلاس‌هاب — ساختار زنگ‌های کلاس (مشترک بین دانش‌آموز و مدیر)
// شنبه تا چهارشنبه: ۴ زنگ (۰۷:۴۵ تا ۱۳:۴۵)
// دوشنبه: ۳ زنگ (پایان ۱۲:۱۵)
// پنجشنبه و جمعه: تعطیل
// زنگ‌های ۷۵ دقیقه‌ای با تفریح‌های ۱۵ و ۳۰ دقیقه‌ای (ناهار)

export const PERIODS_NORMAL = 4;
export const PERIODS_MONDAY = 3;

/** بازه‌ی زمانی استاندارد زنگ‌ها [شروع, پایان] */
export const PERIOD_TABLE = [
  ['07:45', '09:00'],
  ['09:15', '10:30'],
  ['11:00', '12:15'],
  ['12:30', '13:45'],
];

/** روزهای کلاس‌دار (0=شنبه … 4=چهارشنبه) */
export const CLASS_DAYS = [0, 1, 2, 3, 4];

/** تعداد زنگ‌های یک روز هفته (0=شنبه … 6=جمعه) */
export function periodsPerDay(day) {
  if (day === 2) return PERIODS_MONDAY; // دوشنبه
  if (day === 5 || day === 6) return 0; // پنجشنبه و جمعه: تعطیل
  return PERIODS_NORMAL;
}

/** بازه زمانی استاندارد یک زنگ: [شروع, پایان] */
export function periodTimes(day, period) {
  return PERIOD_TABLE[Math.min(period, 4) - 1];
}
