import { env } from './config/env.js';
import { connectDb, disconnectDb } from './config/db.js';
import { createApp } from './app.js';
import { attachChat } from './realtime/chatHub.js';
import { startReminderLoop } from './services/reminderLoop.js';
import fs from 'node:fs';
import path from 'node:path';
import { lunaToNim, normalizeAddress, paymentsStatus } from './services/nimiqService.js';

await connectDb();

// One glance at start-up shows what members will be asked to pay and where it goes.
const priceNim = lunaToNim(env.membership.priceLuna);
const pay = paymentsStatus();
console.log(env.enforceMembership
  ? `Membership: community costs ${priceNim} NIM (${env.membership.days > 0 ? `${env.membership.days}-day access` : 'one-time, lifetime access'})`
  : 'Membership: NOT enforced (ENFORCE_MEMBERSHIP=0) — community is open to everyone');
console.log(pay.enabled
  ? `Nimiq payments: ON -> ${normalizeAddress(env.nimiq.receiveAddress)} (${env.nimiq.network})`
  : `Nimiq payments: OFF — ${pay.problem}`);

const server = createApp().listen(env.port, () => console.log(`PawCircle API listening on :${env.port}`));
attachChat(server); // live chat delivery at /v1/chat/ws
const stopReminders = env.runWorkerInProcess ? startReminderLoop() : null;
console.log(env.runWorkerInProcess ? 'Reminders: running inside the API process' : 'Reminders: NOT running here (start `npm run worker`, or set RUN_WORKER_IN_PROCESS=1)');
console.log(fs.existsSync(path.join(env.webDist, 'index.html')) ? `Web app: serving ${env.webDist}` : 'Web app: not found (API only). Build it with `npx expo export --platform web` in frontend/');

const shutdown = async (signal) => {
  console.log(`${signal} received, shutting down`);
  stopReminders?.();
  server.close(async () => {
    await disconnectDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
