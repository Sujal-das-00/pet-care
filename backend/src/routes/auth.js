import { Router } from 'express';
import * as c from '../controllers/authController.js';
import { validate } from '../middleware/validate.js';
import { authLimiter, walletAuthLimiter } from '../middleware/rateLimit.js';
import { requirePasswordAuth } from '../middleware/auth.js';
import { registerBody, loginBody, refreshBody, nimiqSignInBody } from '../validators/auth.js';

const r = Router();

// Sign in with a Nimiq wallet (the way people sign in).
r.get('/methods', c.methods);
r.post('/nimiq/challenge', walletAuthLimiter, c.nimiqChallenge);
r.post('/nimiq/sign-in', walletAuthLimiter, validate({ body: nimiqSignInBody }), c.nimiqSignIn);

// Email + password: off unless ENABLE_PASSWORD_AUTH=1 (local development and tests only).
r.post('/register', authLimiter, requirePasswordAuth, validate({ body: registerBody }), c.register);
r.post('/login', authLimiter, requirePasswordAuth, validate({ body: loginBody }), c.login);

r.post('/refresh', authLimiter, validate({ body: refreshBody }), c.refresh);
r.post('/logout', authLimiter, validate({ body: refreshBody }), c.logout);

export default r;
