import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { api, setup, teardown, signup, createPet } from './helpers.js';

const { env } = await import('../src/config/env.js');
const { User } = await import('../src/models/User.js');
const { Challenge, ChallengeEntry } = await import('../src/models/Challenge.js');

env.enforceMembership = false; // payments have their own tests; this file is about challenges

before(setup);
after(teardown);

const day = (offset = 0) => DateTime.now().setZone('Asia/Tokyo').plus({ days: offset }).toISODate();
const makeAdmin = async () => { const a = await signup(); await User.updateOne({ _id: a.user.id }, { $set: { role: 'admin' } }); return a; };
const body = (over = {}) => ({ title: 'Weekly Walking Challenge', description: 'Walk as far as you can', metric: 'distance_km', startsOn: day(-1), endsOn: day(5), published: true, ...over });
const post = async (admin, over) => (await api().post('/v1/admin/challenges').set(admin.auth).send(body(over)));
const join = (u, id) => api().post(`/v1/challenges/${id}/join`).set(u.auth);
const log = (u, id, b = {}) => api().post(`/v1/challenges/${id}/entries`).set(u.auth).send(b);
const board = (u, id, q = '') => api().get(`/v1/challenges/${id}/leaderboard${q}`).set(u.auth);

describe('admin posts challenges', () => {
  test('only admins can post; drafts are invisible until published; metric defaults fill the safety caps', async () => {
    const admin = await makeAdmin();
    const member = await signup();
    assert.equal((await api().post('/v1/admin/challenges').set(member.auth).send(body())).status, 403);
    assert.equal((await api().get('/v1/admin/challenges').set(member.auth)).status, 403);

    const draft = (await post(admin, { published: false })).body.challenge;
    assert.equal(draft.published, false);
    assert.deepEqual([draft.maxPerEntry, draft.dailyCap], [30, 30], 'distance defaults');
    assert.equal(draft.status, 'active');
    assert.equal((await api().get('/v1/challenges').set(member.auth)).body.items.some((c) => c.id === draft.id), false);
    assert.equal((await api().get(`/v1/challenges/${draft.id}`).set(member.auth)).status, 404);
    assert.ok((await api().get('/v1/admin/challenges').set(admin.auth)).body.items.some((c) => c.id === draft.id), 'admin sees drafts');

    await api().patch(`/v1/admin/challenges/${draft.id}`).set(admin.auth).send({ published: true });
    assert.equal((await api().get(`/v1/challenges/${draft.id}`).set(member.auth)).status, 200);
    assert.ok((await api().get('/v1/challenges').set(member.auth)).body.items.some((c) => c.id === draft.id));
  });

  test('validation: dates, length, metric, species', async () => {
    const admin = await makeAdmin();
    assert.equal((await post(admin, { endsOn: day(-3) })).status, 400);
    assert.equal((await post(admin, { endsOn: day(40) })).status, 400, 'longer than a month');
    assert.equal((await post(admin, { metric: 'steps_per_second' })).status, 400);
    assert.equal((await post(admin, { species: [] })).status, 400);
    assert.equal((await post(admin, { title: 'x' })).status, 400);
    const act = (await post(admin, { metric: 'activity_minutes' })).body.challenge;
    assert.deepEqual([act.maxPerEntry, act.dailyCap], [240, 360]);
    const days = (await post(admin, { metric: 'active_days' })).body.challenge;
    assert.deepEqual([days.maxPerEntry, days.dailyCap], [1, 1]);
  });

  test('edit, lock metric after entries, delete', async () => {
    const admin = await makeAdmin();
    const u = await signup();
    const c = (await post(admin)).body.challenge;
    const edited = await api().patch(`/v1/admin/challenges/${c.id}`).set(admin.auth).send({ title: 'Renamed', goal: 20 });
    assert.deepEqual([edited.body.challenge.title, edited.body.challenge.goal, edited.body.challenge.metric], ['Renamed', 20, 'distance_km']);
    assert.equal((await api().patch(`/v1/admin/challenges/${c.id}`).set(admin.auth).send({ endsOn: day(-9), startsOn: day(-9) })).status, 200);
    await api().patch(`/v1/admin/challenges/${c.id}`).set(admin.auth).send({ startsOn: day(-1), endsOn: day(5) });

    await join(u, c.id);
    await log(u, c.id, { value: 3 });
    assert.equal((await api().patch(`/v1/admin/challenges/${c.id}`).set(admin.auth).send({ metric: 'check_ins' })).status, 400);
    assert.equal((await api().patch(`/v1/admin/challenges/${c.id}`).set(admin.auth).send({ unknownField: 1 })).status, 400);

    assert.equal((await api().delete(`/v1/admin/challenges/${c.id}`).set(admin.auth)).status, 204);
    assert.equal((await api().get(`/v1/challenges/${c.id}`).set(u.auth)).status, 404);
  });
});

