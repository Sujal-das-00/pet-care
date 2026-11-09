import { env } from '../config/env.js';
import { HttpError } from '../utils/errors.js';
import { Membership } from '../models/Membership.js';
import { User } from '../models/User.js';

/**
 * Server-side entitlements — the only authority on who may use paid features. The app never decides
 * this locally.
 *
 * Paid:  community (groups, posts, comments, events, event ideas) — unlocked by a verified Nimiq payment.
 * Free:  everything else. Invariant: pet-care records and reminders are NEVER gated, even if access lapses.
 */
export async function activeMembership(userId) {
  const m = await Membership.findOne({ userId, status: 'active' }).lean();
  if (!m) return null;
  if (m.expiresAt && m.expiresAt <= new Date()) return null; // time-limited access has lapsed
  return m;
}

/** Accepts a user document (preferred, avoids a query) or an id. */
export async function entitlementsFor(userOrId) {
  const user = userOrId?._id ? userOrId : await User.findById(userOrId).select('role').lean();
  const membership = user ? await activeMembership(user._id) : null;
  const community = !env.enforceMembership || Boolean(membership) || user?.role === 'admin';
  return {
    plan: membership ? 'club' : 'explorer',
    status: 'active',
    enforced: env.enforceMembership,
    membership: membership
      ? { source: membership.source, since: membership.startedAt, expiresAt: membership.expiresAt }
      : null,
    features: { petCare: true, basicFitness: true, community },
  };
}

/** Express middleware. 402 + a stable code, which the app turns into the unlock screen. */
export const requireFeature = (feature) => async (req, _res, next) => {
  const { features } = await entitlementsFor(req.user);
  if (!features[feature]) {
    throw new HttpError(402, 'membership_required', 'Community access needs a membership', { feature });
  }
  next();
};

/**
 * Starts or extends a membership. Idempotent for lifetime access. `days` 0 = never expires.
 * Called only after a payment has been verified on-chain, or by an operator (comp access).
 */
export async function grantMembership(userId, { source, txHash = null, paidLuna = 0, days = env.membership.days }) {
  const now = new Date();
  const existing = await Membership.findOne({ userId });
  const lifetime = !days || days <= 0;

  if (existing && existing.status === 'active' && existing.expiresAt === null) {
    // Already lifetime: only record the extra payment.
    existing.totalPaidLuna += paidLuna;
    if (txHash) existing.lastTxHash = txHash;
    await existing.save();
    return existing;
  }
  const base = existing?.expiresAt && existing.expiresAt > now && existing.status === 'active' ? existing.expiresAt : now;
  const expiresAt = lifetime ? null : new Date(base.getTime() + days * 86_400_000);
  return Membership.findOneAndUpdate(
    { userId },
    {
      $set: { plan: 'club', status: 'active', source, expiresAt, lastTxHash: txHash, ...(existing ? {} : { startedAt: now }) },
      $inc: { totalPaidLuna: paidLuna },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
}
