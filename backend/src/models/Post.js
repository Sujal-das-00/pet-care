import mongoose from 'mongoose';

const { Schema } = mongoose;
const oid = (ref, extra = {}) => ({ type: Schema.Types.ObjectId, ref, ...extra });

// Text posts for now. Photos/videos arrive with the media pipeline (R2 + thumbnails).
const postSchema = new Schema(
  {
    communityId: oid('Community', { required: true }),
    authorId: oid('User', { required: true }),
    petId: oid('Pet', { default: null }), // optional "posting as" pet
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: 1000 },
    likeCount: { type: Number, default: 0, min: 0 },
    commentCount: { type: Number, default: 0, min: 0 },
    reportCount: { type: Number, default: 0 },
    hidden: { type: Boolean, default: false }, // auto-hidden after repeated reports, pending review
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
postSchema.index({ communityId: 1, deletedAt: 1, hidden: 1, createdAt: -1, _id: -1 });
postSchema.index({ authorId: 1, createdAt: -1 });

export const Post = mongoose.model('Post', postSchema);

const commentSchema = new Schema(
  {
    postId: oid('Post', { required: true }),
    authorId: oid('User', { required: true }),
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: 500 },
    reportCount: { type: Number, default: 0 },
    hidden: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
commentSchema.index({ postId: 1, deletedAt: 1, createdAt: 1, _id: 1 });

export const Comment = mongoose.model('Comment', commentSchema);

const likeSchema = new Schema(
  { postId: oid('Post', { required: true }), userId: oid('User', { required: true }) },
  { timestamps: { createdAt: true, updatedAt: false } },
);
likeSchema.index({ postId: 1, userId: 1 }, { unique: true });
likeSchema.index({ userId: 1, postId: 1 });

export const Like = mongoose.model('Like', likeSchema);
