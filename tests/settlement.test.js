import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import {
  startStack,
  stopStack,
  resetData,
  makeUser,
  makeItem,
  bid,
  bringCloseForward,
} from './helpers.js';
import { closeAuction, expireCheckout } from '../src/services/settlement.js';
import { AuctionItem } from '../src/db/models/AuctionItem.js';
import { Order } from '../src/db/models/Order.js';
import { ITEM_STATUS, ORDER_STATUS, UNSOLD_REASON } from '../src/core/status.js';
import { config } from '../src/config.js';

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

describe('anti-sniping', () => {
  it('pushes the close out when a bid lands in the final seconds', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);
    const originalEnd = await bringCloseForward(item.id, 5_000);

    const res = await bid(app, ann, item.id, 25_000);
    expect(res.status).toBe(201);
    expect(res.body.extended).toBe(true);

    // Reset to a fixed distance from the bid, not the old end plus a delta.
    const newEnd = new Date(res.body.endTime).getTime();
    expect(newEnd).toBeGreaterThan(originalEnd);
    expect(newEnd - Date.now()).toBeGreaterThan(config.softClose.extendToMs - 2_000);
    expect(newEnd - Date.now()).toBeLessThanOrEqual(config.softClose.extendToMs);
  });

  it('leaves the close alone for a bid with time to spare', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);

    const res = await bid(app, ann, item.id, 25_000);
    expect(res.body.extended).toBe(false);
  });

  it('does not let repeated late bids ratchet the auction open forever', async () => {
    const item = await makeItem(app, seller);
    const people = [await makeUser(app), await makeUser(app), await makeUser(app)];
    await bringCloseForward(item.id, 5_000);

    let endTime = 0;
    for (const [index, person] of people.entries()) {
      const res = await bid(app, person, item.id, 25_000 + index * 1_000);
      expect(res.status).toBe(201);
      endTime = new Date(res.body.endTime).getTime();
    }

    // Three extensions in a row, and the finish line is still thirty
    // seconds out - not ninety.
    expect(endTime - Date.now()).toBeLessThanOrEqual(config.softClose.extendToMs);
  });

  it('refuses a bid that arrives after the extended close', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);
    await bringCloseForward(item.id, -1);

    const res = await bid(app, ann, item.id, 25_000);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('closed');
  });
});

describe('closing', () => {
  it('tells the caller to come back when the clock has moved', async () => {
    const item = await makeItem(app, seller);
    const endsAt = await bringCloseForward(item.id, 10_000);

    const result = await closeAuction(item.id, { now: Date.now() });
    expect(result.done).toBe(false);
    expect(result.code).toBe('still_open');
    expect(result.endsAt).toBe(endsAt);
  });

  it('closes once when two workers race', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);
    await bid(app, ann, item.id, 25_000);
    await bringCloseForward(item.id, -1);

    const [first, second] = await Promise.all([closeAuction(item.id), closeAuction(item.id)]);
    const outcomes = [first.code, second.code].sort();
    expect(outcomes).toContain('offered');
    expect(await Order.countDocuments({ itemId: item.id })).toBe(1);
  });

  it('offers the item to the winner with a clock on it', async () => {
    const item = await makeItem(app, seller);
    const [ann, bo] = [await makeUser(app), await makeUser(app)];
    await bid(app, ann, item.id, 25_000);
    await bid(app, bo, item.id, 26_000);
    await bringCloseForward(item.id, -1);

    await closeAuction(item.id);

    const stored = await AuctionItem.findById(item.id);
    expect(stored.status).toBe(ITEM_STATUS.ENDED);

    const order = await Order.findOne({ itemId: item.id });
    expect(order.buyerId.toString()).toBe(bo.id);
    expect(order.amountCents).toBe(26_000);
    expect(order.offerRank).toBe(1);
    expect(order.expiresAt.getTime() - order.reservedAt.getTime()).toBe(config.checkoutTtlMs);
  });

  it('holds back an item nobody bid on', async () => {
    const item = await makeItem(app, seller);
    await bringCloseForward(item.id, -1);

    const result = await closeAuction(item.id);
    expect(result.reason).toBe(UNSOLD_REASON.NO_BIDS);
    expect((await AuctionItem.findById(item.id)).status).toBe(ITEM_STATUS.UNSOLD);
  });

  it('holds back an item that never cleared its reserve', async () => {
    const item = await makeItem(app, seller, { reservePriceCents: 50_000 });
    const ann = await makeUser(app);
    await bid(app, ann, item.id, 25_000);
    await bringCloseForward(item.id, -1);

    const result = await closeAuction(item.id);
    expect(result.reason).toBe(UNSOLD_REASON.RESERVE_NOT_MET);
    expect(await Order.countDocuments({ itemId: item.id })).toBe(0);
  });

  it('never tells a bidder what the reserve was', async () => {
    const item = await makeItem(app, seller, { reservePriceCents: 50_000 });
    const ann = await makeUser(app);

    const view = await app.get(`/api/items/${item.id}`).set('authorization', `Bearer ${ann.token}`);
    expect(view.body.item.reservePriceCents).toBeUndefined();
    expect(view.body.item.hasReserve).toBe(true);
    expect(view.body.item.reserveMet).toBe(false);

    // The seller does see their own floor.
    const sellerView = await app
      .get(`/api/items/${item.id}`)
      .set('authorization', `Bearer ${seller.token}`);
    expect(sellerView.body.item.reservePriceCents).toBe(50_000);
  });
});

