import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Pet } from '../models/Pet.js';
import { PetWeight } from '../models/PetWeight.js';
import { Medication, MedicationDose } from '../models/Medication.js';
import { Vaccination } from '../models/Vaccination.js';
import { Appointment } from '../models/Appointment.js';
import { HealthDocument } from '../models/HealthDocument.js';
import { FeedingSchedule } from '../models/FeedingSchedule.js';
import { Reminder } from '../models/Reminder.js';
import { Notification } from '../models/Notification.js';
import { Device } from '../models/Device.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { Community, CommunityMember } from '../models/Community.js';
import { Post, Comment, Like } from '../models/Post.js';
import { Event, EventParticipant } from '../models/Event.js';
import { Report, Block } from '../models/Report.js';
import { Challenge, ChallengeEntry, ChallengeParticipant } from '../models/Challenge.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { Membership } from '../models/Membership.js';
import { PaymentIntent } from '../models/PaymentIntent.js';
import { removeMember, notifyUsers } from './communityService.js';
import { tr } from '../utils/i18n.js';
import { storageConfigured, deleteObject } from './storageService.js';

const OWNED = [PetWeight, Medication, MedicationDose, Vaccination, Appointment, HealthDocument, FeedingSchedule, Reminder];

/** Everything we hold about the user, for data-portability requests (APPI). */
export async function exportUserData(userId) {
  const [user, pets, weights, meds, doses, vax, appts, docs, feeding, reminders] = await Promise.all([
    User.findById(userId).lean(),
    Pet.find({ ownerId: userId }).lean(),
    PetWeight.find({ ownerId: userId }).lean(),
    Medication.find({ ownerId: userId }).lean(),
    MedicationDose.find({ ownerId: userId }).lean(),
    Vaccination.find({ ownerId: userId }).lean(),
    Appointment.find({ ownerId: userId }).lean(),
    HealthDocument.find({ ownerId: userId }).select('-fileKey').lean(),
    FeedingSchedule.find({ ownerId: userId }).lean(),
    Reminder.find({ ownerId: userId }).lean(),
  ]);
  const [challengeParticipation, challengeEntries, chatMessages, membership, payments, memberships, posts, comments, hosted, rsvps, blocks] = await Promise.all([
    ChallengeParticipant.find({ userId }).lean(),
    ChallengeEntry.find({ userId, deletedAt: null }).lean(),
    ChatMessage.find({ authorId: userId, deletedAt: null }).select('room text createdAt').lean(),
    Membership.findOne({ userId }).lean(),
    PaymentIntent.find({ userId }).select('-userId').lean(),
    CommunityMember.find({ userId }).lean(),
    Post.find({ authorId: userId, deletedAt: null }).lean(),
    Comment.find({ authorId: userId, deletedAt: null }).lean(),
    Event.find({ hostId: userId }).lean(),
    EventParticipant.find({ userId }).lean(),
    Block.find({ blockerId: userId }).lean(),
  ]);
  delete user.passwordHash;
  return {
    membership, payments, challenges: { participation: challengeParticipation, entries: challengeEntries }, chatMessages,
    community: { memberships, posts, comments, hostedEvents: hosted, rsvps, blocks },
    exportedAt: new Date().toISOString(),
    user, pets, weights, medications: meds, medicationDoses: doses,
    vaccinations: vax, appointments: appts, documents: docs, feedingSchedules: feeding, reminders,
  };
}

