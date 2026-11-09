import { Medication, MedicationDose } from '../models/Medication.js';
import { medicationView, doseView } from '../views/index.js';
import { medicationReminderDocs, replaceSourceReminders, cancelSourceReminders } from '../services/reminderService.js';
import { beforeCursor, paginate, parseLimit } from '../utils/pagination.js';
import { notFound } from '../utils/errors.js';

async function findMed(req) {
  const med = await Medication.findOne({ _id: req.params.medicationId, petId: req.pet._id, deletedAt: null });
  if (!med) throw notFound('Medication not found');
  return med;
}

const syncReminders = async (med, req, enabled) => {
  const docs = enabled && med.status === 'active' ? medicationReminderDocs(med, req.pet, req.user) : [];
  await replaceSourceReminders('medication', med._id, docs);
};

export async function listMedications(req, res) {
  const wanted = String(req.query.status || 'active');
  const status = wanted === 'all' ? {} : { status: ['active', 'completed', 'discontinued'].includes(wanted) ? wanted : 'active' };
  const items = await Medication.find({ petId: req.pet._id, deletedAt: null, ...status }).sort({ startDate: -1 });
  res.json({ items: items.map(medicationView) });
}

export async function createMedication(req, res) {
  const { remindersEnabled, ...data } = req.valid.body;
  const med = await Medication.create({ ...data, petId: req.pet._id, ownerId: req.userId });
  await syncReminders(med, req, remindersEnabled);
  res.status(201).json({ medication: medicationView(med) });
}

export async function updateMedication(req, res) {
  const med = await findMed(req);
  const { remindersEnabled, ...data } = req.valid.body;
  med.set(data);
  await med.save();
  if (remindersEnabled !== undefined || data.schedules || data.startDate || data.endDate !== undefined) {
    // Re-generate unless the caller explicitly turned reminders off.
    await syncReminders(med, req, remindersEnabled ?? true);
  }
  res.json({ medication: medicationView(med) });
}

/** Marks the whole course as completed (or stopped) and silences its reminders. */
export async function finishMedication(req, res) {
  const med = await findMed(req);
  med.status = req.valid.body.discontinued ? 'discontinued' : 'completed';
  med.completedAt = new Date();
  await med.save();
  await cancelSourceReminders('medication', med._id);
  res.json({ medication: medicationView(med) });
}

export async function deleteMedication(req, res) {
  const med = await findMed(req);
  med.deletedAt = new Date();
  await med.save();
  await cancelSourceReminders('medication', med._id);
  res.status(204).end();
}

/** Dose history ("medication history"), newest first. */
export async function listDoses(req, res) {
  const med = await findMed(req);
  const { limit, cursor } = req.valid.query;
  const q = MedicationDose.find({ medicationId: med._id, ...beforeCursor(cursor, 'scheduledFor') });
  const { items, nextCursor } = await paginate(q, { limit: parseLimit(limit), field: 'scheduledFor' });
  res.json({ items: items.map(doseView), nextCursor });
}
