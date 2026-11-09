import * as auth from '../services/authService.js';
import { userView } from '../views/index.js';
import { audit } from '../services/auditService.js';
import { createChallenge } from '../services/nimiqAuthService.js';
import { env } from '../config/env.js';

const ctx = (req) => ({ userAgent: req.get('user-agent')?.slice(0, 200) });

export async function register(req, res) {
  const { user, session } = await auth.register(req.valid.body, ctx(req));
  req.userId = user._id;
  audit(req, 'auth.register', 'User', user._id);
  res.status(201).json({ user: userView(user), ...session });
}

export async function login(req, res) {
  const { user, session } = await auth.login(req.valid.body, ctx(req));
  req.userId = user._id;
  audit(req, 'auth.login', 'User', user._id);
  res.json({ user: userView(user), ...session });
}

export async function refresh(req, res) {
  res.json(await auth.refresh(req.valid.body.refreshToken, ctx(req)));
}

export async function logout(req, res) {
  await auth.logout(req.valid.body.refreshToken);
  res.status(204).end();
}

/** What the sign-in screen may offer. Wallet sign-in is always on; email + password only exists for development. */
export const methods = (_req, res) => res.json({ nimiq: true, password: env.passwordAuth });

export async function nimiqChallenge(req, res) {
  res.json({ challenge: await createChallenge(req.get('host')) });
}

export async function nimiqSignIn(req, res) {
  const { user, session, created } = await auth.signInWithNimiq(req.valid.body, ctx(req));
  req.userId = user._id;
  audit(req, created ? 'auth.nimiq_register' : 'auth.nimiq_login', 'User', user._id);
  res.status(created ? 201 : 200).json({ user: userView(user), created, ...session });
}
