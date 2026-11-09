import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { api, setup, teardown } from './helpers.js';

const { env } = await import('../src/config/env.js');
const { User } = await import('../src/models/User.js');
const { AuthChallenge } = await import('../src/models/AuthChallenge.js');
const { addressFromPublicKey, verifySignedMessage } = await import('../src/services/nimiqAuthService.js');
const { isValidAddress } = await import('../src/services/nimiqService.js');

before(setup);
after(teardown);

/* ---- a wallet stand-in: real Ed25519 keys, signing the way Nimiq documents ---- */
const MSG_PREFIX = Buffer.from('\x16Nimiq Signed Message:\n', 'utf8');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest();
function wallet() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const sign = (message, scheme = 'nimiq-signed-message') => {
    const msg = Buffer.from(message, 'utf8');
    const prefixed = Buffer.concat([MSG_PREFIX, Buffer.from(String(msg.length)), msg]);
    const data = { 'nimiq-signed-message': sha256(prefixed), raw: msg, sha256: sha256(msg), prefixed }[scheme];
    return crypto.sign(null, data, privateKey).toString('hex');
  };
  return { publicKey: pub.toString('hex'), address: addressFromPublicKey(pub), sign };
}

const challenge = async () => (await api().post('/v1/auth/nimiq/challenge')).body.challenge;
async function signIn(w, over = {}, { scheme, message } = {}) {
  const c = over.challenge ?? (await challenge());
  return api().post('/v1/auth/nimiq/sign-in').send({
    challengeId: c.id, publicKey: w.publicKey, signature: w.sign(message ?? c.message, scheme),
    acceptTerms: true, acceptPrivacy: true, ...over.body,
  });
}

describe('wallet addresses', () => {
  test('derivation matches real mainnet public key / address pairs', () => {
    // Taken from real transactions: the public key in the proof, and the sender address the node reports.
    const real = [
      ['4b93586f7555e72b218bb522d66bf52d9c38b8396bd8bfd45c99c3c282c53ba1', 'NQ16 2SSN 82TL SMQS KXT3 Q01V CMAL NU6F 1LJG'],
      ['ef5ac7e9a5af96478d3c492abb2bc55ecf3196fa17d3813d9337c4c457250f0f', 'NQ49 N8MB XYCR XBUP 404C KXKK L49M A7BT F082'],
      ['8d2663e9477fdd4784b4470529fde33f9545c506d167a74de2bd8601f92ef1b8', 'NQ08 ACT8 T0FE PTG8 P5RL H2S3 QGXH V15R NVXY'],
    ];
    for (const [pub, address] of real) {
      assert.equal(addressFromPublicKey(Buffer.from(pub, 'hex')), address);
      assert.equal(isValidAddress(address), true);
    }
  });

  test('every generated wallet gets a valid, distinct address', () => {
    const seen = new Set();
    for (let i = 0; i < 50; i += 1) { const w = wallet(); assert.equal(isValidAddress(w.address), true); seen.add(w.address); }
    assert.equal(seen.size, 50);
  });
});

describe('signature verification', () => {
  test('accepts the documented Nimiq scheme and the plain variants, and reports the address from the key', () => {
    const w = wallet();
    for (const scheme of ['nimiq-signed-message', 'raw', 'sha256', 'prefixed']) {
      const r = verifySignedMessage({ message: 'hello nonce 123', publicKey: w.publicKey, signature: w.sign('hello nonce 123', scheme) });
      assert.deepEqual([r.ok, r.scheme, r.address], [true, scheme, w.address]);
    }
  });

  test('rejects the wrong message, the wrong key, a corrupted signature and malformed input', () => {
    const [a, b] = [wallet(), wallet()];
    const sig = a.sign('the real message');
    assert.equal(verifySignedMessage({ message: 'a different message', publicKey: a.publicKey, signature: sig }).ok, false);
    assert.equal(verifySignedMessage({ message: 'the real message', publicKey: b.publicKey, signature: sig }).ok, false, 'signed by A, claimed as B');
    const bad = sig.slice(0, -2) + (sig.endsWith('00') ? '01' : '00');
    assert.equal(verifySignedMessage({ message: 'the real message', publicKey: a.publicKey, signature: bad }).ok, false);
    for (const [publicKey, signature] of [['zz', sig], [a.publicKey, 'abcd'], [a.publicKey.slice(2), sig], [null, sig], [a.publicKey, undefined], ['00'.repeat(32), sig]]) {
      assert.equal(verifySignedMessage({ message: 'the real message', publicKey, signature }).ok, false);
    }
  });
});

