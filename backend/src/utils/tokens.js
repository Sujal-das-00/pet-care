import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

export const signAccessToken = (userId) =>
  jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: `${env.accessTtlMin}m`, algorithm: 'HS256' });

export const verifyAccessToken = (token) => jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });

export const newOpaqueToken = () => randomBytes(32).toString('base64url');
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
