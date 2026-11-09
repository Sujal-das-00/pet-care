import { z } from 'zod';
import { timezone } from './common.js';
import { PREFECTURE_CODES } from '../utils/prefectures.js';

export const updateMeBody = z
  .object({
    locale: z.enum(['en']),
    timezone,
    profile: z
      .object({
        displayName: z.string().trim().min(1).max(40),
        prefecture: z.enum(['', ...PREFECTURE_CODES]), // JIS code; '' clears
        city: z.string().trim().max(60),
        neighbourhood: z.string().trim().max(60),
      })
      .partial(),
    preferences: z
      .object({
        weightUnit: z.enum(['kg', 'lb']),
        distanceUnit: z.enum(['km', 'mi']),
        dailyStepGoal: z.number().int().min(1000).max(60000),
        interests: z.array(z.string().trim().min(1).max(30)).max(12),
        onboardingCompleted: z.boolean(),
      })
      .partial(),
    notificationPrefs: z
      .object({
        care: z.boolean(), fitness: z.boolean(), community: z.boolean(),
        challenges: z.boolean(), events: z.boolean(), marketing: z.boolean(),
      })
      .partial(),
  })
  .partial()
  .strict();

export const consentBody = z.object({
  kind: z.enum(['location', 'marketing', 'health_data']),
  granted: z.boolean(),
  version: z.string().max(20).default('2026-11'),
});

export const deviceBody = z.object({
  pushToken: z.string().min(10).max(300),
  platform: z.enum(['ios', 'android', 'web']),
  tokenType: z.enum(['expo', 'fcm', 'apns']).default('expo'),
  locale: z.enum(['en']).default('en'),
});
