import mongoose from 'mongoose';

const { Schema } = mongoose;

export const EVENT_CATEGORIES = [
  'monthly_paw_walk', 'picnic', 'dog_park', 'cat_gathering', 'photo_day',
  'breed_meetup', 'fitness_walk', 'birthday', 'adventure', 'other',
];

// Members organise events themselves; PawCircle provides the platform and guidelines.
const eventSchema = new Schema(
  {
    hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    communityId: { type: Schema.Types.ObjectId, ref: 'Community', default: null },
    ideaId: { type: Schema.Types.ObjectId, ref: 'EventIdea', default: null },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 1500, default: '' },
    category: { type: String, enum: EVENT_CATEGORIES, default: 'other' },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    timezone: { type: String, default: 'Asia/Tokyo' },
    // A public venue only — never a private address (enforced by a required confirmation).
    place: {
      name: { type: String, required: true, trim: true, maxlength: 100 },
      prefecture: { type: String, default: null },
      city: { type: String, trim: true, maxlength: 60, default: '' },
    },
    publicPlaceConfirmed: { type: Boolean, required: true },
    maxParticipants: { type: Number, min: 2, max: 500, default: null }, // null = unlimited
    petTypes: { type: [String], enum: ['dog', 'cat'], default: ['dog', 'cat'] },
    instructions: { type: String, trim: true, maxlength: 1000, default: '' },
    goingCount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['scheduled', 'cancelled', 'completed'], default: 'scheduled' },
    cancelReason: { type: String, trim: true, maxlength: 300, default: '' },
    // Host's completion report ("report event completion").
    completion: {
      attended: { type: Number, min: 0, max: 1000 },
      note: { type: String, trim: true, maxlength: 500 },
      reportedAt: Date,
    },
    reportCount: { type: Number, default: 0 },
    hidden: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

eventSchema.index({ status: 1, hidden: 1, deletedAt: 1, startsAt: 1 });
eventSchema.index({ 'place.prefecture': 1, status: 1, startsAt: 1 });
eventSchema.index({ communityId: 1, status: 1, startsAt: 1 });
eventSchema.index({ hostId: 1, startsAt: -1 });

export const Event = mongoose.model('Event', eventSchema);

const participantSchema = new Schema(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    petIds: { type: [Schema.Types.ObjectId], default: [] },
    status: { type: String, enum: ['going', 'cancelled'], default: 'going' },
    attended: { type: Boolean, default: null }, // set by the host's completion report in a later phase
  },
  { timestamps: true },
);
participantSchema.index({ eventId: 1, userId: 1 }, { unique: true });
participantSchema.index({ userId: 1, status: 1, createdAt: -1 });
participantSchema.index({ eventId: 1, status: 1, createdAt: 1 });

export const EventParticipant = mongoose.model('EventParticipant', participantSchema);

// Official, admin-published templates members can start an event from.
const loc = { title: String, concept: String, format: String, instructions: String, locationRequirements: String, photoSuggestions: String, safety: [String] };
const eventIdeaSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    category: { type: String, enum: EVENT_CATEGORIES, default: 'other' },
    emoji: { type: String, default: '🐾' },
    recommendedGroupSize: { min: Number, max: Number },
    suggestedDurationMinutes: { type: Number, default: 90 },
    petTypes: { type: [String], default: ['dog', 'cat'] },
    en: loc,
    published: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);
eventIdeaSchema.index({ published: 1, order: 1 });

export const EventIdea = mongoose.model('EventIdea', eventIdeaSchema);
