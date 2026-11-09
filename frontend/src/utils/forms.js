import { isDate, isTime } from './format';

/** Inline validation message for a partially-typed date/time field (empty is not an error). */
export function badLocal(value, kind, t) {
  if (!value) return undefined;
  if (kind === 'date') return value.length === 10 && !isDate(value) ? t('forms.badDate') : undefined;
  if (kind === 'time') return value.length === 5 && !isTime(value) ? t('forms.badTime') : undefined;
  return undefined;
}
