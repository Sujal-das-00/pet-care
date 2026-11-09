import { test, before, after, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { api, setup, teardown, signup, createPet } from './helpers.js';

const { env, parsePriceNim } = await import('../src/config/env.js');
const nimiq = await import('../src/services/nimiqService.js');
const { PaymentIntent } = await import('../src/models/PaymentIntent.js');
const { Membership } = await import('../src/models/Membership.js');
const { Notification } = await import('../src/models/Notification.js');
const { User } = await import('../src/models/User.js');

const MERCHANT = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'; // valid checksum
const OTHER = 'NQ81 C01N BASE 0000 0000 0000 0000 0000 0000'; // valid, but not ours

env.enforceMembership = true;
env.nimiq.receiveAddress = MERCHANT;
env.nimiq.rpcUrl = 'http://fake-node.invalid';
env.nimiq.minConfirmations = 2;
env.membership.priceLuna = 100_000; // 1 NIM
env.membership.days = 0; // one-time

/* ---- a fake Nimiq node ---- */
let chain = [];
let rpcCalls = [];
nimiq.setNimiqRpc(async (method, params) => {
  rpcCalls.push(method);
  if (method === 'getTransactionByHash') {
    const tx = chain.find((t) => t.hash === params[0]);
    if (!tx) { const e = new Error('Internal error'); e.rpc = { code: -32603, message: 'Internal error', data: `Transaction not found: ${params[0]}` }; throw e; }
    return tx;
  }
  if (method === 'getTransactionsByAddress') return chain.filter((t) => t.to === params[0] || t.from === params[0]).slice(0, params[1]);
  throw new Error(`unexpected rpc ${method}`);
});
let n = 0;
const addTx = ({ to = MERCHANT, value = 100_000, data = '', confirmations = 5, executionResult = true } = {}) => {
  n += 1;
  const tx = {
    hash: n.toString(16).padStart(64, 'a'), blockNumber: 1000 + n, timestamp: Date.now(), confirmations, size: 48,
    from: OTHER, fromType: 0, to, toType: 0, value, fee: 0, senderData: '',
    recipientData: Buffer.from(data, 'utf8').toString('hex'), flags: data ? 2 : 0, networkId: 24, executionResult,
  };
  chain.push(tx);
  return tx;
};

before(setup);
after(teardown);
beforeEach(() => { chain = []; rpcCalls = []; });

const intentFor = async (u) => (await api().post('/v1/membership/nimiq/intents').set(u.auth)).body.intent;
const verify = (u, intent, body = {}) => api().post(`/v1/membership/nimiq/intents/${intent.id}/verify`).set(u.auth).send(body);
const LOCKED = ['/v1/communities', '/v1/feed', '/v1/events', '/v1/event-ideas'];

describe('nimiq helpers', () => {
  test('address checksum validation', () => {
    assert.equal(nimiq.isValidAddress(MERCHANT), true);
    assert.equal(nimiq.isValidAddress(OTHER), true);
    assert.equal(nimiq.isValidAddress('nq07 0000 0000 0000 0000 0000 0000 0000 0000'), true, 'case and spacing are normalised');
    assert.equal(nimiq.isValidAddress('NQ08 0000 0000 0000 0000 0000 0000 0000 0000'), false, 'bad check digits');
    assert.equal(nimiq.isValidAddress('NQ07 0000'), false);
    assert.equal(nimiq.isValidAddress(''), false);
  });

  test('references are short, unique and fit in the 64-byte message limit', () => {
    const refs = new Set(Array.from({ length: 500 }, nimiq.newReference));
    assert.equal(refs.size, 500);
    assert.ok([...refs].every((r) => /^PAW-[2-9A-HJ-NP-Z]{12}$/.test(r) && Buffer.byteLength(r) <= 64));
  });

  test('verifyTransaction checks recipient, amount, reference, execution and confirmations', () => {
    const intent = { recipient: MERCHANT, amountLuna: 100_000, reference: 'PAW-TEST' };
    const good = { to: MERCHANT, value: 100_000, recipientData: Buffer.from('PAW-TEST').toString('hex'), confirmations: 2, executionResult: true };
    assert.deepEqual(nimiq.verifyTransaction(good, intent, 2), { ok: true, confirmations: 2 });
    assert.equal(nimiq.verifyTransaction({ ...good, value: 250_000 }, intent, 2).ok, true, 'overpaying is fine');
    assert.equal(nimiq.verifyTransaction({ ...good, to: OTHER }, intent, 2).reason, 'wrong_recipient');
    assert.equal(nimiq.verifyTransaction({ ...good, value: 99_999 }, intent, 2).reason, 'amount_too_low');
    assert.equal(nimiq.verifyTransaction({ ...good, recipientData: '' }, intent, 2).reason, 'wrong_reference');
    assert.equal(nimiq.verifyTransaction({ ...good, recipientData: Buffer.from('PAW-OTHER').toString('hex') }, intent, 2).reason, 'wrong_reference');
    assert.equal(nimiq.verifyTransaction({ ...good, executionResult: false }, intent, 2).reason, 'transaction_failed');
    const early = nimiq.verifyTransaction({ ...good, confirmations: 1 }, intent, 2);
    assert.deepEqual([early.ok, early.pending, early.reason], [false, true, 'awaiting_confirmations']);
    assert.equal(nimiq.verifyTransaction(null, intent, 2).pending, true);
  });
});

describe('price configuration', () => {
  test('MEMBERSHIP_PRICE_NIM is parsed into Luna and bad values are refused', () => {
    assert.deepEqual(parsePriceNim(undefined), { nim: 1, luna: 100_000 });
    assert.deepEqual(parsePriceNim(''), { nim: 1, luna: 100_000 });
    assert.deepEqual(parsePriceNim('2.5'), { nim: 2.5, luna: 250_000 });
    assert.deepEqual(parsePriceNim('0.00001'), { nim: 0.00001, luna: 1 });
    assert.deepEqual(parsePriceNim(' 10 '), { nim: 10, luna: 1_000_000 });
    for (const bad of ['0', '-1', 'abc', '1,5', '1.123456', '1e3', 'free']) assert.throws(() => parsePriceNim(bad), /MEMBERSHIP_PRICE_NIM/, bad);
  });

  test('the configured price is what members are asked for, and what the server accepts', async () => {
    const saved = env.membership.priceLuna;
    env.membership.priceLuna = parsePriceNim('2.5').luna;
    try {
      const u = await signup();
      const info = (await api().get('/v1/membership').set(u.auth)).body;
      assert.deepEqual([info.price.luna, info.price.nim], [250_000, 2.5]);
      const intent = await intentFor(u);
      assert.deepEqual([intent.amountLuna, intent.amountNim], [250_000, 2.5]);
      assert.match(intent.uri, /amount=2\.5&/);

      const tooLittle = addTx({ value: 100_000, data: intent.reference }); // the old 1 NIM price
      const r = await verify(u, intent, { txHash: tooLittle.hash });
      assert.equal(r.status, 400);
      assert.equal(r.body.error.details.reason, 'amount_too_low');

      const enough = addTx({ value: 250_000, data: intent.reference });
      assert.equal((await verify(u, intent, { txHash: enough.hash })).body.status, 'paid');
    } finally {
      env.membership.priceLuna = saved;
    }
  });

  test('changing the price never strands someone mid-payment, and new requests use the new price', async () => {
    const saved = env.membership.priceLuna;
    const u = await signup();
    const oldIntent = await intentFor(u); // issued at 1 NIM
    env.membership.priceLuna = 300_000; // operator raises the price to 3 NIM
    try {
      const fresh = await intentFor(u);
      assert.notEqual(fresh.id, oldIntent.id, 'a request at the old price is not reused');
      assert.equal(fresh.amountLuna, 300_000);
      const tx = addTx({ value: 100_000, data: oldIntent.reference });
      assert.equal((await verify(u, oldIntent, { txHash: tx.hash })).body.status, 'paid', 'the price they were quoted is honoured');
    } finally {
      env.membership.priceLuna = saved;
    }
  });
});

describe('the paywall', () => {
  test('free accounts are locked out of every community endpoint but keep pet care', async () => {
    const u = await signup();
    for (const path of LOCKED) {
      const res = await api().get(path).set(u.auth);
      assert.equal(res.status, 402, path);
      assert.equal(res.body.error.code, 'membership_required', path);
    }
    assert.equal((await api().post('/v1/communities').set(u.auth).send({ name: 'Sneaky' })).status, 402);
    assert.equal((await api().get('/v1/posts/6af0aec6fdacfc3e38a9cb78').set(u.auth)).status, 402);

    assert.equal((await createPet(u)).name, 'Coco', 'pet care is never gated');
    assert.equal((await api().get('/v1/home').set(u.auth)).status, 200);
    const info = (await api().get('/v1/membership').set(u.auth)).body;
    assert.equal(info.plan, 'explorer');
    assert.equal(info.features.community, false);
    assert.equal(info.features.petCare, true);
    assert.deepEqual([info.price.luna, info.price.nim, info.price.oneTime], [100_000, 1, true]);
    assert.equal(info.nimiq.enabled, true);
    assert.equal(info.nimiq.recipient, MERCHANT);
  });

  test('after access lapses a member can still leave groups, withdraw from events, report and block', async () => {
    const { grantMembership } = await import('../src/services/entitlementService.js');
    const host = await signup();
    const guest = await signup();
    await grantMembership(host.user.id, { source: 'admin' });
    await grantMembership(guest.user.id, { source: 'admin' });
    const c = (await api().post('/v1/communities').set(host.auth).send({ name: 'Lapse Test' })).body.community;
    await api().post(`/v1/communities/${c.id}/join`).set(guest.auth);
    const e = (await api().post('/v1/events').set(host.auth).send({
      title: 'Lapse Walk', startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), endsAt: new Date(Date.now() + 3 * 86_400_000 + 3_600_000).toISOString(),
      place: { name: 'Yoyogi Park' }, publicPlaceConfirmed: true,
    })).body.event;
    await api().put(`/v1/events/${e.id}/rsvp`).set(guest.auth).send({});

    await Membership.updateOne({ userId: guest.user.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await api().get(`/v1/communities/${c.id}`).set(guest.auth)).status, 402, 'locked');
    assert.equal((await api().get('/v1/blocks').set(guest.auth)).status, 200);
    assert.equal((await api().post('/v1/blocks').set(guest.auth).send({ userId: host.user.id })).status, 204);
    assert.equal((await api().delete(`/v1/events/${e.id}/rsvp`).set(guest.auth)).status, 200);
    assert.equal((await api().delete(`/v1/communities/${c.id}/join`).set(guest.auth)).status, 204);

    const fresh = (await api().get(`/v1/communities/${c.id}`).set(host.auth)).body.community;
    assert.equal(fresh.memberCount, 1);
  });

  test('payments are reported unavailable (503) when no receiving address is configured', async () => {
    const u = await signup();
    const saved = env.nimiq.receiveAddress;
    env.nimiq.receiveAddress = '';
    try {
      assert.equal((await api().get('/v1/membership').set(u.auth)).body.nimiq.enabled, false);
      const res = await api().post('/v1/membership/nimiq/intents').set(u.auth);
      assert.equal(res.status, 503);
      assert.equal(res.body.error.code, 'payments_unavailable');
      env.nimiq.receiveAddress = 'NQ08 0000 0000 0000 0000 0000 0000 0000 0000'; // typo'd address must also be refused
      assert.equal((await api().post('/v1/membership/nimiq/intents').set(u.auth)).status, 503);
    } finally {
      env.nimiq.receiveAddress = saved;
    }
  });
});

