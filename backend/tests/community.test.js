import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { api, setup, teardown, signup, createPet } from './helpers.js';

const { Community } = await import('../src/models/Community.js');
const { Event } = await import('../src/models/Event.js');
const { Reminder } = await import('../src/models/Reminder.js');
const { Notification } = await import('../src/models/Notification.js');
const { User } = await import('../src/models/User.js');
const { Post } = await import('../src/models/Post.js');
const { env } = await import('../src/config/env.js');

// These tests exercise community behaviour itself; the paywall has its own file (membership.test.js).
env.enforceMembership = false;

before(setup);
after(teardown);

const mkCommunity = async (u, over = {}) =>
  (await api().post('/v1/communities').set(u.auth).send({ name: 'Tokyo Dog Lovers', species: 'dog', prefecture: '13', ...over })).body.community;
const join = (u, id) => api().post(`/v1/communities/${id}/join`).set(u.auth);
const inDays = (d, hours = 2) => ({
  startsAt: new Date(Date.now() + d * 86_400_000).toISOString(),
  endsAt: new Date(Date.now() + d * 86_400_000 + hours * 3_600_000).toISOString(),
});
const eventBody = (over = {}) => ({
  title: 'Monthly Paw Walk', ...inDays(3), place: { name: 'Yoyogi Park', prefecture: '13' }, publicPlaceConfirmed: true, ...over,
});
const mkEvent = async (u, over) => (await api().post('/v1/events').set(u.auth).send(eventBody(over)));
const makeAdmin = (u) => User.updateOne({ _id: u.user.id }, { $set: { role: 'admin' } });

describe('profile location', () => {
  test('prefecture must be a JIS code, not free text', async () => {
    const u = await signup();
    assert.equal((await api().patch('/v1/me').set(u.auth).send({ profile: { prefecture: 'Tokyo-ish' } })).status, 400);
    const ok = await api().patch('/v1/me').set(u.auth).send({ profile: { prefecture: '13' } });
    assert.equal(ok.body.user.profile.prefecture, '13');
  });
});

describe('communities', () => {
  test('create makes the creator admin; join/leave are idempotent and keep counts right', async () => {
    const a = await signup();
    const b = await signup();
    const c = await mkCommunity(a);
    assert.equal(c.myRole, 'admin');
    assert.equal(c.memberCount, 1);

    assert.equal((await join(b, c.id)).body.community.memberCount, 2);
    assert.equal((await join(b, c.id)).body.community.memberCount, 2, 'joining twice does not double count');
    assert.equal((await api().get(`/v1/communities/${c.id}`).set(b.auth)).body.community.myRole, 'member');

    assert.equal((await api().delete(`/v1/communities/${c.id}/join`).set(b.auth)).status, 204);
    assert.equal((await api().delete(`/v1/communities/${c.id}/join`).set(b.auth)).status, 204);
    assert.equal((await api().get(`/v1/communities/${c.id}`).set(a.auth)).body.community.memberCount, 1);
  });

  test('admin leaving promotes the longest-standing member; last one out closes it', async () => {
    const a = await signup();
    const b = await signup();
    const c = await mkCommunity(a);
    await join(b, c.id);
    await api().delete(`/v1/communities/${c.id}/join`).set(a.auth);
    assert.equal((await api().get(`/v1/communities/${c.id}`).set(b.auth)).body.community.myRole, 'admin');
    await api().delete(`/v1/communities/${c.id}/join`).set(b.auth);
    assert.equal((await api().get(`/v1/communities/${c.id}`).set(b.auth)).status, 404);
  });

  test('discovery: popular, nearby (by prefecture), mine, and safe search', async () => {
    const a = await signup();
    const b = await signup();
    const tokyo = await mkCommunity(a, { name: 'Tokyo Shiba Fans', prefecture: '13', kind: 'breed', breed: 'Shiba Inu' });
    await mkCommunity(a, { name: 'Osaka Cats', prefecture: '27', species: 'cat' });
    await join(b, tokyo.id);

    assert.equal((await api().get('/v1/communities?scope=nearby').set(b.auth)).body.needsLocation, true);
    await api().patch('/v1/me').set(b.auth).send({ profile: { prefecture: '27' } });
    const near = await api().get('/v1/communities?scope=nearby').set(b.auth);
    assert.deepEqual(near.body.items.map((x) => x.name), ['Osaka Cats']);

    const mine = await api().get('/v1/communities?scope=mine').set(b.auth);
    assert.deepEqual(mine.body.items.map((x) => x.name), ['Tokyo Shiba Fans']);
    assert.equal(mine.body.items[0].myRole, 'member');

    const search = await api().get('/v1/communities?q=shiba').set(b.auth);
    assert.equal(search.body.items.length, 1);
    assert.equal((await api().get(`/v1/communities?q=${encodeURIComponent('(((')}`).set(b.auth)).status, 200, 'regex chars are escaped');
    assert.equal((await api().get('/v1/communities?species=cat').set(b.auth)).body.items.every((x) => x.species !== 'dog'), true);
  });

  test('only the admin edits; creators are capped at 3 communities', async () => {
    const a = await signup();
    const b = await signup();
    const c = await mkCommunity(a);
    await join(b, c.id);
    assert.equal((await api().patch(`/v1/communities/${c.id}`).set(b.auth).send({ description: 'x' })).status, 403);
    const ok = await api().patch(`/v1/communities/${c.id}`).set(a.auth).send({ description: 'Walks every Sunday' });
    assert.equal(ok.body.community.description, 'Walks every Sunday');
    assert.equal(ok.body.community.name, 'Tokyo Dog Lovers', 'partial update keeps other fields');
    await mkCommunity(a, { name: 'Second' });
    await mkCommunity(a, { name: 'Third' });
    assert.equal((await api().post('/v1/communities').set(a.auth).send({ name: 'Fourth' })).status, 400);
  });
});

