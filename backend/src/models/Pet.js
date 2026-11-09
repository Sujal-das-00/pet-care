import mongoose from 'mongoose';

const petSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    // Dogs and cats at launch; extend this enum to add species (architecture is species-agnostic).
    species: { type: String, enum: ['dog', 'cat'], required: true },
    breed: { type: String, trim: true, maxlength: 60, default: '' },
    gender: { type: String, enum: ['male', 'female', 'unknown'], default: 'unknown' },
    neutered: { type: Boolean, default: null },
    dateOfBirth: { type: String, match: /^\d{4}-\d{2}-\d{2}$/, default: null }, // local calendar date, no TZ drift
    dobEstimated: { type: Boolean, default: false },
    personality: { type: [String], default: [] },
    bio: { type: String, trim: true, maxlength: 300, default: '' },
    photoKey: { type: String, default: null },
    microchipId: { type: String, trim: true, maxlength: 30, default: '' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

petSchema.index({ ownerId: 1, deletedAt: 1, createdAt: 1 });

export const Pet = mongoose.model('Pet', petSchema);
