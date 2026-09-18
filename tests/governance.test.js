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
import { shillSignals } from '../src/services/integrity.js';
import { User } from '../src/db/models/User.js';
import { Bid } from '../src/db/models/Bid.js';
import { Order } from '../src/db/models/Order.js';
import { Watch } from '../src/db/models/Watch.js';
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

describe('terms of use', () => {
  it('will not open an account without acceptance', async () => {
    const res = await app.post('/api/auth/register').send({
      email: 'nobody@example.test',
      password: 'a-long-enough-password',
      displayName: 'Nobody',
    });
    expect(res.status).toBe(422);
  });

  it('refuses a declared refusal too', async () => {
    const res = await app.post('/api/auth/register').send({
      email: 'nobody@example.test',
      password: 'a-long-enough-password',
      displayName: 'Nobody',
      acceptTerms: false,
    });
    expect(res.status).toBe(422);
  });

  it('records which version was agreed to, and when', async () => {
    const user = await makeUser(app);
    const stored = await User.findOne({ email: user.email });
    expect(stored.termsVersion).toBe(config.termsVersion);
    expect(stored.termsAcceptedAt).toBeInstanceOf(Date);
  });
});

describe('sessions', () => {
  it('lists one row per sign-in and marks the current one', async () => {
    const ann = await makeUser(app);
    const second = await app
      .post('/api/auth/login')
      .send({ email: ann.email, password: 'a-long-enough-password' });

    const list = await as(app.get('/api/me/sessions'), { token: second.body.token });
    expect(list.body.sessions.length).toBe(2);
    expect(list.body.sessions.filter((s) => s.current)).toHaveLength(1);
  });

  it('ends one device without ending the rest', async () => {
    const ann = await makeUser(app);
    const second = await app
      .post('/api/auth/login')
      .send({ email: ann.email, password: 'a-long-enough-password' });
    const newToken = second.body.token;

    const list = await as(app.get('/api/me/sessions'), { token: newToken });
    const other = list.body.sessions.find((s) => !s.current);

    const killed = await as(app.delete(`/api/me/sessions/${other.id}`), { token: newToken });
    expect(killed.status).toBe(200);

    // The revoked device is out; the one that did the revoking is not.
    expect((await as(app.get('/api/auth/me'), ann)).status).toBe(401);
    expect((await as(app.get('/api/auth/me'), { token: newToken })).status).toBe(200);
  });

  it('signs out everywhere else but keeps the device asking', async () => {
    const ann = await makeUser(app);
    const second = await app
      .post('/api/auth/login')
      .send({ email: ann.email, password: 'a-long-enough-password' });
    const newToken = second.body.token;

    const res = await as(app.delete('/api/me/sessions'), { token: newToken });
    expect(res.body.ended).toBe(1);
    expect((await as(app.get('/api/auth/me'), ann)).status).toBe(401);
    expect((await as(app.get('/api/auth/me'), { token: newToken })).status).toBe(200);
  });
});

describe('closing an account', () => {
  it('refuses while a lot of theirs is still running', async () => {
    await makeItem(app, seller);
    const check = await as(app.get('/api/me/deletion'), seller);
    expect(check.body.canDelete).toBe(false);
    expect(check.body.blockers[0].code).toBe('live_listings');

    const attempt = await as(app.delete('/api/me'), seller);
    expect(attempt.status).toBe(409);
  });

  it('refuses while an order of theirs is unpaid', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);
    await bid(app, ann, item.id, 25_000);
    await bringCloseForward(item.id, -1);
    await closeAuction(item.id);

    const check = await as(app.get('/api/me/deletion'), ann);
    expect(check.body.canDelete).toBe(false);
    expect(check.body.blockers[0].code).toBe('unpaid_orders');
  });

  it('anonymises rather than deleting, so the bid log still adds up', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);
    const bo = await makeUser(app);
    await bid(app, ann, item.id, 25_000);
    await bid(app, bo, item.id, 26_000);
    await as(app.put(`/api/items/${item.id}/watch`), ann);

    const before = await app.get(`/api/items/${item.id}/audit`);
    expect(before.body.bids).toHaveLength(2);

    const closed = await as(app.delete('/api/me'), ann);
    expect(closed.status).toBe(200);

    // The rows other people were party to survive, with the name gone.
    const after = await app.get(`/api/items/${item.id}/audit`);
    expect(after.body.bids).toHaveLength(2);
    expect(after.body.recomputed.highestBidCents).toBe(26_000);
    const hers = after.body.bids.find((b) => b.bidderId === ann.id);
    expect(hers.displayName).toBe('Closed account');

    // Everything that was only ever about her is gone.
    expect(await Watch.countDocuments({ userId: ann.id })).toBe(0);
    const stored = await User.findById(ann.id);
    expect(stored.email).not.toContain('@example.test');
    expect(stored.deletedAt).toBeInstanceOf(Date);
  });

  it('locks the account out afterwards, without admitting it existed', async () => {
    const ann = await makeUser(app);
    const email = ann.email;
    await as(app.delete('/api/me'), ann);

    expect((await as(app.get('/api/auth/me'), ann)).status).toBe(401);
    const login = await app
      .post('/api/auth/login')
      .send({ email, password: 'a-long-enough-password' });
    expect(login.status).toBe(401);
    expect(login.body.error).toBe('bad_credentials');
  });
});

