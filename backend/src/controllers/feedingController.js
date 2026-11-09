import { FeedingSchedule } from '../models/FeedingSchedule.js';
import { feedingView } from '../views/index.js';
import { feedingReminderDocs, replaceSourceReminders, cancelSourceReminders } from '../services/reminderService.js';
import { notFound } from '../utils/errors.js';

async function findFeed(req) {
  const f = await FeedingSchedule.findOne({ _id: req.params.feedingId, petId: req.pet._id, deletedAt: null });
  if (!f) throw notFound('Feeding schedule not found');
  return f;
}

export async function listFeeding(req, res) {
  const items = await FeedingSchedule.find({ petId: req.pet._id, deletedAt: null }).sort({ localTime: 1 });
  res.json({ items: items.map(feedingView) });
}

export async function createFeeding(req, res) {
  const feed = await FeedingSchedule.create({ ...req.valid.body, petId: req.pet._id, ownerId: req.userId });
  await replaceSourceReminders('feeding', feed._id, feedingReminderDocs(feed, req.pet, req.user));
  res.status(201).json({ feeding: feedingView(feed) });
}

export async function updateFeeding(req, res) {
  const feed = await findFeed(req);
  feed.set(req.valid.body);
  await feed.save();
  await replaceSourceReminders('feeding', feed._id, feedingReminderDocs(feed, req.pet, req.user));
  res.json({ feeding: feedingView(feed) });
}

export async function deleteFeeding(req, res) {
  const feed = await findFeed(req);
  feed.deletedAt = new Date();
  await feed.save();
  await cancelSourceReminders('feeding', feed._id);
  res.status(204).end();
}
