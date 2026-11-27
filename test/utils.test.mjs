// Unit tests for public/js/utils.js — Jalali calendar, countdowns, Persian digits
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toJalali, fromJalali, formatJalali, countdown, faDigits,
  iranDayIndex, formatJalaliDateTime, tehranYMD, tehranDayNumber,
  rollingWindow, fortnightWindow, weekOffsetBounds, tehranDateISO, jalaliDateOnly, toJalaliParts,
  weekParity, isoDayNum, saturdayDayNumOf,
  tehranLocalDate, tehranDayIndex, todayJalali,
} from '../public/js/utils.js';

// Known Jalali anchors:
// 2026-11-18 Gregorian = 27 Aban 1405
// 2026-03-21 = 1 Farvardin 1405 (Nowruz 1405)
// 2025-09-22 = 31 Shahrivar 1404 (last day of month)
test('toJalali: 2026-11-18 -> 1405/8/27', () => {
  const d = toJalali(new Date(2026, 10, 18));
  assert.deepEqual([d.jy, d.jm, d.jd], [1405, 8, 27]);
});

test('toJalaliParts matches toJalali', () => {
  const d = new Date(2026, 10, 18);
  assert.deepEqual(toJalaliParts(2026, 11, 18), toJalali(d));
});

test('toJalali: Nowruz 1405', () => {
  const d = toJalali(new Date(2026, 2, 21));
  assert.deepEqual([d.jy, d.jm, d.jd], [1405, 1, 1]);
});

test('toJalali: last day of Shahrivar 1404', () => {
  const d = toJalali(new Date(2025, 8, 22));
  assert.deepEqual([d.jy, d.jm, d.jd], [1404, 6, 31]);
});

test('fromJalali round-trip', () => {
  const rt = fromJalali(1405, 8, 27);
  assert.equal(rt.getFullYear(), 2026);
  assert.equal(rt.getMonth(), 10);
  assert.equal(rt.getDate(), 18);
});

test('formatJalali produces Persian text', () => {
  assert.equal(formatJalali(new Date(2026, 10, 18)), '۲۷ آبان ۱۴۰۵');
});

test('formatJalali with weekday', () => {
  assert.equal(formatJalali(new Date(2026, 10, 18), { withWeekday: true }), 'چهارشنبه ۲۷ آبان ۱۴۰۵');
});

test('iranDayIndex: Saturday=0, Wednesday=4', () => {
  assert.equal(iranDayIndex(new Date(2026, 10, 21)), 0); // Saturday
  assert.equal(iranDayIndex(new Date(2026, 10, 18)), 4); // Wednesday
});

test('countdown states', () => {
  const now = Date.now();
  assert.equal(countdown(new Date(now - 1000).toISOString()).state, 'passed');
  const c3d = countdown(new Date(now + 3 * 86400_000).toISOString());
  assert.match(c3d.text, /۳ روز مانده|۲ روز مانده/);
  // +5h may be today, tomorrow, or 'hours left' depending on time of day (Tehran midnight crossing)
  const c5h = countdown(new Date(now + 5 * 3600_000).toISOString());
  assert.match(c5h.text, /فردا|ساعت|امروز/);
});

test('faDigits converts Latin to Persian digits', () => {
  assert.equal(faDigits('07:30 - پریود 12'), '۰۷:۳۰ - پریود ۱۲');
});

test('formatJalaliDateTime renders Tehran time', () => {
  const s = formatJalaliDateTime('2026-11-23T12:00:00Z');
  assert.ok(s.includes('آذر'), `expected آذر in ${s}`);
  assert.ok(s.includes('۱۵:۳۰'), `expected ۱۵:۳۰ in ${s}`);
});

// ---------- تهران و پنجره غلتان ----------

test('tehranYMD: نیمه‌شب تهران = روز قبلِ UTC', () => {
  // 2026-11-19 01:00 UTC = 2026-11-19 04:30 تهران -> همان روز
  const a = tehranYMD(Date.UTC(2026, 10, 19, 1, 0));
  assert.deepEqual([a.y, a.m, a.d], [2026, 11, 19]);
  // 2026-11-19 22:00 UTC = 2026-11-20 01:30 تهران -> فردا
  const b = tehranYMD(Date.UTC(2026, 10, 19, 22, 0));
  assert.deepEqual([b.y, b.m, b.d], [2026, 11, 20]);
});

