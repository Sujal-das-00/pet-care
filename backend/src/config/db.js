import mongoose from 'mongoose';
import { env } from './env.js';
import { User } from '../models/User.js';

mongoose.set('strictQuery', true);

export async function connectDb(uri = env.mongoUri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  // Accounts changed from email-based to wallet-based: make sure the user indexes match (cheap, one collection).
  await User.syncIndexes();
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