describe('posts, comments, likes', () => {
  test('members post; non-members cannot; feed, likes, comments and counters work', async () => {
    const a = await signup();
    const b = await signup();
    const c = await mkCommunity(a);
    const pet = await createPet(a);

    assert.equal((await api().post(`/v1/communities/${c.id}/posts`).set(b.auth).send({ text: 'hi' })).status, 403);
    assert.equal((await api().post(`/v1/communities/${c.id}/posts`).set(a.auth).send({ text: '   ' })).status, 400);
    const stranger = await api().post(`/v1/communities/${c.id}/posts`).set(a.auth).send({ text: 'x', petId: (await createPet(b)).id });
    assert.equal(stranger.status, 404, "can't post as someone else's pet");

    const p = await api().post(`/v1/communities/${c.id}/posts`).set(a.auth).send({ text: 'Morning walk! 🐾', petId: pet.id });
    assert.equal(p.status, 201);
    assert.equal(p.body.post.pet.name, 'Coco');
    assert.equal(p.body.post.author.displayName, a.user.profile.displayName);
    assert.equal(p.body.post.community.name, 'Tokyo Dog Lovers');
    const id = p.body.post.id;

    await join(b, c.id);
    assert.equal((await api().put(`/v1/posts/${id}/like`).set(b.auth)).body.likeCount, 1);
    assert.equal((await api().put(`/v1/posts/${id}/like`).set(b.auth)).body.likeCount, 1, 'idempotent');
    assert.equal((await api().put(`/v1/posts/${id}/like`).set(a.auth)).body.likeCount, 2);
    assert.equal((await api().delete(`/v1/posts/${id}/like`).set(b.auth)).body.likeCount, 1);

    const cm = await api().post(`/v1/posts/${id}/comments`).set(b.auth).send({ text: 'Cute!' });
    assert.equal(cm.status, 201);
    const view = await api().get(`/v1/posts/${id}`).set(b.auth);
    assert.equal(view.body.post.commentCount, 1);
    assert.equal(view.body.post.liked, false);
    assert.equal((await api().get(`/v1/posts/${id}`).set(a.auth)).body.post.liked, true);

    // feed: members see their communities' posts; a newcomer with no groups gets the discovery feed
    assert.equal((await api().get('/v1/feed').set(b.auth)).body.items.length, 1);
    const newcomer = await signup();
    const disc = await api().get('/v1/feed').set(newcomer.auth);
    assert.equal(disc.body.source, 'discover');
    assert.equal(disc.body.items.length, 1);

    // only author / moderators delete
    assert.equal((await api().delete(`/v1/posts/${id}/comments/${cm.body.comment.id}`).set(a.auth)).status, 204, 'community admin can remove a comment');
    assert.equal((await api().get(`/v1/posts/${id}`).set(a.auth)).body.post.commentCount, 0);
    assert.equal((await api().delete(`/v1/posts/${id}`).set(b.auth)).status, 403);
    assert.equal((await api().delete(`/v1/posts/${id}`).set(a.auth)).status, 204);
    assert.equal((await api().get(`/v1/posts/${id}`).set(a.auth)).status, 404);
    assert.equal((await api().get(`/v1/communities/${c.id}`).set(a.auth)).body.community.postCount, 0);
  });

  test('keyset pagination over posts', async () => {
    const a = await signup();
    const c = await mkCommunity(a);
    for (let i = 0; i < 5; i += 1) await api().post(`/v1/communities/${c.id}/posts`).set(a.auth).send({ text: `post ${i}` });
    const p1 = await api().get(`/v1/communities/${c.id}/posts?limit=2`).set(a.auth);
    assert.deepEqual(p1.body.items.map((x) => x.text), ['post 4', 'post 3']);
    const p2 = await api().get(`/v1/communities/${c.id}/posts?limit=2&cursor=${p1.body.nextCursor}`).set(a.auth);
    assert.deepEqual(p2.body.items.map((x) => x.text), ['post 2', 'post 1']);
    const p3 = await api().get(`/v1/communities/${c.id}/posts?limit=2&cursor=${p2.body.nextCursor}`).set(a.auth);
    assert.deepEqual(p3.body.items.map((x) => x.text), ['post 0']);
    assert.equal(p3.body.nextCursor, null);
  });
});