test('tehranDayNumber: روز بعدِ تهران دقیقاً +۱', () => {
  const t1 = Date.UTC(2026, 10, 19, 10, 0);
  const t2 = Date.UTC(2026, 10, 20, 10, 0);
  assert.equal(tehranDayNumber(t2) - tehranDayNumber(t1), 1);
  //跨越 نیمه‌شب تهران (20:00 UTC = 23:30 تهران همان روز؛ 21:00 UTC = 00:30 فردا)
  const t3 = Date.UTC(2026, 10, 19, 20, 0);
  const t4 = Date.UTC(2026, 10, 19, 21, 0);
  assert.equal(tehranDayNumber(t4) - tehranDayNumber(t3), 1);
});

test('rollingWindow: ۷ روز متوالی از امروزِ تهران، هرگز گذشته نه', () => {
  // چهارشنبه ۲۷ آبان ۱۴۰۵ = 2026-11-18 ساعت ۱۰:۰۰ UTC
  const now = Date.UTC(2026, 10, 18, 10, 0);
  const win = rollingWindow(7, now);
  assert.equal(win.length, 7);
  // روز اول = امروز (چهارشنبه=4)
  assert.equal(win[0].dayIdx, 4);
  // ترتیب dayIdx: 4,5,6,0,1,2,3 (چهارشنبه تا چهارشنبه بعد)
  assert.deepEqual(win.map((w) => w.dayIdx), [4, 5, 6, 0, 1, 2, 3]);
  // تاریخ‌ها صعودی و پیوسته‌اند
  for (let i = 1; i < win.length; i++) {
    const diff = (win[i].date - win[i - 1].date) / 86_400_000;
    assert.equal(diff, 1, `روز ${i} فاصله ${diff} دارد`);
  }
  // تاریخ شمسی روز اول همان امروز است
  const j = toJalali(win[0].date);
  assert.equal(j.jd, 27);
  assert.equal(j.jm, 8);
  assert.equal(j.jy, 1405);
});

// رگرسیون باگ «تکلیف ذخیره می‌شود ولی نمایش داده نمی‌شود»:
// پنجره‌ی نمایش = دو هفته‌ی کامل (این هفته + هفته‌ی بعد). روزِ تمرکزِ صفحه در
// آخر هفته و عصرِ بعد از آخرین زنگ «شنبه‌ی بعد» است؛ با پنجره‌ی ۷روزه از آنجا،
// تکالیفِ همین هفته بیرون می‌افتاد.
const DAY = 86_400_000;
// جمعه‌ی ۲۰۲۶-۱۱-۲۷ ساعت ۱۳:۳۵ تهران = ۱۰:۰۵ UTC (لاگِ واقعی روزِ گزارش باگ)
const FRI_NOON = Date.UTC(2026, 10, 27, 10, 5);

test('fortnightWindow: جمعه → شنبه‌ی همین هفته تا جمعه‌ی هفته‌ی بعد (۱۴ روز)', () => {
  const win = fortnightWindow(0, FRI_NOON);
  assert.equal(win.length, 14);
  assert.equal(win[0].dateISO, '2026-11-21'); // شنبه‌ی همین هفته
  assert.equal(win[6].dateISO, '2026-11-27'); // جمعه = امروز
  assert.equal(win[7].dateISO, '2026-11-28'); // شنبه‌ی هفته‌ی بعد (روزِ تمرکز)
  assert.equal(win[13].dateISO, '2026-12-04'); // جمعه‌ی هفته‌ی بعد
  assert.deepEqual(win.map((w) => w.dayIdx), [0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]);
  for (let i = 1; i < win.length; i++) {
    assert.equal(win[i].dayNum - win[i - 1].dayNum, 1, `روز ${i} پیوسته نیست`);
    assert.equal(win[i].date.getTime() - win[i - 1].date.getTime(), DAY);
  }
  // تاریخِ نمایش (نونِ محلی) همان تاریخِ تهران است
  assert.equal(toJalali(win[0].date).jd, 30);
  assert.equal(toJalali(win[0].date).jm, 8);
  assert.equal(toJalali(win[7].date).jm, 9); // ۷ آذر
});

test('fortnightWindow: عصرِ آخرین روزِ درسی (چهارشنبه ۱۴:۳۰) → همین هفته از شنبه', () => {
  const now = Date.UTC(2026, 10, 25, 11, 0); // چهارشنبه ۲۰۲۶-۱۱-۲۵، ۱۴:۳۰ تهران
  const win = fortnightWindow(0, now);
  assert.equal(win[0].dateISO, '2026-11-21');
  assert.equal(win[4].dateISO, '2026-11-25'); // امروز
  assert.equal(win[13].dateISO, '2026-12-04');
});

