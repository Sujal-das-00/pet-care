import mongoose from 'mongoose';

const dateStr = { type: String, match: /^\d{4}-\d{2}-\d{2}$/ };

const vaccinationSchema = new mongoose.Schema(
  {
    petId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pet', required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    administeredOn: { ...dateStr, required: true },
    nextDueOn: { ...dateStr, default: null },
    clinicName: { type: String, trim: true, maxlength: 100, default: '' },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

vaccinationSchema.index({ petId: 1, administeredOn: -1 });

export const Vaccination = mongoose.model('Vaccination', vaccinationSchema);
