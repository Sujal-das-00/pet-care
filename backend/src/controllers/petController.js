import { Pet } from '../models/Pet.js';
import { petView } from '../views/index.js';
import { latestWeights } from '../services/petService.js';
import { cancelPetReminders } from '../services/reminderService.js';
import { Medication } from '../models/Medication.js';
import { Vaccination } from '../models/Vaccination.js';
import { Appointment } from '../models/Appointment.js';
import { FeedingSchedule } from '../models/FeedingSchedule.js';
import { badRequest } from '../utils/errors.js';
import { audit } from '../services/auditService.js';

const MAX_PETS = 20;

export async function listPets(req, res) {
  const pets = await Pet.find({ ownerId: req.userId, deletedAt: null }).sort({ createdAt: 1 }).lean();
  const weights = await latestWeights(pets.map((p) => p._id));
  res.json({ items: pets.map((p) => petView(p, { timezone: req.user.timezone, latestWeight: weights.get(String(p._id)) })) });
}

export async function createPet(req, res) {
  if ((await Pet.countDocuments({ ownerId: req.userId, deletedAt: null })) >= MAX_PETS) {
    throw badRequest(`You can have up to ${MAX_PETS} pets`);
  }
  const pet = await Pet.create({ ...req.valid.body, ownerId: req.userId });
  audit(req, 'pet.create', 'Pet', pet._id);
  res.status(201).json({ pet: petView(pet, { timezone: req.user.timezone }) });
}

export async function getPet(req, res) {
  const weights = await latestWeights([req.pet._id]);
  res.json({ pet: petView(req.pet, { timezone: req.user.timezone, latestWeight: weights.get(String(req.pet._id)) }) });
}

export async function updatePet(req, res) {
  req.pet.set(req.valid.body);
  await req.pet.save();
  const weights = await latestWeights([req.pet._id]);
  res.json({ pet: petView(req.pet, { timezone: req.user.timezone, latestWeight: weights.get(String(req.pet._id)) }) });
}

/** Soft delete the pet; its reminders stop immediately. Health records are purged with the account. */
export async function deletePet(req, res) {
  const now = new Date();
  req.pet.deletedAt = now;
  await req.pet.save();
  await cancelPetReminders(req.pet._id);
  await Promise.all([
    Medication.updateMany({ petId: req.pet._id }, { $set: { deletedAt: now } }),
    Vaccination.updateMany({ petId: req.pet._id }, { $set: { deletedAt: now } }),
    Appointment.updateMany({ petId: req.pet._id }, { $set: { deletedAt: now } }),
    FeedingSchedule.updateMany({ petId: req.pet._id }, { $set: { deletedAt: now } }),
  ]);
  audit(req, 'pet.delete', 'Pet', req.pet._id);
  res.status(204).end();
}
