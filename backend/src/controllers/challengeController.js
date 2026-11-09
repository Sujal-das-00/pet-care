import { Challenge, ChallengeEntry, ChallengeParticipant, METRIC_DEFAULTS } from '../models/Challenge.js';
import { Pet } from '../models/Pet.js';
import { addDays, leaderboard, myScores, statusFilter, statusOf, todayInApp } from '../services/challengeService.js';
import { HttpError, badRequest, notFound } from '../utils/errors.js';

const MAX_ENTRIES_PER_HOUR = 20;
const BACKDATE_DAYS = 7; // you can log a missed day, but not rewrite history
const round1 = (n) => Math.round(n * 10) / 10;

export const challengeView = (c, extra = {}) => ({
  id: String(c._id),
  title: c.title,
  description: c.description,
  instructions: c.instructions,
  emoji: c.emoji,
  tint: c.tint,
  metric: c.metric,
  goal: c.goal,
  startsOn: c.startsOn,
  endsOn: c.endsOn,
  status: statusOf(c),
  species: c.species,
  maxPerEntry: c.maxPerEntry,
  dailyCap: c.dailyCap,
  participantCount: c.participantCount,
  published: c.published,
  joined: false,
  myScore: 0,
  ...extra,
});

async function loadPublished(id) {
  const c = await Challenge.findOne({ _id: id, published: true, deletedAt: null });
  if (!c) throw notFound('Challenge not found');
  return c;
}

export async function listChallenges(req, res) {
  const { status, limit } = req.valid.query;
  const sort = status === 'ended' ? { endsOn: -1 } : status === 'upcoming' ? { startsOn: 1 } : { endsOn: 1, startsOn: 1 };
  const rows = await Challenge.find({ published: true, deletedAt: null, ...statusFilter(status) }).sort(sort).limit(limit).lean();
  const ids = rows.map((c) => c._id);
  const [joined, scores] = await Promise.all([
    ChallengeParticipant.find({ userId: req.userId, challengeId: { $in: ids } }).select('challengeId').lean(),
    myScores(req.userId, ids),
  ]);
  const joinedSet = new Set(joined.map((j) => String(j.challengeId)));
  res.json({ items: rows.map((c) => challengeView(c, { joined: joinedSet.has(String(c._id)), myScore: scores.get(String(c._id)) ?? 0 })) });
}

export async function getChallenge(req, res) {
  const c = await loadPublished(req.params.challengeId);
  const [joined, scores] = await Promise.all([
    ChallengeParticipant.exists({ challengeId: c._id, userId: req.userId }),
    myScores(req.userId, [c._id]),
  ]);
  res.json({ challenge: challengeView(c.toObject(), { joined: Boolean(joined), myScore: scores.get(String(c._id)) ?? 0 }) });
}

export async function joinChallenge(req, res) {
  const c = await loadPublished(req.params.challengeId);
  if (statusOf(c) === 'ended') throw badRequest('This challenge has ended');
  if (c.species.length < 2 && !(await Pet.exists({ ownerId: req.userId, deletedAt: null, species: { $in: c.species } }))) {
    throw new HttpError(400, 'no_eligible_pet', `This challenge is for ${c.species[0]}s. Add one to join.`);
  }
  try {
    await ChallengeParticipant.create({ challengeId: c._id, userId: req.userId });
    await Challenge.updateOne({ _id: c._id }, { $inc: { participantCount: 1 } });
  } catch (e) {
    if (e.code !== 11000) throw e; // already joined
  }
  const fresh = await Challenge.findById(c._id).lean();
  res.json({ challenge: challengeView(fresh, { joined: true, myScore: (await myScores(req.userId, [c._id])).get(String(c._id)) ?? 0 }) });
}

/**
 * Logs an activity toward a challenge. Self-reported until GPS walk tracking exists, so it is
 * bounded: per-entry and per-day caps, a short back-dating window, and a rate limit.
 */
