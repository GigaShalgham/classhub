import test from 'node:test';
import assert from 'node:assert/strict';
import { periodsPerDay, periodTimes, CLASS_DAYS, PERIODS_MONDAY, PERIODS_NORMAL } from '../public/js/schedule.js';

test('monday has 3 periods, others 4, thu+fri off', () => {
  assert.equal(periodsPerDay(2), PERIODS_MONDAY);
  assert.equal(PERIODS_MONDAY, 3);
  assert.equal(periodsPerDay(0), PERIODS_NORMAL);
  assert.equal(PERIODS_NORMAL, 4);
  assert.equal(periodsPerDay(5), 0); // پنجشنبه تعطیل
  assert.equal(periodsPerDay(6), 0); // جمعه تعطیل
});

test('standard period times end at 12:15 (monday) and 13:45 (others)', () => {
  assert.deepEqual(periodTimes(2, 3), ['11:00', '12:15']); // آخرین زنگ دوشنبه
  assert.deepEqual(periodTimes(0, 4), ['12:30', '13:45']); // آخرین زنگ سایر روزها
  assert.deepEqual(periodTimes(0, 1), ['07:45', '09:00']);
  assert.deepEqual(periodTimes(3, 2), ['09:15', '10:30']);
});

test('CLASS_DAYS covers Sat..Wed, no Thu/Fri', () => {
  assert.deepEqual(CLASS_DAYS, [0, 1, 2, 3, 4]);
});
