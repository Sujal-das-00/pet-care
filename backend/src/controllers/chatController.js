import { ChatMessage } from '../models/ChatMessage.js';
import { CommunityMember } from '../models/Community.js';
import { authorMap, blockedIds, canModerate } from '../services/communityService.js';
import { GLOBAL_ROOM, authorizeRoom, messageView } from '../services/chatService.js';
import { broadcast } from '../realtime/chatHub.js';
import { beforeCursor, paginate } from '../utils/pagination.js';
import { PREFECTURES } from '../utils/prefectures.js';
import { HttpError, forbidden, notFound } from '../utils/errors.js';

const MAX_PER_MINUTE = 20;

const visible = (extra = {}) => ({ hidden: false, deletedAt: null, ...extra });

/** The rooms this person can enter: Everyone, their local area (if set) and each community they belong to. */
export async function listRooms(req, res) {
  const rooms = [{ room: GLOBAL_ROOM, type: 'global', title: 'Everyone', emoji: '🌏', subtitle: 'All PawCircle members' }];
  const pref = req.user.profile?.prefecture;
  if (pref) {
    const name = PREFECTURES.find((p) => p.code === pref)?.name;
    if (name) rooms.push({ room: `local:${pref}`, type: 'local', title: name, emoji: '📍', subtitle: 'People near you' });
  }
  const memberships = await CommunityMember.find({ userId: req.userId }).populate('communityId', 'name emoji deletedAt status').lean();
  for (const m of memberships) {
    const c = m.communityId;
    if (c && !c.deletedAt && c.status === 'active') rooms.push({ room: `community:${c._id}`, type: 'community', title: c.name, emoji: c.emoji, subtitle: 'Community chat', communityId: String(c._id) });
  }

  // Latest message in each, for the list preview.
  const blocked = await blockedIds(req.userId);
  const last = await ChatMessage.aggregate([
    { $match: { room: { $in: rooms.map((r) => r.room) }, hidden: false, deletedAt: null, authorId: { $nin: blocked } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$room', text: { $first: '$text' }, at: { $first: '$createdAt' } } },
  ]);
  const byRoom = new Map(last.map((l) => [l._id, l]));
  res.json({ items: rooms.map((r) => ({ ...r, lastMessage: byRoom.get(r.room) ? { text: byRoom.get(r.room).text, at: byRoom.get(r.room).at } : null })) });
}

/** Newest first, keyset-paginated. The app reverses it for display. */
export async function listMessages(req, res) {
  const info = await authorizeRoom(req.user, req.params.room);
  const { limit, cursor } = req.valid.query;
  const blocked = await blockedIds(req.userId);
  const q = ChatMessage.find({ ...visible({ room: info.room, authorId: { $nin: blocked } }), ...beforeCursor(cursor, 'createdAt') });
  const { items, nextCursor } = await paginate(q, { limit, field: 'createdAt' });
  const authors = await authorMap(items.map((m) => m.authorId));
  res.json({ room: { room: info.room, type: info.type, title: info.title, emoji: info.emoji }, items: items.map((m) => messageView(m, authors.get(String(m.authorId)))), nextCursor });
}

export async function postMessage(req, res) {
  const info = await authorizeRoom(req.user, req.params.room);
  const { text } = req.valid.body;

  // Spam controls: a per-minute budget, and no repeating yourself within a few seconds.
  if ((await ChatMessage.countDocuments({ authorId: req.userId, createdAt: { $gte: new Date(Date.now() - 60_000) } })) >= MAX_PER_MINUTE) {
    throw new HttpError(429, 'slow_down', 'You’re sending messages very quickly. Please wait a moment.');
  }
  if (await ChatMessage.exists({ authorId: req.userId, room: info.room, text, createdAt: { $gte: new Date(Date.now() - 15_000) } })) {
    throw new HttpError(429, 'duplicate', 'You just sent that.');
  }

  const m = await ChatMessage.create({ room: info.room, authorId: req.userId, text });
  const authors = await authorMap([req.userId]);
  const view = messageView(m, authors.get(String(req.userId)));
  broadcast(info.room, { type: 'message', message: view }, req.userId).catch(() => {});
  res.status(201).json({ message: view });
}

export async function deleteMessage(req, res) {
  const info = await authorizeRoom(req.user, req.params.room);
  const m = await ChatMessage.findOne({ _id: req.params.messageId, room: info.room, deletedAt: null });
  if (!m) throw notFound('Message not found');
  const isAuthor = String(m.authorId) === String(req.userId);
  if (!isAuthor && !canModerate(req.user, info.type === 'community' ? info.myRole : null)) throw forbidden('You can’t delete this message');
  m.deletedAt = new Date();
  await m.save();
  broadcast(info.room, { type: 'deleted', room: info.room, id: String(m._id) }).catch(() => {});
  res.status(204).end();
}
