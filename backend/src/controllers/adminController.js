import { Report } from '../models/Report.js';
import { Post, Comment } from '../models/Post.js';
import { Event, EventIdea } from '../models/Event.js';
import { Community } from '../models/Community.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { User } from '../models/User.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { audit } from '../services/auditService.js';
import { beforeCursor, paginate } from '../utils/pagination.js';
import { notFound } from '../utils/errors.js';

// Moderation API. The admin dashboard UI arrives in Phase 6; operators can use these endpoints today.

async function summarise(report) {
  const { targetType: t, targetId: id } = report;
  const pick = { post: [Post, 'text communityId authorId hidden'], comment: [Comment, 'text authorId hidden'], message: [ChatMessage, 'text room authorId hidden'], event: [Event, 'title hostId hidden status'], community: [Community, 'name status'], user: [User, 'profile.displayName status'] }[t];
  const doc = await pick[0].findById(id).select(pick[1]).lean();
  return doc ? { exists: true, ...doc, id: String(doc._id), _id: undefined } : { exists: false };
}

export async function listReports(req, res) {
  const { status, limit, cursor } = req.valid.query;
  const q = Report.find({ status, ...beforeCursor(cursor, 'createdAt') });
  const { items, nextCursor } = await paginate(q, { limit, field: 'createdAt' });
  const withTarget = await Promise.all(items.map(async (r) => ({
    id: String(r._id), targetType: r.targetType, targetId: String(r.targetId), reason: r.reason, note: r.note,
    status: r.status, createdAt: r.createdAt, target: await summarise(r),
  })));
  res.json({ items: withTarget, nextCursor });
}

/**
 * hide    -> content is hidden (users: suspended and signed out) and every open report on it is actioned
 * dismiss -> reports are dismissed and any auto-hidden content is released
 */
export async function resolveReport(req, res) {
  const report = await Report.findById(req.params.reportId);
  if (!report) throw notFound('Report not found');
  const { targetType: type, targetId: id } = report;
  const { action } = req.valid.body;
  const hide = action === 'hide';

  if (type === 'post') await Post.updateOne({ _id: id }, { $set: { hidden: hide } });
  else if (type === 'comment') await Comment.updateOne({ _id: id }, { $set: { hidden: hide } });
  else if (type === 'message') await ChatMessage.updateOne({ _id: id }, { $set: { hidden: hide } });
  else if (type === 'event') await Event.updateOne({ _id: id }, { $set: { hidden: hide } });
  else if (type === 'community') await Community.updateOne({ _id: id }, { $set: { status: hide ? 'hidden' : 'active' } });
  else if (type === 'user' && hide) {
    await User.updateOne({ _id: id }, { $set: { status: 'suspended' } });
    await RefreshToken.updateMany({ userId: id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  }

  await Report.updateMany(
    { targetType: type, targetId: id, status: 'open' },
    { $set: { status: hide ? 'actioned' : 'dismissed', resolvedBy: req.userId, resolvedAt: new Date() } },
  );
  audit(req, `moderation.${action}`, type, id, { reportId: String(report._id) });
  res.json({ ok: true });
}

export async function upsertIdea(req, res) {
  const idea = await EventIdea.findOneAndUpdate({ key: req.valid.body.key }, { $set: req.valid.body }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
  audit(req, 'idea.upsert', 'EventIdea', idea._id);
  res.json({ id: String(idea._id) });
}

export async function updateCommunityFlags(req, res) {
  const c = await Community.findByIdAndUpdate(req.params.communityId, { $set: req.valid.body }, { returnDocument: 'after' });
  if (!c) throw notFound('Community not found');
  audit(req, 'community.admin_update', 'Community', c._id, req.valid.body);
  res.json({ ok: true });
}

export async function featureEvent(req, res) {
  const e = await Event.findByIdAndUpdate(req.params.eventId, { $set: { featured: Boolean(req.valid.body.featured) } }, { returnDocument: 'after' });
  if (!e) throw notFound('Event not found');
  audit(req, 'event.feature', 'Event', e._id, { featured: e.featured });
  res.json({ ok: true });
}
