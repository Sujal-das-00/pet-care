import { User } from '../models/User.js';
import { Device } from '../models/Device.js';
import { userView } from '../views/index.js';
import { audit } from '../services/auditService.js';
import * as auth from '../services/authService.js';
import { verifyPassword } from '../utils/password.js';
import { badRequest, unauthorized } from '../utils/errors.js';
import { entitlementsFor } from '../services/entitlementService.js';
import { deleteAccount, exportUserData } from '../services/accountService.js';

export const getMe = (req, res) => res.json({ user: userView(req.user) });

/** Dotted $set so partial nested updates never wipe sibling fields. */
const flatten = (obj, prefix = '') =>
  Object.entries(obj).reduce((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(acc, flatten(v, key));
    else acc[key] = v;
    return acc;
  }, {});

export async function updateMe(req, res) {
  const user = await User.findByIdAndUpdate(req.userId, { $set: flatten(req.valid.body) }, { returnDocument: 'after', runValidators: true });
  res.json({ user: userView(user) });
}

export async function recordConsent(req, res) {
  const { kind, granted, version } = req.valid.body;
  const user = await User.findByIdAndUpdate(
    req.userId,
    { $push: { consents: { kind, granted, version, at: new Date() } } },
    { returnDocument: 'after' },
  );
  audit(req, 'consent.record', 'User', req.userId, { kind, granted });
  res.json({ user: userView(user) });
}

export async function registerDevice(req, res) {
  const { pushToken, ...rest } = req.valid.body;
  // A token belongs to whoever registered it most recently (handles shared/handed-over phones).
  await Device.findOneAndUpdate(
    { pushToken },
    { $set: { ...rest, userId: req.userId, lastSeenAt: new Date() } },
    { upsert: true },
  );
  res.status(204).end();
}

export async function removeDevice(req, res) {
  await Device.deleteOne({ pushToken: req.valid.body.pushToken, userId: req.userId });
  res.status(204).end();
}

export async function changePassword(req, res) {
  const session = await auth.changePassword(req.userId, req.valid.body.currentPassword, req.valid.body.newPassword);
  audit(req, 'auth.password_change', 'User', req.userId);
  res.json(session);
}

export const getEntitlements = async (req, res) => res.json(await entitlementsFor(req.user));

export async function exportData(req, res) {
  audit(req, 'account.export', 'User', req.userId);
  res.set('content-disposition', 'attachment; filename="pawcircle-export.json"');
  res.json(await exportUserData(req.userId));
}

export async function removeAccount(req, res) {
  const user = await User.findById(req.userId).select('+passwordHash');
  if (user.passwordHash) {
    if (!req.valid.body.password || !(await verifyPassword(req.valid.body.password, user.passwordHash))) throw unauthorized('Password is incorrect');
  } else if (req.valid.body.confirm !== 'DELETE') {
    throw badRequest('Type DELETE to confirm');
  }
  audit(req, 'account.delete', 'User', req.userId);
  await deleteAccount(req.userId);
  res.status(204).end();
}
