import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const required = (name, fallback) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing env var ${name}`);
  return v;
};

const isProd = process.env.NODE_ENV === 'production';

/**
 * MEMBERSHIP_PRICE_NIM is a plain NIM amount ("1", "2.5", "0.5"). Luna (1 NIM = 100,000 Luna) is the
 * chain's smallest unit, so at most 5 decimals are allowed. An invalid value stops the server from
 * starting rather than silently charging the wrong amount.
 */
export function parsePriceNim(raw) {
  const text = String(raw ?? '').trim() || '1';
  if (!/^\d+(\.\d{1,5})?$/.test(text)) throw new Error(`MEMBERSHIP_PRICE_NIM must be a positive number with at most 5 decimals, got "${text}"`);
  const nim = Number(text);
  const luna = Math.round(nim * 100_000);
  if (luna < 1) throw new Error('MEMBERSHIP_PRICE_NIM must be greater than 0');
  return { nim, luna };
}

export const env = {
  isProd,
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT || 4000),
  mongoUri: required('MONGODB_URI', isProd ? undefined : 'mongodb://127.0.0.1:27018/pawcircle'),
  jwtSecret: required('JWT_ACCESS_SECRET', isProd ? undefined : 'dev-only-secret-do-not-use-in-prod'),
  accessTtlMin: Number(process.env.ACCESS_TOKEN_TTL_MIN || 15),
  refreshTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS || 60),
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  r2: {
    endpoint: process.env.R2_ENDPOINT || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket: process.env.R2_BUCKET || 'pawcircle-media',
  },
  // Community (groups, posts, events) is a paid feature. Set ENFORCE_MEMBERSHIP=0 only for local
  // development without payments. Pet care is never gated.
  enforceMembership: process.env.ENFORCE_MEMBERSHIP !== '0',
  membership: {
    priceLuna: parsePriceNim(process.env.MEMBERSHIP_PRICE_NIM).luna, // what members pay, in Luna (1 NIM = 100,000 Luna)
    days: Number(process.env.MEMBERSHIP_DAYS || 0), // 0 = one-time payment, access never expires
  },
  nimiq: {
    network: process.env.NIMIQ_NETWORK === 'testnet' ? 'testnet' : 'mainnet',
    rpcUrl: process.env.NIMIQ_RPC_URL || '', // a Nimiq node's JSON-RPC endpoint
    receiveAddress: process.env.NIMIQ_RECEIVE_ADDRESS || '', // where members' NIM is sent
    minConfirmations: Number(process.env.NIMIQ_MIN_CONFIRMATIONS || 2),
    intentTtlMin: Number(process.env.PAYMENT_INTENT_TTL_MIN || 60),
  },
  // The built web app (`expo export --platform web` -> frontend/dist). When it exists the API serves it too,
  // so one service hosts everything on one URL.
  webDist: process.env.WEB_DIST_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../frontend/dist'),
  // Run the reminder scheduler inside the API process (simplest hosting: one service, no separate worker).
  // How many reverse proxies sit in front of the API (Render, Cloudflare...). Wrong values make every visitor
  // look like the same IP (rate limits shared) or let clients spoof their IP, so it is explicit.
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS || 1),
  runWorkerInProcess: process.env.RUN_WORKER_IN_PROCESS === '1',
  reminderPollSeconds: Number(process.env.REMINDER_POLL_SECONDS || 30),
};

if (isProd && env.jwtSecret.length < 32) throw new Error('JWT_ACCESS_SECRET must be >= 32 chars in production');
