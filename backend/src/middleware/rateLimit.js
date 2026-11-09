import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const make = (windowMs, limit, code) =>
  rateLimit({
    windowMs,
    limit: env.isTest ? 10_000 : limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code, message: 'Too many requests, please slow down' } }),
  });

export const apiLimiter = make(60_000, 240, 'rate_limited');
// Payment checks hit an external node, so keep them modest per client.
export const paymentLimiter = make(60_000, 30, 'payment_rate_limited');
// Credential endpoints: brute-force / spam protection.
export const authLimiter = make(15 * 60_000, 30, 'auth_rate_limited');
