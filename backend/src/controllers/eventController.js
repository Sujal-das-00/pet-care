import { Event, EventParticipant, EventIdea } from '../models/Event.js';
import { Community, CommunityMember } from '../models/Community.js';
import { Pet } from '../models/Pet.js';
import { Reminder } from '../models/Reminder.js';
import { eventView, ideaView } from '../views/index.js';
import { authorMap, blockedIds, notifyUsers, petMap, loadCommunity } from '../services/communityService.js';
import { audit } from '../services/auditService.js';
import { tr } from '../utils/i18n.js';
import { HttpError, badRequest, forbidden, notFound } from '../utils/errors.js';

const MAX_UPCOMING_HOSTED = 10;
const MIN = 60_000;
const LIVE = { deletedAt: null, hidden: false };

/* ---------- helpers ---------- */

/** Reminder 2 h before; for late sign-ups 15 min before; none if that has passed. */
function reminderTime(event, now = new Date()) {
  const start = event.startsAt.getTime();
  for (const lead of [120 * MIN, 15 * MIN]) if (start - lead > now.getTime()) return new Date(start - lead);
  return null;
}

async function addReminder(event, user) {
  const when = reminderTime(event);
  if (!when) return;
  const text = tr(user.locale, 'event', { title: event.title, place: event.place.name });
  await Reminder.deleteMany({ ownerId: user._id, sourceType: 'event', sourceId: event._id });
  await Reminder.create({
    ownerId: user._id, kind: 'event', ...text, sourceType: 'event', sourceId: event._id,
    timezone: user.timezone, nextDueAt: when, recurrence: 'none', isFinal: true,
  });
}

const dropReminders = (eventId, ownerId) =>
  Reminder.deleteMany({ sourceType: 'event', sourceId: eventId, ...(ownerId ? { ownerId } : {}) });

async function loadEvent(id, { includeHidden = false } = {}) {
  const e = await Event.findOne({ _id: id, deletedAt: null, ...(includeHidden ? {} : { hidden: false }) });
  if (!e) throw notFound('Event not found');
  return e;
}

export async function presentEvents(events, req) {
  if (!events.length) return [];
  const [hosts, communities, mine] = await Promise.all([
    authorMap(events.map((e) => e.hostId)),
    Community.find({ _id: { $in: events.map((e) => e.communityId).filter(Boolean) } }).select('name emoji').lean(),
    EventParticipant.find({ userId: req.userId, status: 'going', eventId: { $in: events.map((e) => e._id) } }).select('eventId').lean(),
  ]);
  const comm = new Map(communities.map((c) => [String(c._id), c]));
  const going = new Set(mine.map((m) => String(m.eventId)));
  return events.map((e) =>
    eventView(e, {
      host: hosts.get(String(e.hostId)),
      community: e.communityId ? comm.get(String(e.communityId)) : null,
      myStatus: going.has(String(e._id)) ? 'going' : null,
      isHost: String(e.hostId) === String(req.userId),
    }),
  );
}

/* ---------- ideas ---------- */

export async function listIdeas(req, res) {
  const ideas = await EventIdea.find({ published: true }).sort({ order: 1, _id: 1 }).lean();
  res.json({ items: ideas.map((i) => ideaView(i)) });
}

export async function getIdea(req, res) {
  const idea = await EventIdea.findOne({ _id: req.params.ideaId, published: true }).lean();
  if (!idea) throw notFound('Idea not found');
  res.json({ idea: ideaView(idea) });
}

/* ---------- events ---------- */

export async function listEvents(req, res) {
  const { scope, prefecture, communityId, category, petType, limit, offset } = req.valid.query;
  const now = new Date();
  const blocked = await blockedIds(req.userId);
  const filter = { ...LIVE, status: 'scheduled', startsAt: { $gte: new Date(now.getTime() - 3 * 3600_000) }, hostId: { $nin: blocked } };
  if (category) filter.category = category;
  if (petType) filter.petTypes = petType;

  if (scope === 'nearby') {
    const pref = prefecture || req.user.profile?.prefecture;
    if (!pref) return res.json({ items: [], hasMore: false, needsLocation: true });
    filter['place.prefecture'] = pref;
  } else if (prefecture) filter['place.prefecture'] = prefecture;

  if (scope === 'community') {
    if (!communityId) throw badRequest('communityId is required');
    filter.communityId = communityId;
  }
  if (scope === 'mine') {
    const going = await EventParticipant.find({ userId: req.userId, status: 'going' }).select('eventId').lean();
    filter.$or = [{ hostId: req.userId }, { _id: { $in: going.map((g) => g.eventId) } }];
    delete filter.hostId; // my own events are never filtered by blocks
  }

  const rows = await Event.find(filter).sort({ featured: -1, startsAt: 1, _id: 1 }).skip(offset).limit(limit + 1).lean();
  const items = rows.slice(0, limit);
  res.json({ items: await presentEvents(items, req), hasMore: rows.length > limit });
}

