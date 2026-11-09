import { DateTime } from 'luxon';
import { Reminder } from '../models/Reminder.js';
import { Pet } from '../models/Pet.js';
import { reminderView } from '../views/index.js';
import { manualReminderDoc, completeReminder } from '../services/reminderService.js';
import { firstOccurrence } from '../utils/recurrence.js';
import { notFound, badRequest } from '../utils/errors.js';

async function findOwned(req) {
  const r = await Reminder.findOne({ _id: req.params.reminderId, ownerId: req.userId, status: 'active' });
  if (!r) throw notFound('Reminder not found');
  return r;
}

export async function listReminders(req, res) {
  const { petId, scope, days, limit } = req.valid.query;
  const now = new Date();
  const tz = req.user.timezone;
  const endToday = DateTime.fromJSDate(now, { zone: tz }).endOf('day').toJSDate();
  const horizon = new Date(now.getTime() + days * 86_400_000);

  const filter = { ownerId: req.userId, status: 'active' };
  if (petId) filter.petId = petId;
  if (scope === 'pending') filter.pendingDueAt = { $ne: null };
  else if (scope === 'today') filter.$or = [{ pendingDueAt: { $ne: null } }, { nextDueAt: { $lte: endToday } }];
  else if (scope === 'upcoming') filter.$or = [{ pendingDueAt: { $ne: null } }, { nextDueAt: { $lte: horizon } }];

  const items = await Reminder.find(filter).sort({ pendingDueAt: 1, nextDueAt: 1 }).limit(limit).lean();
  items.sort((a, b) => (a.pendingDueAt ?? a.nextDueAt) - (b.pendingDueAt ?? b.nextDueAt));
  res.json({ items: items.map(reminderView) });
}

export async function createReminder(req, res) {
  const input = req.valid.body;
  if (input.petId) {
    const pet = await Pet.exists({ _id: input.petId, ownerId: req.userId, deletedAt: null });
    if (!pet) throw notFound('Pet not found');
  }
  const reminder = await Reminder.create(manualReminderDoc(input, req.user));
  res.status(201).json({ reminder: reminderView(reminder) });
}

export async function updateReminder(req, res) {
  const r = await findOwned(req);
  if (r.sourceType !== 'manual') {
    throw badRequest('This reminder is managed by its health record. Edit the record instead.');
  }
  const { date, localTime, endDate, ...rest } = req.valid.body;
  const merged = {
    date: date ?? DateTime.fromJSDate(r.nextDueAt, { zone: r.timezone }).toISODate(),
    localTime: localTime ?? r.localTime,
    recurrence: rest.recurrence ?? r.recurrence,
    daysOfWeek: rest.daysOfWeek ?? r.daysOfWeek,
  };
  r.set(rest);
  r.localTime = merged.localTime;
  if (endDate !== undefined) {
    r.endsAt = endDate ? DateTime.fromISO(endDate, { zone: r.timezone }).endOf('day').toUTC().toJSDate() : null;
  }
  if (date || localTime || rest.recurrence || rest.daysOfWeek) {
    r.nextDueAt = firstOccurrence(
      { startDate: merged.date, localTime: merged.localTime, timezone: r.timezone, recurrence: merged.recurrence, daysOfWeek: merged.daysOfWeek },
      new Date(),
    );
    r.pendingDueAt = null;
    r.lastNotifiedAt = null;
  }
  r.isFinal = r.recurrence === 'none';
  await r.save();
  res.json({ reminder: reminderView(r) });
}

export async function complete(req, res) {
  const r = await findOwned(req);
  await completeReminder(r, req.valid.body.action);
  res.json({ reminder: reminderView(r) });
}

export async function cancelReminder(req, res) {
  const r = await findOwned(req);
  r.status = 'cancelled';
  await r.save();
  res.status(204).end();
}
