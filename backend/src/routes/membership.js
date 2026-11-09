import { Router } from 'express';
import * as c from '../controllers/membershipController.js';
import { validate } from '../middleware/validate.js';
import { paymentLimiter } from '../middleware/rateLimit.js';
import { idParams } from '../validators/common.js';
import { verifyBody } from '../validators/membership.js';

const r = Router();
r.get('/', c.getMembership);
r.post('/nimiq/intents', paymentLimiter, c.createIntent);
r.post('/nimiq/intents/:intentId/verify', paymentLimiter, validate({ params: idParams('intentId'), body: verifyBody }), c.verifyIntent);

export default r;