describe('finding and joining challenges', () => {
  test('status filters follow the Tokyo calendar and are sorted sensibly', async () => {
    const admin = await makeAdmin();
    const u = await signup();
    const active = (await post(admin, { title: 'Active one', startsOn: day(0), endsOn: day(6) })).body.challenge;
    const soon = (await post(admin, { title: 'Upcoming one', startsOn: day(2), endsOn: day(8) })).body.challenge;
    const over = (await post(admin, { title: 'Ended one', startsOn: day(-12), endsOn: day(-6) })).body.challenge;
    const ids = async (s) => (await api().get(`/v1/challenges?status=${s}`).set(u.auth)).body.items.map((c) => c.id);
    assert.ok((await ids('active')).includes(active.id));
    assert.ok(!(await ids('active')).includes(soon.id) && !(await ids('active')).includes(over.id));
    assert.ok((await ids('upcoming')).includes(soon.id));
    assert.ok((await ids('ended')).includes(over.id));
    assert.deepEqual([active.status, soon.status, over.status], ['active', 'upcoming', 'ended']);
    assert.equal((await ids('all')).length >= 3, true);
    // first/last day are inclusive
    const edge = (await post(admin, { startsOn: day(-3), endsOn: day(0) })).body.challenge;
    assert.equal(edge.status, 'active');
  });

  test('join is idempotent and counts once; ended challenges cannot be joined', async () => {
    const admin = await makeAdmin();
    const [a, b] = [await signup(), await signup()];
    const c = (await post(admin)).body.challenge;
    assert.equal((await join(a, c.id)).body.challenge.participantCount, 1);
    assert.equal((await join(a, c.id)).body.challenge.participantCount, 1);
    assert.equal((await join(b, c.id)).body.challenge.participantCount, 2);
    assert.equal((await api().get(`/v1/challenges/${c.id}`).set(a.auth)).body.challenge.joined, true);
    const over = (await post(admin, { startsOn: day(-9), endsOn: day(-4) })).body.challenge;
    assert.equal((await join(a, over.id)).status, 400);
  });

  test('single-species challenges need an eligible pet', async () => {
    const admin = await makeAdmin();
    const noPets = await signup();
    const dogOwner = await signup();
    await createPet(dogOwner);
    const cat = (await post(admin, { title: 'Indoor Paw Adventure', metric: 'activity_minutes', species: ['cat'] })).body.challenge;
    const res = await join(noPets, cat.id);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'no_eligible_pet');
    assert.equal((await join(dogOwner, cat.id)).status, 400, 'a dog is not a cat');
    const catOwner = await signup();
    await createPet(catOwner, { name: 'Momo', species: 'cat' });
    assert.equal((await join(catOwner, cat.id)).status, 200);
  });
});

