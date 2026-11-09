import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema(
  {
    petId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pet', required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clinicName: { type: String, required: true, trim: true, maxlength: 100 },
    clinicAddress: { type: String, trim: true, maxlength: 200, default: '' },
    clinicPhone: { type: String, trim: true, maxlength: 30, default: '' },
    vetName: { type: String, trim: true, maxlength: 80, default: '' },
    reason: { type: String, trim: true, maxlength: 200, default: '' },
    scheduledAt: { type: Date, required: true },
    reminderMinutesBefore: { type: Number, min: 0, max: 10080, default: 60 },
    status: { type: String, enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' },
    visitNotes: { type: String, trim: true, maxlength: 2000, default: '' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

appointmentSchema.index({ petId: 1, scheduledAt: -1 });

export const Appointment = mongoose.model('Appointment', appointmentSchema);
