import mongoose from 'mongoose';

const { Schema } = mongoose;

export const REPORT_TARGETS = ['post', 'comment', 'event', 'community', 'user', 'message'];
export const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'unsafe_event', 'privacy', 'other'];

const reportSchema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: REPORT_TARGETS, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    note: { type: String, trim: true, maxlength: 500, default: '' },
    status: { type: String, enum: ['open', 'actioned', 'dismissed'], default: 'open' },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: Date,
  },
  { timestamps: true },
);
// One report per person per target, so a single user can't brigade-hide content.
reportSchema.index({ reporterId: 1, targetType: 1, targetId: 1 }, { unique: true });
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ targetType: 1, targetId: 1 });

export const Report = mongoose.model('Report', reportSchema);

const blockSchema = new Schema(
  {
    blockerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    blockedId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
blockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
blockSchema.index({ blockedId: 1 });

export const Block = mongoose.model('Block', blockSchema);
