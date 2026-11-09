import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { setup, teardown } from './helpers.js';

const { env } = await import('../src/config/env.js');
const { createApp } = await import('../src/app.js');

let dist;
let app;
before(async () => {
  await setup();
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'pawcircle-dist-'));
  fs.mkdirSync(path.join(dist, '_expo/static/js/web'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html><body><div id="root">PawCircle shell</div></body></html>');
  fs.writeFileSync(path.join(dist, '_expo/static/js/web/entry-abc123.js'), 'console.log("app")');
  fs.writeFileSync(path.join(dist, 'favicon.ico'), 'ico');
  env.webDist = dist;
  app = createApp();
});
after(async () => { fs.rmSync(dist, { recursive: true, force: true }); await teardown(); });

describe('serving the web app from the API', () => {
  test('the app shell is served at / and for client-side routes (refresh / shared links keep working)', async () => {
    for (const p of ['/', '/home', '/groups/6af0aec6fdacfc3e38a9cb78', '/chat-room?room=global', '/unlock']) {
      const res = await request(app).get(p).set('Accept', 'text/html');
      assert.equal(res.status, 200, p);
      assert.match(res.text, /PawCircle shell/, p);
      assert.match(res.headers['cache-control'], /no-cache/, 'a new deploy must be picked up');
    }
  });

  test('hashed build files are cached for a year; other files briefly', async () => {
    const js = await request(app).get('/_expo/static/js/web/entry-abc123.js');
    assert.equal(js.status, 200);
    assert.match(js.headers['cache-control'], /max-age=31536000/);
    assert.match(js.headers['cache-control'], /immutable/);
    assert.equal((await request(app).get('/favicon.ico')).status, 200);
  });

  test('the API is never swallowed by the app shell', async () => {
    const missing = await request(app).get('/v1/nope');
    assert.equal(missing.status, 401, 'unknown API paths ask for a login first, like every other API path');
    assert.match(missing.headers['content-type'], /json/);
    assert.doesNotMatch(missing.text, /PawCircle shell/);
    assert.equal((await request(app).get('/v1/pets')).status, 401, 'still the real, authenticated API');
    assert.equal((await request(app).get('/health')).body.ok, true);
    assert.equal((await request(app).post('/home').send({})).status, 404, 'only GET navigations get the shell');
  });

  test('a missing file is a real 404, not the app shell', async () => {
    const res = await request(app).get('/_expo/static/js/web/entry-missing.js');
    assert.equal(res.status, 404);
    assert.doesNotMatch(res.text, /PawCircle shell/);
    assert.equal((await request(app).get('/nothing.png')).status, 404);
  });

  test('security headers allow the app and its live chat socket, and nothing foreign', async () => {
    const csp = (await request(app).get('/')).headers['content-security-policy'];
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'(;|$)/, 'no inline or remote scripts');
    assert.match(csp, /connect-src 'self' ws: wss:/);
    assert.match(csp, /object-src 'none'/);
    assert.equal((await request(app).get('/')).headers['x-powered-by'], undefined);
  });

  test('without a web build the API still works on its own', async () => {
    env.webDist = path.join(dist, 'does-not-exist');
    const apiOnly = createApp();
    assert.equal((await request(apiOnly).get('/home')).status, 404);
    assert.equal((await request(apiOnly).get('/health')).status, 200);
    env.webDist = dist;
  });
});
