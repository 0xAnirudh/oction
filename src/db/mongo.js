import mongoose from 'mongoose';
import { config } from '../config.js';
import { log } from '../log.js';

mongoose.set('strictQuery', true);

export async function connectMongo(uri = config.mongoUri) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  log.info('mongo connected', { db: mongoose.connection.name });
  return mongoose.connection;
}

export async function disconnectMongo() {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
}
