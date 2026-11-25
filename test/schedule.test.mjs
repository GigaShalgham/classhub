import test from 'node:test';
import assert from 'node:assert/strict';
import { setBells, classDays, periodsPerDay, periodTimes, bellsOfDay } from '../public/js/schedule.js';

// زنگ‌ها از نسخه‌ی ۵ به بعد «داده» هستند (تب «زنگ‌ها» مدیر) — تست با دیتای
// نمونه‌ی همان ساختار قدیمی (دوشنبه ۳ زنگ، شنبه-چهارشنبه ۴ زنگ، پنجشنبه/جمعه تعطیل)
const BELLS_FIXTURE = [
  { day: 0, period: 1, start_time: '07:45', end_time: '09:00' },
  { day: 0, period: 2, start_time: '09:15', end_time: '10:30' },
  { day: 0, period: 3, start_time: '10:45', end_time: '12:00' },
  { day: 0, period: 4, start_time: '12:30', end_time: '13:45' },
  { day: 1, period: 1, start_time: '07:45', end_time: '09:00' },
  { day: 1, period: 2, start_time: '09:15', end_time: '10:30' },
  { day: 1, period: 3, start_time: '10:45', end_time: '12:00' },
  { day: 1, period: 4, start_time: '12:30', end_time: '13:45' },
  { day: 2, period: 1, start_time: '07:45', end_time: '09:00' },
  { day: 2, period: 2, start_time: '09:15', end_time: '10:30' },
  { day: 2, period: 3, start_time: '11:00', end_time: '12:15' },
  { day: 3, period: 1, start_time: '07:45', end_time: '09:00' },
  { day: 3, period: 2, start_time: '09:15', end_time: '10:30' },
  { day: 3, period: 3, start_time: '10:45', end_time: '12:00' },
  { day: 3, period: 4, start_time: '12:30', end_time: '13:45' },
  { day: 4, period: 1, start_time: '07:45', end_time: '09:00' },
  { day: 4, period: 2, start_time: '09:15', end_time: '10:30' },
  { day: 4, period: 3, start_time: '10:45', end_time: '12:00' },
  { day: 4, period: 4, start_time: '12:30', end_time: '13:45' },
];

setBells(BELLS_FIXTURE);

test('monday has 3 periods, others 4, thu+fri off', () => {
  assert.equal(periodsPerDay(2), 3);
  assert.equal(periodsPerDay(0), 4);
  assert.equal(periodsPerDay(5), 0); // پنجشنبه تعطیل
  assert.equal(periodsPerDay(6), 0); // جمعه تعطیل
});

test('standard period times end at 12:15 (monday) and 13:45 (others)', () => {
  assert.deepEqual(periodTimes(2, 3), ['11:00', '12:15']); // آخرین زنگ دوشنبه
  assert.deepEqual(periodTimes(0, 4), ['12:30', '13:45']); // آخرین زنگ سایر روزها
  assert.deepEqual(periodTimes(0, 1), ['07:45', '09:00']);
  assert.deepEqual(periodTimes(3, 2), ['09:15', '10:30']);
});

test('classDays covers Sat..Wed, no Thu/Fri', () => {
  assert.deepEqual(classDays(), [0, 1, 2, 3, 4]);
});

test('bellsOfDay returns sorted by period, empty for off days', () => {
  const sat = bellsOfDay(0);
  assert.deepEqual(sat.map((b) => b.period), [1, 2, 3, 4]);
  assert.deepEqual(bellsOfDay(5), []);
});

test('setBells normalizes snake/camel keys and drops malformed rows', () => {
  setBells([
    { day: 1, period: 2, startTime: '09:15', endTime: '10:30' }, // camelCase
    { day: 1, period: '1', start_time: '07:45', end_time: '09:00' }, // period به‌صورت رشته
    { day: 1 }, // بدون ساعت — باید دور ریخته شود
    null, // نال — باید دور ریخته شود
  ]);
  const d1 = bellsOfDay(1);
  assert.equal(d1.length, 2);
  assert.deepEqual(d1.map((b) => b.period), [1, 2]);
  assert.equal(periodsPerDay(1), 2);
  setBells(BELLS_FIXTURE); // برگشت به دیتای اصلی برای تست‌های بعدی
});
