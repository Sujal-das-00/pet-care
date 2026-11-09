import { z } from 'zod';
import { dateStr, forUpdate, isoDateTime, timeStr, weekdays } from './common.js';

const personality = z.array(z.string().trim().min(1).max(24)).max(8);

export const createPetBody = z.object({
  name: z.string().trim().min(1).max(40),
  species: z.enum(['dog', 'cat']),
  breed: z.string().trim().max(60).default(''),
  gender: z.enum(['male', 'female', 'unknown']).default('unknown'),
  neutered: z.boolean().nullable().default(null),
  dateOfBirth: dateStr.nullable().default(null),
  dobEstimated: z.boolean().default(false),
  personality: personality.default([]),
  bio: z.string().trim().max(300).default(''),
  microchipId: z.string().trim().max(30).default(''),
});
export const updatePetBody = forUpdate(createPetBody).omit({ species: true }).strict();

export const weightBody = z.object({
  value: z.number().positive().max(200000),
  unit: z.enum(['kg', 'lb', 'g']).optional(), // defaults to the owner's preferred unit
  measuredAt: isoDateTime.optional(),
  note: z.string().trim().max(200).default(''),
});
export const seriesQuery = z.object({ days: z.coerce.number().int().min(7).max(3650).default(365) });

const schedule = z.object({ localTime: timeStr, daysOfWeek: weekdays.default([]) });
export const medicationBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    dosageInstructions: z.string().trim().max(500).default(''),
    prescribedBy: z.string().trim().max(80).default(''),
    notes: z.string().trim().max(500).default(''),
    startDate: dateStr,
    endDate: dateStr.nullable().default(null),
    schedules: z.array(schedule).max(8).default([]),
    remindersEnabled: z.boolean().default(true),
  })
  .refine((m) => !m.endDate || m.endDate >= m.startDate, { path: ['endDate'], message: 'End date is before start date' });
export const updateMedicationBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    dosageInstructions: z.string().trim().max(500),
    prescribedBy: z.string().trim().max(80),
    notes: z.string().trim().max(500),
    startDate: dateStr,
    endDate: dateStr.nullable(),
    schedules: z.array(schedule).max(8),
    remindersEnabled: z.boolean(),
  })
  .partial()
  .strict();

export const vaccinationBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    administeredOn: dateStr,
    nextDueOn: dateStr.nullable().default(null),
    clinicName: z.string().trim().max(100).default(''),
    notes: z.string().trim().max(500).default(''),
    remindersEnabled: z.boolean().default(true),
  })
  .refine((v) => !v.nextDueOn || v.nextDueOn >= v.administeredOn, { path: ['nextDueOn'], message: 'Next due is before administered date' });
export const updateVaccinationBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    administeredOn: dateStr,
    nextDueOn: dateStr.nullable(),
    clinicName: z.string().trim().max(100),
    notes: z.string().trim().max(500),
    remindersEnabled: z.boolean(),
  })
  .partial()
  .strict();

export const appointmentBody = z.object({
  clinicName: z.string().trim().min(1).max(100),
  clinicAddress: z.string().trim().max(200).default(''),
  clinicPhone: z.string().trim().max(30).default(''),
  vetName: z.string().trim().max(80).default(''),
  reason: z.string().trim().max(200).default(''),
  scheduledAt: isoDateTime,
  reminderMinutesBefore: z.number().int().min(0).max(10080).default(60),
});
export const updateAppointmentBody = forUpdate(appointmentBody)
  .extend({
    status: z.enum(['scheduled', 'completed', 'cancelled']).optional(),
    visitNotes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const feedingBody = z.object({
  label: z.string().trim().min(1).max(60),
  localTime: timeStr,
  daysOfWeek: weekdays.default([]),
  food: z.string().trim().max(100).default(''),
  amountNote: z.string().trim().max(100).default(''),
  active: z.boolean().default(true),
});
export const updateFeedingBody = forUpdate(feedingBody).strict();

export const documentBody = z.object({
  filename: z.string().trim().min(1).max(120),
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  sizeBytes: z.number().int().min(1).max(15 * 1024 * 1024),
  kind: z.enum(['vaccination', 'medical', 'prescription', 'other']).default('other'),
  title: z.string().trim().max(120).default(''),
  linkedType: z.enum(['vaccination', 'appointment']).nullable().default(null),
  linkedId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().default(null),
});
