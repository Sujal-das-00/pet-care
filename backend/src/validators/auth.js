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
// Wallet accounts have no password: they confirm by typing DELETE. (Accounts with a password still use it.)
export const deleteAccountBody = z.object({ password: z.string().min(1).optional(), confirm: z.string().max(20).optional() });

export const nimiqSignInBody = z.object({
  challengeId: z.string().regex(/^[a-f0-9]{24}$/i),
  publicKey: z.string().regex(/^[0-9a-fA-F]{64}$/, 'Expected a 32-byte hex public key'),
  signature: z.string().regex(/^[0-9a-fA-F]{128}$/, 'Expected a 64-byte hex signature'),
  displayName: z.string().trim().max(40).optional(),
  timezone: timezone.default('Asia/Tokyo'),
  // Only needed the first time (it creates the account); the server insists on them then.
  acceptTerms: z.boolean().default(false),
  acceptPrivacy: z.boolean().default(false),
  marketingOptIn: z.boolean().default(false),
});
