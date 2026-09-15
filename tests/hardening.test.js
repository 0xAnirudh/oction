import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import crypto from 'node:crypto';
import { startStack, stopStack, resetData, makeUser, makeItem } from './helpers.js';
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

describe('idempotent bids', () => {
  it('answers a replayed bid without placing a second one', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);
    const key = crypto.randomUUID();

    const send = () =>
      app
        .post(`/api/items/${item.id}/bids`)
        .set('authorization', `Bearer ${ann.token}`)
        .set('idempotency-key', key)
        .send({ amountCents: 25_000 });

    const first = await send();
    const second = await send();

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers['idempotent-replay']).toBe('true');
    expect(second.body.bid.seq).toBe(first.body.bid.seq);

    // The price moved once, not twice.
    const view = await app.get(`/api/items/${item.id}`);
    expect(view.body.item.bidCount).toBe(1);
    expect(view.body.item.currentHighestBidCents).toBe(25_000);
  });

  it('keeps keys separate per lot', async () => {
    const [one, two] = [await makeItem(app, seller), await makeItem(app, seller)];
    const ann = await makeUser(app);
    const key = crypto.randomUUID();

    const bid = (itemId) =>
      app
        .post(`/api/items/${itemId}/bids`)
        .set('authorization', `Bearer ${ann.token}`)
        .set('idempotency-key', key)
        .send({ amountCents: 25_000 });

    expect((await bid(one.id)).status).toBe(201);
    const other = await bid(two.id);

    // Same key, different lot: a real bid, not a replay of the first.
    expect(other.status).toBe(201);
    expect(other.headers['idempotent-replay']).toBeUndefined();
    expect((await app.get(`/api/items/${two.id}`)).body.item.bidCount).toBe(1);
  });

  it('replays a rejection too, rather than retrying it', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);
    const key = crypto.randomUUID();

    const send = () =>
      app
        .post(`/api/items/${item.id}/bids`)
        .set('authorization', `Bearer ${ann.token}`)
        .set('idempotency-key', key)
        .send({ amountCents: 100 });

    const first = await send();
    const second = await send();
    expect(first.status).toBe(409);
    expect(second.status).toBe(409);
    expect(second.headers['idempotent-replay']).toBe('true');
  });

  it('still takes bids with no key at all', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);
    const res = await app
      .post(`/api/items/${item.id}/bids`)
      .set('authorization', `Bearer ${ann.token}`)
      .send({ amountCents: 25_000 });
    expect(res.status).toBe(201);
  });

  it('refuses a key that is not a sane string', async () => {
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);
    const res = await app
      .post(`/api/items/${item.id}/bids`)
      .set('authorization', `Bearer ${ann.token}`)
      .set('idempotency-key', 'x'.repeat(300))
      .send({ amountCents: 25_000 });
    expect(res.status).toBe(400);
  });
});

describe('auth rate limiting', () => {
  it('throttles repeated attempts from one address', async () => {
    const previous = { ...config.rateLimit.auth };
    config.rateLimit.auth.ipMax = 3;
    config.rateLimit.auth.ipWindowMs = 60_000;

    try {
      const results = [];
      for (let i = 0; i < 6; i += 1) {
        results.push(
          await app
            .post('/api/auth/login')
            .send({ email: 'nobody@example.test', password: 'wrong-password' }),
        );
      }
      const limited = results.filter((r) => r.status === 429);
      expect(limited.length).toBeGreaterThan(0);
      expect(limited[0].headers['retry-after']).toBeDefined();
    } finally {
      Object.assign(config.rateLimit.auth, previous);
    }
  });

  it('counts failures against an account but not attempts', async () => {
    const previous = { ...config.rateLimit.auth };
    config.rateLimit.auth.accountMax = 3;
    config.rateLimit.auth.accountWindowMs = 900_000;

    try {
      const user = await makeUser(app);

      // Signing in correctly, repeatedly, must never be throttled - the
      // account bucket is only charged when the password is wrong.
      for (let i = 0; i < 5; i += 1) {
        const ok = await app
          .post('/api/auth/login')
          .send({ email: user.email, password: 'a-long-enough-password' });
        expect(ok.status).toBe(200);
      }

      for (let i = 0; i < 4; i += 1) {
        await app.post('/api/auth/login').send({ email: user.email, password: 'not-the-password' });
      }

      const after = await app
        .post('/api/auth/login')
        .send({ email: user.email, password: 'a-long-enough-password' });
      expect(after.status).toBe(429);
    } finally {
      Object.assign(config.rateLimit.auth, previous);
    }
  });
});
