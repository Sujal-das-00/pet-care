import { DateTime } from 'luxon';

/**
 * Reminder recurrence. Reminders store a UTC `nextDueAt`, an IANA `timezone` and a local
 * wall-clock `localTime` ("HH:mm") so they stay correct across DST and other markets later.
 */
export const RECURRENCE_KINDS = ['none', 'daily', 'weekly', 'monthly', 'yearly'];

export const isValidTimezone = (tz) => DateTime.now().setZone(tz).isValid;

/** UTC Date for a local calendar date ("YYYY-MM-DD") and wall-clock time ("HH:mm"). */
export function localToUtc(dateISO, localTime, timezone) {
  const [h, m] = localTime.split(':').map(Number);
  return DateTime.fromISO(dateISO, { zone: timezone })
    .set({ hour: h, minute: m, second: 0, millisecond: 0 })
    .toUTC()
    .toJSDate();
}

/**
 * First occurrence at/after `from` for a daily/weekly rule that starts on `startDate`.
 * For weekly rules with daysOfWeek (1=Mon..7=Sun) the first matching weekday is chosen.
 */
export function firstOccurrence({ startDate, localTime, timezone, recurrence = 'none', daysOfWeek = [] }, from = new Date()) {
  let cur = DateTime.fromISO(startDate, { zone: timezone });
  const [h, m] = localTime.split(':').map(Number);
  cur = cur.set({ hour: h, minute: m, second: 0, millisecond: 0 });
  const floor = DateTime.fromJSDate(from, { zone: timezone });
  let guard = 0;
  while ((cur < floor || (recurrence === 'weekly' && daysOfWeek.length && !daysOfWeek.includes(cur.weekday))) && guard++ < 800) {
    if (recurrence === 'none') break;
    cur = cur.plus({ days: 1 });
  }
  return cur.toUTC().toJSDate();
}

/**
 * Next occurrence strictly after `after`, skipping any missed ones.
 * Returns null for non-recurring rules or once `endsAt` has passed.
 */
export function nextOccurrence(rule, after = new Date()) {
  const { recurrence = 'none', interval = 1, daysOfWeek = [], localTime, timezone, nextDueAt, endsAt } = rule;
  if (recurrence === 'none') return null;
  let cur = DateTime.fromJSDate(nextDueAt, { zone: timezone });
  const afterDt = DateTime.fromJSDate(after, { zone: timezone });
  const step = Math.max(1, interval);
  let guard = 0;
  do {
    if (recurrence === 'daily') cur = cur.plus({ days: step });
    else if (recurrence === 'monthly') cur = cur.plus({ months: step });
    else if (recurrence === 'yearly') cur = cur.plus({ years: step });
    else if (recurrence === 'weekly') {
      if (daysOfWeek.length) {
        do { cur = cur.plus({ days: 1 }); } while (!daysOfWeek.includes(cur.weekday));
      } else cur = cur.plus({ weeks: step });
    } else return null;
    if (localTime) {
      const [h, m] = localTime.split(':').map(Number);
      cur = cur.set({ hour: h, minute: m, second: 0, millisecond: 0 });
    }
    if (++guard > 5000) return null;
  } while (cur <= afterDt);
  const result = cur.toUTC().toJSDate();
  if (endsAt && result > endsAt) return null;
  return result;
}