describe('safety: block, report, auto-hide, moderation', () => {
  test('blocking hides a user’s posts and comments both ways', async () => {
    const a = await signup();
    const b = await signup();
    const c = await mkCommunity(a);
    await join(b, c.id);
    await api().post(`/v1/communities/${c.id}/posts`).set(b.auth).send({ text: 'from b' });
    assert.equal((await api().get(`/v1/communities/${c.id}/posts`).set(a.auth)).body.items.length, 1);

    assert.equal((await api().post('/v1/blocks').set(a.auth).send({ userId: b.user.id })).status, 204);
    assert.equal((await api().post('/v1/blocks').set(a.auth).send({ userId: a.user.id })).status, 400, 'cannot block yourself');
    assert.equal((await api().get(`/v1/communities/${c.id}/posts`).set(a.auth)).body.items.length, 0);
    assert.equal((await api().get(`/v1/communities/${c.id}/posts`).set(b.auth)).body.items.length, 1, 'b still sees own post');
    assert.equal((await api().get('/v1/blocks').set(a.auth)).body.items[0].userId, b.user.id);

    await api().delete(`/v1/blocks/${b.user.id}`).set(a.auth);
    assert.equal((await api().get(`/v1/communities/${c.id}/posts`).set(a.auth)).body.items.length, 1);
  });

  test('three distinct reports auto-hide a post; admin can dismiss to release it', async () => {
    const author = await signup();
    const c = await mkCommunity(author);
    const post = (await api().post(`/v1/communities/${c.id}/posts`).set(author.auth).send({ text: 'spammy' })).body.post;
    const reporters = [await signup(), await signup(), await signup()];

    assert.equal((await api().post('/v1/reports').set(author.auth).send({ targetType: 'post', targetId: post.id, reason: 'spam' })).status, 400, 'no self-reports');
    const first = { targetType: 'post', targetId: post.id, reason: 'spam' };
    assert.equal((await api().post('/v1/reports').set(reporters[0].auth).send(first)).status, 201);
    assert.equal((await api().post('/v1/reports').set(reporters[0].auth).send(first)).body.duplicate, true, 'same reporter twice counts once');
    await api().post('/v1/reports').set(reporters[1].auth).send(first);
    assert.equal((await api().get(`/v1/communities/${c.id}/posts`).set(author.auth)).body.items.length, 1, 'two reports: still visible');
    await api().post('/v1/reports').set(reporters[2].auth).send(first);
    assert.equal((await api().get(`/v1/communities/${c.id}/posts`).set(reporters[0].auth)).body.items.length, 0, 'three reports: hidden');

    const admin = await signup();
    assert.equal((await api().get('/v1/admin/reports').set(admin.auth)).status, 403, 'normal users cannot read the queue');
    await makeAdmin(admin);
    const queue = await api().get('/v1/admin/reports').set(admin.auth);
    const report = queue.body.items.find((r) => r.targetId === post.id);
    assert.equal(report.target.text, 'spammy');
    assert.equal((await api().post(`/v1/admin/reports/${report.id}/resolve`).set(admin.auth).send({ action: 'dismiss' })).status, 200);
    assert.equal((await api().get(`/v1/communities/${c.id}/posts`).set(reporters[0].auth)).body.items.length, 1, 'dismissed: visible again');
    assert.equal((await api().get('/v1/admin/reports').set(admin.auth)).body.items.filter((r) => r.targetId === post.id).length, 0);
  });

  test('admin hide on a user suspends them and ends their sessions', async () => {
    const admin = await signup();
    await makeAdmin(admin);
    const bad = await signup();
    const rep = await signup();
    await api().post('/v1/reports').set(rep.auth).send({ targetType: 'user', targetId: bad.user.id, reason: 'harassment' });
    const q = await api().get('/v1/admin/reports').set(admin.auth);
    const r = q.body.items.find((x) => x.targetId === bad.user.id);
    await api().post(`/v1/admin/reports/${r.id}/resolve`).set(admin.auth).send({ action: 'hide' });
    assert.equal((await api().get('/v1/me').set(bad.auth)).status, 403);
    assert.equal((await api().post('/v1/auth/refresh').send({ refreshToken: bad.refreshToken })).status, 401);
  });
});

