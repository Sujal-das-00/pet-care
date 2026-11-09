// Model layer: one function per backend endpoint. No UI or caching concerns here.
import { api } from './client';

export const AuthApi = {
  register: (body) => api.post('/v1/auth/register', body, { auth: false }),
  login: (body) => api.post('/v1/auth/login', body, { auth: false }),
  logout: (refreshToken) => api.post('/v1/auth/logout', { refreshToken }, { auth: false }),
};

export const MeApi = {
  get: () => api.get('/v1/me'),
  update: (body) => api.patch('/v1/me', body),
  consent: (body) => api.post('/v1/me/consents', body),
  registerDevice: (body) => api.put('/v1/me/devices', body),
  removeDevice: (pushToken) => api.del('/v1/me/devices', { pushToken }),
  entitlements: () => api.get('/v1/me/entitlements'),
  notifications: () => api.get('/v1/me/notifications?limit=50'),
  readAll: () => api.post('/v1/me/notifications/read-all'),
  export: () => api.get('/v1/me/export'),
  deleteAccount: (password) => api.del('/v1/me', { password }),
};

export const HomeApi = { get: () => api.get('/v1/home') };

export const PetsApi = {
  list: () => api.get('/v1/pets'),
  create: (body) => api.post('/v1/pets', body),
  get: (id) => api.get(`/v1/pets/${id}`),
  update: (id, body) => api.patch(`/v1/pets/${id}`, body),
  remove: (id) => api.del(`/v1/pets/${id}`),

  weightSeries: (id, days = 365) => api.get(`/v1/pets/${id}/weights/series?days=${days}`),
  weights: (id) => api.get(`/v1/pets/${id}/weights?limit=30`),
  addWeight: (id, body) => api.post(`/v1/pets/${id}/weights`, body),
  deleteWeight: (id, weightId) => api.del(`/v1/pets/${id}/weights/${weightId}`),

  medications: (id, status = 'active') => api.get(`/v1/pets/${id}/medications?status=${status}`),
  addMedication: (id, body) => api.post(`/v1/pets/${id}/medications`, body),
  finishMedication: (id, medId, discontinued = false) => api.post(`/v1/pets/${id}/medications/${medId}/finish`, { discontinued }),
  doses: (id, medId) => api.get(`/v1/pets/${id}/medications/${medId}/doses?limit=30`),

  vaccinations: (id) => api.get(`/v1/pets/${id}/vaccinations`),
  addVaccination: (id, body) => api.post(`/v1/pets/${id}/vaccinations`, body),
  deleteVaccination: (id, vid) => api.del(`/v1/pets/${id}/vaccinations/${vid}`),

  appointments: (id) => api.get(`/v1/pets/${id}/appointments?status=scheduled`),
  addAppointment: (id, body) => api.post(`/v1/pets/${id}/appointments`, body),
  updateAppointment: (id, aid, body) => api.patch(`/v1/pets/${id}/appointments/${aid}`, body),

  feeding: (id) => api.get(`/v1/pets/${id}/feeding`),
  addFeeding: (id, body) => api.post(`/v1/pets/${id}/feeding`, body),
  deleteFeeding: (id, fid) => api.del(`/v1/pets/${id}/feeding/${fid}`),
};

export const RemindersApi = {
  list: (query = 'scope=upcoming') => api.get(`/v1/reminders?${query}`),
  create: (body) => api.post('/v1/reminders', body),
  complete: (id, action = 'done') => api.post(`/v1/reminders/${id}/complete`, { action }),
  cancel: (id) => api.del(`/v1/reminders/${id}`),
};

const qs = (o = {}) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? `?${new URLSearchParams(p.map(([k, v]) => [k, String(v)]))}` : '';
};

