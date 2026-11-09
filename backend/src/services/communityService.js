import { User } from '../models/User.js';
import { Pet } from '../models/Pet.js';
import { Block } from '../models/Report.js';
import { Community, CommunityMember } from '../models/Community.js';
import { Notification } from '../models/Notification.js';
import { sendToUser } from './pushService.js';
import { forbidden, notFound } from '../utils/errors.js';

const uniq = (ids) => [...new Set(ids.filter(Boolean).map(String))];

/** id -> { id, displayName } for a batch of users (display name only; never email or address). */
export async function authorMap(userIds) {
  const ids = uniq(userIds);
  if (!ids.length) return new Map();
  const users = await User.find({ _id: { $in: ids } }).select('profile.displayName status deletedAt').lean();
  return new Map(users.map((u) => [String(u._id), { id: String(u._id), displayName: u.deletedAt ? '' : u.profile?.displayName || '' }]));
}

/** id -> { id, name, species } for pets referenced on posts / RSVPs (name + species only). */
export async function petMap(petIds) {
  const ids = uniq(petIds);
  if (!ids.length) return new Map();
  const pets = await Pet.find({ _id: { $in: ids }, deletedAt: null }).select('name species').lean();
  return new Map(pets.map((p) => [String(p._id), { id: String(p._id), name: p.name, species: p.species }]));
}

/** Users hidden from `userId`'s view: people they blocked and people who blocked them. */
export async function blockedIds(userId) {
  const rows = await Block.find({ $or: [{ blockerId: userId }, { blockedId: userId }] }).lean();
  return rows.map((b) => (String(b.blockerId) === String(userId) ? b.blockedId : b.blockerId));
}

export async function myRole(userId, communityId) {
  const m = await CommunityMember.findOne({ communityId, userId }).select('role').lean();
  return m?.role ?? null;
}

export async function loadCommunity(id) {
  const c = await Community.findOne({ _id: id, deletedAt: null, status: 'active' });
  if (!c) throw notFound('Community not found');
  return c;
}

/** Asserts the caller belongs to the community; returns their role. */
export async function requireMember(userId, communityId) {
  const role = await myRole(userId, communityId);
  if (!role) throw forbidden('Join this community to do that');
  return role;
}

/**
 * Removes a membership and keeps the community healthy: counters stay right, and it is never left
 * without an admin (a moderator, else the longest-standing member, is promoted; the last one out
 * closes the community).
 */
export async function removeMember(communityId, userId) {
  const me = await CommunityMember.findOneAndDelete({ communityId, userId });
  if (!me) return false;
  await Community.updateOne({ _id: communityId, memberCount: { $gt: 0 } }, { $inc: { memberCount: -1 } });
  if (me.role === 'admin' && !(await CommunityMember.exists({ communityId, role: 'admin' }))) {
    const heir =
      (await CommunityMember.findOne({ communityId, role: 'moderator' }).sort({ joinedAt: 1 })) ||
      (await CommunityMember.findOne({ communityId }).sort({ joinedAt: 1 }));
    if (heir) { heir.role = 'admin'; await heir.save(); }
    else await Community.updateOne({ _id: communityId }, { $set: { deletedAt: new Date() } });
  }
  return true;
}

export const canModerate = (user, role) => user?.role === 'admin' || role === 'admin' || role === 'moderator';

/**
 * In-app notification (+ best-effort push) for a set of users. Honours each user's
 * "events"/"community" notification preference. `build(locale)` returns { title, body }. Never throws into the request path.
 */
export async function notifyUsers(userIds, { category = 'events', build, data = {} }) {
  try {
    const users = await User.find({ _id: { $in: uniq(userIds) }, deletedAt: null, status: 'active' }).select('notificationPrefs locale').lean();
    for (const u of users) {
      if (u.notificationPrefs?.[category] === false) continue;
      const { title, body = '' } = build(u.locale); // each person gets their own language
      const n = await Notification.create({ userId: u._id, category, title, body, data, pushStatus: 'pending' });
      const status = await sendToUser(u._id, { title, body, data });
      await Notification.updateOne({ _id: n._id }, { $set: { pushStatus: status } });
    }
  } catch (e) {
    console.error('[notify] failed:', e.message);
  }
}
