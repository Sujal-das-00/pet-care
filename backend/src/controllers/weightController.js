import { PetWeight } from '../models/PetWeight.js';
import { weightView } from '../views/index.js';
import { toGrams, fromGrams } from '../services/petService.js';
import { beforeCursor, paginate, parseLimit } from '../utils/pagination.js';
import { notFound, badRequest } from '../utils/errors.js';

const unitOf = (req) => req.user.preferences?.weightUnit || 'kg';

export async function addWeight(req, res) {
  const { value, unit, measuredAt, note } = req.valid.body;
  const weightGrams = toGrams(value, unit || unitOf(req));
  if (weightGrams < 50 || weightGrams > 150000) throw badRequest('Weight is outside the supported range');
  const when = measuredAt ?? new Date();
  if (when.getTime() > Date.now() + 5 * 60_000) throw badRequest('Measurement date cannot be in the future');
  const w = await PetWeight.create({ petId: req.pet._id, ownerId: req.userId, weightGrams, measuredAt: when, note });
  res.status(201).json({ weight: weightView(w, unitOf(req)) });
}

export async function listWeights(req, res) {
  const { limit, cursor } = req.valid.query;
  const q = PetWeight.find({ petId: req.pet._id, ...beforeCursor(cursor, 'measuredAt') });
  const { items, nextCursor } = await paginate(q, { limit: parseLimit(limit), field: 'measuredAt' });
  res.json({ items: items.map((w) => weightView(w, unitOf(req))), nextCursor });
}

/** Chronological points for charts, plus change statistics. */
export async function weightSeries(req, res) {
  const since = new Date(Date.now() - req.valid.query.days * 86_400_000);
  const rows = await PetWeight.find({ petId: req.pet._id, measuredAt: { $gte: since } })
    .sort({ measuredAt: 1, _id: 1 }).limit(500).lean();
  const unit = unitOf(req);
  const points = rows.map((w) => ({ id: String(w._id), measuredAt: w.measuredAt, weightGrams: w.weightGrams, value: fromGrams(w.weightGrams, unit) }));
  const first = points[0];
  const last = points[points.length - 1];
  const prev = points.length > 1 ? points[points.length - 2] : null;
  res.json({
    unit,
    points,
    summary: last && {
      latest: last.value,
      changeSincePrevious: prev ? Math.round((last.value - prev.value) * 100) / 100 : null,
      changeSinceFirst: first !== last ? Math.round((last.value - first.value) * 100) / 100 : null,
    },
  });
}

export async function deleteWeight(req, res) {
  const r = await PetWeight.deleteOne({ _id: req.params.weightId, petId: req.pet._id });
  if (!r.deletedCount) throw notFound('Weight record not found');
  res.status(204).end();
}
