import { Platform } from 'react-native';

// Android emulators reach the host machine at 10.0.2.2.
const defaultApi = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';

const isLocalHost = (h) => h === 'localhost' || h === '127.0.0.1';

/**
 * Where the API lives.
 *  - Web build served by the API itself (production): the page's own origin — no configuration needed.
 *  - A web build that accidentally baked in a localhost URL but is opened from a real domain: also its own
 *    origin, instead of silently calling the visitor's own computer.
 *  - Otherwise EXPO_PUBLIC_API_URL, falling back to the local dev server.
 */
function resolveApiUrl() {
  const fromEnv = (process.env.EXPO_PUBLIC_API_URL || '').trim();
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    const envIsLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(fromEnv);
    if (!fromEnv || (envIsLocal && !isLocalHost(window.location.hostname))) return window.location.origin;
  }
  return (fromEnv || defaultApi).replace(/\/$/, '');
}

export const API_URL = resolveApiUrl();

/**
 * Demo mode renders clearly-labelled sample content for features that are not built yet
 * (community, challenges, walking) so the design can be reviewed. It is NEVER mixed into
 * real user data and is off unless explicitly enabled.
 */
export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === '1';
