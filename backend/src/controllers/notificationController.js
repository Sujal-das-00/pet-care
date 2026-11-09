import { Notification } from '../models/Notification.js';
import { notificationView } from '../views/index.js';
import { beforeCursor, paginate, parseLimit } from '../utils/pagination.js';

export async function listNotifications(req, res) {
  const { limit, cursor } = req.valid.query;
  const q = Notification.find({ userId: req.userId, ...beforeCursor(cursor, 'createdAt') });
  const { items, nextCursor } = await paginate(q, { limit: parseLimit(limit), field: 'createdAt' });
  const unread = await Notification.countDocuments({ userId: req.userId, readAt: null });
  res.json({ items: items.map(notificationView), nextCursor, unread });
}

export async function markAllRead(req, res) {
  await Notification.updateMany({ userId: req.userId, readAt: null }, { $set: { readAt: new Date() } });
  res.status(204).end();
}

export async function markRead(req, res) {
  await Notification.updateOne({ _id: req.params.notificationId, userId: req.userId }, { $set: { readAt: new Date() } });
  res.status(204).end();
}
