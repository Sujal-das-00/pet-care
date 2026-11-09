import { Router } from 'express';
import * as c from '../controllers/authController.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { registerBody, loginBody, refreshBody } from '../validators/auth.js';

const r = Router();
r.use(authLimiter);
r.post('/register', validate({ body: registerBody }), c.register);
r.post('/login', validate({ body: loginBody }), c.login);
r.post('/refresh', validate({ body: refreshBody }), c.refresh);
r.post('/logout', validate({ body: refreshBody }), c.logout);

export default r;
