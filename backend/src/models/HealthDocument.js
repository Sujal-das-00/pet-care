import mongoose from 'mongoose';

// Private medical files. Bytes live in object storage; access is only via short-lived signed URLs.
const healthDocumentSchema = new mongoose.Schema(
  {
    petId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pet', required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['vaccination', 'medical', 'prescription', 'other'], default: 'other' },
    title: { type: String, trim: true, maxlength: 120, default: '' },
    fileKey: { type: String, required: true, unique: true },
    contentType: { type: String, required: true },
    sizeBytes: { type: Number, default: 0 },
    linkedType: { type: String, enum: ['vaccination', 'appointment', null], default: null },
    linkedId: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: { type: String, enum: ['pending', 'ready'], default: 'pending' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

healthDocumentSchema.index({ petId: 1, createdAt: -1 });

export const HealthDocument = mongoose.model('HealthDocument', healthDocumentSchema);
