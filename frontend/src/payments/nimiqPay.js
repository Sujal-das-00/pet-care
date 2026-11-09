// Native (iOS/Android) build: the Nimiq Pay mini-app provider only exists inside Nimiq Pay's web view,
// so on native we can't pay in one tap. The unlock screen falls back to a payment request link.
export const isInsideNimiqPay = () => false;
export const hostNetwork = () => null;
export async function payWithNimiqPay() {
  throw new Error('Nimiq Pay is only available when PawCircle is opened inside the Nimiq Pay app');
}
