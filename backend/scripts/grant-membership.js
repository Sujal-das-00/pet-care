// Gives an account community access without a payment (staff, support, local testing).
//   npm run grant-membership -- you@example.com [days]      (omit days for lifetime)
import { connectDb, disconnectDb } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { grantMembership } from '../src/services/entitlementService.js';

const [email, days] = [process.argv[2]?.toLowerCase(), Number(process.argv[3] || 0)];
if (!email) { console.error('usage: npm run grant-membership -- <email> [days]'); process.exit(1); }
await connectDb();
const user = await User.findOne({ email, deletedAt: null }).select('_id').lean();
if (user) {
  const m = await grantMembership(user._id, { source: 'admin', days });
  console.log(`${email}: community access granted (${m.expiresAt ? `until ${m.expiresAt.toISOString()}` : 'lifetime'})`);
} else console.log(`No account found for ${email}`);
await disconnectDb();
process.exit(user ? 0 : 1);