describe('logging activity', () => {
  test('distance sums, and every rule that keeps the leaderboard honest', async () => {
    const admin = await makeAdmin();
    const u = await signup();
    const dog = await createPet(u);
    const other = await signup();
    const otherPet = await createPet(other);
    const c = (await post(admin, { dailyCap: 20, startsOn: day(-9), endsOn: day(5) })).body.challenge;

    assert.equal((await log(u, c.id, { value: 3 })).status, 403, 'must join first');
    await join(u, c.id);

    const first = await log(u, c.id, { value: 3.26, petId: dog.id });
    assert.equal(first.status, 201);
    assert.equal(first.body.entry.value, 3.3, 'rounded to 0.1');
    assert.equal(first.body.entry.species, 'dog');
    assert.equal((await log(u, c.id, { value: 5 })).body.myScore, 8.3);

    assert.equal((await log(u, c.id, { value: 31 })).body.error.code, 'entry_too_large');
    assert.equal((await log(u, c.id, { value: 0 })).status, 400);
    assert.equal((await log(u, c.id, {})).status, 400, 'distance needs a value');
    assert.equal((await log(u, c.id, { value: 15 })).body.error.code, 'daily_cap', '8.3 + 15 > 20 today');
    assert.equal((await log(u, c.id, { value: 11.7 })).status, 201, 'exactly up to the cap is fine');

    assert.equal((await log(u, c.id, { value: 1, loggedOn: day(1) })).status, 400, 'future');
    assert.equal((await log(u, c.id, { value: 1, loggedOn: day(-8) })).status, 400, 'older than 7 days');
    assert.equal((await log(u, c.id, { value: 4, loggedOn: day(-2) })).status, 201, 'back-dating a missed day is allowed');
    assert.equal((await log(u, c.id, { value: 1, petId: otherPet.id })).status, 404, 'not my pet');

    const mine = (await api().get(`/v1/challenges/${c.id}/entries`).set(u.auth)).body.items;
    assert.equal(mine.length, 4);
    assert.equal((await api().get(`/v1/challenges/${c.id}`).set(u.auth)).body.challenge.myScore, 24);

    const del = mine.find((e) => e.value === 4);
    assert.equal((await api().delete(`/v1/challenges/${c.id}/entries/${del.id}`).set(u.auth)).status, 204);
    assert.equal((await api().delete(`/v1/challenges/${c.id}/entries/${del.id}`).set(u.auth)).status, 404);
    assert.equal((await api().delete(`/v1/challenges/${c.id}/entries/${mine[0].id}`).set(other.auth)).status, 404, 'cannot delete someone else’s entry');
    assert.equal((await api().get(`/v1/challenges/${c.id}`).set(u.auth)).body.challenge.myScore, 20);
  });

  test('before it starts / after it ends nothing can be logged', async () => {
    const admin = await makeAdmin();
    const u = await signup();
    const soon = (await post(admin, { startsOn: day(2), endsOn: day(8) })).body.challenge;
    await join(u, soon.id); // pre-joining is fine
    assert.equal((await log(u, soon.id, { value: 1 })).status, 400);
    const live = (await post(admin, { startsOn: day(-2), endsOn: day(3) })).body.challenge;
    await join(u, live.id);
    const e = (await log(u, live.id, { value: 2 })).body.entry;
    await Challenge.updateOne({ _id: live.id }, { $set: { startsOn: day(-9), endsOn: day(-1) } }); // it ends
    assert.equal((await log(u, live.id, { value: 1, loggedOn: day(-1) })).status, 400);
    assert.equal((await api().delete(`/v1/challenges/${live.id}/entries/${e.id}`).set(u.auth)).status, 400, 'results are final');
  });

  test('active-days: one check-in per day; check-ins count 1 each up to a daily cap', async () => {
    const admin = await makeAdmin();
    const u = await signup();
    const days = (await post(admin, { metric: 'active_days', title: 'Walk every day' })).body.challenge;
    await join(u, days.id);
    assert.equal((await log(u, days.id, { value: 99 })).body.entry.value, 1, 'value is ignored');
    const again = await log(u, days.id, {});
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'already_logged');
    assert.equal((await log(u, days.id, { loggedOn: day(-1) })).body.myScore, 2, 'a different day counts');
    // removing a check-in frees that day again
    const todays = (await api().get(`/v1/challenges/${days.id}/entries`).set(u.auth)).body.items.find((e) => e.loggedOn === day(0));
    assert.equal((await api().delete(`/v1/challenges/${days.id}/entries/${todays.id}`).set(u.auth)).status, 204);
    assert.equal((await log(u, days.id, {})).status, 201, 'can check in again after removing it');

    const friends = (await post(admin, { metric: 'check_ins', title: 'Make a new friend', dailyCap: 2 })).body.challenge;
    await join(u, friends.id);
    assert.equal((await log(u, friends.id, { value: 50 })).body.entry.value, 1);
    assert.equal((await log(u, friends.id, {})).body.myScore, 2);
    assert.equal((await log(u, friends.id, {})).body.error.code, 'daily_cap');
  });

  test('species-restricted challenges require a matching pet on every entry', async () => {
    const admin = await makeAdmin();
    const owner = await signup();
    const dog = await createPet(owner);
    const cat = await createPet(owner, { name: 'Momo', species: 'cat' });
    const c = (await post(admin, { metric: 'activity_minutes', species: ['cat'] })).body.challenge;
    await join(owner, c.id);
    assert.equal((await log(owner, c.id, { value: 20 })).status, 400, 'must say which pet');
    assert.equal((await log(owner, c.id, { value: 20, petId: dog.id })).status, 400, 'a dog is not eligible');
    const ok = await log(owner, c.id, { value: 20, petId: cat.id });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.entry.species, 'cat');
  });
});

