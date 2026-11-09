import { DateTime } from 'luxon';
import { Reminder } from '../models/Reminder.js';
import { Notification } from '../models/Notification.js';
import { MedicationDose, Medication } from '../models/Medication.js';
import { User } from '../models/User.js';
import { firstOccurrence, localToUtc, nextOccurrence } from '../utils/recurrence.js';
import { tr } from '../utils/i18n.js';
import { sendToUser } from './pushService.js';

const todayIn = (tz, now = new Date()) => DateTime.fromJSDate(now, { zone: tz }).toISODate();
const endOfLocalDay = (dateISO, tz) => DateTime.fromISO(dateISO, { zone: tz }).endOf('day').toUTC().toJSDate();

/* ---------- reminder document builders (pure; return plain objects) ---------- */

export function medicationReminderDocs(med, pet, user, now = new Date()) {
  const tz = user.timezone;
  const startDate = med.startDate > todayIn(tz, now) ? med.startDate : todayIn(tz, now);
  const endsAt = med.endDate ? endOfLocalDay(med.endDate, tz) : null;
  const text = tr(user.locale, 'medication', { pet: pet.name, name: med.name });
  const docs = [];
  for (const s of med.schedules) {
    const recurrence = s.daysOfWeek?.length ? 'weekly' : 'daily';
    const rule = { startDate, localTime: s.localTime, timezone: tz, recurrence, daysOfWeek: s.daysOfWeek || [] };
    const nextDueAt = firstOccurrence(rule, now);
    if (endsAt && nextDueAt > endsAt) continue;
    docs.push({
      ownerId: med.ownerId, petId: pet._id, kind: 'medication', ...text,
      sourceType: 'medication', sourceId: med._id,
      timezone: tz, localTime: s.localTime, nextDueAt, recurrence, daysOfWeek: s.daysOfWeek || [], endsAt,
      isFinal: false,
    });
  }
  return docs;
}

export function vaccinationReminderDocs(vax, pet, user, now = new Date()) {
  if (!vax.nextDueOn) return [];
  const tz = user.timezone;
  const due = localToUtc(vax.nextDueOn, '09:00', tz);
  const early = DateTime.fromJSDate(due).minus({ days: 7 }).toJSDate(); // heads-up a week before
  const when = early > now ? early : due;
  if (when <= now) return [];
  return [{
    ownerId: vax.ownerId, petId: pet._id, kind: 'vaccination',
    ...tr(user.locale, 'vaccination', { pet: pet.name, name: vax.name }),
    sourceType: 'vaccination', sourceId: vax._id,
    timezone: tz, localTime: null, nextDueAt: when, recurrence: 'none', isFinal: true,
  }];
}

export function appointmentReminderDocs(appt, pet, user, now = new Date()) {
  if (appt.status !== 'scheduled') return [];
  const when = new Date(appt.scheduledAt.getTime() - (appt.reminderMinutesBefore ?? 60) * 60_000);
  if (when <= now) return [];
  return [{
    ownerId: appt.ownerId, petId: pet._id, kind: 'appointment',
    ...tr(user.locale, 'appointment', { pet: pet.name, clinic: appt.clinicName }),
    sourceType: 'appointment', sourceId: appt._id,
    timezone: user.timezone, localTime: null, nextDueAt: when, recurrence: 'none', isFinal: true,
  }];
}

export function feedingReminderDocs(feed, pet, user, now = new Date()) {
  if (!feed.active) return [];
  const tz = user.timezone;
  const recurrence = feed.daysOfWeek?.length ? 'weekly' : 'daily';
  const rule = { startDate: todayIn(tz, now), localTime: feed.localTime, timezone: tz, recurrence, daysOfWeek: feed.daysOfWeek || [] };
  return [{
    ownerId: feed.ownerId, petId: pet._id, kind: 'feeding',
    ...tr(user.locale, 'feeding', { pet: pet.name, label: feed.label }),
    sourceType: 'feeding', sourceId: feed._id,
    timezone: tz, localTime: feed.localTime, nextDueAt: firstOccurrence(rule, now),
    recurrence, daysOfWeek: feed.daysOfWeek || [], isFinal: false,
  }];
}

export function manualReminderDoc(input, user, now = new Date()) {
  const tz = user.timezone;
  const rule = {
    startDate: input.date, localTime: input.localTime, timezone: tz,
    recurrence: input.recurrence, daysOfWeek: input.daysOfWeek,
  };
  return {
    ownerId: user._id, petId: input.petId, kind: input.kind, title: input.title, body: input.body,
    sourceType: 'manual', timezone: tz, localTime: input.localTime,
    nextDueAt: firstOccurrence(rule, now),
    recurrence: input.recurrence, interval: input.interval, daysOfWeek: input.daysOfWeek,
    endsAt: input.endDate ? endOfLocalDay(input.endDate, tz) : null,
    isFinal: input.recurrence === 'none',
  };
}

