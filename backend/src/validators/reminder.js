import { z } from 'zod';
import { dateStr, objectId, timeStr, weekdays } from './common.js';

export const createReminderBody = z
  .object({
    petId: objectId.nullable().default(null),
    kind: z.enum(['weight', 'feeding', 'grooming', 'general', 'custom']),
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().max(300).default(''),
    date: dateStr, // first occurrence, in the owner's timezone
    localTime: timeStr,
    recurrence: z.enum(['none', 'daily', 'weekly', 'monthly', 'yearly']).default('none'),
    interval: z.number().int().min(1).max(365).default(1),
    daysOfWeek: weekdays.default([]),
    endDate: dateStr.nullable().default(null),
  })
  .refine((r) => !r.endDate || r.endDate >= r.date, { path: ['endDate'], message: 'End date is before start date' })
  .refine((r) => r.recurrence === 'weekly' || r.daysOfWeek.length === 0, { path: ['daysOfWeek'], message: 'daysOfWeek only applies to weekly reminders' });

export const updateReminderBody = z
  .object({
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().max(300),
    date: dateStr,
    localTime: timeStr,
    recurrence: z.enum(['none', 'daily', 'weekly', 'monthly', 'yearly']),
    interval: z.number().int().min(1).max(365),
    daysOfWeek: weekdays,
    endDate: dateStr.nullable(),
  })
  .partial()
  .strict();

export const listRemindersQuery = z.object({
  petId: objectId.optional(),
  scope: z.enum(['today', 'upcoming', 'pending', 'all']).default('upcoming'),
  days: z.coerce.number().int().min(1).max(365).default(14),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const completeReminderBody = z.object({ action: z.enum(['done', 'skip']).default('done') });