/** Removes everything the user contributed to communities and events, keeping counters consistent. */
async function eraseCommunityFootprint(userId) {
  // Leave communities (promotes a new admin where needed).
  for (const m of await CommunityMember.find({ userId }).select('communityId').lean()) await removeMember(m.communityId, userId);

  // My posts go, along with the comments and likes other people left on them.
  const mine = await Post.find({ authorId: userId }).select('communityId deletedAt').lean();
  for (const p of mine.filter((x) => !x.deletedAt)) {
    await Community.updateOne({ _id: p.communityId, postCount: { $gt: 0 } }, { $inc: { postCount: -1 } });
  }
  const myPostIds = mine.map((p) => p._id);
  await Promise.all([Comment.deleteMany({ postId: { $in: myPostIds } }), Like.deleteMany({ postId: { $in: myPostIds } })]);
  await Post.deleteMany({ authorId: userId });

  // My comments and likes on other people's posts, with the counters they fed.
  for (const c of await Comment.find({ authorId: userId, deletedAt: null }).select('postId').lean()) {
    await Post.updateOne({ _id: c.postId, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } });
  }
  await Comment.deleteMany({ authorId: userId });
  for (const l of await Like.find({ userId }).select('postId').lean()) {
    await Post.updateOne({ _id: l.postId, likeCount: { $gt: 0 } }, { $inc: { likeCount: -1 } });
  }
  await Like.deleteMany({ userId });

  // Challenges and chat: my entries leave the leaderboards, my messages are erased.
  for (const p of await ChallengeParticipant.find({ userId }).select('challengeId').lean()) {
    await Challenge.updateOne({ _id: p.challengeId, participantCount: { $gt: 0 } }, { $inc: { participantCount: -1 } });
  }
  await Promise.all([ChallengeParticipant.deleteMany({ userId }), ChallengeEntry.deleteMany({ userId }), ChatMessage.deleteMany({ authorId: userId })]);

  // Events: cancel upcoming ones I host (participants are told), withdraw from the rest.
  const hosted = await Event.find({ hostId: userId, status: 'scheduled' }).lean();
  for (const e of hosted) {
    await Event.updateOne({ _id: e._id }, { $set: { status: 'cancelled', cancelReason: 'Host closed their account' } });
    const going = await EventParticipant.find({ eventId: e._id, status: 'going', userId: { $ne: userId } }).select('userId').lean();
    await Reminder.deleteMany({ sourceType: 'event', sourceId: e._id });
    notifyUsers(going.map((g) => g.userId), { build: (l) => tr(l, 'eventCancelled', { title: e.title }), data: { type: 'event', eventId: String(e._id) } });
  }
  for (const p of await EventParticipant.find({ userId, status: 'going' }).select('eventId').lean()) {
    await Event.updateOne({ _id: p.eventId, goingCount: { $gt: 0 } }, { $inc: { goingCount: -1 } });
  }
  await EventParticipant.deleteMany({ userId });
  await Promise.all([Report.deleteMany({ reporterId: userId }), Block.deleteMany({ $or: [{ blockerId: userId }, { blockedId: userId }] })]);
}

/** Permanently erases the user's data and anonymises the account row. */
export async function deleteAccount(userId) {
  await eraseCommunityFootprint(userId);
  // Payment records are kept for accounting (the transactions are public on-chain anyway) but are
  // detached from the person; the membership itself is removed.
  await Promise.all([PaymentIntent.updateMany({ userId }, { $set: { userId: null } }), Membership.deleteMany({ userId })]);
  if (storageConfigured()) {
    const docs = await HealthDocument.find({ ownerId: userId }).select('fileKey').lean();
    await Promise.allSettled(docs.map((d) => deleteObject(d.fileKey)));
  }
  await Promise.all([
    ...OWNED.map((M) => M.deleteMany({ ownerId: userId })),
    Pet.deleteMany({ ownerId: userId }),
    Notification.deleteMany({ userId }),
    Device.deleteMany({ userId }),
    RefreshToken.deleteMany({ userId }),
  ]);
  await User.updateOne(
    { _id: userId },
    {
      $unset: { nimiq: '' }, // frees the wallet to sign up again
      $set: {
        status: 'deleted',
        deletedAt: new Date(),
        email: `deleted+${new mongoose.Types.ObjectId()}@deleted.invalid`,
        passwordHash: 'deleted',
        profile: { displayName: '', avatarKey: null, prefecture: '', city: '', neighbourhood: '' },
      },
    },
  );
}
