import mongoose from 'mongoose';

const { Schema } = mongoose;

const consentSchema = new Schema(
  {
    kind: { type: String, enum: ['terms', 'privacy', 'location', 'marketing', 'health_data'], required: true },
    version: { type: String, required: true },
    granted: { type: Boolean, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    // Accounts are identified by a Nimiq wallet. Email + password exist only for development / tests.
    nimiq: {
      address: { type: String, default: undefined }, // "NQ.. .... ...." derived from the signing public key
      publicKey: { type: String, default: undefined }, // hex
      linkedAt: { type: Date, default: undefined },
    },
    email: { type: String, lowercase: true, trim: true, maxlength: 254, default: undefined },
    passwordHash: { type: String, select: false, default: undefined },
    status: { type: String, enum: ['active', 'suspended', 'deleted'], default: 'active', index: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    locale: { type: String, enum: ['en'], default: 'en' },
    timezone: { type: String, default: 'Asia/Tokyo' },
    profile: {
      displayName: { type: String, trim: true, maxlength: 40, default: '' },
      avatarKey: { type: String, default: null },
      // Coarse location only (never a home address) — see privacy requirements.
      prefecture: { type: String, trim: true, maxlength: 40, default: '' },
      city: { type: String, trim: true, maxlength: 60, default: '' },
      neighbourhood: { type: String, trim: true, maxlength: 60, default: '' },
    },
    preferences: {
      weightUnit: { type: String, enum: ['kg', 'lb'], default: 'kg' },
      distanceUnit: { type: String, enum: ['km', 'mi'], default: 'km' },
      dailyStepGoal: { type: Number, min: 1000, max: 60000, default: 8000 },
      interests: { type: [String], default: [] },
      onboardingCompleted: { type: Boolean, default: false },
    },
    notificationPrefs: {
      care: { type: Boolean, default: true },
      fitness: { type: Boolean, default: true },
      community: { type: Boolean, default: true },
      challenges: { type: Boolean, default: true },
      events: { type: Boolean, default: true },
      marketing: { type: Boolean, default: false },
    },
    consents: { type: [consentSchema], default: [] },
    lastLoginAt: Date,
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Unique among live accounts only, so a deleted account's email / wallet can sign up again.
// (`$type: 'string'` so accounts without an email don't collide with each other.)
userSchema.index({ email: 1 }, { unique: true, name: 'email_live_unique', partialFilterExpression: { deletedAt: null, email: { $type: 'string' } } });
userSchema.index({ 'nimiq.address': 1 }, { unique: true, name: 'nimiq_address_live_unique', partialFilterExpression: { deletedAt: null, 'nimiq.address': { $type: 'string' } } });

export const User = mongoose.model('User', userSchema);
