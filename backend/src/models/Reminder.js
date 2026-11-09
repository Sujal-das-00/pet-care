import mongoose from 'mongoose';

export const REMINDER_KINDS = [
  'weight', 'medication', 'vaccination', 'appointment', 'feeding', 'grooming', 'general', 'custom', 'event',
];

/**
 * Lifecycle
 *  - `nextDueAt` is the next occurrence the worker will notify about.
 *  - When notified, that occurrence becomes `pendingDueAt` (awaiting the user's "done") and
 *    `nextDueAt` advances to the following occurrence. If there is none, `isFinal` is set.
 *  - Completing clears `pendingDueAt`; a final reminder then becomes `completed`.
 */
const reminderSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    petId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pet', default: null },
    kind: { type: String, enum: REMINDER_KINDS, required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, trim: true, maxlength: 300, default: '' },
    // Links a generated reminder back to the record that owns it (medication, vaccination, ...).
    sourceType: { type: String, enum: ['medication', 'vaccination', 'appointment', 'feeding', 'event', 'manual'], default: 'manual' },
    sourceId: { type: mongoose.Schema.Types.ObjectId, default: null },

    timezone: { type: String, default: 'Asia/Tokyo' },
    localTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, default: null },
    nextDueAt: { type: Date, required: true },
    pendingDueAt: { type: Date, default: null },
    recurrence: { type: String, enum: ['none', 'daily', 'weekly', 'monthly', 'yearly'], default: 'none' },
    interval: { type: Number, min: 1, max: 365, default: 1 },
    daysOfWeek: { type: [Number], default: [] },
    endsAt: { type: Date, default: null },
    isFinal: { type: Boolean, default: false },

    status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
    lastNotifiedAt: { type: Date, default: null },
    lastCompletedAt: { type: Date, default: null },
    // Worker claim, so several worker processes never double-send.
    claimedUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

reminderSchema.index({ status: 1, nextDueAt: 1 });
reminderSchema.index({ ownerId: 1, status: 1, nextDueAt: 1 });
reminderSchema.index({ ownerId: 1, status: 1, pendingDueAt: 1 });
reminderSchema.index({ sourceType: 1, sourceId: 1 });

export const Reminder = mongoose.model('Reminder', reminderSchema);