export async function createEvent(req, res) {
  const body = req.valid.body;
  const now = new Date();
  if (body.communityId) {
    await loadCommunity(body.communityId);
    if (!(await CommunityMember.exists({ communityId: body.communityId, userId: req.userId }))) throw forbidden('Join the community to host an event in it');
  }
  let ideaCategory;
  if (body.ideaId) {
    const idea = await EventIdea.findById(body.ideaId).lean();
    if (!idea) throw notFound('Idea not found');
    ideaCategory = idea.category;
  }
  if ((await Event.countDocuments({ hostId: req.userId, status: 'scheduled', deletedAt: null, startsAt: { $gt: now } })) >= MAX_UPCOMING_HOSTED) {
    throw badRequest(`You can host up to ${MAX_UPCOMING_HOSTED} upcoming events at once`);
  }
  const event = await Event.create({
    ...body, category: ideaCategory && body.category === 'other' ? ideaCategory : body.category,
    hostId: req.userId, timezone: req.user.timezone, goingCount: 1,
  });
  await EventParticipant.create({ eventId: event._id, userId: req.userId, status: 'going' }); // host attends
  await addReminder(event, req.user);
  audit(req, 'event.create', 'Event', event._id);
  res.status(201).json({ event: (await presentEvents([event.toObject()], req))[0] });
}

export async function getEvent(req, res) {
  const event = await loadEvent(req.params.eventId, { includeHidden: req.user.role === 'admin' });
  const [view] = await presentEvents([event.toObject()], req);
  const blocked = (await blockedIds(req.userId)).map(String);
  const rows = await EventParticipant.find({ eventId: event._id, status: 'going' }).sort({ createdAt: 1 }).limit(60).lean();
  const people = rows.filter((p) => !blocked.includes(String(p.userId))).slice(0, 12);
  const authors = await authorMap(people.map((p) => p.userId));
  res.json({ event: { ...view, participantsPreview: people.map((p) => authors.get(String(p.userId))).filter(Boolean) } });
}

export async function listParticipants(req, res) {
  const event = await loadEvent(req.params.eventId);
  const blocked = (await blockedIds(req.userId)).map(String);
  const rows = (await EventParticipant.find({ eventId: event._id, status: 'going' }).sort({ createdAt: 1 }).limit(200).lean())
    .filter((p) => !blocked.includes(String(p.userId)));
  const [authors, pets] = await Promise.all([authorMap(rows.map((p) => p.userId)), petMap(rows.flatMap((p) => p.petIds))]);
  res.json({
    items: rows.map((p) => ({
      user: authors.get(String(p.userId)),
      pets: p.petIds.map((id) => pets.get(String(id))).filter(Boolean), // name + species only
      isHost: String(p.userId) === String(event.hostId),
    })),
  });
}

const requireHost = (req, event) => {
  if (String(event.hostId) !== String(req.userId) && req.user.role !== 'admin') throw forbidden('Only the host can do that');
};

export async function updateEvent(req, res) {
  const event = await loadEvent(req.params.eventId);
  requireHost(req, event);
  if (event.status !== 'scheduled') throw badRequest('This event can no longer be edited');
  const b = req.valid.body;
  if (b.maxParticipants != null && b.maxParticipants < event.goingCount) throw badRequest('Capacity cannot be lower than the people already going');
  const timeChanged = b.startsAt || b.endsAt;
  const startsAt = b.startsAt ?? event.startsAt;
  const endsAt = b.endsAt ?? event.endsAt;
  if (timeChanged) {
    if (endsAt <= startsAt) throw badRequest('End time must be after the start');
    if (endsAt - startsAt > 12 * 3600_000) throw badRequest('Events can last at most 12 hours');
    if (startsAt.getTime() < Date.now() + 5 * MIN) throw badRequest('Start time must be in the future');
  }
  event.set(b);
  await event.save();

  if (timeChanged || b.place) {
    const going = await EventParticipant.find({ eventId: event._id, status: 'going', userId: { $ne: event.hostId } }).select('userId').lean();
    if (timeChanged) {
      const when = reminderTime(event);
      if (when) await Reminder.updateMany({ sourceType: 'event', sourceId: event._id }, { $set: { nextDueAt: when, pendingDueAt: null } });
      else await dropReminders(event._id);
    }
    notifyUsers(going.map((g) => g.userId), { build: (l) => tr(l, 'eventUpdated', { title: event.title }), data: { type: 'event', eventId: String(event._id) } });
  }
  res.json({ event: (await presentEvents([event.toObject()], req))[0] });
}

