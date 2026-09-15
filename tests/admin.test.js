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
import { closeAuction } from '../src/services/settlement.js';
import { Order } from '../src/db/models/Order.js';
import { AuctionItem } from '../src/db/models/AuctionItem.js';

let app;
let admin;
let seller;

const as = (req, user) => req.set('authorization', `Bearer ${user.token}`);

beforeAll(async () => {
  const stack = await startStack();
  app = supertest(stack.app);
}, 180_000);

afterAll(stopStack);

beforeEach(async () => {
  await resetData();
  config.mail.driver = 'capture';
  drainOutbox();
  admin = await makeUser(app, { admin: true });
  seller = await makeUser(app, { seller: true });
});

describe('the admin gate', () => {
  it('is invisible to everyone else', async () => {
    const ann = await makeUser(app);
    // 404, not 403 - telling a stranger the route exists is telling
    // them what to go looking for.
    expect((await as(app.get('/api/admin/overview'), ann)).status).toBe(404);
    expect((await app.get('/api/admin/overview')).status).toBe(401);
  });

  it('opens for staff', async () => {
    const res = await as(app.get('/api/admin/overview'), admin);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('pendingSellers');
    expect(res.body).toHaveProperty('openDisputes');
  });
});

describe('seller verification', () => {
  it('walks an account from applying to verified', async () => {
    const ann = await makeUser(app, { verified: true });

    const applied = await as(app.post('/api/me/seller-application'), ann);
    expect(applied.status).toBe(200);
    expect(applied.body.user.sellerStatus).toBe('pending');

    const queue = await as(app.get('/api/admin/sellers?status=pending'), admin);
    expect(queue.body.users.map((u) => u.id)).toContain(ann.id);

    const verified = await as(app.post(`/api/admin/sellers/${ann.id}/verify`), admin).send({});
    expect(verified.status).toBe(200);
    expect(verified.body.user.sellerStatus).toBe('verified');

    // And the thing verification is for now works.
    const listing = await makeItem(app, { ...ann, token: ann.token });
    expect(listing.id).toBeTruthy();
  });

  it('will not let an unconfirmed address apply', async () => {
    const ann = await makeUser(app);
    const res = await as(app.post('/api/me/seller-application'), ann);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('email_not_verified');
  });

  it('will not verify an unconfirmed address even from staff', async () => {
    const ann = await makeUser(app);
    const res = await as(app.post(`/api/admin/sellers/${ann.id}/verify`), admin).send({});
    expect(res.status).toBe(409);
  });

  it('can send an application back', async () => {
    const ann = await makeUser(app, { verified: true });
    await as(app.post('/api/me/seller-application'), ann);
    const res = await as(app.post(`/api/admin/sellers/${ann.id}/reject`), admin).send({});
    expect(res.body.user.sellerStatus).toBe('unverified');
  });
});

describe('withdrawing a listing', () => {
  it('stops the lot taking bids', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);
    await bid(app, ann, item.id, 25_000);

    const res = await as(app.post(`/api/admin/items/${item.id}/withdraw`), admin).send({
      reason: 'counterfeit',
    });
    expect(res.status).toBe(200);

    const stored = await AuctionItem.findById(item.id);
    expect(stored.status).toBe('UNSOLD');
    expect(stored.settlement.unsoldReason).toBe('withdrawn_by_staff');

    // Redis must agree, or the room keeps taking money for something
    // that is no longer for sale.
    const after = await bid(app, ann, item.id, 30_000);
    expect(after.status).toBe(409);
  });

  it('cancels a live claim on it', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);
    await bid(app, ann, item.id, 25_000);
    await bringCloseForward(item.id, -1);
    await closeAuction(item.id);

    await as(app.post(`/api/admin/items/${item.id}/withdraw`), admin).send({ reason: 'recalled' });
    const order = await Order.findOne({ itemId: item.id });
    expect(order.status).toBe('CANCELLED');
  });

  it('refuses a lot that already resolved', async () => {
    const item = await makeItem(app, seller);
    await bringCloseForward(item.id, -1);
    await closeAuction(item.id); // unsold, no bids

    const res = await as(app.post(`/api/admin/items/${item.id}/withdraw`), admin).send({
      reason: 'too late',
    });
    expect(res.status).toBe(409);
  });
});

