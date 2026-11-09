import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * What a challenge measures. Score is always the SUM of entry values:
 *   distance_km / activity_minutes -> the number logged
 *   active_days                    -> one entry per day, value 1 (so the sum is the number of days)
 *   check_ins                      -> each entry counts 1 (e.g. "met a new pet friend")
 */
export const METRICS = ['distance_km', 'activity_minutes', 'active_days', 'check_ins'];

// Sensible per-metric limits: leaderboards must reward consistency, not unsafe exercise.
export const METRIC_DEFAULTS = {
  distance_km: { maxPerEntry: 30, dailyCap: 30 },
  activity_minutes: { maxPerEntry: 240, dailyCap: 360 },
  active_days: { maxPerEntry: 1, dailyCap: 1 },
  check_ins: { maxPerEntry: 1, dailyCap: 3 },
};

// Posted by the PawCircle admin team. Dates are calendar days in Asia/Tokyo, inclusive.
const challengeSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    instructions: { type: String, trim: true, maxlength: 1000, default: '' },
    emoji: { type: String, default: '🏆', maxlength: 8 },
    tint: { type: String, enum: ['peach', 'lavender', 'blue', 'yellow', 'green', 'pink'], default: 'lavender' },
    metric: { type: String, enum: METRICS, required: true },
    goal: { type: Number, min: 1, default: null }, // optional personal target, shown as a progress bar
    startsOn: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    endsOn: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    // Eligible pets. A single-species challenge keeps dogs and cats from being ranked against each other.
    species: { type: [String], enum: ['dog', 'cat'], default: ['dog', 'cat'] },
    maxPerEntry: { type: Number, required: true, min: 1 },
    dailyCap: { type: Number, required: true, min: 1 },
    published: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    participantCount: { type: Number, default: 0, min: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

challengeSchema.index({ published: 1, deletedAt: 1, startsOn: 1, endsOn: 1 });

export const Challenge = mongoose.model('Challenge', challengeSchema);

const participantSchema = new Schema(
  {
    challengeId: { type: Schema.Types.ObjectId, ref: 'Challenge', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: 'joinedAt', updatedAt: false } },
);
participantSchema.index({ challengeId: 1, userId: 1 }, { unique: true });
participantSchema.index({ userId: 1, joinedAt: -1 });

export const ChallengeParticipant = mongoose.model('ChallengeParticipant', participantSchema);

// Self-reported until GPS walk tracking exists (Phase 2); capped and removable by admins.
const entrySchema = new Schema(
  {
    challengeId: { type: Schema.Types.ObjectId, ref: 'Challenge', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    petId: { type: Schema.Types.ObjectId, ref: 'Pet', default: null },
    species: { type: String, enum: ['dog', 'cat', null], default: null }, // snapshot, for per-species leaderboards
    value: { type: Number, required: true, min: 0.1 },
    loggedOn: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    note: { type: String, trim: true, maxlength: 200, default: '' },
    // Set only for "active_days" so a day can be claimed once; sparse-unique below.
    dayKey: { type: String, default: undefined },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
entrySchema.index({ challengeId: 1, userId: 1, loggedOn: -1 });
entrySchema.index({ challengeId: 1, deletedAt: 1, species: 1, userId: 1 });
entrySchema.index({ dayKey: 1 }, { unique: true, partialFilterExpression: { dayKey: { $type: 'string' } } });

export const ChallengeEntry = mongoose.model('ChallengeEntry', entrySchema);
