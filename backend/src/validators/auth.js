import { z } from 'zod';
import { timezone } from './common.js';

const password = z.string().min(8, 'At least 8 characters').max(128);

export const registerBody = z.object({
  email: z.email().max(254),
  password,
  displayName: z.string().trim().min(1).max(40),
  locale: z.enum(['en']).default('en'),
  timezone: timezone.default('Asia/Tokyo'),
  // Terms + privacy consent is mandatory (APPI). Location/health/marketing are asked contextually later.
  acceptTerms: z.literal(true, { error: 'You must accept the Terms of Service' }),
  acceptPrivacy: z.literal(true, { error: 'You must accept the Privacy Policy' }),
  marketingOptIn: z.boolean().default(false),
});

export const loginBody = z.object({ email: z.email(), password: z.string().min(1).max(128) });
export const refreshBody = z.object({ refreshToken: z.string().min(20).max(200) });
export const changePasswordBody = z.object({ currentPassword: z.string().min(1), newPassword: password });
export const deleteAccountBody = z.object({ password: z.string().min(1) });
