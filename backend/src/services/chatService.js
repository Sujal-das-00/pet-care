import { Community, CommunityMember } from '../models/Community.js';
import { PREFECTURES } from '../utils/prefectures.js';
import { forbidden, notFound } from '../utils/errors.js';

/**
 * Chat rooms:
 *   global              everyone with community access
 *   local:<prefecture>  people whose profile area is that prefecture (JIS code, e.g. local:13 = Tokyo)
 *   community:<id>      members of that community
 */
export const GLOBAL_ROOM = 'global';

export function parseRoom(room) {
  if (room === GLOBAL_ROOM) return { room, type: 'global' };
  let m = /^local:(\d{2})$/.exec(room);
  if (m && PREFECTURES.some((p) => p.code === m[1])) return { room, type: 'local', prefecture: m[1] };
  m = /^community:([a-f0-9]{24})$/i.exec(room);
  if (m) return { room, type: 'community', communityId: m[1] };
  return null;
}

/** Throws unless `user` may read and write in `room`; returns display info for it. */
export async function authorizeRoom(user, room) {
  const parsed = parseRoom(String(room));
  if (!parsed) throw notFound('Chat room not found');

  if (parsed.type === 'global') return { ...parsed, title: 'Everyone', emoji: '🌏' };

  if (parsed.type === 'local') {
    if (user.profile?.prefecture !== parsed.prefecture) throw forbidden('Local chat is for people in that area. Set your area in Settings.');
    return { ...parsed, title: PREFECTURES.find((p) => p.code === parsed.prefecture).name, emoji: '📍' };
  }

  const community = await Community.findOne({ _id: parsed.communityId, deletedAt: null, status: 'active' }).select('name emoji').lean();
  if (!community) throw notFound('Chat room not found');
  const member = await CommunityMember.findOne({ communityId: parsed.communityId, userId: user._id }).select('role').lean();
  if (!member) throw forbidden('Join this community to chat with its members');
  return { ...parsed, title: community.name, emoji: community.emoji, myRole: member.role };
}

export const messageView = (m, author) => ({
  id: String(m._id),
  room: m.room,
  text: m.text,
  createdAt: m.createdAt,
  author: author || { id: String(m.authorId), displayName: '' },
});
