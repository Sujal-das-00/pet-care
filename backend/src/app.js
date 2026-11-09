import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import api from './routes/index.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { mountWeb } from './web.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxyHops); // behind a load balancer / CDN (see TRUST_PROXY_HOPS)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https:'], // react-native-web injects inline styles
        'img-src': ["'self'", 'data:', 'blob:'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'", 'ws:', 'wss:'], // the API and the live-chat socket (same origin); some browsers need ws:/wss: spelled out
        'object-src': ["'none'"],
        'frame-ancestors': ["'self'"],
      },
    },
  }));
  // Production: only the configured origins. Development: any origin, so Expo web/dev clients just work.
  app.use(cors({ origin: env.corsOrigins.length ? env.corsOrigins : !env.isProd }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) =>
    res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'up' : 'down' }),
  );

  app.use('/v1', apiLimiter, api);
  mountWeb(app);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
