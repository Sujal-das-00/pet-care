import { User } from '../models/User.js';
import { unauthorized, forbidden } from '../utils/errors.js';
import { verifyAccessToken } from '../utils/tokens.js';

/** Requires a valid access token for an active account. Sets req.user (lean doc) and req.userId. */
export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized('Missing bearer token');
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw unauthorized('Invalid or expired token');
  }
  const user = await User.findOne({ _id: payload.sub, deletedAt: null }).lean();
  if (!user) throw unauthorized('Account not found');
  if (user.status === 'suspended') throw forbidden('Account suspended');
  req.user = user;
  req.userId = user._id;
  next();
}

export const requireAdmin = (req, _res, next) => {
  if (req.user?.role !== 'admin') throw forbidden('Admin only');
  next();
};