test('fortnightWindow: صبحِ روزِ کلاس (دوشنبه ۰۸:۰۰) و خودِ شنبه', () => {
  const mon = fortnightWindow(0, Date.UTC(2026, 10, 23, 4, 30)); // دوشنبه ۲۰۲۶-۱۱-۲۳
  assert.equal(mon[0].dateISO, '2026-11-21');
  assert.equal(mon[2].dateISO, '2026-11-23');
  const sat = fortnightWindow(0, Date.UTC(2026, 10, 28, 6, 30)); // شنبه ۲۰۲۶-۱۱-۲۸
  assert.equal(sat[0].dateISO, '2026-11-28');
  assert.equal(sat[13].dateISO, '2026-12-11');
});

test('fortnightWindow: هر روزِ ۷روزه‌ی آینده و روزِ تمرکز همیشه در پنجره‌ی پیش‌فرض‌اند', () => {
  // برای هر ساعتِ هفته‌ی ۲۱–۲۷ نوامبر: امروز + ۶ روزِ بعد و ۶ روزِ قبلِ بعدی هم پوشش داده می‌شوند
  for (let h = 0; h < 7 * 24; h += 3) {
    const now = Date.UTC(2026, 10, 21, 0, 0) + h * 3_600_000;
    const today = tehranDayNumber(now);
    const nums = fortnightWindow(0, now).map((w) => w.dayNum);
    for (let k = 0; k <= 6; k++) {
      assert.ok(nums.includes(today + k), `now=${new Date(now).toISOString()} k=${k} بیرون از پنجره`);
    }
    assert.equal(nums[0], nums[13] - 13);
  }
});

test('fortnightWindow: جابه‌جایی هفته‌ای', () => {
  const prev = fortnightWindow(-1, FRI_NOON);
  assert.equal(prev[0].dateISO, '2026-11-14');
  assert.equal(prev[13].dateISO, '2026-11-27'); // امروزِ جمعه هنوز آخر پنجره است
  const next = fortnightWindow(1, FRI_NOON);
  assert.deepEqual([next[0].dateISO, next[13].dateISO], ['2026-11-28', '2026-12-11']);
});

test('weekOffsetBounds: پنجره هرگز بیرون از بازه‌ی تکالیفِ API نمی‌رود', () => {
  // بازه‌ی واقعی API در روزِ گزارش: ۲۱ روز قبل تا ۴۵ روز بعد
  const b = weekOffsetBounds({ from: '2026-11-06', to: '2027-01-11' }, FRI_NOON);
  assert.deepEqual(b, { min: -2, max: 5 });
  for (let k = b.min; k <= b.max; k++) {
    const w = fortnightWindow(k, FRI_NOON);
    assert.ok(w[0].dateISO >= '2026-11-06' && w[13].dateISO <= '2027-01-11', `k=${k}`);
  }
  // یک پله بیرون‌تر از هر طرف، بیرون از بازه است
  assert.ok(fortnightWindow(b.min - 1, FRI_NOON)[0].dateISO < '2026-11-06');
  assert.ok(fortnightWindow(b.max + 1, FRI_NOON)[13].dateISO > '2027-01-11');
  // بدون hwRange: محدوده‌ی محافظه‌کارانه
  assert.deepEqual(weekOffsetBounds(null, FRI_NOON), { min: -2, max: 4 });
});

test('tehranDateISO: مرز نیمه‌شبِ تهران', () => {
  assert.equal(tehranDateISO(Date.UTC(2026, 10, 27, 10, 5)), '2026-11-27'); // ۱۳:۳۵ تهران
  assert.equal(tehranDateISO(Date.UTC(2026, 10, 27, 20, 40)), '2026-11-28'); // ۰۰:۱۰ فردا
  // کلید هر روزِ پنجره با شماره‌ی روزِ آن هم‌خوان است
  for (const w of fortnightWindow(0, FRI_NOON)) {
    assert.equal(tehranDateISO(w.dayNum * DAY), w.dateISO);
  }
});

test('rollingWindow: نیمه‌شب تهران درست شروع می‌شود', () => {
  // 2026-11-19 20:30 UTC = 2026-11-20 00:00 تهران دقیق -> پنجره از ۲۰ نوامبر (جمعه) شروع می‌شود
  const now = Date.UTC(2026, 10, 19, 20, 30);
  const win = rollingWindow(3, now);
  const j = toJalali(win[0].date);
  assert.equal(j.jd, 29); // 29 آبان
  assert.equal(iranDayIndex(win[0].date), 6); // جمعه
});

