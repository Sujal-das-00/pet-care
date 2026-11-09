import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import { api, app, setup, teardown, signup } from './helpers.js';

const { env } = await import('../src/config/env.js');
const { User } = await import('../src/models/User.js');
const { ChatMessage } = await import('../src/models/ChatMessage.js');
const { attachChat } = await import('../src/realtime/chatHub.js');

env.enforceMembership = false;

let server;
let port;
before(async () => {
  await setup();
  server = http.createServer(app);
  attachChat(server);
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});
const sockets = [];
after(async () => {
  // Always close every client, even after a failed assertion, or the server can never shut down.
  sockets.forEach((w) => w.terminate());
  server.closeAllConnections?.();
  await new Promise((r) => { server.close(r); setTimeout(r, 3000).unref(); });
  await teardown();
});

const send = (u, room, text) => api().post(`/v1/chat/rooms/${encodeURIComponent(room)}/messages`).set(u.auth).send({ text });
const history = (u, room, q = '') => api().get(`/v1/chat/rooms/${encodeURIComponent(room)}/messages${q}`).set(u.auth);
const setArea = (u, code) => api().patch('/v1/me').set(u.auth).send({ profile: { prefecture: code } });
const makeAdmin = (u) => User.updateOne({ _id: u.user.id }, { $set: { role: 'admin' } });

