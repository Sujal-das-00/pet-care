import { DateTime } from 'luxon';

const zone = 'Asia/Tokyo'; // display zone; the user's own timezone is applied by the server for scheduling
const loc = () => 'en-US';
const dt = (iso, tz = zone) => DateTime.fromISO(iso, { zone: tz }).setLocale(loc());

/** Sun, Nov 28 */
export const fmtDate = (iso, tz) => (iso ? dt(iso, tz).toFormat('ccc, MMM d') : '');
export const fmtDateLong = (iso, tz) => (iso ? dt(iso, tz).toFormat('MMM d, yyyy') : '');
export const fmtTime = (iso, tz) => (iso ? dt(iso, tz).toFormat('HH:mm') : '');
export const fmtDateTime = (iso, tz) => (iso ? `${fmtDate(iso, tz)} ${fmtTime(iso, tz)}` : '');
export const fmtShort = (iso, tz) => (iso ? dt(iso, tz).toFormat('MMM d') : '');

export const todayISO = (tz = zone) => DateTime.now().setZone(tz).toISODate();
/** True when the instant falls on today's calendar date in the display zone (not the UTC date). */
export const isToday = (iso, tz = zone) => DateTime.fromISO(iso, { zone: tz }).toISODate() === todayISO(tz);
export const isOverdue = (iso) => DateTime.fromISO(iso).toMillis() < Date.now();

export const fmtAge = (age, t) => {
  if (!age) return '';
  if (age.years >= 1) return t('pet.ageYears', { count: age.years });
  return t('pet.ageMonths', { count: age.months });
};

export const fmtWeight = (grams, unit = 'kg') => {
  if (grams == null) return '–';
  const v = unit === 'lb' ? grams / 453.59237 : grams / 1000;
  return `${Math.round(v * 10) / 10} ${unit}`;
};

export const greetingKey = (tz = zone) => {
  const h = DateTime.now().setZone(tz).hour;
  return h < 11 ? 'home.goodMorning' : h < 18 ? 'home.goodAfternoon' : 'home.goodEvening';
};

export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && DateTime.fromISO(s).isValid;
export const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const errMsg = (e, t) => (e?.code === 'membership_required' ? t('membership.required') : e?.code === 'event_full' ? t('events.full') : e?.code === 'slow_down' ? t('community.slowDown') : e?.status === 0 ? t('common.offline') : e?.details?.[0]?.message ? `${e.details[0].path}: ${e.details[0].message}` : e?.message || t('common.error'));