describe('events', () => {
  test('hosting requires a public place and a future start; host is auto-going with a reminder', async () => {
    const h = await signup();
    assert.equal((await mkEvent(h, { publicPlaceConfirmed: false })).status, 400);
    assert.equal((await mkEvent(h, { startsAt: new Date(Date.now() - 3600_000).toISOString(), endsAt: new Date(Date.now() + 3600_000).toISOString() })).status, 400);
    assert.equal((await mkEvent(h, { ...inDays(3, 20) })).status, 400, 'max 12h');
    assert.equal((await mkEvent(h, { place: { name: 'Yoyogi Park', prefecture: '99' } })).status, 400);

    const res = await mkEvent(h, { description: 'Meet at the main gate' });
    assert.equal(res.status, 201);
    const e = res.body.event;
    assert.equal(e.goingCount, 1);
    assert.equal(e.myStatus, 'going');
    assert.equal(e.isHost, true);
    assert.equal(await Reminder.countDocuments({ sourceType: 'event', sourceId: e.id }), 1);
    assert.equal(e.host.displayName, h.user.profile.displayName);
  });

  test('RSVP: capacity is never exceeded under concurrency; leaving frees a seat; hosts cannot leave', async () => {
    const h = await signup();
    const e = (await mkEvent(h, { maxParticipants: 3 })).body.event; // host + 2 seats
    const guests = await Promise.all([1, 2, 3, 4, 5].map(() => signup()));
    const results = await Promise.all(guests.map((g) => api().put(`/v1/events/${e.id}/rsvp`).set(g.auth).send({})));
    const ok = results.filter((r) => r.status === 200).length;
    const full = results.filter((r) => r.status === 409 && r.body.error.code === 'event_full').length;
    assert.equal(ok, 2);
    assert.equal(full, 3);
    assert.equal((await Event.findById(e.id)).goingCount, 3);

    const winner = guests[results.findIndex((r) => r.status === 200)];
    const loser = guests[results.findIndex((r) => r.status === 409)];
    assert.equal((await api().delete(`/v1/events/${e.id}/rsvp`).set(winner.auth)).body.event.goingCount, 2);
    assert.equal((await api().delete(`/v1/events/${e.id}/rsvp`).set(winner.auth)).body.event.goingCount, 2, 'idempotent');
    assert.equal((await api().put(`/v1/events/${e.id}/rsvp`).set(loser.auth).send({})).status, 200, 'freed seat is available');
    assert.equal((await api().put(`/v1/events/${e.id}/rsvp`).set(loser.auth).send({})).body.event.goingCount, 3, 'double RSVP is a no-op');
    assert.equal((await api().delete(`/v1/events/${e.id}/rsvp`).set(h.auth)).status, 400);
    assert.equal(await Reminder.countDocuments({ ownerId: winner.user.id, sourceType: 'event' }), 0, 'leaving drops the reminder');
  });

  test('pet-type rules, participants list shows names only, blocked users hidden', async () => {
    const h = await signup();
    const e = (await mkEvent(h, { petTypes: ['dog'] })).body.event;
    const g = await signup();
    const cat = await createPet(g, { name: 'Momo', species: 'cat' });
    const dog = await createPet(g, { name: 'Coco' });
    assert.equal((await api().put(`/v1/events/${e.id}/rsvp`).set(g.auth).send({ petIds: [cat.id] })).status, 400);
    assert.equal((await api().put(`/v1/events/${e.id}/rsvp`).set(g.auth).send({ petIds: [dog.id] })).status, 200);

    const list = await api().get(`/v1/events/${e.id}/participants`).set(h.auth);
    const entry = list.body.items.find((x) => x.user.id === g.user.id);
    assert.deepEqual(entry.pets, [{ id: dog.id, name: 'Coco', species: 'dog' }]);
    assert.equal(JSON.stringify(list.body).includes(g.email), false, 'no emails leak');

    await api().post('/v1/blocks').set(h.auth).send({ userId: g.user.id });
    assert.equal((await api().get(`/v1/events/${e.id}/participants`).set(h.auth)).body.items.some((x) => x.user.id === g.user.id), false);
  });

  test('community events need membership; discovery scopes work', async () => {
    const h = await signup();
    const c = await mkCommunity(h);
    const outsider = await signup();
    assert.equal((await mkEvent(outsider, { communityId: c.id })).status, 403);
    const e = (await mkEvent(h, { communityId: c.id, category: 'dog_park' })).body.event;
    assert.equal(e.community.name, 'Tokyo Dog Lovers');

    const byCommunity = await api().get(`/v1/events?scope=community&communityId=${c.id}`).set(outsider.auth);
    assert.deepEqual(byCommunity.body.items.map((x) => x.id), [e.id]);
    assert.equal((await api().get('/v1/events?scope=community').set(outsider.auth)).status, 400);
    assert.equal((await api().get('/v1/communities/' + c.id).set(h.auth)).body.community.upcomingEvents, 1);

    assert.equal((await api().get('/v1/events?scope=nearby').set(outsider.auth)).body.needsLocation, true);
    await api().patch('/v1/me').set(outsider.auth).send({ profile: { prefecture: '13' } });
    assert.ok((await api().get('/v1/events?scope=nearby').set(outsider.auth)).body.items.some((x) => x.id === e.id));
    assert.equal((await api().get('/v1/events?prefecture=27').set(outsider.auth)).body.items.some((x) => x.id === e.id), false);
    assert.equal((await api().get('/v1/events?petType=cat').set(outsider.auth)).body.items.some((x) => x.id === e.id), true);

    await api().put(`/v1/events/${e.id}/rsvp`).set(outsider.auth).send({});
    assert.equal((await api().get('/v1/events?scope=mine').set(outsider.auth)).body.items.length, 1);
  });

  test('host edits, cancels (participants are notified), completes', async () => {
    const h = await signup();
    const g = await signup();
    const j = await signup();
    const e = (await mkEvent(h, { maxParticipants: 4 })).body.event;
    await api().put(`/v1/events/${e.id}/rsvp`).set(g.auth).send({});
    await api().put(`/v1/events/${e.id}/rsvp`).set(j.auth).send({});

    assert.equal((await api().patch(`/v1/events/${e.id}`).set(g.auth).send({ title: 'Hijack' })).status, 403);
    assert.equal((await api().patch(`/v1/events/${e.id}`).set(h.auth).send({ maxParticipants: 2 })).status, 400, 'below current attendance');
    const edit = await api().patch(`/v1/events/${e.id}`).set(h.auth).send({ description: 'Bring water', ...inDays(4) });
    assert.equal(edit.status, 200);
    const reminder = await Reminder.findOne({ ownerId: g.user.id, sourceType: 'event' });
    assert.ok(Math.abs(reminder.nextDueAt.getTime() - (new Date(edit.body.event.startsAt).getTime() - 2 * 3600_000)) < 1000, 'reminder moved with the event');

    assert.equal((await api().post(`/v1/events/${e.id}/complete`).set(h.auth).send({ attended: 3 })).status, 400, 'cannot complete before it starts');
    assert.equal((await api().post(`/v1/events/${e.id}/cancel`).set(g.auth).send({})).status, 403);
    const cancel = await api().post(`/v1/events/${e.id}/cancel`).set(h.auth).send({ reason: 'Rain' });
    assert.equal(cancel.body.event.status, 'cancelled');
    assert.equal(cancel.body.event.cancelReason, 'Rain');
    await new Promise((r) => setTimeout(r, 300)); // notifications are fire-and-forget
    assert.equal(await Reminder.countDocuments({ sourceType: 'event', sourceId: e.id }), 0);
    assert.equal((await Notification.findOne({ userId: g.user.id, category: 'events' }).sort({ createdAt: -1 })).body, 'This event was cancelled');
    assert.equal((await Notification.findOne({ userId: j.user.id, category: 'events' }).sort({ createdAt: -1 })).body, 'This event was cancelled');
    assert.equal((await api().put(`/v1/events/${e.id}/rsvp`).set((await signup()).auth).send({})).status, 400, 'closed');

    // completion: an event that already started
    const started = (await mkEvent(h)).body.event;
    await Event.updateOne({ _id: started.id }, { $set: { startsAt: new Date(Date.now() - 3600_000), endsAt: new Date(Date.now() + 3600_000) } });
    const done = await api().post(`/v1/events/${started.id}/complete`).set(h.auth).send({ attended: 7, note: 'Great turnout' });
    assert.equal(done.body.event.status, 'completed');
    assert.equal(done.body.event.completion.attended, 7);
  });

  test('hosts are limited to 10 upcoming events', async () => {
    const h = await signup();
    for (let i = 0; i < 10; i += 1) assert.equal((await mkEvent(h, { title: `Walk ${i}` })).status, 201);
    assert.equal((await mkEvent(h, { title: 'One too many' })).status, 400);
  });

  test('event ideas are published by admins and visible to members', async () => {
    const admin = await signup();
    const text = (title) => ({ title, concept: 'c', format: 'f', instructions: 'i', locationRequirements: 'l', photoSuggestions: 'p', safety: ['s'] });
    const body = { key: 'test-walk', category: 'monthly_paw_walk', emoji: '🐾', en: text('Monthly Walk') };
    assert.equal((await api().put('/v1/admin/event-ideas').set(admin.auth).send(body)).status, 403);
    await makeAdmin(admin);
    assert.equal((await api().put('/v1/admin/event-ideas').set(admin.auth).send(body)).status, 200);
    assert.equal((await api().put('/v1/admin/event-ideas').set(admin.auth).send({ ...body, suggestedDurationMinutes: 60 })).status, 200, 'upsert by key');

    const viewer = await signup();
    const list = (await api().get('/v1/event-ideas').set(viewer.auth)).body.items.filter((i) => i.key === 'test-walk');
    assert.equal(list.length, 1);
    assert.equal(list[0].title, 'Monthly Walk');
    assert.deepEqual(list[0].safety, ['s']);

    const withIdea = await mkEvent(viewer, { ideaId: list[0].id });
    assert.equal(withIdea.body.event.category, 'monthly_paw_walk', 'category inherited from the idea');
  });
});

