import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { env } from './config/env.js';

/**
 * Serves the web build next to the API. Real files (JS, fonts, images) are served as-is; every other
 * browser navigation gets index.html so client-side routes like /groups/123 survive a refresh or a
 * shared link. API paths are never rewritten, so a wrong /v1 URL is still a JSON 404.
 */
export function mountWeb(app) {
  const dist = env.webDist;
  const index = path.join(dist, 'index.html');
  if (!fs.existsSync(index)) return false;

  // Build output under /_expo/static has content hashes in its names, so it can be cached for a year.
  app.use('/_expo', express.static(path.join(dist, '_expo'), { immutable: true, maxAge: '365d', index: false }));
  app.use(express.static(dist, { index: false, maxAge: '1h' }));

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/v1/') || req.path === '/v1' || req.path === '/health') return next();
    if (path.extname(req.path)) return next(); // a missing asset is a real 404, not the app shell
    res.set('Cache-Control', 'no-cache'); // always pick up a new deploy
    return res.sendFile(index);
  });
  return true;
}
