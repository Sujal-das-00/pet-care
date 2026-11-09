import { randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { HttpError } from '../utils/errors.js';

/* ---------------- addresses & units ---------------- */

export const LUNA_PER_NIM = 100_000;
export const lunaToNim = (luna) => luna / LUNA_PER_NIM;

/** "NQ07 0000 ..." / "nq07000..." -> "NQ07 0000 ..." (upper-case, groups of four). */
export function normalizeAddress(address) {
  const compact = String(address ?? '').replace(/[\s_-]/g, '').toUpperCase();
  return compact.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Nimiq addresses are IBAN-compatible: "NQ" + 2 check digits + 32 base-32 characters. Validating the
 * checksum catches a mistyped receiving address in configuration before any money is sent to it.
 */
export function isValidAddress(address) {
  const compact = normalizeAddress(address).replace(/ /g, '');
  if (!/^NQ\d{2}[0-9A-HJ-NP-VXY]{32}$/.test(compact)) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  const numeric = [...rearranged].map((c) => (c >= 'A' ? String(c.charCodeAt(0) - 55) : c)).join('');
  return BigInt(numeric) % 97n === 1n;
}

/** UTF-8 text from an on-chain `recipientData` hex string ('' when there is none). */
export const decodeData = (hex) => {
  try {
    return Buffer.from(String(hex || ''), 'hex').toString('utf8').replace(/\0+$/g, '').trim();
  } catch {
    return '';
  }
};

// Unambiguous characters only (no 0/O/1/I), so it survives being read aloud or retyped.
const REF_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function newReference() {
  const bytes = randomBytes(12);
  return `PAW-${[...bytes].map((b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('')}`; // 16 bytes, well under the 64-byte limit
}

/** Why payments are (not) available — used by the app, and printed at start-up so a missing setting is obvious. */
export function paymentsStatus() {
  if (!env.nimiq.receiveAddress) return { enabled: false, problem: 'NIMIQ_RECEIVE_ADDRESS is not set' };
  if (!isValidAddress(env.nimiq.receiveAddress)) return { enabled: false, problem: 'NIMIQ_RECEIVE_ADDRESS is not a valid Nimiq address (checksum failed — check for typos)' };
  if (!env.nimiq.rpcUrl) return { enabled: false, problem: 'NIMIQ_RPC_URL is not set' };
  return { enabled: true, problem: null };
}
export const paymentsEnabled = () => paymentsStatus().enabled;

/** Payment request link understood by Nimiq wallets: nimiq:<address>?amount=<NIM>&message=<text>. */
export function paymentUri({ recipient, amountLuna, reference }) {
  return `nimiq:${recipient.replace(/ /g, '')}?amount=${lunaToNim(amountLuna)}&message=${encodeURIComponent(reference)}`;
}

/* ---------------- JSON-RPC ---------------- */

async function httpRpc(method, params) {
  if (!env.nimiq.rpcUrl) throw new HttpError(503, 'payments_unavailable', 'Payments are not available right now');
  let res;
  try {
    res = await fetch(env.nimiq.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new HttpError(502, 'payment_provider_unavailable', 'Could not reach the Nimiq network. Please try again.');
  }
  if (!res.ok) throw new HttpError(502, 'payment_provider_unavailable', 'Could not reach the Nimiq network. Please try again.');
  const json = await res.json().catch(() => null);
  if (json?.error) {
    const err = new Error(json.error.message || 'rpc error');
    err.rpc = json.error;
    throw err;
  }
  return json?.result?.data ?? null; // Nimiq wraps results as { data, metadata }
}

let rpc = httpRpc;
/** Tests swap the network out for a fake. */
export const setNimiqRpc = (fn) => { rpc = fn ?? httpRpc; };

export async function getTransactionByHash(hash) {
  if (!/^[0-9a-f]{64}$/i.test(String(hash))) return null;
  try {
    return await rpc('getTransactionByHash', [String(hash).toLowerCase()]);
  } catch (e) {
    if (e.rpc && /not found/i.test(`${e.rpc.data ?? ''} ${e.rpc.message ?? ''}`)) return null; // not on chain (yet)
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, 'payment_provider_unavailable', 'Could not read the Nimiq network. Please try again.');
  }
}

export async function recentTransactions(address, limit = 100) {
  try {
    return (await rpc('getTransactionsByAddress', [address, limit, null])) ?? [];
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, 'payment_provider_unavailable', 'Could not read the Nimiq network. Please try again.');
  }
}

/** Finds the incoming payment that carries an intent's reference, if it has reached the chain. */
export async function findPaymentByReference(intent) {
  const txs = await recentTransactions(intent.recipient, 100);
  return txs.find((t) => normalizeAddress(t.to) === intent.recipient && decodeData(t.recipientData) === intent.reference) ?? null;
}

/**
 * Decides whether an on-chain transaction pays for an intent. Pure and exhaustive on purpose: this is
 * the only gate between a public blockchain transaction and paid access.
 * -> { ok: true } | { ok: false, reason, pending?, confirmations? }
 */
export function verifyTransaction(tx, intent, minConfirmations = env.nimiq.minConfirmations) {
  if (!tx) return { ok: false, reason: 'not_found', pending: true };
  if (tx.executionResult === false) return { ok: false, reason: 'transaction_failed' };
  if (normalizeAddress(tx.to) !== intent.recipient) return { ok: false, reason: 'wrong_recipient' };
  if (!Number.isFinite(tx.value) || tx.value < intent.amountLuna) return { ok: false, reason: 'amount_too_low' };
  if (decodeData(tx.recipientData) !== intent.reference) return { ok: false, reason: 'wrong_reference' };
  const confirmations = Number(tx.confirmations ?? 0);
  if (confirmations < minConfirmations) return { ok: false, reason: 'awaiting_confirmations', pending: true, confirmations };
  return { ok: true, confirmations };
}
