// Grants platform-operator rights to an existing account.   npm run make-admin -- you@example.com
import { connectDb, disconnectDb } from '../src/config/db.js';
import { User } from '../src/models/User.js';

const email = process.argv[2]?.toLowerCase();
if (!email) { console.error('usage: npm run make-admin -- <email>'); process.exit(1); }
await connectDb();
const r = await User.updateOne({ email, deletedAt: null }, { $set: { role: 'admin' } });
console.log(r.matchedCount ? `${email} is now an admin` : `No account found for ${email}`);
await disconnectDb();
process.exit(r.matchedCount ? 0 : 1);
