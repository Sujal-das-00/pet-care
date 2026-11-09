import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, enum: ['care', 'fitness', 'community', 'challenges', 'events', 'system'], default: 'care' },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    reminderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reminder', default: null },
    pushStatus: { type: String, enum: ['pending', 'sent', 'failed', 'no_device'], default: 'pending' },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, createdAt: -1, _id: -1 });
// Keep the inbox bounded.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export const Notification = mongoose.model('Notification', notificationSchema);
