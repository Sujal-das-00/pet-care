import { Report, Block } from '../models/Report.js';
import { Post, Comment } from '../models/Post.js';
import { Event } from '../models/Event.js';
import { Community } from '../models/Community.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { User } from '../models/User.js';
import { authorMap } from '../services/communityService.js';
import { audit } from '../services/auditService.js';
import { badRequest, notFound } from '../utils/errors.js';

// Distinct reporters needed before content is hidden pending human review.
export const AUTO_HIDE_AT = 3;

const TARGETS = {
  post: { model: Post, owner: 'authorId', hides: true },
  comment: { model: Comment, owner: 'authorId', hides: true },
  message: { model: ChatMessage, owner: 'authorId', hides: true },
  event: { model: Event, owner: 'hostId', hides: true },
  community: { model: Community, owner: 'createdBy', hides: false },
  user: { model: User, owner: '_id', hides: false },
};

export async function createReport(req, res) {
  const { targetType, targetId, reason, note } = req.valid.body;
  const t = TARGETS[targetType];
  const target = await t.model.findById(targetId).lean();
  if (!target || target.deletedAt) throw notFound('Nothing to report');
  if (String(target[t.owner]) === String(req.userId)) throw badRequest('You cannot report your own content');

  try {
    await Report.create({ reporterId: req.userId, targetType, targetId, reason, note });
  } catch (e) {
    if (e.code === 11000) return res.status(200).json({ ok: true, duplicate: true }); // already reported: idempotent
    throw e;
  }
  if (t.model.schema.path('reportCount')) {
    const updated = await t.model.findByIdAndUpdate(targetId, { $inc: { reportCount: 1 } }, { returnDocument: 'after' });
    if (t.hides && updated.reportCount >= AUTO_HIDE_AT && !updated.hidden) await t.model.updateOne({ _id: targetId }, { $set: { hidden: true } });
  }
  audit(req, 'report.create', targetType, targetId, { reason });
  res.status(201).json({ ok: true });
}

export async function listBlocks(req, res) {
  const rows = await Block.find({ blockerId: req.userId }).sort({ createdAt: -1 }).limit(200).lean();
  const authors = await authorMap(rows.map((b) => b.blockedId));
  res.json({ items: rows.map((b) => ({ userId: String(b.blockedId), displayName: authors.get(String(b.blockedId))?.displayName || '', blockedAt: b.createdAt })) });
}

export async function blockUser(req, res) {
  const { userId } = req.valid.body;
  if (String(userId) === String(req.userId)) throw badRequest('You cannot block yourself');
  if (!(await User.exists({ _id: userId, deletedAt: null }))) throw notFound('User not found');
  try {
    await Block.create({ blockerId: req.userId, blockedId: userId });
  } catch (e) {
    if (e.code !== 11000) throw e;
  }
  res.status(204).end();
}

export async function unblockUser(req, res) {
  await Block.deleteOne({ blockerId: req.userId, blockedId: req.params.userId });
  res.status(204).end();
}