/* ---------- persistence helpers ---------- */

/** Replace all active reminders generated from a source record. */
export async function replaceSourceReminders(sourceType, sourceId, docs) {
  await Reminder.deleteMany({ sourceType, sourceId, status: 'active' });
  if (docs.length) await Reminder.insertMany(docs);
}

export const cancelSourceReminders = (sourceType, sourceId) =>
  Reminder.deleteMany({ sourceType, sourceId, status: 'active' });

export const cancelPetReminders = (petId) => Reminder.deleteMany({ petId });

/* ---------- user actions ---------- */

/**
 * Marks a reminder done/skipped. If a notified occurrence is pending, that one is resolved;
 * otherwise the upcoming occurrence is completed early and the reminder advances.
 */
export async function completeReminder(reminder, action = 'done', now = new Date()) {
  let due;
  if (reminder.pendingDueAt) {
    due = reminder.pendingDueAt;
    reminder.pendingDueAt = null;
    if (reminder.isFinal) reminder.status = 'completed';
  } else {
    due = reminder.nextDueAt;
    const next = nextOccurrence(reminder, now);
    if (next) reminder.nextDueAt = next;
    else reminder.status = 'completed';
  }
  reminder.lastCompletedAt = now;
  await reminder.save();

  if (reminder.sourceType === 'medication') {
    await MedicationDose.create({
      medicationId: reminder.sourceId, petId: reminder.petId, ownerId: reminder.ownerId,
      scheduledFor: due, outcome: action === 'skip' ? 'skipped' : 'given', recordedAt: now,
    });
  }
  if (reminder.status === 'completed') await maybeFinishMedication(reminder);
  return reminder;
}

async function maybeFinishMedication(reminder) {
  if (reminder.sourceType !== 'medication') return;
  const remaining = await Reminder.countDocuments({
    sourceType: 'medication', sourceId: reminder.sourceId, status: 'active',
  });
  if (!remaining) {
    await Medication.updateOne(
      { _id: reminder.sourceId, status: 'active' },
      { $set: { status: 'completed', completedAt: new Date() } },
    );
  }
}

/* ---------- background delivery (used by worker.js) ---------- */

/**
 * Finds due reminders, claims each atomically (safe with several workers), creates the in-app
 * notification, sends the push and advances the reminder. Returns the number delivered.
 */
export async function processDueReminders({ now = new Date(), maxBatch = 500 } = {}) {
  let delivered = 0;
  for (let i = 0; i < maxBatch; i += 1) {
    const claimed = await Reminder.findOneAndUpdate(
      {
        status: 'active',
        nextDueAt: { $lte: now },
        $and: [
          { $or: [{ pendingDueAt: null }, { isFinal: false }] },
          { $or: [{ claimedUntil: null }, { claimedUntil: { $lt: now } }] },
        ],
      },
      { $set: { claimedUntil: new Date(now.getTime() + 2 * 60_000) } },
      { sort: { nextDueAt: 1 }, returnDocument: 'after' },
    );
    if (!claimed) break;
    await deliver(claimed, now);
    delivered += 1;
  }
  return delivered;
}

async function deliver(reminder, now) {
  const user = await User.findOne({ _id: reminder.ownerId, deletedAt: null, status: 'active' }).lean();
  if (!user) {
    await Reminder.deleteOne({ _id: reminder._id });
    return;
  }

  const wantsPush = user.notificationPrefs?.care !== false;
  let pushStatus = 'no_device';
  if (wantsPush) {
    await Notification.create({
      userId: user._id, category: 'care', title: reminder.title, body: reminder.body,
      data: { type: 'reminder', reminderId: String(reminder._id), petId: reminder.petId ? String(reminder.petId) : null },
      reminderId: reminder._id, pushStatus: 'pending',
    });
    pushStatus = await sendToUser(user._id, {
      title: reminder.title, body: reminder.body,
      data: { type: 'reminder', reminderId: String(reminder._id), petId: reminder.petId ? String(reminder.petId) : null },
    });
    await Notification.updateOne({ reminderId: reminder._id, pushStatus: 'pending' }, { $set: { pushStatus } });
  }

  // Advance: the notified occurrence becomes pending; compute the next one.
  const set = { pendingDueAt: reminder.nextDueAt, lastNotifiedAt: now, claimedUntil: null };
  if (reminder.recurrence === 'none') set.isFinal = true;
  else {
    const next = nextOccurrence(reminder, now);
    if (next) set.nextDueAt = next;
    else set.isFinal = true;
  }
  await Reminder.updateOne({ _id: reminder._id }, { $set: set });
}
