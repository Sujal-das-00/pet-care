import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { newOpaqueToken, sha256, signAccessToken } from '../utils/tokens.js';
import { HttpError, conflict, unauthorized, forbidden } from '../utils/errors.js';
import { consumeChallenge, findByAddress, invalidChallenge, invalidSignature, verifySignedMessage } from './nimiqAuthService.js';

const CONSENT_VERSION = '2026-11';

export async function issueSession(user, { familyId = randomUUID(), userAgent } = {}) {
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

/**
 * Sign in (or sign up) with a Nimiq wallet signature. The wallet address — derived from the signing public
 * key, never taken from the client — identifies the account. First sign-in creates it, which needs consent.
 */
export async function signInWithNimiq(input, ctx = {}) {
  // Burn the challenge first: a failed attempt can't be retried against the same nonce.
  const challenge = await consumeChallenge(input.challengeId);
  if (!challenge) throw invalidChallenge();
  const proof = verifySignedMessage({ message: challenge.message, publicKey: input.publicKey, signature: input.signature });
  if (!proof.ok) {
    if (!env.isTest) console.warn(`[nimiq-auth] signature did not verify (publicKey ${input.publicKey.length / 2} bytes, signature ${input.signature.length / 2} bytes). If every real Nimiq Pay sign-in fails, Nimiq Pay may sign in a format we don't accept yet.`);
    throw invalidSignature();
  }

  let user = await findByAddress(proof.address);
  let created = false;
  if (user) {
    if (user.status === 'suspended') throw forbidden('Account suspended');
  } else {
    if (!input.acceptTerms || !input.acceptPrivacy) {
      throw new HttpError(400, 'consent_required', 'Please accept the Terms of Service and Privacy Policy to create your account');
    }
    const now = new Date();
    try {
      user = await User.create({
        nimiq: { address: proof.address, publicKey: input.publicKey.toLowerCase(), linkedAt: now },
        locale: 'en',
        timezone: input.timezone,
        profile: { displayName: input.displayName || '' },
        notificationPrefs: { marketing: Boolean(input.marketingOptIn) },
        consents: [
          { kind: 'terms', version: CONSENT_VERSION, granted: true, at: now },
          { kind: 'privacy', version: CONSENT_VERSION, granted: true, at: now },
          { kind: 'marketing', version: CONSENT_VERSION, granted: Boolean(input.marketingOptIn), at: now },
        ],
      });
      created = true;
    } catch (e) {
      if (e.code !== 11000) throw e;
      user = await findByAddress(proof.address); // two first sign-ins raced; the other one won
    }
  }
  user.lastLoginAt = new Date();
  await user.save();
  if (created) console.log(`[nimiq-auth] new account; signature verified as "${proof.scheme}"`); // reveals which signing format Nimiq Pay uses
  return { user, created, session: await issueSession(user, ctx) };
}
