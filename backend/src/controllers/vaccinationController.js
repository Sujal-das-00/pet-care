import { Vaccination } from '../models/Vaccination.js';
import { vaccinationView } from '../views/index.js';
import { vaccinationReminderDocs, replaceSourceReminders, cancelSourceReminders } from '../services/reminderService.js';
import { notFound } from '../utils/errors.js';

async function findVax(req) {
  const v = await Vaccination.findOne({ _id: req.params.vaccinationId, petId: req.pet._id, deletedAt: null });
  if (!v) throw notFound('Vaccination not found');
  return v;
}

export async function listVaccinations(req, res) {
  const items = await Vaccination.find({ petId: req.pet._id, deletedAt: null }).sort({ administeredOn: -1 });
  res.json({ items: items.map(vaccinationView) });
}

export async function createVaccination(req, res) {
  const { remindersEnabled, ...data } = req.valid.body;
  const vax = await Vaccination.create({ ...data, petId: req.pet._id, ownerId: req.userId });
  await replaceSourceReminders('vaccination', vax._id, remindersEnabled ? vaccinationReminderDocs(vax, req.pet, req.user) : []);
  res.status(201).json({ vaccination: vaccinationView(vax) });
}

export async function updateVaccination(req, res) {
  const vax = await findVax(req);
  const { remindersEnabled, ...data } = req.valid.body;
  vax.set(data);
  await vax.save();
  await replaceSourceReminders('vaccination', vax._id, remindersEnabled === false ? [] : vaccinationReminderDocs(vax, req.pet, req.user));
  res.json({ vaccination: vaccinationView(vax) });
}

export async function deleteVaccination(req, res) {
  const vax = await findVax(req);
  vax.deletedAt = new Date();
  await vax.save();
  await cancelSourceReminders('vaccination', vax._id);
  res.status(204).end();
}