describe('account deletion cleans up community footprint', () => {
  test('counters stay correct and hosted events are cancelled', async () => {
    const keeper = await signup();
    const leaver = await signup();
    const c = await mkCommunity(keeper);
    await join(leaver, c.id);
    const post = (await api().post(`/v1/communities/${c.id}/posts`).set(keeper.auth).send({ text: 'hello' })).body.post;
    await api().put(`/v1/posts/${post.id}/like`).set(leaver.auth);
    await api().post(`/v1/posts/${post.id}/comments`).set(leaver.auth).send({ text: 'nice' });
    await api().post(`/v1/communities/${c.id}/posts`).set(leaver.auth).send({ text: 'mine' });
    const hosted = (await mkEvent(leaver)).body.event;
    const other = (await mkEvent(keeper)).body.event;
    await api().put(`/v1/events/${other.id}/rsvp`).set(leaver.auth).send({});
    await api().put(`/v1/events/${hosted.id}/rsvp`).set(keeper.auth).send({});

    const exp = await api().get('/v1/me/export').set(leaver.auth);
    assert.equal(exp.body.community.posts.length, 1);
    assert.equal(exp.body.community.hostedEvents.length, 1);

    assert.equal((await api().delete('/v1/me').set(leaver.auth).send({ password: leaver.password })).status, 204);
    await new Promise((r) => setTimeout(r, 300));

    const comm = (await api().get(`/v1/communities/${c.id}`).set(keeper.auth)).body.community;
    assert.equal(comm.memberCount, 1);
    assert.equal(comm.postCount, 1);
    const p = (await api().get(`/v1/posts/${post.id}`).set(keeper.auth)).body.post;
    assert.equal(p.likeCount, 0);
    assert.equal(p.commentCount, 0);
    assert.equal((await Event.findById(hosted.id)).status, 'cancelled');
    assert.equal((await Event.findById(other.id)).goingCount, 1);
    assert.equal(await Post.countDocuments({ communityId: c.id, deletedAt: null }), 1);
    assert.equal(await Reminder.countDocuments({ sourceType: 'event', sourceId: hosted.id }), 0);
  });
});
