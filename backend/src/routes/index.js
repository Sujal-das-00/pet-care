import { Router } from 'express';
import authRoutes from './auth.js';
import meRoutes from './me.js';
import petRoutes from './pets.js';
import reminderRoutes from './reminders.js';
import communityRoutes from './community.js';
import membershipRoutes from './membership.js';
import { getHome } from '../controllers/homeController.js';
import { requireAuth } from '../middleware/auth.js';

const api = Router();

api.use('/auth', authRoutes);

// Everything below requires a signed-in, active account.
api.use(requireAuth);
api.get('/home', getHome);
api.use('/me', meRoutes);
api.use('/pets', petRoutes);
api.use('/reminders', reminderRoutes);
api.use('/membership', membershipRoutes);
api.use(communityRoutes);

export default api;