describe('challenges', () => {
  test('are ASCII, one-time-nonce, bound to the domain and expire', async () => {
    const [c1, c2] = [await challenge(), await challenge()];
    assert.notEqual(c1.message, c2.message);
    assert.match(c1.message, /^Sign in to PawCircle\nDomain: [\w.:-]+\nNonce: [a-f0-9]{32}\nIssued: \d{4}-/);
    assert.ok(/^[\x20-\x7E\n]+$/.test(c1.message), 'ASCII only, so byte length equals character length in every signing scheme');
    assert.ok(new Date(c1.expiresAt) - Date.now() <= 5 * 60_000 + 1000);
    assert.ok(new Date(c1.expiresAt) - Date.now() > 60_000);
  });
});

describe('signing in', () => {
  test('first sign-in creates the account from the wallet; the next one signs back in to the same account', async () => {
    const w = wallet();
    const first = await signIn(w);
    assert.equal(first.status, 201);
    assert.equal(first.body.created, true);
    assert.equal(first.body.user.nimiqAddress, w.address);
    assert.equal(first.body.user.authMethod, 'nimiq');
    assert.equal(first.body.user.email, null);
    assert.ok(first.body.accessToken && first.body.refreshToken);
    assert.deepEqual(first.body.user.consents.map((c) => c.kind).sort(), ['marketing', 'privacy', 'terms']);

    const me = await api().get('/v1/me').set('Authorization', `Bearer ${first.body.accessToken}`);
    assert.equal(me.body.user.nimiqAddress, w.address);

    const again = await signIn(w, { body: { acceptTerms: false, acceptPrivacy: false } }); // returning users don't need to re-consent
    assert.equal(again.status, 200);
    assert.equal(again.body.created, false);
    assert.equal(again.body.user.id, first.body.user.id);
    assert.equal(await User.countDocuments({ 'nimiq.address': w.address }), 1);
  });

  test('works with every supported signing format', async () => {
    for (const scheme of ['nimiq-signed-message', 'raw', 'sha256', 'prefixed']) {
      assert.equal((await signIn(wallet(), {}, { scheme })).status, 201, scheme);
    }
  });

  test('a new account needs consent; nothing is created without it', async () => {
    const w = wallet();
    const res = await signIn(w, { body: { acceptTerms: false, acceptPrivacy: true } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'consent_required');
    assert.equal(await User.countDocuments({ 'nimiq.address': w.address }), 0);
    assert.equal((await signIn(w)).status, 201, 'and with consent it works');
  });

  test('the account is the address derived from the key, never one the client names', async () => {
    const [attacker, victim] = [wallet(), wallet()];
    await signIn(victim);
    const res = await signIn(attacker, { body: { address: victim.address, nimiqAddress: victim.address } });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.nimiqAddress, attacker.address, 'claimed addresses are ignored');
    assert.notEqual(res.body.user.nimiqAddress, victim.address);
  });

  test('rejects forged, mismatched and replayed signatures', async () => {
    const [a, b] = [wallet(), wallet()];
    await signIn(a);

    // B signs, but presents A's public key to take over A's account
    const c1 = await challenge();
    const forged = await api().post('/v1/auth/nimiq/sign-in').send({ challengeId: c1.id, publicKey: a.publicKey, signature: b.sign(c1.message), acceptTerms: true, acceptPrivacy: true });
    assert.equal(forged.status, 401);
    assert.equal(forged.body.error.code, 'signature_invalid');

    // a signature over some other text
    const c2 = await challenge();
    assert.equal((await signIn(a, { challenge: c2 }, { message: 'Sign in to PawCircle\nNonce: made-up' })).body.error.code, 'signature_invalid');

    // replaying a captured, valid sign-in is useless: the challenge was used up
    const c3 = await challenge();
    const body = { challengeId: c3.id, publicKey: a.publicKey, signature: a.sign(c3.message), acceptTerms: true, acceptPrivacy: true };
    assert.equal((await api().post('/v1/auth/nimiq/sign-in').send(body)).status, 200);
    const replay = await api().post('/v1/auth/nimiq/sign-in').send(body);
    assert.equal(replay.status, 401);
    assert.equal(replay.body.error.code, 'challenge_invalid');
  });

  test('a failed attempt burns the challenge; expired and unknown challenges are refused', async () => {
    const w = wallet();
    const c = await challenge();
    assert.equal((await signIn(w, { challenge: c }, { message: 'wrong' })).status, 401);
    assert.equal((await signIn(w, { challenge: c })).body.error.code, 'challenge_invalid', 'same nonce can not be retried');

    const old = await challenge();
    await AuthChallenge.updateOne({ _id: old.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await signIn(w, { challenge: old })).body.error.code, 'challenge_invalid');
    assert.equal((await signIn(w, { challenge: { id: '6af0aec6fdacfc3e38a9cb78', message: 'x' } })).body.error.code, 'challenge_invalid');
  });

  test('malformed requests are 400s', async () => {
    const w = wallet();
    const c = await challenge();
    const send = (b) => api().post('/v1/auth/nimiq/sign-in').send(b);
    assert.equal((await send({})).status, 400);
    assert.equal((await send({ challengeId: 'nope', publicKey: w.publicKey, signature: w.sign(c.message) })).status, 400);
    assert.equal((await send({ challengeId: c.id, publicKey: 'abc', signature: w.sign(c.message) })).status, 400);
    assert.equal((await send({ challengeId: c.id, publicKey: w.publicKey, signature: 'abc' })).status, 400);
  });

  test('two first sign-ins racing for one wallet still make exactly one account', async () => {
    const w = wallet();
    const results = await Promise.all(Array.from({ length: 5 }, () => signIn(w)));
    assert.ok(results.every((r) => [200, 201].includes(r.status)), results.map((r) => r.status).join());
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(new Set(results.map((r) => r.body.user.id)).size, 1);
    assert.equal(await User.countDocuments({ 'nimiq.address': w.address }), 1);
  });

  test('suspended wallets are refused', async () => {
    const w = wallet();
    await signIn(w);
    await User.updateOne({ 'nimiq.address': w.address }, { $set: { status: 'suspended' } });
    assert.equal((await signIn(w)).status, 403);
  });

  test('wallet accounts have no email, and many of them can coexist', async () => {
    const [a, b] = [wallet(), wallet()];
    assert.equal((await signIn(a)).status, 201);
    assert.equal((await signIn(b)).status, 201, 'two accounts without an email do not collide');
    assert.equal(await User.countDocuments({ email: { $exists: false } }) >= 2, true);
  });
});

