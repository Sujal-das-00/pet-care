import { DateTime } from 'luxon';
import { PetWeight } from '../models/PetWeight.js';

/** Age as { years, months } from a YYYY-MM-DD birth date, relative to `now` in `tz`. */
export function ageFromDob(dob, tz = 'Asia/Tokyo', now = new Date()) {
  if (!dob) return null;
  const birth = DateTime.fromISO(dob, { zone: tz });
  const today = DateTime.fromJSDate(now, { zone: tz });
  if (!birth.isValid || birth > today) return null;
  const diff = today.diff(birth, ['years', 'months']).toObject();
  return { years: Math.floor(diff.years), months: Math.floor(diff.months) };
}

const LB_TO_G = 453.59237;
export const toGrams = (value, unit) => Math.round(unit === 'kg' ? value * 1000 : unit === 'lb' ? value * LB_TO_G : value);
export const fromGrams = (grams, unit) => {
  const v = unit === 'lb' ? grams / LB_TO_G : grams / 1000;
  return Math.round(v * 100) / 100;
};

/** Latest recorded weight (grams) for each pet id, in one query. */
export async function latestWeights(petIds) {
  if (!petIds.length) return new Map();
  const rows = await PetWeight.aggregate([
    { $match: { petId: { $in: petIds } } },
    { $sort: { measuredAt: -1, _id: -1 } },
    { $group: { _id: '$petId', weightGrams: { $first: '$weightGrams' }, measuredAt: { $first: '$measuredAt' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), { weightGrams: r.weightGrams, measuredAt: r.measuredAt }]));
}
