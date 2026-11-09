import { Community, CommunityMember } from '../models/Community.js';
import { communityView } from '../views/index.js';
import { authorMap, loadCommunity, myRole, removeMember } from '../services/communityService.js';
import { Event } from '../models/Event.js';
import { audit } from '../services/auditService.js';
import { badRequest, forbidden } from '../utils/errors.js';

const MAX_OWNED = 3;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LIVE = { deletedAt: null, status: 'active' };

async function rolesFor(userId, communities) {
  if (!communities.length) return new Map();
  const rows = await CommunityMember.find({ userId, communityId: { $in: communities.map((c) => c._id) } }).select('communityId role').lean();
  return new Map(rows.map((r) => [String(r.communityId), r.role]));
}

export async function listCommunities(req, res) {
  const { scope, q, species, kind, prefecture, limit, offset } = req.valid.query;
  const filter = { ...LIVE };
  if (species) filter.species = { $in: [species, 'any'] };
  if (kind) filter.kind = kind;
  if (q) filter.$or = [{ name: new RegExp(escapeRe(q), 'i') }, { breed: new RegExp(escapeRe(q), 'i') }, { description: new RegExp(escapeRe(q), 'i') }];

  let sort = { featured: -1, memberCount: -1, _id: -1 };
  if (scope === 'new') sort = { createdAt: -1, _id: -1 };
  if (scope === 'mine') {
    const mem = await CommunityMember.find({ userId: req.userId }).select('communityId').lean();
    filter._id = { $in: mem.map((m) => m.communityId) };
  }
  if (scope === 'nearby') {
    const pref = prefecture || req.user.profile?.prefecture;
    if (!pref) return res.json({ items: [], hasMore: false, needsLocation: true });
    filter.prefecture = pref;
  } else if (prefecture) filter.prefecture = prefecture;

  const rows = await Community.find(filter).sort(sort).skip(offset).limit(limit + 1).lean();
  const items = rows.slice(0, limit);
  const roles = await rolesFor(req.userId, items);
  res.json({ items: items.map((c) => communityView(c, { role: roles.get(String(c._id)) ?? null })), hasMore: rows.length > limit });
}

export async function createCommunity(req, res) {
  if ((await Community.countDocuments({ createdBy: req.userId, deletedAt: null })) >= MAX_OWNED) {
    throw badRequest(`You can create up to ${MAX_OWNED} communities`);
  }
  const c = await Community.create({ ...req.valid.body, createdBy: req.userId, memberCount: 1 });
  await CommunityMember.create({ communityId: c._id, userId: req.userId, role: 'admin' });
  audit(req, 'community.create', 'Community', c._id);
  res.status(201).json({ community: communityView(c, { role: 'admin' }) });
}

export async function getCommunity(req, res) {
  const c = await loadCommunity(req.params.communityId);
  const upcomingEvents = await Event.countDocuments({
    communityId: c._id, status: 'scheduled', hidden: false, deletedAt: null, startsAt: { $gte: new Date() },
  });
  res.json({ community: { ...communityView(c, { role: await myRole(req.userId, c._id) }), upcomingEvents } });
}

export async function updateCommunity(req, res) {
  const c = await loadCommunity(req.params.communityId);
  const role = await myRole(req.userId, c._id);
  if (req.user.role !== 'admin' && role !== 'admin') throw forbidden('Only the community admin can edit it');
  c.set(req.valid.body);
  await c.save();
  res.json({ community: communityView(c, { role }) });
}

export async function deleteCommunity(req, res) {
  const c = await loadCommunity(req.params.communityId);
  if (req.user.role !== 'admin' && (await myRole(req.userId, c._id)) !== 'admin') throw forbidden('Only the community admin can delete it');
  c.deletedAt = new Date();
  await c.save();
  audit(req, 'community.delete', 'Community', c._id);
  res.status(204).end();
}

/** Idempotent: joining twice is a no-op; the counter only moves when a membership row is really created. */
export async function join(req, res) {
  const c = await loadCommunity(req.params.communityId);
  try {
    await CommunityMember.create({ communityId: c._id, userId: req.userId, role: 'member' });
    await Community.updateOne({ _id: c._id }, { $inc: { memberCount: 1 } });
  } catch (e) {
    if (e.code !== 11000) throw e; // already a member
  }
  const fresh = await Community.findById(c._id).lean();
  res.json({ community: communityView(fresh, { role: await myRole(req.userId, c._id) }) });
}

export async function leave(req, res) {
  const c = await loadCommunity(req.params.communityId);
  await removeMember(c._id, req.userId);
  res.status(204).end();
}

export async function listMembers(req, res) {
  const c = await loadCommunity(req.params.communityId);
  const { limit, offset } = req.valid.query;
  const rows = await CommunityMember.find({ communityId: c._id }).sort({ role: 1, joinedAt: 1 }).skip(offset).limit(limit + 1).lean();
  const items = rows.slice(0, limit);
  const authors = await authorMap(items.map((m) => m.userId));
  res.json({
    items: items.map((m) => ({ ...(authors.get(String(m.userId)) || { id: String(m.userId), displayName: '' }), role: m.role, joinedAt: m.joinedAt })),
    hasMore: rows.length > limit,
  });
}

/** Admin-only role changes: promote/demote a moderator. */
export async function setMemberRole(req, res) {
  const c = await loadCommunity(req.params.communityId);
  if (req.user.role !== 'admin' && (await myRole(req.userId, c._id)) !== 'admin') throw forbidden('Only the community admin can do that');
  const { role } = req.valid.body;
  const m = await CommunityMember.findOneAndUpdate({ communityId: c._id, userId: req.params.userId, role: { $ne: 'admin' } }, { $set: { role } }, { returnDocument: 'after' });
  if (!m) throw badRequest('Member not found, or is the admin');
  res.json({ ok: true });
}
