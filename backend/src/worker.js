import { env } from './config/env.js';
import { connectDb, disconnectDb } from './config/db.js';
import { startReminderLoop } from './services/reminderLoop.js';

// Stand-alone reminder scheduler: `npm run worker`. Only needed if you do NOT set RUN_WORKER_IN_PROCESS=1.
await connectDb();
console.log(`Reminder worker started (poll every ${env.reminderPollSeconds}s)`);
const stop = startReminderLoop();

const shutdown = async () => { stop(); await disconnectDb(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
