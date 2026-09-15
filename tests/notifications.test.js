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
import { config } from '../src/config.js';
import { drainOutbox } from '../src/mail/mailer.js';
import { deliver, NOTICES } from '../src/services/notifications.js';
import { closeAuction } from '../src/services/settlement.js';
import { Order } from '../src/db/models/Order.js';
import { User } from '../src/db/models/User.js';
import { Watch } from '../src/db/models/Watch.js';

let app;
let seller;

beforeAll(async () => {
  const stack = await startStack();
  app = supertest(stack.app);
}, 180_000);

afterAll(stopStack);

beforeEach(async () => {
  await resetData();
  config.mail.driver = 'capture';
  drainOutbox();
  seller = await makeUser(app, { seller: true });
});

describe('outbid notices', () => {
  it('tells the bidder who lost the lead', async () => {
    const item = await makeItem(app, seller);
    const [ann, bo] = [await makeUser(app), await makeUser(app)];
    await bid(app, ann, item.id, 25_000);
    await bid(app, bo, item.id, 26_000);
    drainOutbox();

    const result = await deliver({
      kind: NOTICES.OUTBID,
      userId: ann.id,
      itemId: item.id,
      amountCents: 26_000,
    });

    expect(result.sent).toBe(true);
    const [message] = drainOutbox();
    expect(message.to).toBe(ann.email);
    expect(message.subject).toMatch(/outbid/i);
    expect(message.text).toContain('$260.00');
  });

  it('says nothing to someone who has taken the lead back', async () => {
    const item = await makeItem(app, seller);
    const [ann, bo] = [await makeUser(app), await makeUser(app)];
    await bid(app, ann, item.id, 25_000);
    await bid(app, bo, item.id, 26_000);
    await bid(app, ann, item.id, 27_000);
    drainOutbox();

    // The notice was queued when ann was behind; by the time it runs she
    // leads again, and an email saying otherwise would be wrong.
    const result = await deliver({
      kind: NOTICES.OUTBID,
      userId: ann.id,
      itemId: item.id,
      amountCents: 26_000,
    });

    expect(result.skipped).toBe('leads_again');
    expect(drainOutbox()).toHaveLength(0);
  });

  it('respects the account switch', async () => {
    const item = await makeItem(app, seller);
    const [ann, bo] = [await makeUser(app), await makeUser(app)];
    await bid(app, ann, item.id, 25_000);
    await bid(app, bo, item.id, 26_000);
    await User.updateOne({ _id: ann.id }, { $set: { 'notify.outbid': false } });
    drainOutbox();

    const result = await deliver({
      kind: NOTICES.OUTBID,
      userId: ann.id,
      itemId: item.id,
      amountCents: 26_000,
    });

    expect(result.skipped).toBe(true);
    expect(drainOutbox()).toHaveLength(0);
  });
});

describe('win notices', () => {
  it('tells the winner, with the hold deadline', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);
    await bid(app, ann, item.id, 25_000);
    await bringCloseForward(item.id, -1);
    await closeAuction(item.id);
    drainOutbox();

    const order = await Order.findOne({ itemId: item.id });
    await deliver({ kind: NOTICES.WON, orderId: order._id.toString() });

    const [message] = drainOutbox();
    expect(message.to).toBe(ann.email);
    expect(message.subject).toMatch(/you won/i);
    expect(message.text).toContain('$250.00');
  });

  it('uses different wording for a lot that rolled down', async () => {
    const item = await makeItem(app, seller);
    const [ann, bo] = [await makeUser(app), await makeUser(app)];
    await bid(app, ann, item.id, 25_000);
    await bid(app, bo, item.id, 26_000);
    await bringCloseForward(item.id, -1);
    await closeAuction(item.id);

    const first = await Order.findOne({ itemId: item.id });
    await Order.updateOne({ _id: first._id }, { $set: { expiresAt: new Date(Date.now() - 1) } });
    const { expireCheckout } = await import('../src/services/settlement.js');
    await expireCheckout(first._id.toString());
    drainOutbox();

    const second = await Order.findOne({ itemId: item.id, status: 'PENDING' });
    await deliver({ kind: NOTICES.ROLLED_DOWN, orderId: second._id.toString() });

    const [message] = drainOutbox();
    expect(message.to).toBe(ann.email);
    expect(message.subject).toMatch(/offered to you/i);
  });
});

describe('closing soon notices', () => {
  it('goes to confirmed watchers who are not already winning', async () => {
    const item = await makeItem(app, seller);
    const [ann, bo, cy] = [await makeUser(app), await makeUser(app), await makeUser(app)];

    // ann is confirmed and watching; bo is watching but unconfirmed;
    // cy is confirmed, watching, and currently winning it.
    await User.updateMany({ _id: { $in: [ann.id, cy.id] } }, { $set: { emailVerified: true } });
    await Watch.create([
      { userId: ann.id, itemId: item.id },
      { userId: bo.id, itemId: item.id },
      { userId: cy.id, itemId: item.id },
    ]);
    await bid(app, cy, item.id, 25_000);
    drainOutbox();

    await bringCloseForward(item.id, 60_000);
    const result = await deliver({
      kind: NOTICES.CLOSING_SOON,
      itemId: item.id,
      leadMs: config.notifications.closingSoonLeadMs,
    });

    expect(result.sent).toBe(1);
    const sent = drainOutbox();
    expect(sent.map((m) => m.to)).toEqual([ann.email]);
  });

  it('comes back later when a late bid has moved the close', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);
    await User.updateOne({ _id: ann.id }, { $set: { emailVerified: true } });
    await Watch.create({ userId: ann.id, itemId: item.id });
    drainOutbox(); // the sign-up confirmations, not what this is about

    // Still an hour out, so a "closes soon" would be nonsense.
    const result = await deliver({
      kind: NOTICES.CLOSING_SOON,
      itemId: item.id,
      leadMs: 60_000,
    });

    expect(result.reschedule).toBeGreaterThan(Date.now());
    expect(drainOutbox()).toHaveLength(0);
  });
});

describe('notification preferences', () => {
  it('can be turned off from the account', async () => {
    const ann = await makeUser(app);
    const res = await app
      .patch('/api/me/notifications')
      .set('authorization', `Bearer ${ann.token}`)
      .send({ outbid: false });

    expect(res.status).toBe(200);
    expect(res.body.user.notify).toEqual({ outbid: false, won: true, closingSoon: true });
  });
});
