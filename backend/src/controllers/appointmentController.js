import { Appointment } from '../models/Appointment.js';
import { appointmentView } from '../views/index.js';
import { appointmentReminderDocs, replaceSourceReminders, cancelSourceReminders } from '../services/reminderService.js';
import { notFound } from '../utils/errors.js';

async function findAppt(req) {
  const a = await Appointment.findOne({ _id: req.params.appointmentId, petId: req.pet._id, deletedAt: null });
  if (!a) throw notFound('Appointment not found');
  return a;
}

export async function listAppointments(req, res) {
  const filter = { petId: req.pet._id, deletedAt: null };
  const s = String(req.query.status || '');
  if (['scheduled', 'completed', 'cancelled'].includes(s)) filter.status = s;
  const items = await Appointment.find(filter).sort({ scheduledAt: -1 }).limit(200);
  res.json({ items: items.map(appointmentView) });
}

export async function createAppointment(req, res) {
  const appt = await Appointment.create({ ...req.valid.body, petId: req.pet._id, ownerId: req.userId });
  await replaceSourceReminders('appointment', appt._id, appointmentReminderDocs(appt, req.pet, req.user));
  res.status(201).json({ appointment: appointmentView(appt) });
}

export async function updateAppointment(req, res) {
  const appt = await findAppt(req);
  appt.set(req.valid.body);
  await appt.save();
  await replaceSourceReminders('appointment', appt._id, appointmentReminderDocs(appt, req.pet, req.user));
  res.json({ appointment: appointmentView(appt) });
}

export async function deleteAppointment(req, res) {
  const appt = await findAppt(req);
  appt.deletedAt = new Date();
  await appt.save();
  await cancelSourceReminders('appointment', appt._id);
  res.status(204).end();
}