describe('paying 1 NIM', () => {
  test('intent -> pay -> verify unlocks community, and is idempotent', async () => {
    const u = await signup();
    const intent = await intentFor(u);
    assert.equal(intent.amountLuna, 100_000);
    assert.equal(intent.amountNim, 1);
    assert.equal(intent.recipient, MERCHANT);
    assert.match(intent.reference, /^PAW-/);
    assert.match(intent.uri, /^nimiq:NQ07\w+\?amount=1&message=PAW-/);
    assert.equal((await intentFor(u)).id, intent.id, 'a fresh pending intent is reused, not duplicated');
    assert.equal(await PaymentIntent.countDocuments({ userId: u.user.id }), 1);

    // nothing on chain yet
    let r = await verify(u, intent);
    assert.equal(r.body.status, 'pending');
    assert.equal((await api().get('/v1/communities').set(u.auth)).status, 402, 'still locked');

    // the wallet's transaction exists but is not confirmed enough
    const tx = addTx({ data: intent.reference, confirmations: 1 });
    r = await verify(u, intent, { txHash: tx.hash });
    assert.deepEqual([r.body.status, r.body.reason, r.body.confirmations, r.body.needed], ['pending', 'awaiting_confirmations', 1, 2]);
    assert.equal((await api().get('/v1/communities').set(u.auth)).status, 402, 'unconfirmed payments do not unlock anything');

    tx.confirmations = 3;
    r = await verify(u, intent, { txHash: tx.hash });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'paid');
    assert.equal(r.body.membership.expiresAt, null, 'one-time payment = lifetime access');

    for (const path of LOCKED) assert.equal((await api().get(path).set(u.auth)).status, 200, path);
    const info = (await api().get('/v1/membership').set(u.auth)).body;
    assert.equal(info.plan, 'club');
    assert.equal(info.features.community, true);
    assert.equal((await api().get('/v1/me/entitlements').set(u.auth)).body.plan, 'club');

    const m = await Membership.findOne({ userId: u.user.id });
    assert.deepEqual([m.source, m.totalPaidLuna, m.lastTxHash], ['nimiq', 100_000, tx.hash]);
    assert.equal(await Notification.countDocuments({ userId: u.user.id, category: 'system' }), 1);

    // verifying again, or asking to pay again, changes nothing
    assert.equal((await verify(u, intent, { txHash: tx.hash })).body.status, 'paid');
    assert.equal((await Membership.findOne({ userId: u.user.id })).totalPaidLuna, 100_000);
    assert.equal((await api().post('/v1/membership/nimiq/intents').set(u.auth)).status, 409);
  });

  test('works without a hash: the server finds the payment by its reference', async () => {
    const u = await signup();
    const intent = await intentFor(u);
    addTx({ data: 'PAW-SOMEONEELSE' }); // unrelated payment to us
    addTx({ to: OTHER, data: intent.reference }); // right message, wrong recipient
    assert.equal((await verify(u, intent)).body.status, 'pending');
    addTx({ data: intent.reference });
    assert.equal((await verify(u, intent)).body.status, 'paid');
    assert.ok(rpcCalls.includes('getTransactionsByAddress'));
  });

  test('rejects payments that do not match the request', async () => {
    const u = await signup();
    const intent = await intentFor(u);
    const cases = [
      [{ to: OTHER, data: intent.reference }, 'wrong_recipient'],
      [{ value: 50_000, data: intent.reference }, 'amount_too_low'],
      [{ value: 100_000, data: 'PAW-WRONGREF0000' }, 'wrong_reference'],
      [{ value: 100_000, data: '' }, 'wrong_reference'],
      [{ data: intent.reference, executionResult: false }, 'transaction_failed'],
    ];
    for (const [over, reason] of cases) {
      const tx = addTx(over);
      const res = await verify(u, intent, { txHash: tx.hash });
      assert.equal(res.status, 400, reason);
      assert.equal(res.body.error.code, 'payment_invalid');
      assert.equal(res.body.error.details.reason, reason);
    }
    assert.equal((await api().get('/v1/communities').set(u.auth)).status, 402, 'none of them unlocked access');
    assert.equal((await verify(u, intent, { txHash: 'not-a-hash' })).status, 400);
  });

  test('overpaying is accepted; paying late (after the request expired) is still honoured', async () => {
    const u = await signup();
    const intent = await intentFor(u);
    await PaymentIntent.updateOne({ _id: intent.id }, { $set: { expiresAt: new Date(Date.now() - 3600_000) } });
    const tx = addTx({ value: 300_000, data: intent.reference });
    const res = await verify(u, intent, { txHash: tx.hash });
    assert.equal(res.body.status, 'paid');
    assert.equal((await Membership.findOne({ userId: u.user.id })).totalPaidLuna, 300_000);
  });

  test('someone else cannot use my payment, my request, or a replayed transaction', async () => {
    const alice = await signup();
    const bob = await signup();
    const aIntent = await intentFor(alice);
    const bIntent = await intentFor(bob);
    const aTx = addTx({ data: aIntent.reference });

    assert.equal((await verify(bob, aIntent)).status, 404, 'cannot verify another user’s request');
    const steal = await verify(bob, bIntent, { txHash: aTx.hash });
    assert.equal(steal.status, 400, 'Alice’s transaction carries Alice’s reference, not Bob’s');
    assert.equal(steal.body.error.details.reason, 'wrong_reference');
    assert.equal((await api().get('/v1/communities').set(bob.auth)).status, 402);

    assert.equal((await verify(alice, aIntent, { txHash: aTx.hash })).body.status, 'paid');

    // Database-level guarantee: one transaction can only ever fund one request.
    await assert.rejects(PaymentIntent.create({
      userId: bob.user.id, network: 'mainnet', recipient: MERCHANT, amountLuna: 100_000, reference: 'PAW-REPLAYTEST01',
      status: 'paid', txHash: aTx.hash, expiresAt: new Date(),
    }), { code: 11000 });
  });

  test('concurrent verifications grant access once', async () => {
    const u = await signup();
    const intent = await intentFor(u);
    const tx = addTx({ data: intent.reference });
    const results = await Promise.all(Array.from({ length: 6 }, () => verify(u, intent, { txHash: tx.hash })));
    assert.ok(results.every((r) => r.status === 200 && r.body.status === 'paid'));
    assert.equal((await Membership.findOne({ userId: u.user.id })).totalPaidLuna, 100_000);
    assert.equal(await Notification.countDocuments({ userId: u.user.id, category: 'system' }), 1);
  });

  test('a node outage is a 502, not a false unlock', async () => {
    const u = await signup();
    const intent = await intentFor(u);
    nimiq.setNimiqRpc(async () => { throw new (await import('../src/utils/errors.js')).HttpError(502, 'payment_provider_unavailable', 'down'); });
    try {
      assert.equal((await verify(u, intent)).status, 502);
      assert.equal((await api().get('/v1/communities').set(u.auth)).status, 402);
    } finally {
      nimiq.setNimiqRpc(async (m, p) => {
        if (m === 'getTransactionByHash') { const t = chain.find((x) => x.hash === p[0]); if (t) return t; const e = new Error('x'); e.rpc = { data: 'Transaction not found' }; throw e; }
        return chain;
      });
    }
  });
});

