// Builds the fixture the storm runs against: one verified seller, one
// item closing shortly, and a few hundred bidders with tokens already
// minted.
//
// Users are inserted straight into Mongo sharing a single password hash
// and their tokens are signed locally. Registering five hundred accounts
// through the API would mean five hundred scrypt derivations, which is
// most of a minute spent measuring the password hash rather than the
// bid path.

import fs from 'node:fs/promises';
import path from 'node:path';
import { connectMongo, disconnectMongo } from '../src/db/mongo.js';
import { getRedis, closeRedis } from '../src/redis/client.js';
import { closeQueue } from '../src/queue/index.js';
import { User } from '../src/db/models/User.js';
import { AuctionItem } from '../src/db/models/AuctionItem.js';
import { Bid } from '../src/db/models/Bid.js';
import { hashPassword, signToken } from '../src/services/auth.js';
import { ensureRoomState } from '../src/services/catalog.js';
import { ITEM_STATUS } from '../src/core/status.js';

const BIDDERS = Number(process.env.LOADTEST_BIDDERS ?? 500);
const RUNS_FOR_MS = Number(process.env.LOADTEST_WINDOW_MS ?? 120_000);
const API_BASE = process.env.LOADTEST_API ?? 'http://127.0.0.1:4200';
const START_CENTS = 10_000;

await connectMongo();
getRedis();

await User.deleteMany({ email: /@loadtest\.test$/ });

const passwordHash = await hashPassword('loadtest-password');

const seller = await User.create({
  email: `seller-${Date.now()}@loadtest.test`,
  passwordHash,
  displayName: 'Load Test Seller',
  sellerStatus: 'verified',
});

const bidders = await User.insertMany(
  Array.from({ length: BIDDERS }, (_, i) => ({
    email: `bidder-${Date.now()}-${i}@loadtest.test`,
    passwordHash,
    displayName: `Bidder ${i}`,
  })),
);

const endTime = new Date(Date.now() + RUNS_FOR_MS);
const item = await AuctionItem.create({
  title: 'Load test lot',
  description: 'Exists to be bid on five hundred times at once.',
  condition: 'Used',
  sellerId: seller._id,
  startingPriceCents: START_CENTS,
  reservePriceCents: 0,
  startTime: new Date(Date.now() - 1000),
  endTime,
  scheduledEndTime: endTime,
  status: ITEM_STATUS.ACTIVE,
});
await ensureRoomState(item);
await Bid.deleteMany({ itemId: item._id });

const fixture = {
  apiBase: API_BASE,
  itemId: item._id.toString(),
  startCents: START_CENTS,
  endsAt: endTime.getTime(),
  tokens: bidders.map((b) => signToken(b)),
};

const out = path.resolve(process.cwd(), 'loadtest/fixture.json');
await fs.writeFile(out, JSON.stringify(fixture, null, 2));

console.log(
  `fixture: ${fixture.tokens.length} bidders, item ${fixture.itemId}, closes in ${Math.round(RUNS_FOR_MS / 1000)}s`,
);
console.log(`written to ${out}`);

await closeQueue();
await closeRedis();
await disconnectMongo();