export async function cancelEvent(req, res) {
  const event = await loadEvent(req.params.eventId, { includeHidden: true });
  requireHost(req, event);
  if (event.status !== 'scheduled') throw badRequest('Event is already closed');
  event.status = 'cancelled';
  event.cancelReason = req.valid.body.reason;
  await event.save();
  await dropReminders(event._id);
  const going = await EventParticipant.find({ eventId: event._id, status: 'going', userId: { $ne: event.hostId } }).select('userId').lean();
  notifyUsers(going.map((g) => g.userId), { build: (l) => tr(l, 'eventCancelled', { title: event.title }), data: { type: 'event', eventId: String(event._id) } });
  audit(req, 'event.cancel', 'Event', event._id);
  res.json({ event: (await presentEvents([event.toObject()], req))[0] });
}

/** Host reports the event happened (Journey 5, "report event completion"). */
export async function completeEvent(req, res) {
  const event = await loadEvent(req.params.eventId);
  requireHost(req, event);
  if (event.status !== 'scheduled') throw badRequest('Event is already closed');
  if (event.startsAt > new Date()) throw badRequest('You can report completion once the event has started');
  event.status = 'completed';
  event.completion = { ...req.valid.body, reportedAt: new Date() };
  await event.save();
  res.json({ event: (await presentEvents([event.toObject()], req))[0] });
}

export async function rsvp(req, res) {
  const event = await loadEvent(req.params.eventId);
  const now = new Date();
  const { petIds } = req.valid.body;

  if (petIds.length) {
    const pets = await Pet.find({ _id: { $in: petIds }, ownerId: req.userId, deletedAt: null }).select('species').lean();
    if (pets.length !== new Set(petIds).size) throw notFound('Pet not found');
    if (pets.some((p) => !event.petTypes.includes(p.species))) throw badRequest('This event is not open to that kind of pet');
  }

  const existing = await EventParticipant.findOne({ eventId: event._id, userId: req.userId });
  if (existing?.status === 'going') {
    existing.petIds = petIds;
    await existing.save();
    return res.json({ event: (await presentEvents([event.toObject()], req))[0] });
  }

  // Claim a seat atomically so concurrent sign-ups can never exceed capacity.
  const claimed = await Event.findOneAndUpdate(
    {
      _id: event._id, status: 'scheduled', ...LIVE, startsAt: { $gt: now },
      $or: [{ maxParticipants: null }, { $expr: { $lt: ['$goingCount', '$maxParticipants'] } }],
    },
    { $inc: { goingCount: 1 } },
    { returnDocument: 'after' },
  );
  if (!claimed) {
    const fresh = await Event.findById(event._id).lean();
    if (fresh.status !== 'scheduled' || fresh.startsAt <= now) throw badRequest('Sign-ups for this event are closed');
    throw new HttpError(409, 'event_full', 'This event is full');
  }
  try {
    if (existing) { existing.status = 'going'; existing.petIds = petIds; await existing.save(); }
    else await EventParticipant.create({ eventId: event._id, userId: req.userId, petIds, status: 'going' });
  } catch (e) {
    await Event.updateOne({ _id: event._id }, { $inc: { goingCount: -1 } }); // lost a race with ourselves; give the seat back
    if (e.code !== 11000) throw e;
  }
  await addReminder(claimed, req.user);
  res.json({ event: (await presentEvents([claimed.toObject()], req))[0] });
}

export async function cancelRsvp(req, res) {
  const event = await loadEvent(req.params.eventId);
  if (String(event.hostId) === String(req.userId)) throw badRequest('Hosts cancel the event instead of leaving it');
  const p = await EventParticipant.findOneAndUpdate({ eventId: event._id, userId: req.userId, status: 'going' }, { $set: { status: 'cancelled' } });
  if (p) {
    await Event.updateOne({ _id: event._id, goingCount: { $gt: 0 } }, { $inc: { goingCount: -1 } });
    await dropReminders(event._id, req.userId);
  }
  const fresh = await Event.findById(event._id);
  res.json({ event: (await presentEvents([fresh.toObject()], req))[0] });
}
