import { z } from 'zod';
import { isValidTimezone } from '../utils/recurrence.js';

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');
export const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm');
export const timezone = z.string().refine(isValidTimezone, 'Invalid IANA timezone');
export const weekdays = z.array(z.number().int().min(1).max(7)).max(7).refine((a) => new Set(a).size === a.length, 'Duplicate weekday');
export const isoDateTime = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

export const idParams = (...names) => z.object(Object.fromEntries(names.map((n) => [n, objectId])));
export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(200).optional(),
});

/**
 * Builds a PATCH schema from a create schema: every field optional and — crucially — with
 * defaults removed. (zod's .partial() keeps .default(), which would silently overwrite stored
 * values with defaults on every partial update.)
 */
export const forUpdate = (objectSchema) =>
  z.object(
    Object.fromEntries(
      Object.entries(objectSchema.shape).map(([key, field]) => [key, (field instanceof z.ZodDefault ? field.unwrap() : field).optional()]),
    ),
  );
