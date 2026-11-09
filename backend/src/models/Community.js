import mongoose from 'mongoose';

const communitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    kind: { type: String, enum: ['city', 'breed', 'interest', 'activity', 'general'], default: 'general' },
    species: { type: String, enum: ['any', 'dog', 'cat'], default: 'any' },
    breed: { type: String, trim: true, maxlength: 60, default: '' },
    // Coarse location only. `prefecture` is a JIS code ("13" = Tokyo); null = nationwide/global.
    prefecture: { type: String, default: null },
    city: { type: String, trim: true, maxlength: 60, default: '' },
    // Until cover-image upload ships (media pipeline), communities carry an emoji + pastel tint.
    emoji: { type: String, default: '🐾', maxlength: 8 },
    tint: { type: String, enum: ['peach', 'lavender', 'blue', 'yellow', 'green', 'pink'], default: 'green' },
    official: { type: Boolean, default: false }, // created by the PawCircle team
    featured: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Denormalised counters (updated atomically with $inc).
    memberCount: { type: Number, default: 0, min: 0 },
    postCount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['active', 'hidden'], default: 'active' },
    reportCount: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

communitySchema.index({ status: 1, deletedAt: 1, memberCount: -1 });
communitySchema.index({ prefecture: 1, status: 1, memberCount: -1 });
communitySchema.index({ name: 1 });

export const Community = mongoose.model('Community', communitySchema);

const memberSchema = new mongoose.Schema(
  {
    communityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['admin', 'moderator', 'member'], default: 'member' },
  },
  { timestamps: { createdAt: 'joinedAt', updatedAt: false } },
);

memberSchema.index({ communityId: 1, userId: 1 }, { unique: true });
memberSchema.index({ userId: 1, joinedAt: -1 });
memberSchema.index({ communityId: 1, role: 1 });

export const CommunityMember = mongoose.model('CommunityMember', memberSchema);
