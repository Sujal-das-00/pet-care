import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { HttpError } from '../utils/errors.js';
import { env } from '../config/env.js';

export const notFoundHandler = (_req, res) =>
  res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Invalid request',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: { code: 'bad_id', message: `Invalid ${err.path}` } });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Invalid data',
        details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
      },
    });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: { code: 'duplicate', message: 'Already exists' } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'bad_json', message: 'Malformed JSON body' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'too_large', message: 'Request body too large' } });
  }
  if (!env.isTest) console.error(`[${req.method} ${req.path}]`, err);
  return res.status(500).json({ error: { code: 'internal', message: 'Something went wrong' } });
}
