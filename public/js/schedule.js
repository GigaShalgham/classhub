// کلاس‌هاب — ساختار زنگ‌های کلاس (مشترک بین دانش‌آموز و مدیر)
// دوشنبه ۳ زنگ (پایان ۱۲:۱۵) · بقیه روزها ۴ زنگ (پایان ۱۳:۴۵) · جمعه تعطیل
// زنگ‌های ۷۵ دقیقه‌ای با تفریح‌های ۱۵ و ۳۰ دقیقه‌ای (ناهار)

export const PERIODS_NORMAL = 4;
export const PERIODS_MONDAY = 3;

/** تعداد زنگ‌های یک روز هفته (0=شنبه … 6=جمعه) */
export function periodsPerDay(day) {
  if (day === 2) return PERIODS_MONDAY; // دوشنبه
  if (day === 6) return 0;              // جمعه: تعطیل
  return PERIODS_NORMAL;
}

/** بازه زمانی استاندارد یک زنگ: [شروع, پایان] */
export function periodTimes(day, period) {
  const table = [
    ['07:45', '09:00'],
    ['09:15', '10:30'],
    ['11:00', '12:15'],
    ['12:30', '13:45'],
  ];
  return table[Math.min(period, 4) - 1];
}

/** روزهای کلاس‌دار (برای گرید مدیر) */
export const CLASS_DAYS = [0, 1, 2, 3, 4, 5];
