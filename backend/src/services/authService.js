import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { newOpaqueToken, sha256, signAccessToken } from '../utils/tokens.js';
import { conflict, unauthorized, forbidden } from '../utils/errors.js';

const CONSENT_VERSION = '2026-11';

async function issueSession(user, { familyId = randomUUID(), userAgent } = {}) {
  const refreshToken = newOpaqueToken();
  await RefreshToken.create({
    userId: user._id,
    tokenHash: sha256(refreshToken),
    familyId,
    expiresAt: new Date(Date.now() + env.refreshTtlDays * 86_400_000),
    userAgent,
  });
  return { accessToken: signAccessToken(user._id), refreshToken, expiresIn: env.accessTtlMin * 60 };
}

export async function register(input, ctx = {}) {
  const exists = await User.exists({ email: input.email.toLowerCase(), deletedAt: null });
  if (exists) throw conflict('An account with this email already exists');
  const now = new Date();
  const consents = [
    { kind: 'terms', version: CONSENT_VERSION, granted: true, at: now },
    { kind: 'privacy', version: CONSENT_VERSION, granted: true, at: now },
    { kind: 'marketing', version: CONSENT_VERSION, granted: input.marketingOptIn, at: now },
  ];
  const user = await User.create({
    email: input.email,
    passwordHash: await hashPassword(input.password),
    locale: input.locale,
    timezone: input.timezone,
    profile: { displayName: input.displayName },
    notificationPrefs: { marketing: input.marketingOptIn },
    consents,
  });
  return { user, session: await issueSession(user, ctx) };
}

// Fixed hash so unknown-email logins cost the same as wrong-password logins (no timing oracle).
let dummyHash;

export async function login({ email, password }, ctx = {}) {
  const user = await User.findOne({ email: email.toLowerCase(), deletedAt: null }).select('+passwordHash');
  dummyHash ??= await hashPassword('not-a-real-password');
  const ok = await verifyPassword(password, user?.passwordHash ?? dummyHash);
  if (!user || !ok) throw unauthorized('Incorrect email or password');
  if (user.status === 'suspended') throw forbidden('Account suspended');
  user.lastLoginAt = new Date();
  await user.save();
  return { user, session: await issueSession(user, ctx) };
}

/** Rotates the refresh token. Presenting an already-rotated token revokes the whole family (theft signal). */
export async function refresh(rawToken, ctx = {}) {
  const record = await RefreshToken.findOne({ tokenHash: sha256(rawToken) });
  if (!record || record.expiresAt < new Date()) throw unauthorized('Invalid refresh token');
  if (record.revokedAt) {
    await RefreshToken.updateMany({ familyId: record.familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    throw unauthorized('Refresh token reuse detected; please sign in again');
  }
  // Atomic revoke so two concurrent refreshes can't both succeed.
  const claimed = await RefreshToken.findOneAndUpdate({ _id: record._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  if (!claimed) throw unauthorized('Invalid refresh token');
  const user = await User.findOne({ _id: record.userId, deletedAt: null });
  if (!user || user.status !== 'active') throw unauthorized('Account unavailable');
  return issueSession(user, { familyId: record.familyId, ...ctx });
}

export async function logout(rawToken) {
  const record = await RefreshToken.findOne({ tokenHash: sha256(rawToken) });
  if (record) await RefreshToken.updateMany({ familyId: record.familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!(await verifyPassword(currentPassword, user.passwordHash))) throw unauthorized('Current password is incorrect');
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  // Sign out every other session.
  await RefreshToken.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  return issueSession(user);
}