describe('leaderboards', () => {
  test('ranks, ties, species split, "where am I" below the top, and exclusion of suspended members', async () => {
    const admin = await makeAdmin();
    const c = (await post(admin, { dailyCap: 100, maxPerEntry: 100 })).body.challenge;
    const people = [];
    for (const [name, km, species] of [['Ann', 20, 'dog'], ['Ben', 12, 'dog'], ['Cy', 12, 'cat'], ['Di', 5, 'cat'], ['Ed', 1, 'dog']]) {
      const u = await signup({ displayName: name });
      const pet = await createPet(u, { name: `${name}'s pet`, species });
      await join(u, c.id);
      await log(u, c.id, { value: km, petId: pet.id });
      people.push(u);
    }
    const [ann, ben, cy, di, ed] = people;

    const all = (await board(ann, c.id)).body;
    assert.deepEqual(all.items.map((i) => [i.user.displayName, i.rank, i.score]), [['Ann', 1, 20], ['Ben', 2, 12], ['Cy', 2, 12], ['Di', 4, 5], ['Ed', 5, 1]]);
    assert.equal(all.items[0].isMe, true);
    assert.equal(all.me.rank, 1);
    assert.equal(all.items.find((i) => i.user.displayName === 'Ben').user.id, ben.user.id, 'earlier to reach the score is listed first');

    const dogs = (await board(ann, c.id, '?species=dog')).body;
    assert.deepEqual(dogs.items.map((i) => i.user.displayName), ['Ann', 'Ben', 'Ed']);
    const cats = (await board(cy, c.id, '?species=cat')).body;
    assert.deepEqual(cats.items.map((i) => [i.user.displayName, i.rank]), [['Cy', 1], ['Di', 2]]);

    // limited view still tells me where I am
    const tight = (await board(ed, c.id, '?limit=2')).body;
    assert.equal(tight.items.length, 2);
    assert.deepEqual([tight.me.rank, tight.me.score, tight.me.isMe], [5, 1, true]);
    const nobody = await signup();
    assert.equal((await board(nobody, c.id)).body.me, null, 'not on the board yet');

    await User.updateOne({ _id: di.user.id }, { $set: { status: 'suspended' } });
    assert.ok(!(await board(ann, c.id)).body.items.some((i) => i.user.displayName === 'Di'));
  });

  test('local scope uses my prefecture; community scope is members-only', async () => {
    const admin = await makeAdmin();
    const c = (await post(admin)).body.challenge;
    const tokyoA = await signup({ displayName: 'TokyoA' });
    const tokyoB = await signup({ displayName: 'TokyoB' });
    const osaka = await signup({ displayName: 'Osaka' });
    for (const [u, pref] of [[tokyoA, '13'], [tokyoB, '13'], [osaka, '27']]) {
      await api().patch('/v1/me').set(u.auth).send({ profile: { prefecture: pref } });
      await join(u, c.id);
    }
    await log(tokyoA, c.id, { value: 5 }); await log(tokyoB, c.id, { value: 9 }); await log(osaka, c.id, { value: 30 });

    const local = (await board(tokyoA, c.id, '?scope=local')).body;
    assert.deepEqual(local.items.map((i) => i.user.displayName), ['TokyoB', 'TokyoA']);
    assert.equal(local.prefecture, '13');
    assert.deepEqual((await board(tokyoA, c.id, '?scope=local&prefecture=27')).body.items.map((i) => i.user.displayName), ['Osaka'], 'can look at another area');
    const noArea = await signup();
    assert.equal((await board(noArea, c.id, '?scope=local')).status, 400);

    const club = (await api().post('/v1/communities').set(tokyoA.auth).send({ name: 'Walk Club' })).body.community;
    await api().post(`/v1/communities/${club.id}/join`).set(tokyoB.auth);
    const inClub = (await board(tokyoB, c.id, `?scope=community&communityId=${club.id}`)).body;
    assert.deepEqual(inClub.items.map((i) => i.user.displayName), ['TokyoB', 'TokyoA']);
    assert.equal((await board(osaka, c.id, `?scope=community&communityId=${club.id}`)).status, 403, 'outsiders can’t see a community board');
    assert.equal((await board(tokyoA, c.id, '?scope=community')).status, 400);
  });

  test('an admin can remove a suspicious entry and the board updates; ended boards stay readable', async () => {
    const admin = await makeAdmin();
    const [cheat, honest] = [await signup({ displayName: 'Cheat' }), await signup({ displayName: 'Honest' })];
    const c = (await post(admin)).body.challenge;
    for (const u of [cheat, honest]) await join(u, c.id);
    await log(honest, c.id, { value: 10 });
    const big = (await log(cheat, c.id, { value: 29 })).body.entry;
    assert.equal((await board(honest, c.id)).body.items[0].user.displayName, 'Cheat');

    assert.equal((await api().delete(`/v1/admin/challenge-entries/${big.id}`).set(honest.auth)).status, 403);
    const review = (await api().get(`/v1/admin/challenges/${c.id}/entries`).set(admin.auth)).body;
    assert.equal(review.items[0].value, 29, 'biggest first, easy to spot');
    assert.equal(review.items[0].displayName, 'Cheat', 'names the person, so it can be actioned');
    assert.equal(review.participants, 2);
    assert.equal((await api().delete(`/v1/admin/challenge-entries/${big.id}`).set(admin.auth)).status, 204);
    assert.equal((await board(honest, c.id)).body.items[0].user.displayName, 'Honest');
    assert.equal(await ChallengeEntry.countDocuments({ challengeId: c.id, deletedAt: null }), 1);

    await Challenge.updateOne({ _id: c.id }, { $set: { startsOn: day(-9), endsOn: day(-2) } });
    const final = (await board(honest, c.id)).body;
    assert.equal(final.challenge.status, 'ended');
    assert.equal(final.items[0].user.displayName, 'Honest');
  });
});

