import mongoose from 'mongoose';

// A single-use "sign this message" request. The wallet's signature over `message` proves control of the key.
const authChallengeSchema = new mongoose.Schema(
  {
    message: { type: String, required: true }, // exactly what the wallet shows and signs (ASCII only)
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
authChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Mongo removes expired ones

export const AuthChallenge = mongoose.model('AuthChallenge', authChallengeSchema);
