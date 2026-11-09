import mongoose from 'mongoose';

const { Schema } = mongoose;

const scheduleSchema = new Schema({
  localTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  // ISO weekdays 1=Mon..7=Sun; empty means every day.
  daysOfWeek: { type: [Number], default: [] },
});

// Medication records are user-entered / veterinarian-provided. PawCircle never suggests drugs or doses.
const medicationSchema = new Schema(
  {
    petId: { type: Schema.Types.ObjectId, ref: 'Pet', required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    dosageInstructions: { type: String, trim: true, maxlength: 500, default: '' },
    prescribedBy: { type: String, trim: true, maxlength: 80, default: '' },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    endDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/, default: null },
    schedules: { type: [scheduleSchema], default: [] },
    status: { type: String, enum: ['active', 'completed', 'discontinued'], default: 'active' },
    completedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

medicationSchema.index({ petId: 1, status: 1, startDate: -1 });

export const Medication = mongoose.model('Medication', medicationSchema);

const doseSchema = new Schema(
  {
    medicationId: { type: Schema.Types.ObjectId, ref: 'Medication', required: true },
    petId: { type: Schema.Types.ObjectId, ref: 'Pet', required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    scheduledFor: { type: Date, required: true },
    outcome: { type: String, enum: ['given', 'skipped'], required: true },
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

doseSchema.index({ medicationId: 1, scheduledFor: -1, _id: -1 });

export const MedicationDose = mongoose.model('MedicationDose', doseSchema);
