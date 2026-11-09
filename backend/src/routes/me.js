import { Router } from 'express';
import { z } from 'zod';
import * as c from '../controllers/meController.js';
import * as n from '../controllers/notificationController.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { updateMeBody, consentBody, deviceBody } from '../validators/me.js';
import { changePasswordBody, deleteAccountBody } from '../validators/auth.js';
import { pageQuery, idParams } from '../validators/common.js';

const r = Router();
r.get('/', c.getMe);
r.patch('/', validate({ body: updateMeBody }), c.updateMe);
r.get('/entitlements', c.getEntitlements);
r.post('/consents', validate({ body: consentBody }), c.recordConsent);
r.put('/devices', validate({ body: deviceBody }), c.registerDevice);
r.delete('/devices', validate({ body: z.object({ pushToken: z.string().min(10) }) }), c.removeDevice);
r.post('/password', authLimiter, validate({ body: changePasswordBody }), c.changePassword);
r.get('/export', authLimiter, c.exportData);
r.delete('/', authLimiter, validate({ body: deleteAccountBody }), c.removeAccount);

r.get('/notifications', validate({ query: pageQuery }), n.listNotifications);
r.post('/notifications/read-all', n.markAllRead);
r.post('/notifications/:notificationId/read', validate({ params: idParams('notificationId') }), n.markRead);

export default r;
