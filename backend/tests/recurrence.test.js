import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstOccurrence, nextOccurrence, localToUtc } from '../src/utils/recurrence.js';
import { toGrams, fromGrams, ageFromDob } from '../src/services/petService.js';

test('Tokyo local time maps to UTC (+9, no DST)', () => {
  assert.equal(localToUtc('2026-11-08', '08:00', 'Asia/Tokyo').toISOString(), '2026-11-07T23:00:00.000Z');
});

test('daily: first occurrence is today if still ahead, else tomorrow', () => {
  const rule = { startDate: '2026-11-08', localTime: '20:00', timezone: 'Asia/Tokyo', recurrence: 'daily' };
  const morning = new Date('2026-11-08T00:00:00Z'); // 09:00 JST
  assert.equal(firstOccurrence(rule, morning).toISOString(), '2026-11-08T11:00:00.000Z'); // 20:00 JST today
  const night = new Date('2026-11-08T13:00:00Z'); // 22:00 JST
  assert.equal(firstOccurrence(rule, night).toISOString(), '2026-11-09T11:00:00.000Z');
});

test('nextOccurrence skips missed days and honours endsAt', () => {
  const base = { recurrence: 'daily', localTime: '08:00', timezone: 'Asia/Tokyo', nextDueAt: new Date('2026-11-01T23:00:00Z') };
  const after = new Date('2026-11-05T12:00:00Z');
  assert.equal(nextOccurrence(base, after).toISOString(), '2026-11-05T23:00:00.000Z');
  assert.equal(nextOccurrence({ ...base, endsAt: new Date('2026-11-05T00:00:00Z') }, after), null);
  assert.equal(nextOccurrence({ ...base, recurrence: 'none' }, after), null);
});

test('weekly on selected weekdays (1=Mon..7=Sun)', () => {
  // 2026-11-09 is a Monday
  const rule = { recurrence: 'weekly', daysOfWeek: [1, 4], localTime: '09:00', timezone: 'Asia/Tokyo', nextDueAt: new Date('2026-11-09T00:00:00Z') };
  assert.equal(nextOccurrence(rule, new Date('2026-11-09T01:00:00Z')).toISOString(), '2026-11-12T00:00:00.000Z'); // Thursday
  const start = firstOccurrence({ startDate: '2026-11-10', localTime: '09:00', timezone: 'Asia/Tokyo', recurrence: 'weekly', daysOfWeek: [4] }, new Date('2026-11-09T00:00:00Z'));
  assert.equal(start.toISOString(), '2026-11-12T00:00:00.000Z');
});

test('weight unit conversion round-trips sensibly', () => {
  assert.equal(toGrams(4.2, 'kg'), 4200);
  assert.equal(toGrams(10, 'lb'), 4536);
  assert.equal(fromGrams(4536, 'lb'), 10);
  assert.equal(fromGrams(4200, 'kg'), 4.2);
});

test('age from date of birth', () => {
  const now = new Date('2026-11-08T03:00:00Z');
  assert.deepEqual(ageFromDob('2021-03-05', 'Asia/Tokyo', now), { years: 5, months: 8 });
  assert.equal(ageFromDob(null), null);
  assert.equal(ageFromDob('2030-01-01', 'Asia/Tokyo', now), null);
});
