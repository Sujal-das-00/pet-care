import { Device } from '../models/Device.js';

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';

// Swappable (tests inject a stub so nothing touches the network).
let transport = async (messages) => {
  const res = await fetch(EXPO_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!res.ok) throw new Error(`Expo push HTTP ${res.status}`);
  return (await res.json()).data;
};
export const setPushTransport = (fn) => { transport = fn; };

/**
 * Sends a push to every device the user has registered.
 * Returns 'sent' | 'failed' | 'no_device'. Expo push tokens are relayed to FCM/APNs by Expo.
 */
export async function sendToUser(userId, { title, body, data = {} }) {
  const devices = await Device.find({ userId, tokenType: 'expo' }).lean();
  if (!devices.length) return 'no_device';
  try {
    const tickets = await transport(
      devices.map((d) => ({ to: d.pushToken, title, body, data, sound: 'default', channelId: 'care' })),
    );
    const dead = [];
    tickets.forEach((t, i) => {
      if (t.status === 'error' && t.details?.error === 'DeviceNotRegistered') dead.push(devices[i]._id);
    });
    if (dead.length) await Device.deleteMany({ _id: { $in: dead } });
    return tickets.some((t) => t.status === 'ok') ? 'sent' : 'failed';
  } catch (err) {
    console.error('[push] send failed:', err.message);
    return 'failed';
  }
}
