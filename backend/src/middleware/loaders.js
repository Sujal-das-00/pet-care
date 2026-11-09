import { Pet } from '../models/Pet.js';
import { notFound } from '../utils/errors.js';

/**
 * Loads :petId and enforces ownership. A pet that belongs to someone else is reported as 404
 * (not 403) so ids can't be probed.
 */
export async function loadOwnedPet(req, _res, next) {
  const pet = await Pet.findOne({ _id: req.params.petId, ownerId: req.userId, deletedAt: null });
  if (!pet) throw notFound('Pet not found');
  req.pet = pet;
  next();
}
