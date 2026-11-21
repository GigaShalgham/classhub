// Unit tests for public/js/utils.js — Jalali calendar, countdowns, Persian digits
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toJalali, fromJalali, formatJalali, countdown, faDigits,
  iranDayIndex, formatJalaliDateTime, tehranYMD, tehranDayNumber,
  rollingWindow, jalaliDateOnly, toJalaliParts,
  weekParity, isoDayNum, saturdayDayNumOf,
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
