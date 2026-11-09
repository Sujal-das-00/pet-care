import { env } from '../config/env.js';
import { PaymentIntent } from '../models/PaymentIntent.js';
import { entitlementsFor, grantMembership } from '../services/entitlementService.js';
import {
  findPaymentByReference, getTransactionByHash, lunaToNim, newReference, paymentsEnabled, paymentUri, verifyTransaction, normalizeAddress,
} from '../services/nimiqService.js';
import { notifyUsers } from '../services/communityService.js';
import { audit } from '../services/auditService.js';
import { tr } from '../utils/i18n.js';
import { HttpError, notFound } from '../utils/errors.js';

const pricing = () => ({ luna: env.membership.priceLuna, nim: lunaToNim(env.membership.priceLuna), oneTime: env.membership.days <= 0, days: env.membership.days });

const intentView = (i) => ({
  id: String(i._id),
  status: i.status,
  network: i.network,
  recipient: i.recipient,
  amountLuna: i.amountLuna,
  amountNim: lunaToNim(i.amountLuna),
  reference: i.reference, // must be sent as the transaction message
  expiresAt: i.expiresAt,
  uri: paymentUri(i),
  txHash: i.txHash,
});

/** What the app needs to render the paywall: entitlement state, price, and whether paying is possible. */
export async function getMembership(req, res) {
  const ent = await entitlementsFor(req.user);
  res.json({
    ...ent,
    price: pricing(),
    nimiq: {
      enabled: paymentsEnabled(),
      network: env.nimiq.network,
      recipient: paymentsEnabled() ? normalizeAddress(env.nimiq.receiveAddress) : null,
      minConfirmations: env.nimiq.minConfirmations,
    },
  });
}

/** Creates (or reuses) the payment request a member then pays from Nimiq Pay. */
export async function createIntent(req, res) {
  if (!paymentsEnabled()) throw new HttpError(503, 'payments_unavailable', 'Payments are not available right now');
  const ent = await entitlementsFor(req.user);
  if (ent.membership && !ent.membership.expiresAt) throw new HttpError(409, 'already_member', 'You already have community access');

  const recipient = normalizeAddress(env.nimiq.receiveAddress);
  const fresh = await PaymentIntent.findOne({
    userId: req.userId, status: 'pending', network: env.nimiq.network, recipient,
    amountLuna: env.membership.priceLuna, expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
  if (fresh) return res.json({ intent: intentView(fresh) });

  const intent = await PaymentIntent.create({
    userId: req.userId, network: env.nimiq.network, recipient, amountLuna: env.membership.priceLuna,
    reference: newReference(), expiresAt: new Date(Date.now() + env.nimiq.intentTtlMin * 60_000),
  });
  audit(req, 'payment.intent', 'PaymentIntent', intent._id);
  res.status(201).json({ intent: intentView(intent) });
}

/**
 * Confirms a payment against the blockchain. The client may pass the transaction hash it got from
 * Nimiq Pay; without one we search incoming payments for this intent's reference. Either way the
 * transaction is read from the Nimiq network and checked by `verifyTransaction` — a client claiming
 * "I paid" is never enough.
 */
export async function verifyIntent(req, res) {
  const intent = await PaymentIntent.findOne({ _id: req.params.intentId, userId: req.userId });
  if (!intent) throw notFound('Payment request not found');

  if (intent.status === 'paid') return res.json({ status: 'paid', membership: (await entitlementsFor(req.user)).membership });
  if (!paymentsEnabled()) throw new HttpError(503, 'payments_unavailable', 'Payments are not available right now');

  const { txHash } = req.valid.body;
  const tx = txHash ? await getTransactionByHash(txHash) : await findPaymentByReference(intent);
  const result = verifyTransaction(tx, intent);

  if (!result.ok && result.pending) {
    return res.json({ status: 'pending', reason: result.reason, confirmations: result.confirmations ?? 0, needed: env.nimiq.minConfirmations });
  }
  if (!result.ok) {
    throw new HttpError(400, 'payment_invalid', 'That transaction does not match this payment request', { reason: result.reason });
  }

  // Atomically claim the intent. The unique txHash index makes sure one transaction can never pay twice.
  let claimed;
  try {
    claimed = await PaymentIntent.findOneAndUpdate(
      { _id: intent._id, status: 'pending' },
      { $set: { status: 'paid', txHash: tx.hash, paidLuna: tx.value, paidAt: new Date() } },
      { returnDocument: 'after' },
    );
  } catch (e) {
    if (e.code === 11000) throw new HttpError(409, 'payment_already_used', 'That transaction was already used for another payment');
    throw e;
  }
  if (claimed) {
    await grantMembership(req.userId, { source: 'nimiq', txHash: tx.hash, paidLuna: tx.value });
    audit(req, 'payment.confirmed', 'PaymentIntent', intent._id, { txHash: tx.hash, luna: tx.value });
    notifyUsers([req.userId], { category: 'system', build: (l) => tr(l, 'membershipActive'), data: { type: 'membership' } });
  }
  res.json({ status: 'paid', membership: (await entitlementsFor(req.user)).membership });
}