test('jalaliDateOnly', () => {
  assert.equal(jalaliDateOnly('2026-11-23T12:00:00Z'), '۲ آذر');
  assert.equal(jalaliDateOnly(null), '—');
});

// ---------- زنگ‌های گردشی: پاریتی هفته نسبت به مبنا ----------
// شنبه ۱۴۰۵/۰۹/۰۱ = 2026-11-21 (میلادی) — همان مبنا که قبلاً در کد هاردکد بود
const NOON = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0).getTime();

test('isoDayNum: بدون وابستگی زمانی', () => {
  assert.equal(isoDayNum('2026-11-21'), isoDayNum('2026-11-22') - 1);
  assert.equal(isoDayNum('2026-11-21') % 7, isoDayNum('2026-11-28') % 7);
});

test('saturdayDayNumOf: شنبه‌ی هفته‌ی جاری', () => {
  // 2026-11-25 چهارشنبه است؛ شنبه‌ی همان هفته 2026-11-21
  const sat = saturdayDayNumOf(NOON(2026, 11, 25));
  assert.equal(sat, isoDayNum('2026-11-21'));
  // خود شنبه و جمعه‌ی همان هفته → همان شنبه
  assert.equal(saturdayDayNumOf(NOON(2026, 11, 21)), sat);
  assert.equal(saturdayDayNumOf(NOON(2026, 11, 27)), sat);
});

test('weekParity: مبنا = هفته‌ی اصلی', () => {
  const anchor = '2026-11-21';
  assert.equal(weekParity(NOON(2026, 11, 21), anchor), 'main'); // هفته‌ی مبنا → اصلی
  assert.equal(weekParity(NOON(2026, 11, 27), anchor), 'main'); // جمعه‌ی همان هفته
  assert.equal(weekParity(NOON(2026, 11, 28), anchor), 'alt');  // شنبه‌ی بعد → دوم
  assert.equal(weekParity(NOON(2026, 12, 4), anchor), 'alt');   // جمعه‌ی هفته‌ی دوم
  assert.equal(weekParity(NOON(2026, 12, 5), anchor), 'main');  // دو هفته بعد → اصلی
});

test('weekParity: بدون مبنا → null (درس اصلی)', () => {
  assert.equal(weekParity(NOON(2026, 11, 21), null), null);
  assert.equal(weekParity(NOON(2026, 11, 21), ''), null);
  assert.equal(weekParity(NOON(2026, 11, 21), undefined), null);
});

test('weekParity: تاریخ قبل از مبنا → null (درس اصلی)', () => {
  assert.equal(weekParity(NOON(2026, 11, 14), '2026-11-21'), null);
});

test('weekParity: مبنا غیرشنبه هم به شنبه‌ی همان هفته نرمال می‌شود', () => {
  // دوشنبه 2026-11-23 همان هفته‌ی شنبه 2026-11-21 است
  assert.equal(weekParity(NOON(2026, 11, 28), '2026-11-23'), 'alt');
  assert.equal(weekParity(NOON(2026, 11, 21), '2026-11-23'), 'main');
});

test('weekParity: مبنا جمعه‌ی همان هفته هم شنبه‌ی همان هفته است', () => {
  assert.equal(weekParity(NOON(2026, 11, 28), '2026-11-27'), 'alt');
  assert.equal(weekParity(NOON(2026, 11, 21), '2026-11-27'), 'main');
});


// ---------- امروزِ تهران (مقاوم در برابر منطقه‌ی زمانی مرورگر) ----------
test('tehranDayIndex: شنبه و یکشنبه', () => {
  assert.equal(tehranDayIndex(NOON(2026, 11, 21)), 0); // شنبه
  assert.equal(tehranDayIndex(NOON(2026, 11, 22)), 1); // یکشنبه
  assert.equal(tehranDayIndex(NOON(2026, 11, 27)), 6); // جمعه
});

test('tehranLocalDate: نیمه‌شب تهران بعد از UTC، تاریخ فردا', () => {
  // 2026-11-22T22:00Z = 2026-11-23 01:30 تهران → باید ۲۳ نوامبر باشد
  const d = tehranLocalDate(Date.UTC(2026, 10, 22, 22, 0));
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 10);
  assert.equal(d.getDate(), 23);
});

test('todayJalali: ۱ آذر ۱۴۰۵ روی ۲۲ نوامبر', () => {
  const j = todayJalali(NOON(2026, 11, 22));
  assert.deepEqual([j.jy, j.jm, j.jd], [1405, 9, 1]);
});
