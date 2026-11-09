import { env } from '../config/env.js';
import { processDueReminders } from './reminderService.js';

/**
 * Polls for due reminders and delivers them. Safe to run in several processes at once — each reminder
 * is claimed atomically before delivery. Returns a stop() function.
 */
export function startReminderLoop() {
  let stopping = false;
  let timer;
  async function tick() {
    try {
      const n = await processDueReminders();
      if (n) console.log(`[reminders] delivered ${n}`);
    } catch (err) {
      console.error('[reminders] tick failed:', err);
    } finally {
      if (!stopping) timer = setTimeout(tick, env.reminderPollSeconds * 1000);
    }
  }
  tick();
  return () => { stopping = true; clearTimeout(timer); };
}
