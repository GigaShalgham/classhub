// Unit tests for public/js/utils.js — Jalali calendar, countdowns, Persian digits
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toJalali, fromJalali, formatJalali, countdown, faDigits,
  iranDayIndex, formatJalaliDateTime,
} from '../public/js/utils.js';

// Known Jalali anchors:
// 2026-11-18 Gregorian = 27 Aban 1405
// 2026-03-21 = 1 Farvardin 1405 (Nowruz 1405)
// 2025-09-22 = 31 Shahrivar 1404 (last day of month)
test('toJalali: 2026-11-18 -> 1405/8/27', () => {
  const d = toJalali(new Date(2026, 10, 18));
  assert.deepEqual([d.jy, d.jm, d.jd], [1405, 8, 27]);
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
  const c5h = countdown(new Date(now + 5 * 3600_000).toISOString());
  assert.match(c5h.text, /فردا|ساعت/);
});

test('faDigits converts Latin to Persian digits', () => {
  assert.equal(faDigits('07:30 - پریود 12'), '۰۷:۳۰ - پریود ۱۲');
});

test('formatJalaliDateTime renders Tehran time', () => {
  const s = formatJalaliDateTime('2026-11-23T12:00:00Z');
  assert.ok(s.includes('آذر'), `expected آذر in ${s}`);
  assert.ok(s.includes('۱۵:۳۰'), `expected ۱۵:۳۰ in ${s}`);
});