export async function addEntry(req, res) {
  const c = await loadPublished(req.params.challengeId);
  const today = todayInApp();
  if (statusOf(c, today) !== 'active') throw badRequest(statusOf(c, today) === 'ended' ? 'This challenge has ended' : 'This challenge has not started yet');
  if (!(await ChallengeParticipant.exists({ challengeId: c._id, userId: req.userId }))) throw new HttpError(403, 'not_joined', 'Join the challenge first');

  const { petId, note } = req.valid.body;
  const loggedOn = req.valid.body.loggedOn ?? today;
  if (loggedOn > today) throw badRequest('You can’t log a future day');
  if (loggedOn < addDays(today, -BACKDATE_DAYS)) throw badRequest(`You can only log the last ${BACKDATE_DAYS} days`);
  if (loggedOn < c.startsOn || loggedOn > c.endsOn) throw badRequest('That day is outside the challenge');

  let species = null;
  if (petId) {
    const pet = await Pet.findOne({ _id: petId, ownerId: req.userId, deletedAt: null }).select('species').lean();
    if (!pet) throw notFound('Pet not found');
    if (!c.species.includes(pet.species)) throw badRequest(`This challenge is for ${c.species.join(' and ')}s`);
    species = pet.species;
  } else if (c.species.length < 2) {
    throw badRequest('Choose which pet this is for');
  }

  // Entry value by metric.
  let value;
  if (c.metric === 'active_days' || c.metric === 'check_ins') value = 1;
  else {
    value = round1(req.valid.body.value ?? NaN);
    if (!Number.isFinite(value) || value < 0.1) throw badRequest('Enter how much you did');
    if (value > c.maxPerEntry) throw new HttpError(400, 'entry_too_large', `A single entry can be at most ${c.maxPerEntry}`);
  }

  if ((await ChallengeEntry.countDocuments({ userId: req.userId, createdAt: { $gte: new Date(Date.now() - 3600_000) } })) >= MAX_ENTRIES_PER_HOUR) {
    throw new HttpError(429, 'slow_down', 'You’re logging very quickly. Please wait a moment.');
  }
  // One check-in per day for active-days challenges: say so plainly rather than hitting the daily cap.
  if (c.metric === 'active_days' && (await ChallengeEntry.exists({ challengeId: c._id, userId: req.userId, loggedOn, deletedAt: null }))) {
    throw new HttpError(409, 'already_logged', 'You already checked in for that day');
  }
  const day = await ChallengeEntry.aggregate([
    { $match: { challengeId: c._id, userId: req.userId, loggedOn, deletedAt: null } },
    { $group: { _id: null, total: { $sum: '$value' } } },
  ]);
  if ((day[0]?.total ?? 0) + value > c.dailyCap + 1e-9) {
    throw new HttpError(400, 'daily_cap', `The daily limit for this challenge is ${c.dailyCap}. Rest up!`);
  }

  try {
    const entry = await ChallengeEntry.create({
      challengeId: c._id, userId: req.userId, petId, species, value, loggedOn, note,
      dayKey: c.metric === 'active_days' ? `${c._id}:${req.userId}:${loggedOn}` : undefined,
    });
    const score = (await myScores(req.userId, [c._id])).get(String(c._id)) ?? 0;
    res.status(201).json({ entry: entryView(entry), myScore: score });
  } catch (e) {
    if (e.code === 11000) throw new HttpError(409, 'already_logged', 'You already checked in for that day');
    throw e;
  }
}

const entryView = (e) => ({ id: String(e._id), challengeId: String(e.challengeId), value: e.value, loggedOn: e.loggedOn, species: e.species, petId: e.petId ? String(e.petId) : null, note: e.note, createdAt: e.createdAt });

export async function listMyEntries(req, res) {
  const c = await loadPublished(req.params.challengeId);
  const rows = await ChallengeEntry.find({ challengeId: c._id, userId: req.userId, deletedAt: null }).sort({ loggedOn: -1, createdAt: -1 }).limit(100).lean();
  res.json({ items: rows.map(entryView) });
}

export async function deleteMyEntry(req, res) {
  const c = await loadPublished(req.params.challengeId);
  if (statusOf(c) === 'ended') throw badRequest('Results are final once a challenge has ended');
  const r = await ChallengeEntry.updateOne({ _id: req.params.entryId, challengeId: c._id, userId: req.userId, deletedAt: null }, { $set: { deletedAt: new Date() }, $unset: { dayKey: '' } });
  if (!r.modifiedCount) throw notFound('Entry not found');
  res.status(204).end();
}

export async function getLeaderboard(req, res) {
  const c = await loadPublished(req.params.challengeId);
  const board = await leaderboard(c, req.user, req.valid.query);
  res.json({ challenge: { id: String(c._id), title: c.title, metric: c.metric, status: statusOf(c), endsOn: c.endsOn }, ...board });
}

export { METRIC_DEFAULTS };
