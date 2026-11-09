import mongoose from 'mongoose';

const feedingScheduleSchema = new mongoose.Schema(
  {
    petId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pet', required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, required: true, trim: true, maxlength: 60 }, // e.g. "Morning meal"
    localTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    daysOfWeek: { type: [Number], default: [] },
    food: { type: String, trim: true, maxlength: 100, default: '' },
    amountNote: { type: String, trim: true, maxlength: 100, default: '' },
    active: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

feedingScheduleSchema.index({ petId: 1, localTime: 1 });

export const FeedingSchedule = mongoose.model('FeedingSchedule', feedingScheduleSchema);