describe('sign-in methods and the old email + password path', () => {
  test('the app asks what is available; password endpoints vanish unless enabled', async () => {
    assert.deepEqual((await api().get('/v1/auth/methods')).body, { nimiq: true, password: true }, 'tests run with it on');
    env.passwordAuth = false;
    try {
      assert.deepEqual((await api().get('/v1/auth/methods')).body, { nimiq: true, password: false });
      const body = { email: 'x@example.com', password: 'correct-horse-battery', displayName: 'X', acceptTerms: true, acceptPrivacy: true };
      assert.equal((await api().post('/v1/auth/register').send(body)).status, 404);
      assert.equal((await api().post('/v1/auth/login').send({ email: 'x@example.com', password: 'whatever12345' })).status, 404);
      assert.equal((await signIn(wallet())).status, 201, 'wallet sign-in is unaffected');
    } finally {
      env.passwordAuth = true;
    }
  });
});

describe('wallet accounts in the rest of the app', () => {
  test('sessions refresh, pet care works, and the account can be deleted by typing DELETE', async () => {
    const w = wallet();
    const s = (await signIn(w)).body;
    const auth = { Authorization: `Bearer ${s.accessToken}` };

    const refreshed = await api().post('/v1/auth/refresh').send({ refreshToken: s.refreshToken });
    assert.equal(refreshed.status, 200);

    assert.equal((await api().post('/v1/pets').set(auth).send({ name: 'Coco', species: 'dog' })).status, 201);
    assert.equal((await api().get('/v1/home').set(auth)).status, 200);
    assert.equal((await api().get('/v1/me/export').set(auth)).body.user.nimiq.address, w.address);

    assert.equal((await api().delete('/v1/me').set(auth).send({})).status, 400, 'needs confirmation');
    assert.equal((await api().delete('/v1/me').set(auth).send({ confirm: 'delete me' })).status, 400);
    assert.equal((await api().delete('/v1/me').set(auth).send({ confirm: 'DELETE' })).status, 204);
    assert.equal((await api().get('/v1/me').set(auth)).status, 401);

    const back = await signIn(w);
    assert.equal(back.status, 201, 'the wallet can start fresh');
    assert.notEqual(back.body.user.id, s.user.id);
    assert.equal((await api().get('/v1/pets').set({ Authorization: `Bearer ${back.body.accessToken}` })).body.items.length, 0, 'none of the old data came back');
  });
});