/** A tiny WebSocket test client that queues everything it receives. */
function socket(token) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/chat/ws?token=${encodeURIComponent(token)}`);
  sockets.push(ws);
  const queue = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    const i = waiters.findIndex((w) => w.pred(m));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(m);
    else queue.push(m);
  });
  const closed = new Promise((r) => ws.on('close', (code) => r(code)));
  const next = (pred = () => true, ms = 6000) => { // generous: CI and busy laptops are slow
    const i = queue.findIndex(pred);
    if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const w = { pred, resolve };
      waiters.push(w);
      setTimeout(() => { const j = waiters.indexOf(w); if (j >= 0) { waiters.splice(j, 1); reject(new Error('timed out waiting for a websocket message')); } }, ms);
    });
  };
  const quiet = async (pred, ms = 300) => { await new Promise((r) => setTimeout(r, ms)); return !queue.some(pred); };
  const opened = new Promise((r) => ws.on('open', r));
  return { ws, next, quiet, closed, opened, join: (room) => ws.send(JSON.stringify({ type: 'join', room })), close: () => ws.close() };
}

describe('rooms and access rules', () => {
  test('everyone has Global; Local appears once an area is set; Community rooms follow memberships', async () => {
    const u = await signup();
    let rooms = (await api().get('/v1/chat/rooms').set(u.auth)).body.items;
    assert.deepEqual(rooms.map((r) => r.room), ['global']);

    await setArea(u, '13');
    const club = (await api().post('/v1/communities').set(u.auth).send({ name: 'Chat Club', emoji: '🐕' })).body.community;
    rooms = (await api().get('/v1/chat/rooms').set(u.auth)).body.items;
    assert.deepEqual(rooms.map((r) => [r.room, r.type, r.title]), [['global', 'global', 'Everyone'], ['local:13', 'local', 'Tokyo'], [`community:${club.id}`, 'community', 'Chat Club']]);
    assert.equal(rooms[0].lastMessage, null);

    await send(u, 'global', 'hello world');
    rooms = (await api().get('/v1/chat/rooms').set(u.auth)).body.items;
    assert.equal(rooms[0].lastMessage.text, 'hello world');
  });

  test('you can only enter your own area and your own communities', async () => {
    const [tokyo, osaka, outsider] = [await signup(), await signup(), await signup()];
    await setArea(tokyo, '13'); await setArea(osaka, '27');
    const club = (await api().post('/v1/communities').set(tokyo.auth).send({ name: 'Tokyo Only' })).body.community;

    assert.equal((await send(tokyo, 'local:13', 'hi tokyo')).status, 201);
    assert.equal((await send(osaka, 'local:13', 'sneaking in')).status, 403);
    assert.equal((await history(osaka, 'local:13')).status, 403);
    assert.equal((await send(outsider, 'local:13', 'no area set')).status, 403);
    assert.equal((await send(outsider, `community:${club.id}`, 'not a member')).status, 403);
    assert.equal((await history(outsider, `community:${club.id}`)).status, 403);
    assert.equal((await send(tokyo, `community:${club.id}`, 'members only')).status, 201);

    for (const bad of ['nope', 'local:99', 'local:1', 'community:xyz', 'community:000000000000000000000000']) {
      assert.equal((await send(tokyo, bad, 'x')).status, 404, bad);
    }
  });

  test('chat belongs to the paid community: locked without a membership', async () => {
    env.enforceMembership = true;
    try {
      const free = await signup();
      assert.equal((await api().get('/v1/chat/rooms').set(free.auth)).status, 402);
      assert.equal((await send(free, 'global', 'hi')).status, 402);
      assert.equal((await history(free, 'global')).status, 402);
    } finally {
      env.enforceMembership = false;
    }
  });
});

describe('messages', () => {
  test('send, read newest-first with pagination, authors shown by name only', async () => {
    const [a, b] = [await signup({ displayName: 'Ann' }), await signup({ displayName: 'Ben' })];
    await setArea(a, '14'); await setArea(b, '14');
    for (let i = 1; i <= 5; i += 1) await send(i % 2 ? a : b, 'local:14', `message ${i}`);

    const p1 = (await history(a, 'local:14', '?limit=2')).body;
    assert.deepEqual(p1.items.map((m) => m.text), ['message 5', 'message 4']);
    assert.equal(p1.items[0].author.displayName, 'Ann');
    assert.equal(JSON.stringify(p1).includes('@example.com'), false);
    assert.equal(p1.room.title, 'Kanagawa');
    const p2 = (await history(a, 'local:14', `?limit=2&cursor=${p1.nextCursor}`)).body;
    assert.deepEqual(p2.items.map((m) => m.text), ['message 3', 'message 2']);
    const p3 = (await history(a, 'local:14', `?limit=2&cursor=${p2.nextCursor}`)).body;
    assert.deepEqual(p3.items.map((m) => m.text), ['message 1']);
    assert.equal(p3.nextCursor, null);
  });

  test('validation and spam controls', async () => {
    const u = await signup();
    assert.equal((await send(u, 'global', '   ')).status, 400);
    assert.equal((await send(u, 'global', 'x'.repeat(501))).status, 400);
    assert.equal((await send(u, 'global', '  trimmed  ')).body.message.text, 'trimmed');

    const dup = await send(u, 'global', 'trimmed');
    assert.equal(dup.status, 429);
    assert.equal(dup.body.error.code, 'duplicate');

    // a per-minute budget stops floods
    await ChatMessage.insertMany(Array.from({ length: 20 }, (_, i) => ({ room: 'global', authorId: u.user.id, text: `flood ${i}` })));
    const flood = await send(u, 'global', 'one more');
    assert.equal(flood.status, 429);
    assert.equal(flood.body.error.code, 'slow_down');
  });

  test('delete: own messages, community admins in their room, platform admins anywhere', async () => {
    const [owner, member, stranger, admin] = [await signup(), await signup(), await signup(), await signup()];
    await makeAdmin(admin);
    const club = (await api().post('/v1/communities').set(owner.auth).send({ name: 'Del Club' })).body.community;
    await api().post(`/v1/communities/${club.id}/join`).set(member.auth);
    const room = `community:${club.id}`;
    const del = (u, r, id) => api().delete(`/v1/chat/rooms/${encodeURIComponent(r)}/messages/${id}`).set(u.auth);

    const m1 = (await send(member, room, 'my own words')).body.message;
    assert.equal((await del(member, room, m1.id)).status, 204, 'author');
    assert.equal((await del(member, room, m1.id)).status, 404);
    assert.equal((await history(owner, room)).body.items.length, 0);

    const m2 = (await send(member, room, 'moderate me')).body.message;
    assert.equal((await del(stranger, room, m2.id)).status, 403, 'non-members are refused outright');
    const m3 = (await send(owner, room, 'owner says')).body.message;
    assert.equal((await del(member, room, m3.id)).status, 403, 'a regular member cannot delete others');
    assert.equal((await del(owner, room, m2.id)).status, 204, 'community admin');

    const g = (await send(stranger, 'global', 'global words')).body.message;
    assert.equal((await del(member, 'global', g.id)).status, 403);
    assert.equal((await del(admin, 'global', g.id)).status, 204, 'platform admin');
  });

  test('blocked people disappear from history, and three reports auto-hide a message', async () => {
    const [a, b, r1, r2, r3] = [await signup(), await signup(), await signup(), await signup(), await signup()];
    await send(b, 'global', 'from b');
    assert.ok((await history(a, 'global')).body.items.some((m) => m.text === 'from b'));
    await api().post('/v1/blocks').set(a.auth).send({ userId: b.user.id });
    assert.ok(!(await history(a, 'global')).body.items.some((m) => m.text === 'from b'));
    assert.ok((await history(r1, 'global')).body.items.some((m) => m.text === 'from b'), 'others still see it');

    const bad = (await send(b, 'global', 'buy cheap stuff now')).body.message;
    const report = (u) => api().post('/v1/reports').set(u.auth).send({ targetType: 'message', targetId: bad.id, reason: 'spam' });
    assert.equal((await report(b)).status, 400, 'no self reports');
    for (const u of [r1, r2]) await report(u);
    assert.ok((await history(r3, 'global')).body.items.some((m) => m.id === bad.id), 'two reports: still visible');
    await report(r3);
    assert.ok(!(await history(r3, 'global')).body.items.some((m) => m.id === bad.id), 'three reports: hidden');
  });
});

describe('live delivery over WebSocket', () => {
  test('rejects missing / invalid tokens', async () => {
    const bad = socket('not-a-token');
    assert.equal(await bad.closed, 4401);
    const none = socket('');
    assert.equal(await none.closed, 4401);
  });

  test('members joined to a room receive messages instantly; others do not', async () => {
    const [a, b, c] = [await signup({ displayName: 'Ann' }), await signup({ displayName: 'Ben' }), await signup()];
    for (const u of [a, b, c]) await setArea(u, '13');
    await setArea(c, '27'); // c lives elsewhere

    const sa = socket(a.accessToken); await sa.opened; await sa.next((m) => m.type === 'ready');
    const sc = socket(c.accessToken); await sc.opened; await sc.next((m) => m.type === 'ready');

    sa.join('local:13');
    assert.equal((await sa.next((m) => m.type === 'joined')).room, 'local:13');
    sc.join('local:13');
    const err = await sc.next((m) => m.type === 'error');
    assert.equal(err.code, 'forbidden', 'wrong area can’t subscribe');
    sc.join('global');
    await sc.next((m) => m.type === 'joined');

    assert.equal((await send(b, 'local:13', 'hello Tokyo')).status, 201);
    const got = await sa.next((m) => m.type === 'message');
    assert.deepEqual([got.message.text, got.message.author.displayName, got.message.room], ['hello Tokyo', 'Ben', 'local:13']);
    assert.ok(await sc.quiet((m) => m.type === 'message'), 'the Osaka user, not in that room, received nothing');

    // deletes are pushed too
    const del = await api().delete(`/v1/chat/rooms/${encodeURIComponent('local:13')}/messages/${got.message.id}`).set(b.auth);
    assert.equal(del.status, 204);
    assert.equal((await sa.next((m) => m.type === 'deleted')).id, got.message.id);

    sa.ws.send(JSON.stringify({ type: 'ping' }));
    assert.equal((await sa.next((m) => m.type === 'pong')).type, 'pong');
    sa.close(); sc.close();
  });

  test('a join sent the instant the socket opens (before the server finished authenticating) is not lost', async () => {
    const u = await signup();
    for (let i = 0; i < 8; i += 1) {
      const s = socket(u.accessToken);
      s.ws.on('open', () => s.join('global')); // no waiting for "ready"
      assert.equal((await s.next((m) => m.type === 'joined')).room, 'global', `attempt ${i + 1}`);
      s.close();
    }
  });

  test('a person who blocked the author never receives their live messages', async () => {
    const [a, b, c] = [await signup(), await signup(), await signup()];
    await api().post('/v1/blocks').set(a.auth).send({ userId: b.user.id });
    const sa = socket(a.accessToken); const sc = socket(c.accessToken);
    await Promise.all([sa.opened, sc.opened]);
    sa.join('global'); sc.join('global');
    await sa.next((m) => m.type === 'joined'); await sc.next((m) => m.type === 'joined');
    await send(b, 'global', 'blocked voice');
    assert.equal((await sc.next((m) => m.type === 'message')).message.text, 'blocked voice');
    assert.ok(await sa.quiet((m) => m.type === 'message'), 'blocker is not sent it');
    sa.close(); sc.close();
  });

  test('without a membership a socket may connect but cannot join rooms', async () => {
    const free = await signup();
    env.enforceMembership = true;
    try {
      const s = socket(free.accessToken);
      await s.opened;
      s.join('global');
      assert.equal((await s.next((m) => m.type === 'error')).code, 'membership_required');
      s.ws.send('this is not json');
      assert.equal((await s.next((m) => m.type === 'error')).code, 'bad_message');
      s.close();
    } finally {
      env.enforceMembership = false;
    }
  });
});
