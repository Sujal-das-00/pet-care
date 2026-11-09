import { z } from 'zod';
import { METRICS } from '../models/Challenge.js';
import { PREFECTURE_CODES } from '../utils/prefectures.js';
import { dateStr, objectId } from './common.js';

const tint = z.enum(['peach', 'lavender', 'blue', 'yellow', 'green', 'pink']);
const speciesList = z.array(z.enum(['dog', 'cat'])).min(1).max(2).refine((a) => new Set(a).size === a.length, 'Duplicate species');

const base = z.object({
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().max(1000).default(''),
  instructions: z.string().trim().max(1000).default(''),
  emoji: z.string().trim().min(1).max(8).default('🏆'),
  tint: tint.default('lavender'),
  metric: z.enum(METRICS),
  goal: z.number().positive().max(100000).nullable().default(null),
  startsOn: dateStr,
  endsOn: dateStr,
  species: speciesList.default(['dog', 'cat']),
  maxPerEntry: z.number().positive().max(1000).optional(), // defaults per metric
  dailyCap: z.number().positive().max(10000).optional(),
  published: z.boolean().default(false),
});

const dateRules = (c) => !c.startsOn || !c.endsOn || c.endsOn >= c.startsOn;
const lengthRules = (c) => !c.startsOn || !c.endsOn || (Date.parse(c.endsOn) - Date.parse(c.startsOn)) / 86_400_000 <= 31;

export const createChallengeBody = base
  .refine(dateRules, { path: ['endsOn'], message: 'End date is before the start date' })
  .refine(lengthRules, { path: ['endsOn'], message: 'Challenges can run for at most 32 days' });

export const updateChallengeBody = z
  .object({
    title: base.shape.title,
    description: base.shape.description.unwrap(),
    instructions: base.shape.instructions.unwrap(),
    emoji: base.shape.emoji.unwrap(),
    tint: base.shape.tint.unwrap(),
    metric: base.shape.metric,
    goal: base.shape.goal.unwrap(),
    startsOn: dateStr,
    endsOn: dateStr,
    species: speciesList,
    maxPerEntry: base.shape.maxPerEntry.unwrap(),
    dailyCap: base.shape.dailyCap.unwrap(),
    published: z.boolean(),
  })
  .partial()
  .strict();

export const listChallengesQuery = z.object({
  status: z.enum(['active', 'upcoming', 'ended', 'all']).default('active'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const entryBody = z.object({
  value: z.number().positive().max(1000).optional(), // ignored for active_days / check_ins
  petId: objectId.nullable().default(null),
  loggedOn: dateStr.optional(), // defaults to today
  note: z.string().trim().max(200).default(''),
});

export const leaderboardQuery = z.object({
  scope: z.enum(['global', 'local', 'community']).default('global'),
  species: z.enum(['dog', 'cat']).optional(),
  communityId: objectId.optional(),
  prefecture: z.enum(PREFECTURE_CODES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
