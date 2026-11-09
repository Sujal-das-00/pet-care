import mongoose from 'mongoose';

// One row per user. This — never client-reported state — decides who can use paid features.
const membershipSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    plan: { type: String, enum: ['club'], default: 'club' },
    status: { type: String, enum: ['active', 'revoked'], default: 'active' },
    source: { type: String, enum: ['nimiq', 'admin'], required: true },
    startedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null }, // null = lifetime (one-time payment)
    lastTxHash: { type: String, default: null },
    totalPaidLuna: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Membership = mongoose.model('Membership', membershipSchema);
