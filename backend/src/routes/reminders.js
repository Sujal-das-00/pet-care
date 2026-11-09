import { Router } from 'express';
import * as c from '../controllers/reminderController.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.js';
import { createReminderBody, updateReminderBody, listRemindersQuery, completeReminderBody } from '../validators/reminder.js';

const r = Router();
const idp = idParams('reminderId');

r.get('/', validate({ query: listRemindersQuery }), c.listReminders);
r.post('/', validate({ body: createReminderBody }), c.createReminder);
r.patch('/:reminderId', validate({ params: idp, body: updateReminderBody }), c.updateReminder);
r.post('/:reminderId/complete', validate({ params: idp, body: completeReminderBody }), c.complete);
r.delete('/:reminderId', validate({ params: idp }), c.cancelReminder);

export default r;
