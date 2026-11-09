/**
 * "V" of MVC for a JSON API: presenters shape model documents into the public response format.
 * They are the only place that decides which fields leave the server.
 */
import { ageFromDob, fromGrams } from '../services/petService.js';

const strip = (doc, omit = []) => {
  const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const { _id, __v, deletedAt, ...rest } = o; // eslint-disable-line no-unused-vars
  for (const k of omit) delete rest[k];
  return { id: String(_id), ...rest };
};

export const userView = (u) => ({
  id: String(u._id),
  email: u.email ?? null,
  authMethod: u.nimiq?.address ? 'nimiq' : 'password',
  nimiqAddress: u.nimiq?.address ?? null,
  role: u.role,
  locale: u.locale,
  timezone: u.timezone,
  profile: u.profile,
  preferences: u.preferences,
  notificationPrefs: u.notificationPrefs,
  consents: (u.consents || []).map(({ kind, version, granted, at }) => ({ kind, version, granted, at })),
  createdAt: u.createdAt,
});

export const petView = (p, { timezone, latestWeight } = {}) => ({
  ...strip(p, ['ownerId']),
  age: ageFromDob(p.dateOfBirth, timezone),
  latestWeight: latestWeight ? { weightGrams: latestWeight.weightGrams, measuredAt: latestWeight.measuredAt } : null,
});

export const weightView = (w, unit) => ({
  id: String(w._id),
  petId: String(w.petId),
  weightGrams: w.weightGrams,
  value: fromGrams(w.weightGrams, unit),
  unit,
  measuredAt: w.measuredAt,
  note: w.note,
});

export const medicationView = (m) => ({
  ...strip(m, ['ownerId']),
  schedules: (m.schedules || []).map((s) => ({ id: String(s._id), localTime: s.localTime, daysOfWeek: s.daysOfWeek })),
});

export const doseView = (d) => strip(d, ['ownerId']);
export const vaccinationView = (v) => strip(v, ['ownerId']);
export const appointmentView = (a) => strip(a, ['ownerId']);
export const feedingView = (f) => strip(f, ['ownerId']);
export const documentView = (d) => strip(d, ['ownerId', 'fileKey']); // storage keys never leave the server

export const reminderView = (r) => ({
  ...strip(r, ['ownerId', 'claimedUntil', 'isFinal']),
  petId: r.petId ? String(r.petId) : null,
  // What the UI should show: the awaiting occurrence if notified, else the next one.
  dueAt: r.pendingDueAt ?? r.nextDueAt,
  isPending: Boolean(r.pendingDueAt),
});

export const notificationView = (n) => strip(n, ['userId']);

/* ---------------- community ---------------- */

export const communityView = (c, { role = null } = {}) => ({
  id: String(c._id),
  name: c.name,
  description: c.description,
  kind: c.kind,
  species: c.species,
  breed: c.breed,
  prefecture: c.prefecture,
  city: c.city,
  emoji: c.emoji,
  tint: c.tint,
  official: c.official,
  featured: c.featured,
  memberCount: c.memberCount,
  postCount: c.postCount,
  myRole: role, // null when not a member
  createdAt: c.createdAt,
});

export const postView = (p, { author, pet, liked = false, mine = false } = {}) => ({
  id: String(p._id),
  communityId: String(p.communityId),
  text: p.text,
  likeCount: p.likeCount,
  commentCount: p.commentCount,
  liked,
  mine,
  author: author || { id: String(p.authorId), displayName: '' },
  pet: pet || null,
  createdAt: p.createdAt,
});

export const commentView = (c, { author, mine = false } = {}) => ({
  id: String(c._id),
  postId: String(c.postId),
  text: c.text,
  mine,
  author: author || { id: String(c.authorId), displayName: '' },
  createdAt: c.createdAt,
});

export const eventView = (e, { host, community, myStatus = null, isHost = false } = {}) => ({
  id: String(e._id),
  title: e.title,
  description: e.description,
  category: e.category,
  startsAt: e.startsAt,
  endsAt: e.endsAt,
  timezone: e.timezone,
  place: { name: e.place?.name, prefecture: e.place?.prefecture, city: e.place?.city },
  maxParticipants: e.maxParticipants,
  goingCount: e.goingCount,
  spotsLeft: e.maxParticipants ? Math.max(0, e.maxParticipants - e.goingCount) : null,
  petTypes: e.petTypes,
  instructions: e.instructions,
  status: e.status,
  cancelReason: e.status === 'cancelled' ? e.cancelReason : '',
  completion: e.status === 'completed' ? { attended: e.completion?.attended, note: e.completion?.note } : null,
  featured: e.featured,
  ideaId: e.ideaId ? String(e.ideaId) : null,
  host: host || { id: String(e.hostId), displayName: '' },
  community: community ? { id: String(community._id), name: community.name, emoji: community.emoji } : null,
  myStatus, // 'going' | null
  isHost,
});

export const ideaView = (i) => {
  const t = i.en || {};
  return {
    id: String(i._id),
    key: i.key,
    category: i.category,
    emoji: i.emoji,
    recommendedGroupSize: i.recommendedGroupSize,
    suggestedDurationMinutes: i.suggestedDurationMinutes,
    petTypes: i.petTypes,
    title: t.title,
    concept: t.concept,
    format: t.format,
    instructions: t.instructions,
    locationRequirements: t.locationRequirements,
    photoSuggestions: t.photoSuggestions,
    safety: t.safety || [],
  };
};

export const blockView = (b, user) => ({ userId: String(b.blockedId), displayName: user?.displayName || '', blockedAt: b.createdAt });
