import { Community, CommunityMember } from '../models/Community.js';
import { Post, Comment, Like } from '../models/Post.js';
import { Pet } from '../models/Pet.js';
import { postView, commentView } from '../views/index.js';
import { authorMap, blockedIds, canModerate, loadCommunity, myRole, petMap, requireMember } from '../services/communityService.js';
import { beforeCursor, paginate } from '../utils/pagination.js';
import { HttpError, forbidden, notFound } from '../utils/errors.js';

const MAX_POSTS_PER_HOUR = 10;
const MAX_COMMENTS_PER_HOUR = 30;
const slowDown = () => new HttpError(429, 'slow_down', 'You are posting too fast. Please wait a bit.');

/** Hydrates raw posts with author, pet, community and the viewer's like state in a fixed number of queries. */
async function present(posts, req) {
  const [authors, pets, likes, communities] = await Promise.all([
    authorMap(posts.map((p) => p.authorId)),
    petMap(posts.map((p) => p.petId)),
    Like.find({ userId: req.userId, postId: { $in: posts.map((p) => p._id) } }).select('postId').lean(),
    Community.find({ _id: { $in: posts.map((p) => p.communityId) } }).select('name emoji').lean(),
  ]);
  const liked = new Set(likes.map((l) => String(l.postId)));
  const byCommunity = new Map(communities.map((c) => [String(c._id), { id: String(c._id), name: c.name, emoji: c.emoji }]));
  return posts.map((p) => ({
    ...postView(p, {
      author: authors.get(String(p.authorId)),
      pet: pets.get(String(p.petId)),
      liked: liked.has(String(p._id)),
      mine: String(p.authorId) === String(req.userId),
    }),
    community: byCommunity.get(String(p.communityId)) || null,
  }));
}

const visible = (extra = {}) => ({ deletedAt: null, hidden: false, ...extra });

/** Posts from the communities I belong to; if I belong to none, from the most popular ones. */
export async function feed(req, res) {
  const { limit, cursor } = req.valid.query;
  const memberships = await CommunityMember.find({ userId: req.userId }).select('communityId').lean();
  let communityIds = memberships.map((m) => m.communityId);
  let source = 'mine';
  if (!communityIds.length) {
    const top = await Community.find({ deletedAt: null, status: 'active' }).sort({ memberCount: -1, _id: -1 }).limit(10).select('_id').lean();
    communityIds = top.map((c) => c._id);
    source = 'discover';
  }
  const blocked = await blockedIds(req.userId);
  const q = Post.find({ ...visible({ communityId: { $in: communityIds }, authorId: { $nin: blocked } }), ...beforeCursor(cursor, 'createdAt') });
  const { items, nextCursor } = await paginate(q, { limit, field: 'createdAt' });
  res.json({ items: await present(items, req), nextCursor, source });
}

export async function listPosts(req, res) {
  const c = await loadCommunity(req.params.communityId);
  const { limit, cursor } = req.valid.query;
  const blocked = await blockedIds(req.userId);
  const q = Post.find({ ...visible({ communityId: c._id, authorId: { $nin: blocked } }), ...beforeCursor(cursor, 'createdAt') });
  const { items, nextCursor } = await paginate(q, { limit, field: 'createdAt' });
  res.json({ items: await present(items, req), nextCursor });
}

export async function createPost(req, res) {
  const c = await loadCommunity(req.params.communityId);
  await requireMember(req.userId, c._id);
  const { text, petId } = req.valid.body;
  if (petId && !(await Pet.exists({ _id: petId, ownerId: req.userId, deletedAt: null }))) throw notFound('Pet not found');
  if ((await Post.countDocuments({ authorId: req.userId, createdAt: { $gte: new Date(Date.now() - 3600_000) } })) >= MAX_POSTS_PER_HOUR) throw slowDown();
  const post = await Post.create({ communityId: c._id, authorId: req.userId, petId, text });
  await Community.updateOne({ _id: c._id }, { $inc: { postCount: 1 } });
  res.status(201).json({ post: (await present([post.toObject()], req))[0] });
}

