import { API_URL } from '../config';
import { getItem, setItem } from './storage';

const KEY = 'pawcircle.session';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let session = null; // { accessToken, refreshToken }
let onSignedOut = () => {};
let onPaywall = () => {};
let refreshing = null;

export const setSignedOutHandler = (fn) => { onSignedOut = fn; };
export const setPaywallHandler = (fn) => { onPaywall = fn; };
export const currentSession = () => session;

export async function loadSession() {
  const raw = await getItem(KEY);
  session = raw ? JSON.parse(raw) : null;
  return session;
}

export async function saveSession(s) {
  session = s ? { accessToken: s.accessToken, refreshToken: s.refreshToken } : null;
  await setItem(KEY, session ? JSON.stringify(session) : null);
}

async function raw(path, { method = 'GET', body, auth = true, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal });
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the server');
  }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error || {};
    if (res.status === 402 && e.code === 'membership_required') onPaywall();
    throw new ApiError(res.status, e.code || 'error', e.message || `Request failed (${res.status})`, e.details);
  }
  return json;
}

/** Exchanges the refresh token once, even if several requests hit 401 at the same time. */
async function refreshSession() {
  refreshing ??= (async () => {
    try {
      if (!session?.refreshToken) throw new ApiError(401, 'unauthorized', 'No session');
      const next = await raw('/v1/auth/refresh', { method: 'POST', auth: false, body: { refreshToken: session.refreshToken } });
      await saveSession(next);
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function request(path, opts) {
  try {
    return await raw(path, opts);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && opts?.auth !== false && session?.refreshToken) {
      try {
        await refreshSession();
      } catch {
        await saveSession(null);
        onSignedOut();
        throw e;
      }
      return raw(path, opts);
    }
    throw e;
  }
}

export const api = {
  get: (p, o) => request(p, { ...o, method: 'GET' }),
  post: (p, body, o) => request(p, { ...o, method: 'POST', body: body ?? {} }),
  patch: (p, body, o) => request(p, { ...o, method: 'PATCH', body }),
  put: (p, body, o) => request(p, { ...o, method: 'PUT', body }),
  del: (p, body, o) => request(p, { ...o, method: 'DELETE', body }),
};
