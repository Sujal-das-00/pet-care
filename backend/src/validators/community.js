import { z } from 'zod';
import { PREFECTURE_CODES } from '../utils/prefectures.js';
import { EVENT_CATEGORIES } from '../models/Event.js';
import { REPORT_REASONS, REPORT_TARGETS } from '../models/Report.js';
import { forUpdate, isoDateTime, objectId } from './common.js';

const prefecture = z.enum(PREFECTURE_CODES);
const tint = z.enum(['peach', 'lavender', 'blue', 'yellow', 'green', 'pink']);
const offsetLimit = {
  limit: z.coerce.number().int().min(1).max(30).default(20),
  offset: z.coerce.number().int().min(0).max(1000).default(0),
};

/* ---- communities ---- */
export const listCommunitiesQuery = z.object({
  scope: z.enum(['popular', 'nearby', 'mine', 'new']).default('popular'),
  q: z.string().trim().max(60).optional(),
  species: z.enum(['dog', 'cat']).optional(),
  kind: z.enum(['city', 'breed', 'interest', 'activity', 'general']).optional(),
  prefecture: prefecture.optional(),
  ...offsetLimit,
});

export const createCommunityBody = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500).default(''),
  kind: z.enum(['city', 'breed', 'interest', 'activity', 'general']).default('general'),
  species: z.enum(['any', 'dog', 'cat']).default('any'),
  breed: z.string().trim().max(60).default(''),
  prefecture: prefecture.nullable().default(null),
  city: z.string().trim().max(60).default(''),
  emoji: z.string().trim().min(1).max(8).default('🐾'),
  tint: tint.default('green'),
});
export const updateCommunityBody = forUpdate(createCommunityBody).omit({ kind: true }).strict();
export const membersQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(30), offset: offsetLimit.offset });

/* ---- posts ---- */
export const createPostBody = z.object({
  text: z.string().trim().min(1, 'Write something first').max(1000),
  petId: objectId.nullable().default(null),
});
export const createCommentBody = z.object({ text: z.string().trim().min(1).max(500) });
export const feedQuery = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(15),
  cursor: z.string().max(200).optional(),
});

/* ---- events ---- */
const baseEvent = z.object({
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().max(1500).default(''),
  category: z.enum(EVENT_CATEGORIES).default('other'),
  communityId: objectId.nullable().default(null),
  ideaId: objectId.nullable().default(null),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  place: z.object({
    name: z.string().trim().min(2).max(100),
    prefecture: prefecture.nullable().default(null),
    city: z.string().trim().max(60).default(''),
  }),
  // Safety: hosts must confirm the venue is public (no private homes), shown as a checkbox in the app.
  publicPlaceConfirmed: z.literal(true, { error: 'Choose a public place, not a private home' }),
  maxParticipants: z.number().int().min(2).max(500).nullable().default(null),
  petTypes: z.array(z.enum(['dog', 'cat'])).min(1).default(['dog', 'cat']),
  instructions: z.string().trim().max(1000).default(''),
});

export const createEventBody = baseEvent
  .refine((e) => e.endsAt > e.startsAt, { path: ['endsAt'], message: 'End time must be after the start' })
  .refine((e) => e.endsAt - e.startsAt <= 12 * 3600_000, { path: ['endsAt'], message: 'Events can last at most 12 hours' })
  .refine((e) => e.startsAt.getTime() > Date.now() + 5 * 60_000, { path: ['startsAt'], message: 'Start time must be in the future' });

export const updateEventBody = z
  .object({
    title: baseEvent.shape.title,
    description: baseEvent.shape.description.unwrap(),
    instructions: baseEvent.shape.instructions.unwrap(),
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    place: baseEvent.shape.place,
    maxParticipants: z.number().int().min(2).max(500).nullable(),
  })
  .partial()
  .strict();

export const listEventsQuery = z.object({
  scope: z.enum(['upcoming', 'mine', 'nearby', 'community']).default('upcoming'),
  prefecture: prefecture.optional(),
  communityId: objectId.optional(),
  category: z.enum(EVENT_CATEGORIES).optional(),
  petType: z.enum(['dog', 'cat']).optional(),
  ...offsetLimit,
});

export const rsvpBody = z.object({ petIds: z.array(objectId).max(5).default([]) });
export const cancelEventBody = z.object({ reason: z.string().trim().max(300).default('') });
export const completeEventBody = z.object({
  attended: z.number().int().min(0).max(1000),
  note: z.string().trim().max(500).default(''),
});

/* ---- safety ---- */
export const createReportBody = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: objectId,
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(500).default(''),
});
export const blockBody = z.object({ userId: objectId });

/* ---- admin ---- */
const ideaText = z.object({
  title: z.string().min(1), concept: z.string().default(''), format: z.string().default(''),
  instructions: z.string().default(''), locationRequirements: z.string().default(''),
  photoSuggestions: z.string().default(''), safety: z.array(z.string()).default([]),
});
export const ideaBody = z.object({
  key: z.string().trim().min(2).max(40),
  category: z.enum(EVENT_CATEGORIES).default('other'),
  emoji: z.string().max(8).default('🐾'),
  recommendedGroupSize: z.object({ min: z.number().int().min(2), max: z.number().int().min(2) }).optional(),
  suggestedDurationMinutes: z.number().int().min(15).max(720).default(90),
  petTypes: z.array(z.enum(['dog', 'cat'])).default(['dog', 'cat']),
  en: ideaText,
  published: z.boolean().default(true),
  order: z.number().int().default(0),
});
export const resolveReportBody = z.object({ action: z.enum(['hide', 'dismiss']) });
export const featureEventBody = z.object({ featured: z.boolean() });
export const setRoleBody = z.object({ role: z.enum(['member', 'moderator']) });
export const adminListReportsQuery = z.object({
  status: z.enum(['open', 'actioned', 'dismissed']).default('open'),
  limit: z.coerce.number().int().min(1).max(50).default(30),
  cursor: z.string().max(200).optional(),
});
export const adminCommunityBody = z.object({
  featured: z.boolean(), official: z.boolean(), status: z.enum(['active', 'hidden']),
}).partial().strict();