describe('membership and account deletion', () => {
  test('challenges are part of the paid community: locked without a membership', async () => {
    const admin = await makeAdmin();
    const c = (await post(admin)).body.challenge;
    env.enforceMembership = true;
    try {
      const free = await signup();
      for (const path of ['/v1/challenges', `/v1/challenges/${c.id}`, `/v1/challenges/${c.id}/leaderboard`]) {
        const res = await api().get(path).set(free.auth);
        assert.equal(res.status, 402, path);
        assert.equal(res.body.error.code, 'membership_required');
      }
      assert.equal((await join(free, c.id)).status, 402);
      assert.equal((await api().get(`/v1/challenges/${c.id}`).set(admin.auth)).status, 200, 'operators are never locked out');
    } finally {
      env.enforceMembership = false;
    }
  });

  test('deleting an account removes its entries from the board and the participant count', async () => {
    const admin = await makeAdmin();
    const c = (await post(admin)).body.challenge;
    const [stay, leave] = [await signup({ displayName: 'Stay' }), await signup({ displayName: 'Leave' })];
    for (const u of [stay, leave]) await join(u, c.id);
    await log(stay, c.id, { value: 2 });
    await log(leave, c.id, { value: 8 });
    const exp = await api().get('/v1/me/export').set(leave.auth);
    assert.equal(exp.body.challenges.entries.length, 1);

    assert.equal((await api().delete('/v1/me').set(leave.auth).send({ password: leave.password })).status, 204);
    const after = (await board(stay, c.id)).body;
    assert.deepEqual(after.items.map((i) => i.user.displayName), ['Stay']);
    assert.equal((await api().get(`/v1/challenges/${c.id}`).set(stay.auth)).body.challenge.participantCount, 1);
  });
});
