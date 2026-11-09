import { DateTime } from 'luxon';
import { Pet } from '../models/Pet.js';
import { Reminder } from '../models/Reminder.js';
import { Appointment } from '../models/Appointment.js';
import { Vaccination } from '../models/Vaccination.js';
import { Notification } from '../models/Notification.js';
import { petView, reminderView, appointmentView, vaccinationView } from '../views/index.js';
import { latestWeights } from '../services/petService.js';
import { entitlementsFor } from '../services/entitlementService.js';
import { Event, EventParticipant } from '../models/Event.js';
import { presentEvents } from './eventController.js';

/**
 * One round-trip for the Home dashboard. Only data that exists is returned — fitness, challenges,
 * events and community arrive with their phases and are deliberately absent (no fabricated data).
 */
export async function getHome(req, res) {
  const tz = req.user.timezone;
  const now = new Date();
  const endToday = DateTime.fromJSDate(now, { zone: tz }).endOf('day').toJSDate();
  const today = DateTime.fromJSDate(now, { zone: tz }).toISODate();
  const in30 = DateTime.fromJSDate(now, { zone: tz }).plus({ days: 30 }).toISODate();

  const pets = await Pet.find({ ownerId: req.userId, deletedAt: null }).sort({ createdAt: 1 }).lean();
  const petIds = pets.map((p) => p._id);
  const [weights, reminders, nextAppointment, vaccinationsDue, unread, entitlements] = await Promise.all([
    latestWeights(petIds),
    Reminder.find({
      ownerId: req.userId, status: 'active',
      $or: [{ pendingDueAt: { $ne: null } }, { nextDueAt: { $lte: endToday } }],
    }).sort({ nextDueAt: 1 }).limit(20).lean(),
    Appointment.findOne({ ownerId: req.userId, deletedAt: null, status: 'scheduled', scheduledAt: { $gte: now } }).sort({ scheduledAt: 1 }).lean(),
    Vaccination.find({ ownerId: req.userId, deletedAt: null, nextDueOn: { $ne: null, $lte: in30 } }).sort({ nextDueOn: 1 }).limit(5).lean(),
    Notification.countDocuments({ userId: req.userId, readAt: null }),
    entitlementsFor(req.user),
  ]);

  // The next event I'm hosting or going to (real RSVPs only).
  // Events are a paid feature, so only look them up for members.
  const going = entitlements.features.community ? await EventParticipant.find({ userId: req.userId, status: 'going' }).select('eventId').lean() : [];
  const nextEventDoc = going.length && await Event.findOne({
    _id: { $in: going.map((g) => g.eventId) }, status: 'scheduled', hidden: false, deletedAt: null, startsAt: { $gte: now },
  }).sort({ startsAt: 1 }).lean();
  const [nextEvent] = nextEventDoc ? await presentEvents([nextEventDoc], req) : [null];

  reminders.sort((a, b) => (a.pendingDueAt ?? a.nextDueAt) - (b.pendingDueAt ?? b.nextDueAt));
  res.json({
    greetingName: req.user.profile?.displayName || '',
    today,
    pets: pets.map((p) => petView(p, { timezone: tz, latestWeight: weights.get(String(p._id)) })),
    reminders: reminders.map(reminderView),
    nextEvent: nextEvent ?? null,
    nextAppointment: nextAppointment ? appointmentView(nextAppointment) : null,
    vaccinationsDue: vaccinationsDue.map(vaccinationView),
    unreadNotifications: unread,
    entitlements,
  });
}
