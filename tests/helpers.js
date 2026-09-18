import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { connectMongo, disconnectMongo } from '../src/db/mongo.js';
import { getRedis, closeRedis } from '../src/redis/client.js';
import { closeQueue } from '../src/queue/index.js';
import { createApp } from '../src/http/app.js';
import { User } from '../src/db/models/User.js';
import { CONDITIONS } from '../src/core/status.js';

// Mongo is in-process so the suite needs no services of its own. Redis
// is the real thing on database 15 - the bid path is a Lua script, and a
// fake would be testing the fake.

let mongod;

export async function startStack() {
  mongod = await MongoMemoryServer.create();
  await connectMongo(mongod.getUri('oction_test'));
  const redis = getRedis();
  await redis.flushdb();
  return { app: createApp(), redis };
}

export async function stopStack() {
  await closeQueue();
  await closeRedis();
  await disconnectMongo();
  if (mongod) await mongod.stop();
}

export async function resetData() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  await getRedis().flushdb();
}

let counter = 0;

export async function makeUser(app, { seller = false, admin = false, verified = false } = {}) {
  counter += 1;
  const email = `person${counter}@example.test`;
  const res = await app.post('/api/auth/register').send({
    email,
    password: 'a-long-enough-password',
    displayName: `Person ${counter}`,
    acceptTerms: true,
  });
  if (res.status !== 201)
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);

  const set = {};
  if (seller) set.sellerStatus = 'verified';
  if (admin) set.isAdmin = true;
  if (seller || admin || verified) set.emailVerified = true;
  if (Object.keys(set).length) await User.updateOne({ email }, { $set: set });

  return { ...res.body.user, token: res.body.token, email };
}

export function itemPayload(overrides = {}) {
  const now = Date.now();
  return {
    title: '1989 Nintendo Game Boy (Sealed)',
    description: 'Factory sealed, original shrink.',
    condition: CONDITIONS[3],
    startingPriceCents: 25_000,
    reservePriceCents: 0,
    bidIncrementCents: null,
    startTime: new Date(now - 1000).toISOString(),
    endTime: new Date(now + 3_600_000).toISOString(),
    shippingDetails: { weightKg: 0.9, shipsFrom: 'Bengaluru, IN' },
    ...overrides,
  };
}

export const auth = (req, user) => req.set('authorization', `Bearer ${user.token}`);

export async function makeItem(app, seller, overrides = {}) {
  const res = await app
    .post('/api/items')
    .set('authorization', `Bearer ${seller.token}`)
    .send(itemPayload(overrides));
  if (res.status !== 201)
    throw new Error(`listing failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.item;
}

export function bid(app, user, itemId, amountCents) {
  return app
    .post(`/api/items/${itemId}/bids`)
    .set('authorization', `Bearer ${user.token}`)
    .send({ amountCents });
}

// Drag an auction's finish line to `msFromNow`, in both stores, so a
// test can stand next to the close without waiting an hour for it. The
// route refuses to list an auction shorter than a minute, which is the
// right rule for sellers and an inconvenient one for tests.
export async function bringCloseForward(itemId, msFromNow) {
  const { AuctionItem } = await import('../src/db/models/AuctionItem.js');
  const { keys } = await import('../src/redis/keys.js');
  const endsAt = Date.now() + msFromNow;
  await AuctionItem.updateOne({ _id: itemId }, { $set: { endTime: new Date(endsAt) } });
  await getRedis().hset(keys.itemState(itemId), 'endsAt', String(endsAt));
  return endsAt;
}
