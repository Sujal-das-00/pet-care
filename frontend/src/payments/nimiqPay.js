import { API_URL } from '../config';

// Native (iOS/Android) build: the Nimiq Pay mini-app provider only exists inside Nimiq Pay's web view, so
// on native we can't sign in or pay in one tap. The sign-in screen offers a link that opens PawCircle
// inside Nimiq Pay instead.
export const isInsideNimiqPay = () => false;
export const hostNetwork = () => null;
export async function payWithNimiqPay() {
  throw new Error('Nimiq Pay is only available when PawCircle is opened inside the Nimiq Pay app');
}
export async function signWithNimiqPay() {
  throw new Error('Nimiq Pay is only available when PawCircle is opened inside the Nimiq Pay app');
}
/** https link that opens this app as a mini app inside Nimiq Pay (documented by Nimiq; works with any domain). */
export function openInNimiqPayUrl() {
  try { return `https://nimpay.app/miniapps/open/${new URL(API_URL).host}`; } catch { return 'https://nimpay.app'; }
}
