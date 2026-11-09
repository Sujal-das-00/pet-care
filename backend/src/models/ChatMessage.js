import mongoose from 'mongoose';

// Room keys: "global" | "community:<communityId>" | "local:<prefectureCode>"
const chatMessageSchema = new mongoose.Schema(
  {
    room: { type: String, required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: 500 },
    reportCount: { type: Number, default: 0 },
    hidden: { type: Boolean, default: false }, // auto-hidden after repeated reports
    deletedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

chatMessageSchema.index({ room: 1, createdAt: -1, _id: -1 });
chatMessageSchema.index({ authorId: 1, createdAt: -1 });
// Chat is ephemeral: keep ~60 days. Bounds storage cost and the personal data we hold.
chatMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 3600 });

export const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