describe('checkout', () => {
  const shipping = {
    shipping: {
      fullName: 'A Bidder',
      line1: '12 Somewhere Road',
      city: 'Bengaluru',
      postcode: '560001',
      country: 'IN',
    },
  };

  it('settles the item when the winner pays in time', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);
    await bid(app, ann, item.id, 25_000);
    await bringCloseForward(item.id, -1);
    await closeAuction(item.id);

    const order = await Order.findOne({ itemId: item.id });
    const res = await app
      .post(`/api/orders/${order._id}/checkout`)
      .set('authorization', `Bearer ${ann.token}`)
      .send(shipping);

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe(ORDER_STATUS.PAID);
    expect((await AuctionItem.findById(item.id)).status).toBe(ITEM_STATUS.SETTLED);
  });

  it('refuses a checkout by anyone but the winner', async () => {
    const item = await makeItem(app, seller);
    const [ann, bo] = [await makeUser(app), await makeUser(app)];
    await bid(app, ann, item.id, 25_000);
    await bringCloseForward(item.id, -1);
    await closeAuction(item.id);

    const order = await Order.findOne({ itemId: item.id });
    const res = await app
      .post(`/api/orders/${order._id}/checkout`)
      .set('authorization', `Bearer ${bo.token}`)
      .send(shipping);

    expect(res.status).toBe(403);
  });

  it('rolls the item down to the runner-up when the clock runs out', async () => {
    const item = await makeItem(app, seller);
    const [ann, bo] = [await makeUser(app), await makeUser(app)];
    await bid(app, ann, item.id, 25_000);
    await bid(app, bo, item.id, 26_000);
    await bringCloseForward(item.id, -1);
    await closeAuction(item.id);

    const first = await Order.findOne({ itemId: item.id });
    expect(first.buyerId.toString()).toBe(bo.id);

    await Order.updateOne({ _id: first._id }, { $set: { expiresAt: new Date(Date.now() - 1) } });
    const rolled = await expireCheckout(first._id.toString());
    expect(rolled.code).toBe('rolled');

    expect((await Order.findById(first._id)).status).toBe(ORDER_STATUS.EXPIRED);

    const second = await Order.findOne({
      itemId: item.id,
      status: ORDER_STATUS.PENDING,
    });
    expect(second.buyerId.toString()).toBe(ann.id);
    expect(second.offerRank).toBe(2);
    // The runner-up pays what they actually bid, not what the winner did.
    expect(second.amountCents).toBe(25_000);
  });

  it('will not roll down to a bidder below the reserve', async () => {
    const item = await makeItem(app, seller, { reservePriceCents: 26_000 });
    const [ann, bo] = [await makeUser(app), await makeUser(app)];
    await bid(app, ann, item.id, 25_000); // under the reserve
    await bid(app, bo, item.id, 26_000); // clears it
    await bringCloseForward(item.id, -1);
    await closeAuction(item.id);

    const first = await Order.findOne({ itemId: item.id });
    await Order.updateOne({ _id: first._id }, { $set: { expiresAt: new Date(Date.now() - 1) } });
    const rolled = await expireCheckout(first._id.toString());

    expect(rolled.code).toBe('unsold');
    const stored = await AuctionItem.findById(item.id);
    expect(stored.status).toBe(ITEM_STATUS.UNSOLD);
    expect(stored.settlement.unsoldReason).toBe(UNSOLD_REASON.NO_TAKERS);
  });

  it('does not expire an order whose clock is still running', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);
    await bid(app, ann, item.id, 25_000);
    await bringCloseForward(item.id, -1);
    await closeAuction(item.id);

    const order = await Order.findOne({ itemId: item.id });
    const result = await expireCheckout(order._id.toString());
    expect(result.code).toBe('not_yet');
    expect((await Order.findById(order._id)).status).toBe(ORDER_STATUS.PENDING);
  });
});
