import crypto from 'node:crypto';
import { blake2b } from '@noble/hashes/blake2.js';
import { AuthChallenge } from '../models/AuthChallenge.js';
import { User } from '../models/User.js';
import { HttpError } from '../utils/errors.js';
import { normalizeAddress } from './nimiqService.js';

/**
 * "Sign in with Nimiq Pay".
 *
 *  1. The server issues a one-time challenge (a short ASCII message with a random nonce).
 *  2. The app asks Nimiq Pay to sign it:  nimiq.sign(message)  ->  { publicKey, signature }
 *  3. We check the Ed25519 signature, derive the wallet address from the public key, and that address IS the account.
 *
 * We never trust `listAccounts()` or an address sent by the client: Nimiq's docs say listing accounts "does not
 * prove ownership" and that a `sign()` result must be verified before it is used as proof of identity.
 */

const CHALLENGE_TTL_MS = 5 * 60_000;

/* ---------------- address derivation ---------------- */

const ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVXY'; // Nimiq base32 (no I, O, W, Z)

/**
 * Nimiq address = first 20 bytes of BLAKE2b-256(publicKey), base32, with IBAN-style check digits.
 * (Checked against 12 of 12 real mainnet transactions: the sender address the node reports matches the
 * address derived from the public key inside the transaction's proof.)
 */
export function addressFromPublicKey(publicKey) {
  const hash = blake2b(publicKey, { dkLen: 32 }).slice(0, 20);
  let bits = '';
  for (const byte of hash) bits += byte.toString(2).padStart(8, '0');
  let base = '';
  for (let i = 0; i < bits.length; i += 5) base += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  const numeric = [...`${base}NQ00`].map((c) => (c >= 'A' ? String(c.charCodeAt(0) - 55) : c)).join('');
  const check = String(98n - (BigInt(numeric) % 97n)).padStart(2, '0');
  return normalizeAddress(`NQ${check}${base}`);
}

/* ---------------- signature verification ---------------- */

const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex'); // wraps a raw 32-byte key for Node's crypto
const MSG_PREFIX = Buffer.from('\x16Nimiq Signed Message:\n', 'utf8'); // 23 bytes, as documented for the Nimiq Hub

const sha256 = (b) => crypto.createHash('sha256').update(b).digest();

/**
 * The byte strings a wallet might have signed for `message`. Nimiq documents one scheme for signed messages
 * (the Hub / Keyguard one: prefix + length, SHA-256, Ed25519). Nimiq Pay's provider docs don't spell its
 * format out, so we also accept the plain variants. This is safe: the message always contains a fresh
 * server-generated nonce and is consumed on first use, so a valid signature over any of these forms still
 * proves the holder of the key approved *this* sign-in.
 */
function signedForms(message) {
  const msg = Buffer.from(message, 'utf8');
  const prefixed = Buffer.concat([MSG_PREFIX, Buffer.from(String(msg.length), 'utf8'), msg]);
  return [
    ['nimiq-signed-message', sha256(prefixed)], // documented Nimiq scheme
    ['raw', msg],
    ['sha256', sha256(msg)],
    ['prefixed', prefixed],
  ];
}

const isHex = (s, bytes) => typeof s === 'string' && s.length === bytes * 2 && /^[0-9a-fA-F]+$/.test(s);

/** -> { ok: true, address, scheme } | { ok: false } */
export function verifySignedMessage({ message, publicKey, signature }) {
  if (!isHex(publicKey, 32) || !isHex(signature, 64)) return { ok: false };
  try {
    const pub = Buffer.from(publicKey, 'hex');
    const key = crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, pub]), format: 'der', type: 'spki' });
    const sig = Buffer.from(signature, 'hex');
    for (const [scheme, data] of signedForms(message)) {
      if (crypto.verify(null, data, key, sig)) return { ok: true, scheme, address: addressFromPublicKey(pub) };
    }
  } catch {
    /* not a valid key or signature */
  }
  return { ok: false };
}

/* ---------------- challenges ---------------- */

const safeHost = (h) => (/^[A-Za-z0-9.:-]{1,100}$/.test(String(h || '')) ? h : 'pawcircle');

/** The text the wallet will show. ASCII only, so byte length equals character length in every scheme. */
export async function createChallenge(host) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const issuedAt = new Date();
  const message = [
    'Sign in to PawCircle',
    `Domain: ${safeHost(host)}`,
    `Nonce: ${nonce}`,
    `Issued: ${issuedAt.toISOString()}`,
    'This only proves you own this wallet. It does not send any funds.',
  ].join('\n');
  const doc = await AuthChallenge.create({ message, expiresAt: new Date(issuedAt.getTime() + CHALLENGE_TTL_MS) });
  return { id: String(doc._id), message, expiresAt: doc.expiresAt };
}

/** Atomically uses up a challenge: a second attempt with the same one finds nothing. */
export async function consumeChallenge(id) {
  if (!/^[a-f0-9]{24}$/i.test(String(id))) return null;
  return AuthChallenge.findOneAndDelete({ _id: id, expiresAt: { $gt: new Date() } });
}

/** Finds the account that owns a wallet address (live accounts only). */
export const findByAddress = (address) => User.findOne({ 'nimiq.address': address, deletedAt: null });

export const invalidChallenge = () => new HttpError(401, 'challenge_invalid', 'This sign-in request expired. Please try again.');
export const invalidSignature = () => new HttpError(401, 'signature_invalid', 'We couldn’t verify your wallet signature. Please try again.');
