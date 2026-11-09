import mongoose from 'mongoose';

const petWeightSchema = new mongoose.Schema(
  {
    petId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pet', required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Canonical unit is grams; kg/lb conversion happens at the edges.
    weightGrams: { type: Number, required: true, min: 50, max: 150000 },
    measuredAt: { type: Date, required: true, default: Date.now },
    note: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { timestamps: true },
);

petWeightSchema.index({ petId: 1, measuredAt: -1, _id: -1 });

export const PetWeight = mongoose.model('PetWeight', petWeightSchema);