async function findPost(id) {
  const p = await Post.findOne({ _id: id, deletedAt: null });
  if (!p) throw notFound('Post not found');
  return p;
}

export async function getPost(req, res) {
  const post = await findPost(req.params.postId);
  if (post.hidden && String(post.authorId) !== String(req.userId) && req.user.role !== 'admin') throw notFound('Post not found');
  res.json({ post: (await present([post.toObject()], req))[0] });
}

export async function deletePost(req, res) {
  const post = await findPost(req.params.postId);
  const isAuthor = String(post.authorId) === String(req.userId);
  if (!isAuthor && !canModerate(req.user, await myRole(req.userId, post.communityId))) throw forbidden('You cannot delete this post');
  post.deletedAt = new Date();
  await post.save();
  await Community.updateOne({ _id: post.communityId }, { $inc: { postCount: -1 } });
  res.status(204).end();
}

/** Like/unlike are idempotent; the counter only moves when a row is actually created or removed. */
export async function like(req, res) {
  const post = await findPost(req.params.postId);
  try {
    await Like.create({ postId: post._id, userId: req.userId });
    await Post.updateOne({ _id: post._id }, { $inc: { likeCount: 1 } });
  } catch (e) {
    if (e.code !== 11000) throw e; // already liked
  }
  res.json({ liked: true, likeCount: (await Post.findById(post._id).select('likeCount').lean()).likeCount });
}

export async function unlike(req, res) {
  const post = await findPost(req.params.postId);
  const r = await Like.deleteOne({ postId: post._id, userId: req.userId });
  if (r.deletedCount) await Post.updateOne({ _id: post._id, likeCount: { $gt: 0 } }, { $inc: { likeCount: -1 } });
  res.json({ liked: false, likeCount: (await Post.findById(post._id).select('likeCount').lean()).likeCount });
}

export async function listComments(req, res) {
  const post = await findPost(req.params.postId);
  const blocked = (await blockedIds(req.userId)).map(String);
  const rows = await Comment.find({ postId: post._id, deletedAt: null, hidden: false }).sort({ createdAt: 1, _id: 1 }).limit(200).lean();
  const kept = rows.filter((c) => !blocked.includes(String(c.authorId)));
  const authors = await authorMap(kept.map((c) => c.authorId));
  res.json({ items: kept.map((c) => commentView(c, { author: authors.get(String(c.authorId)), mine: String(c.authorId) === String(req.userId) })) });
}

export async function createComment(req, res) {
  const post = await findPost(req.params.postId);
  await requireMember(req.userId, post.communityId);
  if ((await Comment.countDocuments({ authorId: req.userId, createdAt: { $gte: new Date(Date.now() - 3600_000) } })) >= MAX_COMMENTS_PER_HOUR) throw slowDown();
  const c = await Comment.create({ postId: post._id, authorId: req.userId, text: req.valid.body.text });
  await Post.updateOne({ _id: post._id }, { $inc: { commentCount: 1 } });
  const authors = await authorMap([req.userId]);
  res.status(201).json({ comment: commentView(c, { author: authors.get(String(req.userId)), mine: true }) });
}

export async function deleteComment(req, res) {
  const post = await findPost(req.params.postId);
  const c = await Comment.findOne({ _id: req.params.commentId, postId: post._id, deletedAt: null });
  if (!c) throw notFound('Comment not found');
  const isAuthor = String(c.authorId) === String(req.userId);
  if (!isAuthor && !canModerate(req.user, await myRole(req.userId, post.communityId))) throw forbidden('You cannot delete this comment');
  c.deletedAt = new Date();
  await c.save();
  await Post.updateOne({ _id: post._id, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } });
  res.status(204).end();
}