export const CommunityApi = {
  list: (q) => api.get(`/v1/communities${qs(q)}`),
  get: (id) => api.get(`/v1/communities/${id}`),
  create: (body) => api.post('/v1/communities', body),
  update: (id, body) => api.patch(`/v1/communities/${id}`, body),
  join: (id) => api.post(`/v1/communities/${id}/join`),
  leave: (id) => api.del(`/v1/communities/${id}/join`),
  members: (id, q) => api.get(`/v1/communities/${id}/members${qs(q)}`),
  feed: (q) => api.get(`/v1/feed${qs(q)}`),
  posts: (id, q) => api.get(`/v1/communities/${id}/posts${qs(q)}`),
  createPost: (id, body) => api.post(`/v1/communities/${id}/posts`, body),
  post: (id) => api.get(`/v1/posts/${id}`),
  deletePost: (id) => api.del(`/v1/posts/${id}`),
  like: (id) => api.put(`/v1/posts/${id}/like`),
  unlike: (id) => api.del(`/v1/posts/${id}/like`),
  comments: (id) => api.get(`/v1/posts/${id}/comments`),
  addComment: (id, text) => api.post(`/v1/posts/${id}/comments`, { text }),
  deleteComment: (id, cid) => api.del(`/v1/posts/${id}/comments/${cid}`),
};

export const EventApi = {
  ideas: () => api.get('/v1/event-ideas'),
  idea: (id) => api.get(`/v1/event-ideas/${id}`),
  list: (q) => api.get(`/v1/events${qs(q)}`),
  get: (id) => api.get(`/v1/events/${id}`),
  create: (body) => api.post('/v1/events', body),
  update: (id, body) => api.patch(`/v1/events/${id}`, body),
  cancel: (id, reason) => api.post(`/v1/events/${id}/cancel`, { reason }),
  complete: (id, body) => api.post(`/v1/events/${id}/complete`, body),
  participants: (id) => api.get(`/v1/events/${id}/participants`),
  rsvp: (id, petIds = []) => api.put(`/v1/events/${id}/rsvp`, { petIds }),
  leave: (id) => api.del(`/v1/events/${id}/rsvp`),
};

export const SafetyApi = {
  report: (body) => api.post('/v1/reports', body),
  blocks: () => api.get('/v1/blocks'),
  block: (userId) => api.post('/v1/blocks', { userId }),
  unblock: (userId) => api.del(`/v1/blocks/${userId}`),
};

export const MembershipApi = {
  get: () => api.get('/v1/membership'),
  createIntent: () => api.post('/v1/membership/nimiq/intents'),
  verify: (intentId, txHash) => api.post(`/v1/membership/nimiq/intents/${intentId}/verify`, txHash ? { txHash } : {}),
};

export const ChallengeApi = {
  list: (status = 'active', limit = 20) => api.get(`/v1/challenges${qs({ status, limit })}`),
  get: (id) => api.get(`/v1/challenges/${id}`),
  join: (id) => api.post(`/v1/challenges/${id}/join`),
  entries: (id) => api.get(`/v1/challenges/${id}/entries`),
  addEntry: (id, body) => api.post(`/v1/challenges/${id}/entries`, body),
  deleteEntry: (id, entryId) => api.del(`/v1/challenges/${id}/entries/${entryId}`),
  leaderboard: (id, q) => api.get(`/v1/challenges/${id}/leaderboard${qs(q)}`),
};

export const AdminChallengeApi = {
  list: () => api.get('/v1/admin/challenges'),
  create: (body) => api.post('/v1/admin/challenges', body),
  update: (id, body) => api.patch(`/v1/admin/challenges/${id}`, body),
  remove: (id) => api.del(`/v1/admin/challenges/${id}`),
  entries: (id) => api.get(`/v1/admin/challenges/${id}/entries`),
  removeEntry: (entryId) => api.del(`/v1/admin/challenge-entries/${entryId}`),
};

export const ChatApi = {
  rooms: () => api.get('/v1/chat/rooms'),
  messages: (room, q) => api.get(`/v1/chat/rooms/${encodeURIComponent(room)}/messages${qs(q)}`),
  send: (room, text) => api.post(`/v1/chat/rooms/${encodeURIComponent(room)}/messages`, { text }),
  remove: (room, id) => api.del(`/v1/chat/rooms/${encodeURIComponent(room)}/messages/${id}`),
};
