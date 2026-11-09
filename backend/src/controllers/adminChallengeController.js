import { Challenge, ChallengeEntry, ChallengeParticipant, METRIC_DEFAULTS } from '../models/Challenge.js';
import { challengeView } from './challengeController.js';
import { audit } from '../services/auditService.js';
import { authorMap } from '../services/communityService.js';
import { badRequest, notFound } from '../utils/errors.js';

// The PawCircle team posts challenges here (weekly by convention). A form in the app calls these;
// the full admin dashboard UI arrives in Phase 6.

async function find(id) {
  const c = await Challenge.findOne({ _id: id, deletedAt: null });
  if (!c) throw notFound('Challenge not found');
  return c;
}

export async function listAll(req, res) {
  const rows = await Challenge.find({ deletedAt: null }).sort({ startsOn: -1, _id: -1 }).limit(100).lean();
  res.json({ items: rows.map((c) => challengeView(c)) });
}

export async function create(req, res) {
  const b = req.valid.body;
  const d = METRIC_DEFAULTS[b.metric];
  const c = await Challenge.create({ ...b, maxPerEntry: b.maxPerEntry ?? d.maxPerEntry, dailyCap: b.dailyCap ?? d.dailyCap, createdBy: req.userId });
  audit(req, 'challenge.create', 'Challenge', c._id, { published: c.published });
  res.status(201).json({ challenge: challengeView(c.toObject()) });
}

export async function update(req, res) {
  const c = await find(req.params.challengeId);
  const b = req.valid.body;
  if (b.metric && b.metric !== c.metric && (await ChallengeEntry.exists({ challengeId: c._id, deletedAt: null }))) {
    throw badRequest('The metric can’t change once people have logged entries');
  }
  c.set(b);
  if (c.endsOn < c.startsOn) throw badRequest('End date is before the start date');
  if (b.metric && b.maxPerEntry === undefined) c.maxPerEntry = METRIC_DEFAULTS[c.metric].maxPerEntry;
  if (b.metric && b.dailyCap === undefined) c.dailyCap = METRIC_DEFAULTS[c.metric].dailyCap;
  await c.save();
  audit(req, 'challenge.update', 'Challenge', c._id, b);
  res.json({ challenge: challengeView(c.toObject()) });
}

export async function remove(req, res) {
  const c = await find(req.params.challengeId);
  c.deletedAt = new Date();
  c.published = false;
  await c.save();
  audit(req, 'challenge.delete', 'Challenge', c._id);
  res.status(204).end();
}

/** Removes a suspicious entry (e.g. an implausible distance) from the leaderboard. */
export async function removeEntry(req, res) {
  const e = await ChallengeEntry.findOneAndUpdate({ _id: req.params.entryId, deletedAt: null }, { $set: { deletedAt: new Date() }, $unset: { dayKey: '' } });
  if (!e) throw notFound('Entry not found');
  audit(req, 'challenge.entry_remove', 'ChallengeEntry', e._id, { challengeId: String(e.challengeId), userId: String(e.userId) });
  res.status(204).end();
}

/** Entries for a challenge (newest first) so an admin can review and remove cheats. */
export async function listEntries(req, res) {
  const c = await find(req.params.challengeId);
  const rows = await ChallengeEntry.find({ challengeId: c._id, deletedAt: null }).sort({ value: -1 }).limit(100).lean();
  const participants = await ChallengeParticipant.countDocuments({ challengeId: c._id });
  const names = await authorMap(rows.map((e) => e.userId));
  res.json({
    participants,
    items: rows.map((e) => ({ id: String(e._id), userId: String(e.userId), displayName: names.get(String(e.userId))?.displayName || '', value: e.value, loggedOn: e.loggedOn, species: e.species, note: e.note })),
  });
}
