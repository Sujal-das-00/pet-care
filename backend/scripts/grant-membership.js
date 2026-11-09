// Gives an account community access without a payment (staff, support, local testing).
//   npm run grant-membership -- "<NQ.. wallet address>" [days]      (omit days for lifetime)
//   npm run grant-membership -- you@example.com [days]
import { connectDb, disconnectDb } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { grantMembership } from '../src/services/entitlementService.js';
import { normalizeAddress } from '../src/services/nimiqService.js';

// The wallet address contains spaces, so everything up to an optional trailing number is the identifier.
const args = process.argv.slice(2);
const last = args[args.length - 1];
const days = args.length > 1 && /^\d+$/.test(last) ? Number(args.pop()) : 0;
const arg = args.join(' ').trim();
if (!arg) { console.error('usage: npm run grant-membership -- "<NQ.. wallet address>" | <email> [days]'); process.exit(1); }
const query = /^NQ/i.test(arg) ? { 'nimiq.address': normalizeAddress(arg) } : { email: arg.toLowerCase() };
await connectDb();
const user = await User.findOne({ ...query, deletedAt: null }).select('_id').lean();
if (user) {
  const m = await grantMembership(user._id, { source: 'admin', days });
  console.log(`${arg}: community access granted (${m.expiresAt ? `until ${m.expiresAt.toISOString()}` : 'lifetime'})`);
} else console.log(`No account found for ${arg}. Sign in once first so the account exists.`);
await disconnectDb();
process.exit(user ? 0 : 1);