describe('membership lifecycle', () => {
  test('timed access expires; platform admins are never locked out; comped access works', async () => {
    const { grantMembership } = await import('../src/services/entitlementService.js');
    const u = await signup();
    await grantMembership(u.user.id, { source: 'admin', days: 30 });
    assert.equal((await api().get('/v1/communities').set(u.auth)).status, 200);
    const m = await Membership.findOne({ userId: u.user.id });
    assert.ok(Math.abs(m.expiresAt - (Date.now() + 30 * 86_400_000)) < 5000);

    await Membership.updateOne({ userId: u.user.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await api().get('/v1/communities').set(u.auth)).status, 402, 'lapsed');
    assert.equal((await createPet(u)).name, 'Coco', 'pet care survives a lapse');

    await grantMembership(u.user.id, { source: 'admin', days: 0 });
    assert.equal((await api().get('/v1/communities').set(u.auth)).status, 200);

    const admin = await signup();
    assert.equal((await api().get('/v1/communities').set(admin.auth)).status, 402);
    await User.updateOne({ _id: admin.user.id }, { $set: { role: 'admin' } });
    assert.equal((await api().get('/v1/communities').set(admin.auth)).status, 200, 'operators can moderate');
  });

  test('account deletion removes the membership and detaches payment records from the person', async () => {
    const u = await signup();
    const intent = await intentFor(u);
    const tx = addTx({ data: intent.reference });
    await verify(u, intent, { txHash: tx.hash });
    const exp = await api().get('/v1/me/export').set(u.auth);
    assert.equal(exp.body.membership.source, 'nimiq');
    assert.equal(exp.body.payments.length, 1);

    assert.equal((await api().delete('/v1/me').set(u.auth).send({ password: u.password })).status, 204);
    assert.equal(await Membership.countDocuments({ userId: u.user.id }), 0);
    const kept = await PaymentIntent.findById(intent.id).lean();
    assert.equal(kept.userId, null);
    assert.equal(kept.txHash, tx.hash, 'kept for accounting, without any link to a person');
  });
});
