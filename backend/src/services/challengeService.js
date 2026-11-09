import { DateTime } from 'luxon';
import { ChallengeEntry } from '../models/Challenge.js';
import { CommunityMember } from '../models/Community.js';
import { User } from '../models/User.js';
import { badRequest, forbidden } from '../utils/errors.js';

// Challenge days are calendar days in Japan, matching how events and reminders are scheduled.
export const APP_TZ = 'Asia/Tokyo';
export const todayInApp = () => DateTime.now().setZone(APP_TZ).toISODate();
export const addDays = (isoDate, n) => DateTime.fromISO(isoDate, { zone: APP_TZ }).plus({ days: n }).toISODate();

export const statusOf = (c, today = todayInApp()) => (today < c.startsOn ? 'upcoming' : today > c.endsOn ? 'ended' : 'active');

/** Mongo filter for a status, using ISO date strings (which sort lexicographically). */
export function statusFilter(status, today = todayInApp()) {
  if (status === 'active') return { startsOn: { $lte: today }, endsOn: { $gte: today } };
  if (status === 'upcoming') return { startsOn: { $gt: today } };
  if (status === 'ended') return { endsOn: { $lt: today } };
  return {};
}

/** userId -> total score, for one user across many challenges (used on list screens). */
export async function myScores(userId, challengeIds) {
  if (!challengeIds.length) return new Map();
  const rows = await ChallengeEntry.aggregate([
    { $match: { userId, challengeId: { $in: challengeIds }, deletedAt: null } },
    { $group: { _id: '$challengeId', score: { $sum: '$value' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), Math.round(r.score * 10) / 10]));
}

const round = (n) => Math.round(n * 10) / 10;

/**
 * Leaderboard for one challenge.
 *  scope: global (everyone) | local (same prefecture) | community (members of one community)
 *  species: optionally rank only entries logged with dogs, or only with cats
 * Ties share a rank (1, 2, 2, 4); the member who reached the score first is listed first.
 */
export async function leaderboard(challenge, user, { scope = 'global', species, communityId, prefecture, limit = 50 }) {
  const match = { challengeId: challenge._id, deletedAt: null };
  if (species) match.species = species;

  if (scope === 'community') {
    if (!communityId) throw badRequest('communityId is required for a community leaderboard');
    if (!(await CommunityMember.exists({ communityId, userId: user._id }))) throw forbidden('Join this community to see its leaderboard');
    match.userId = { $in: await CommunityMember.distinct('userId', { communityId }) };
  }
  let prefName = null;
  if (scope === 'local') {
    prefName = prefecture || user.profile?.prefecture;
    if (!prefName) throw badRequest('Choose your area to see the local leaderboard');
    match.userId = { $in: await User.distinct('_id', { 'profile.prefecture': prefName, status: 'active', deletedAt: null }) };
  }

  const grouped = [
    { $match: match },
    { $group: { _id: '$userId', score: { $sum: '$value' }, first: { $min: '$createdAt' } } },
  ];
  const rows = await ChallengeEntry.aggregate([
    ...grouped,
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
    { $unwind: '$u' },
    { $match: { 'u.status': 'active', 'u.deletedAt': null } }, // suspended / deleted people don't rank
    { $sort: { score: -1, first: 1 } },
    { $limit: limit },
    { $project: { score: 1, name: '$u.profile.displayName' } },
  ]);

  let rank = 0;
  let prev = null;
  const items = rows.map((r, i) => {
    if (r.score !== prev) { rank = i + 1; prev = r.score; }
    return { rank, user: { id: String(r._id), displayName: r.name || '' }, score: round(r.score), isMe: String(r._id) === String(user._id) };
  });

  // Where the viewer stands, even when they're below the visible top.
  let me = items.find((i) => i.isMe) ?? null;
  if (!me) {
    const mine = await ChallengeEntry.aggregate([{ $match: { ...match, userId: user._id } }, { $group: { _id: null, score: { $sum: '$value' } } }]);
    if (mine.length && (match.userId?.$in ? match.userId.$in.some((id) => String(id) === String(user._id)) : true)) {
      const ahead = await ChallengeEntry.aggregate([...grouped, { $match: { score: { $gt: mine[0].score } } }, { $count: 'n' }]);
      me = { rank: (ahead[0]?.n ?? 0) + 1, user: { id: String(user._id), displayName: user.profile?.displayName || '' }, score: round(mine[0].score), isMe: true };
    }
  }
  return { items, me, scope, species: species ?? null, prefecture: prefName };
}