describe('reporting a listing', () => {
  it('lands in the staff queue and counts duplicates on the same lot', async () => {
    const item = await makeItem(app, seller);
    const [ann, bo] = [await makeUser(app), await makeUser(app)];

    expect(
      (
        await as(app.post(`/api/items/${item.id}/report`), ann).send({
          reason: 'counterfeit',
          detail: 'The serial does not exist.',
        })
      ).status,
    ).toBe(201);
    await as(app.post(`/api/items/${item.id}/report`), bo).send({
      reason: 'counterfeit',
      detail: '',
    });

    const queue = await as(app.get('/api/admin/reports'), admin);
    expect(queue.body.reports).toHaveLength(2);
    expect(queue.body.reports[0].reportsOnThisItem).toBe(2);
  });

  it('refuses the same person reporting twice', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);
    const send = () =>
      as(app.post(`/api/items/${item.id}/report`), ann).send({ reason: 'other', detail: '' });

    expect((await send()).status).toBe(201);
    expect((await send()).status).toBe(409);
  });

  it('refuses a seller reporting their own lot', async () => {
    const item = await makeItem(app, seller);
    const res = await as(app.post(`/api/items/${item.id}/report`), seller).send({
      reason: 'other',
      detail: '',
    });
    expect(res.status).toBe(409);
  });

  it('can be upheld and take the listing down with it', async () => {
    const item = await makeItem(app, seller);
    const [ann, bo] = [await makeUser(app), await makeUser(app)];
    await as(app.post(`/api/items/${item.id}/report`), ann).send({
      reason: 'stolen_goods',
      detail: '',
    });
    await as(app.post(`/api/items/${item.id}/report`), bo).send({
      reason: 'stolen_goods',
      detail: '',
    });

    const queue = await as(app.get('/api/admin/reports'), admin);
    const first = queue.body.reports[0].id;

    const resolved = await as(app.post(`/api/admin/reports/${first}/resolve`), admin).send({
      outcome: 'uphold',
      note: 'Matches a police listing.',
      withdrawItem: true,
    });
    expect(resolved.body.withdrawn).toBe(true);

    expect((await AuctionItem.findById(item.id)).status).toBe('UNSOLD');
    // The other report on the same lot is decided by the same action
    // rather than left for somebody to close by hand.
    const remaining = await as(app.get('/api/admin/reports'), admin);
    expect(remaining.body.reports).toHaveLength(0);
  });
});

describe('shill detection', () => {
  it('flags a bidder who pushes a seller lots and never takes one', async () => {
    const shill = await makeUser(app);
    const genuine = await makeUser(app);

    for (let i = 0; i < 3; i += 1) {
      const item = await makeItem(app, seller);
      await bid(app, shill, item.id, 25_000);
      await bid(app, genuine, item.id, 26_000);
      await bringCloseForward(item.id, -1);
      await closeAuction(item.id);
    }

    const { suspects } = await shillSignals(seller.id);
    const flagged = suspects.find((s) => s.bidderId === shill.id);

    expect(flagged).toBeTruthy();
    expect(flagged.lotsBidOn).toBe(3);
    expect(flagged.won).toBe(0);
    expect(flagged.reasons.join(' ')).toMatch(/never takes the item/i);

    // The bidder who actually bought things is not accused of anything
    // on the strength of having bid.
    const other = suspects.find((s) => s.bidderId === genuine.id);
    expect(other?.reasons ?? []).not.toContain(
      'Bids often on this seller and almost never takes the item',
    );
  });

  it('notices a bidder on the same connection as the seller', async () => {
    const item = await makeItem(app, seller);
    const alt = await makeUser(app);
    await bid(app, alt, item.id, 25_000);

    // Supertest reports every request as coming from the same place, so
    // the digests already match; assert the signal reads it rather than
    // pretending to fake a second network.
    await User.updateOne({ _id: seller.id }, { $set: { signupIpHash: 'shared-digest' } });
    await Bid.updateMany({ bidderId: alt.id }, { $set: { ipHash: 'shared-digest' } });

    const { suspects } = await shillSignals(seller.id);
    const flagged = suspects.find((s) => s.bidderId === alt.id);
    expect(flagged.score).toBeGreaterThanOrEqual(55);
    expect(flagged.reasons.join(' ')).toMatch(/same connection/i);
  });

  it('says nothing about a seller nobody has bid on', async () => {
    const quiet = await makeUser(app, { seller: true });
    const { suspects } = await shillSignals(quiet.id);
    expect(suspects).toHaveLength(0);
  });
});
