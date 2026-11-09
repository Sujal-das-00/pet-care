// Grants platform-operator rights to an existing account.
//   npm run make-admin -- NQ12\ 3456\ ...      (the Nimiq wallet address they sign in with)
//   npm run make-admin -- you@example.com        (development accounts that use email)
// People must have signed in once so the account exists.
import { connectDb, disconnectDb } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { normalizeAddress } from '../src/services/nimiqService.js';

const arg = process.argv.slice(2).join(' ').trim();
if (!arg) { console.error('usage: npm run make-admin -- "<NQ.. wallet address>" | <email>'); process.exit(1); }
const query = /^NQ/i.test(arg) ? { 'nimiq.address': normalizeAddress(arg) } : { email: arg.toLowerCase() };
await connectDb();
const r = await User.updateOne({ ...query, deletedAt: null }, { $set: { role: 'admin' } });
console.log(r.matchedCount ? `${arg} is now an admin` : `No account found for ${arg}. Sign in once first so the account exists.`);
await disconnectDb();
process.exit(r.matchedCount ? 0 : 1);
