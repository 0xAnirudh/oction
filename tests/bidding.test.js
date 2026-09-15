import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { startStack, stopStack, resetData, makeUser, makeItem, bid } from './helpers.js';
import { config } from '../src/config.js';
import { minimumBid } from '../src/core/increments.js';

let app;
let seller;

beforeAll(async () => {
  const stack = await startStack();
  app = supertest(stack.app);
}, 180_000);

afterAll(stopStack);

beforeEach(async () => {
  await resetData();
  seller = await makeUser(app, { seller: true });
});

describe('placing a bid', () => {
  it('takes the asking price as the first bid', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);

    const res = await bid(app, ann, item.id, 25_000);
    expect(res.status).toBe(201);
    expect(res.body.currentHighestBidCents).toBe(25_000);
    // $250 sits under the $500 rung, so the next step is $10.
    expect(res.body.nextMinimumCents).toBe(26_000);
  });

  it('refuses anything under the asking price', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);

    const res = await bid(app, ann, item.id, 24_999);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('too_low');
  });

  it('refuses a raise smaller than the increment', async () => {
    const item = await makeItem(app, seller);
    const [ann, bo] = [await makeUser(app), await makeUser(app)];

    await bid(app, ann, item.id, 25_000);
    const res = await bid(app, bo, item.id, 25_500);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('too_low');
    expect(res.body.nextMinimumCents).toBe(26_000);
  });

  it('refuses the seller', async () => {
    const item = await makeItem(app, seller);
    const res = await bid(app, seller, item.id, 25_000);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('seller');
  });

  it('refuses a bidder who is already winning', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);

    await bid(app, ann, item.id, 25_000);
    const res = await bid(app, ann, item.id, 30_000);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already_leading');
  });

  it('refuses a bid above the fat-finger ceiling', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);

    const res = await bid(app, ann, item.id, config.maxBidCents + 1);
    expect(res.status).toBe(422);
  });

  it('refuses an auction that has not opened', async () => {
    const item = await makeItem(app, seller, {
      startTime: new Date(Date.now() + 600_000).toISOString(),
      endTime: new Date(Date.now() + 1_200_000).toISOString(),
    });
    const ann = await makeUser(app);

    const res = await bid(app, ann, item.id, 25_000);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('not_started');
  });
});

describe('the increment ladder', () => {
  // The ladder exists twice - once in JavaScript for the UI, once in Lua
  // inside the bid script - and the two must not drift. This walks a bid
  // up through the $500 boundary and checks Redis agrees with the number
  // the client would have shown.
  it('agrees between the Lua script and the JavaScript copy', async () => {
    const item = await makeItem(app, seller, { startingPriceCents: 48_000 });
    const people = [await makeUser(app), await makeUser(app)];

    let price = 48_000;
    let res = await bid(app, people[0], item.id, price);
    expect(res.status).toBe(201);

    for (let step = 0; step < 6; step += 1) {
      const expected = minimumBid({ startingPriceCents: 48_000, bidIncrementCents: null }, price);
      expect(res.body.nextMinimumCents).toBe(expected);

      // A cent under the minimum is refused, the minimum itself is taken.
      const bidder = people[step % 2 === 0 ? 1 : 0];
      const short = await bid(app, bidder, item.id, expected - 1);
      expect(short.status, `short bid at ${expected}`).toBe(409);

      res = await bid(app, bidder, item.id, expected);
      expect(res.status, `bid at ${expected}`).toBe(201);
      price = expected;
    }

    // Crossed $500, so the rung is now $50 rather than $10.
    expect(price).toBeGreaterThan(50_000);
    expect(res.body.nextMinimumCents).toBe(price + 5_000);
  });

  it('honours a seller-pinned increment instead', async () => {
    const item = await makeItem(app, seller, { bidIncrementCents: 2_500 });
    const [ann, bo] = [await makeUser(app), await makeUser(app)];

    await bid(app, ann, item.id, 25_000);
    expect((await bid(app, bo, item.id, 26_000)).status).toBe(409);
    expect((await bid(app, bo, item.id, 27_500)).status).toBe(201);
  });
});

describe('simultaneous bids', () => {
  it('accepts exactly one bid per rung when forty arrive at once', async () => {
    const item = await makeItem(app, seller);
    const bidders = await Promise.all(Array.from({ length: 40 }, () => makeUser(app)));

    // Everyone fires the same amount in the same instant. One of them
    // owns that rung; the other thirty-nine must be told they were late,
    // not quietly accepted over the top of each other.
    const results = await Promise.all(bidders.map((b) => bid(app, b, item.id, 25_000)));

    const accepted = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(39);
    expect(new Set(rejected.map((r) => r.body.error))).toEqual(new Set(['too_low']));

    const view = await app.get(`/api/items/${item.id}`);
    expect(view.body.item.currentHighestBidCents).toBe(25_000);
    expect(view.body.item.bidCount).toBe(1);
  });

  it('leaves a gap-free log when a crowd walks the price up', async () => {
    const item = await makeItem(app, seller);
    const bidders = await Promise.all(Array.from({ length: 12 }, () => makeUser(app)));

    // Ten rounds of everybody bidding at once, each round one rung up.
    for (let round = 0; round < 10; round += 1) {
      const amount = 25_000 + round * 1_000;
      await Promise.all(bidders.map((b) => bid(app, b, item.id, amount)));
    }

    const audit = await app.get(`/api/items/${item.id}/audit`);
    expect(audit.status).toBe(200);
    expect(audit.body.sequenceGaps).toEqual([]);

    // Whatever the race did, the log and the projection tell one story.
    expect(audit.body.recomputed.highestBidCents).toBe(audit.body.stored.highestBidCents);
    expect(audit.body.recomputed.winnerId).toBe(audit.body.stored.winnerId);
    expect(audit.body.recomputed.bidCount).toBe(audit.body.stored.bidCount);

    // And the price never went backwards.
    const amounts = audit.body.bids.map((b) => b.amountCents);
    const sorted = [...amounts].sort((a, b) => a - b);
    expect(amounts).toEqual(sorted);
  });
});

describe('rate limiting', () => {
  it('throttles a bidder hammering the button', async () => {
    const previous = { ...config.rateLimit.bids };
    config.rateLimit.bids.max = 2;
    config.rateLimit.bids.windowMs = 1000;

    try {
      const item = await makeItem(app, seller);
      const ann = await makeUser(app);

      const results = [];
      for (let i = 0; i < 5; i += 1) {
        results.push(await bid(app, ann, item.id, 25_000 + i * 1_000));
      }

      const limited = results.filter((r) => r.status === 429);
      expect(limited.length).toBeGreaterThan(0);
      expect(limited[0].headers['retry-after']).toBeDefined();
    } finally {
      Object.assign(config.rateLimit.bids, previous);
    }
  });
});