describe('disputes', () => {
  const shipping = {
    shipping: {
      fullName: 'A Bidder',
      line1: '12 Somewhere Road',
      city: 'Bengaluru',
      postcode: '560001',
      country: 'IN',
    },
  };

  async function paidOrder() {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);
    await bid(app, ann, item.id, 25_000);
    await bringCloseForward(item.id, -1);
    await closeAuction(item.id);
    const order = await Order.findOne({ itemId: item.id });
    await as(app.post(`/api/orders/${order._id}/checkout`), ann).send(shipping);
    return { order, ann, item };
  }

  it('can be opened on a paid order and lands in the queue', async () => {
    const { order, ann } = await paidOrder();

    const opened = await as(app.post(`/api/orders/${order._id}/dispute`), ann).send({
      reason: 'not_as_described',
      detail: 'The box was opened and the seal is gone.',
    });
    expect(opened.status).toBe(201);
    expect(opened.body.dispute.status).toBe('OPEN');

    const queue = await as(app.get('/api/admin/disputes'), admin);
    expect(queue.body.disputes).toHaveLength(1);
    expect(queue.body.disputes[0].item).not.toBeNull();
  });

  it('cannot be opened twice on the same order', async () => {
    const { order, ann } = await paidOrder();
    const open = () =>
      as(app.post(`/api/orders/${order._id}/dispute`), ann).send({ reason: 'damaged', detail: '' });

    expect((await open()).status).toBe(201);
    expect((await open()).status).toBe(409);
  });

  it('cannot be opened on an order nobody paid for', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);
    await bid(app, ann, item.id, 25_000);
    await bringCloseForward(item.id, -1);
    await closeAuction(item.id);
    const order = await Order.findOne({ itemId: item.id });

    const res = await as(app.post(`/api/orders/${order._id}/dispute`), ann).send({
      reason: 'not_received',
      detail: '',
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('not_paid');
  });

  it('cannot be opened by a bystander', async () => {
    const { order } = await paidOrder();
    const stranger = await makeUser(app);
    const res = await as(app.post(`/api/orders/${order._id}/dispute`), stranger).send({
      reason: 'damaged',
      detail: '',
    });
    expect(res.status).toBe(403);
  });

  it('is resolved once and stays resolved', async () => {
    const { order, ann } = await paidOrder();
    const opened = await as(app.post(`/api/orders/${order._id}/dispute`), ann).send({
      reason: 'damaged',
      detail: 'Arrived in pieces.',
    });
    const id = opened.body.dispute.id;

    const resolved = await as(app.post(`/api/admin/disputes/${id}/resolve`), admin).send({
      outcome: 'buyer',
      resolution: 'Refund approved.',
    });
    expect(resolved.status).toBe(200);
    expect(resolved.body.dispute.status).toBe('RESOLVED_BUYER');

    const again = await as(app.post(`/api/admin/disputes/${id}/resolve`), admin).send({
      outcome: 'seller',
      resolution: 'Changed my mind.',
    });
    expect(again.status).toBe(409);
  });

  it('is visible to both sides but not to strangers', async () => {
    const { order, ann } = await paidOrder();
    await as(app.post(`/api/orders/${order._id}/dispute`), ann).send({
      reason: 'damaged',
      detail: '',
    });

    expect((await as(app.get(`/api/orders/${order._id}/dispute`), ann)).status).toBe(200);
    expect((await as(app.get(`/api/orders/${order._id}/dispute`), seller)).status).toBe(200);

    const stranger = await makeUser(app);
    expect((await as(app.get(`/api/orders/${order._id}/dispute`), stranger)).status).toBe(403);
  });
});
