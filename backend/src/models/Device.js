import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    platform: { type: String, enum: ['ios', 'android', 'web'], required: true },
    // Expo push tokens route to FCM/APNs; raw fcm/apns tokens supported for later.
    tokenType: { type: String, enum: ['expo', 'fcm', 'apns'], default: 'expo' },
    pushToken: { type: String, required: true, unique: true },
    locale: { type: String, default: 'en' },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const Device = mongoose.model('Device', deviceSchema);
