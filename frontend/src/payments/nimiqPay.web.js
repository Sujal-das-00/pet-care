// Web build — this is what runs when PawCircle is opened as a mini app inside Nimiq Pay.
// Docs: https://nimiq.com/developers/mini-apps (provider API: sendBasicTransactionWithData).
import { init, NimiqProviderError } from '@nimiq/mini-app-sdk';

/** True only inside Nimiq Pay, which injects `window.nimiq` / `window.nimiqPay` before the page loads. */
export const isInsideNimiqPay = () => typeof window !== 'undefined' && Boolean(window.nimiq || window.nimiqPay);

/** 'mainnet' | 'testnet' | null — the network the user's Nimiq Pay is connected to. */
export const hostNetwork = () => (typeof window !== 'undefined' ? window.nimiqPay?.network ?? null : null);

/**
 * Asks Nimiq Pay to send `amountLuna` to `recipient` with `reference` as the on-chain message. The user
 * approves in a native dialog. Returns { txHash } or { cancelled: true }. The hash only says the
 * transaction was submitted — the server still verifies it on-chain before unlocking anything.
 */
export async function payWithNimiqPay({ recipient, amountLuna, reference }) {
  const nimiq = await init({ timeout: 8000 });
  try {
    const txHash = await nimiq.sendBasicTransactionWithData({ recipient, value: amountLuna, data: reference });
    return { txHash };
  } catch (error) {
    if (NimiqProviderError.is(error) && error.type === 'PERMISSION_DENIED') return { cancelled: true };
    throw error;
  }
}

/**
 * Asks Nimiq Pay to sign `message` with the user's wallet (they approve in a native dialog; nothing is sent).
 * Returns { publicKey, signature } (hex) or { cancelled: true }. The server verifies this and derives the wallet
 * address from the public key. We never trust an address the app reports.
 */
export async function signWithNimiqPay(message) {
  const nimiq = await init({ timeout: 8000 });
  try {
    const { publicKey, signature } = await nimiq.sign(message);
    return { publicKey, signature };
  } catch (error) {
    if (NimiqProviderError.is(error) && error.type === 'PERMISSION_DENIED') return { cancelled: true };
    throw error;
  }
}

/** https link that opens this app as a mini app inside Nimiq Pay (documented by Nimiq; works with any domain). */
export const openInNimiqPayUrl = () => `https://nimpay.app/miniapps/open/${typeof window !== 'undefined' ? window.location.host : ''}`;
