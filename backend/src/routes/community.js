import { Router } from 'express';
import * as communities from '../controllers/communityController.js';
import * as posts from '../controllers/postController.js';
import * as events from '../controllers/eventController.js';
import * as safety from '../controllers/safetyController.js';
import * as admin from '../controllers/adminController.js';
import * as challenges from '../controllers/challengeController.js';
import * as adminChallenges from '../controllers/adminChallengeController.js';
import * as chat from '../controllers/chatController.js';
import { validate } from '../middleware/validate.js';
import { requireAdmin } from '../middleware/auth.js';
import { requireFeature } from '../services/entitlementService.js';
import { idParams } from '../validators/common.js';
import * as v from '../validators/community.js';
import * as cv from '../validators/challenge.js';
import * as chv from '../validators/chat.js';

const r = Router();
const cid = idParams('communityId');
const eid = idParams('eventId');

/* ===== NOT gated: getting out and staying safe must always work, even after access lapses ===== */
r.delete('/communities/:communityId/join', validate({ params: cid }), communities.leave);
r.delete('/events/:eventId/rsvp', validate({ params: eid }), events.cancelRsvp);
r.post('/reports', validate({ body: v.createReportBody }), safety.createReport);
r.get('/blocks', safety.listBlocks);
r.post('/blocks', validate({ body: v.blockBody }), safety.blockUser);
r.delete('/blocks/:userId', validate({ params: idParams('userId') }), safety.unblockUser);

/* ===== platform operators (admin accounts only) ===== */
const a = Router();
a.use(requireAdmin);
a.get('/reports', validate({ query: v.adminListReportsQuery }), admin.listReports);
a.post('/reports/:reportId/resolve', validate({ params: idParams('reportId'), body: v.resolveReportBody }), admin.resolveReport);
a.put('/event-ideas', validate({ body: v.ideaBody }), admin.upsertIdea);
a.patch('/communities/:communityId', validate({ params: cid, body: v.adminCommunityBody }), admin.updateCommunityFlags);
a.post('/events/:eventId/feature', validate({ params: eid, body: v.featureEventBody }), admin.featureEvent);
// Weekly challenges are posted by the PawCircle team (no code deploy needed).
a.get('/challenges', adminChallenges.listAll);
a.post('/challenges', validate({ body: cv.createChallengeBody }), adminChallenges.create);
a.patch('/challenges/:challengeId', validate({ params: idParams('challengeId'), body: cv.updateChallengeBody }), adminChallenges.update);
a.delete('/challenges/:challengeId', validate({ params: idParams('challengeId') }), adminChallenges.remove);
a.get('/challenges/:challengeId/entries', validate({ params: idParams('challengeId') }), adminChallenges.listEntries);
a.delete('/challenge-entries/:entryId', validate({ params: idParams('entryId') }), adminChallenges.removeEntry);
r.use('/admin', a);

/* ===== everything below needs a membership (HTTP 402 `membership_required` otherwise) ===== */
r.use(requireFeature('community'));

/* ----- communities ----- */
r.get('/communities', validate({ query: v.listCommunitiesQuery }), communities.listCommunities);
r.post('/communities', validate({ body: v.createCommunityBody }), communities.createCommunity);
r.get('/communities/:communityId', validate({ params: cid }), communities.getCommunity);
r.patch('/communities/:communityId', validate({ params: cid, body: v.updateCommunityBody }), communities.updateCommunity);
r.delete('/communities/:communityId', validate({ params: cid }), communities.deleteCommunity);
r.post('/communities/:communityId/join', validate({ params: cid }), communities.join);
r.get('/communities/:communityId/members', validate({ params: cid, query: v.membersQuery }), communities.listMembers);
r.put('/communities/:communityId/members/:userId/role', validate({ params: idParams('communityId', 'userId'), body: v.setRoleBody }), communities.setMemberRole);

/* ----- posts ----- */
r.get('/feed', validate({ query: v.feedQuery }), posts.feed);
r.get('/communities/:communityId/posts', validate({ params: cid, query: v.feedQuery }), posts.listPosts);
r.post('/communities/:communityId/posts', validate({ params: cid, body: v.createPostBody }), posts.createPost);
const pid = idParams('postId');
r.get('/posts/:postId', validate({ params: pid }), posts.getPost);
r.delete('/posts/:postId', validate({ params: pid }), posts.deletePost);
r.put('/posts/:postId/like', validate({ params: pid }), posts.like);
r.delete('/posts/:postId/like', validate({ params: pid }), posts.unlike);
r.get('/posts/:postId/comments', validate({ params: pid }), posts.listComments);
r.post('/posts/:postId/comments', validate({ params: pid, body: v.createCommentBody }), posts.createComment);
r.delete('/posts/:postId/comments/:commentId', validate({ params: idParams('postId', 'commentId') }), posts.deleteComment);

/* ----- events ----- */
r.get('/event-ideas', events.listIdeas);
r.get('/event-ideas/:ideaId', validate({ params: idParams('ideaId') }), events.getIdea);
r.get('/events', validate({ query: v.listEventsQuery }), events.listEvents);
r.post('/events', validate({ body: v.createEventBody }), events.createEvent);
r.get('/events/:eventId', validate({ params: eid }), events.getEvent);
r.patch('/events/:eventId', validate({ params: eid, body: v.updateEventBody }), events.updateEvent);
r.post('/events/:eventId/cancel', validate({ params: eid, body: v.cancelEventBody }), events.cancelEvent);
r.post('/events/:eventId/complete', validate({ params: eid, body: v.completeEventBody }), events.completeEvent);
r.get('/events/:eventId/participants', validate({ params: eid }), events.listParticipants);
r.put('/events/:eventId/rsvp', validate({ params: eid, body: v.rsvpBody }), events.rsvp);

/* ----- challenges & leaderboards ----- */
const chId = idParams('challengeId');
r.get('/challenges', validate({ query: cv.listChallengesQuery }), challenges.listChallenges);
r.get('/challenges/:challengeId', validate({ params: chId }), challenges.getChallenge);
r.post('/challenges/:challengeId/join', validate({ params: chId }), challenges.joinChallenge);
r.get('/challenges/:challengeId/entries', validate({ params: chId }), challenges.listMyEntries);
r.post('/challenges/:challengeId/entries', validate({ params: chId, body: cv.entryBody }), challenges.addEntry);
r.delete('/challenges/:challengeId/entries/:entryId', validate({ params: idParams('challengeId', 'entryId') }), challenges.deleteMyEntry);
r.get('/challenges/:challengeId/leaderboard', validate({ params: chId, query: cv.leaderboardQuery }), challenges.getLeaderboard);

/* ----- chat (Everyone / Local / Community rooms) ----- */
r.get('/chat/rooms', chat.listRooms);
r.get('/chat/rooms/:room/messages', validate({ params: chv.roomParams, query: chv.messagesQuery }), chat.listMessages);
r.post('/chat/rooms/:room/messages', validate({ params: chv.roomParams, body: chv.sendMessageBody }), chat.postMessage);
r.delete('/chat/rooms/:room/messages/:messageId', validate({ params: chv.roomParams.extend({ messageId: idParams('messageId').shape.messageId }) }), chat.deleteMessage);

export default r;
