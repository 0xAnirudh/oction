import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import { startStack, stopStack, resetData, makeUser, makeItem } from './helpers.js';
import { config } from '../src/config.js';
import { drainOutbox } from '../src/mail/mailer.js';
import { User } from '../src/db/models/User.js';

let app;

beforeAll(async () => {
  const stack = await startStack();
  app = supertest(stack.app);
}, 180_000);

afterAll(stopStack);

beforeEach(async () => {
  await resetData();
  config.mail.driver = 'capture';
  drainOutbox();
});

// The token only ever exists in the message - what is stored is a hash
// of it - so the test reads it the way a person would.
const tokenFrom = (message) => message.text.match(/token=([\w-]+)/)?.[1];

describe('email verification', () => {
  it('sends a link when an account is opened', async () => {
    const user = await makeUser(app);
    const sent = drainOutbox();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(user.email);
    expect(sent[0].subject).toMatch(/confirm/i);
    expect(tokenFrom(sent[0])).toBeTruthy();
  });

  it('confirms the address when the link is followed', async () => {
    const user = await makeUser(app);
    const token = tokenFrom(drainOutbox()[0]);

    const res = await app.post('/api/auth/verify/confirm').send({ token });
    expect(res.status).toBe(200);
    expect(res.body.user.emailVerified).toBe(true);

    const stored = await User.findOne({ email: user.email });
    expect(stored.emailVerified).toBe(true);
  });

  it('refuses a link twice', async () => {
    await makeUser(app);
    const token = tokenFrom(drainOutbox()[0]);

    expect((await app.post('/api/auth/verify/confirm').send({ token })).status).toBe(200);
    expect((await app.post('/api/auth/verify/confirm').send({ token })).status).toBe(400);
  });

  it('refuses a token that was never issued', async () => {
    const res = await app.post('/api/auth/verify/confirm').send({ token: 'x'.repeat(43) });
    expect(res.status).toBe(400);
  });
});

describe('password reset', () => {
  it('answers the same whether the address exists or not', async () => {
    const user = await makeUser(app);
    drainOutbox();

    const known = await app.post('/api/auth/password/forgot').send({ email: user.email });
    const sentForKnown = drainOutbox();

    const unknown = await app
      .post('/api/auth/password/forgot')
      .send({ email: 'nobody@example.test' });
    const sentForUnknown = drainOutbox();

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);

    // Same answer to the caller, different behaviour behind it.
    expect(sentForKnown).toHaveLength(1);
    expect(sentForUnknown).toHaveLength(0);
  });

  it('changes the password and lets the new one in', async () => {
    const user = await makeUser(app);
    drainOutbox();
    await app.post('/api/auth/password/forgot').send({ email: user.email });
    const token = tokenFrom(drainOutbox()[0]);

    const reset = await app
      .post('/api/auth/password/reset')
      .send({ token, password: 'a-brand-new-password' });
    expect(reset.status).toBe(200);
    expect(reset.body.token).toBeTruthy();

    const old = await app
      .post('/api/auth/login')
      .send({ email: user.email, password: 'a-long-enough-password' });
    expect(old.status).toBe(401);

    const fresh = await app
      .post('/api/auth/login')
      .send({ email: user.email, password: 'a-brand-new-password' });
    expect(fresh.status).toBe(200);
  });

  it('signs out every device holding an older session', async () => {
    const user = await makeUser(app);
    drainOutbox();

    // The session on some other device, taken before the reset.
    const before = await app.get('/api/auth/me').set('authorization', `Bearer ${user.token}`);
    expect(before.status).toBe(200);

    await app.post('/api/auth/password/forgot').send({ email: user.email });
    const token = tokenFrom(drainOutbox()[0]);
    const reset = await app
      .post('/api/auth/password/reset')
      .send({ token, password: 'a-brand-new-password' });

    const after = await app.get('/api/auth/me').set('authorization', `Bearer ${user.token}`);
    expect(after.status).toBe(401);

    // The device that did the reset is signed in.
    const current = await app
      .get('/api/auth/me')
      .set('authorization', `Bearer ${reset.body.token}`);
    expect(current.status).toBe(200);
  });

  it('treats following the link as proof of the address', async () => {
    const user = await makeUser(app);
    drainOutbox();
    await app.post('/api/auth/password/forgot').send({ email: user.email });
    const token = tokenFrom(drainOutbox()[0]);

    await app.post('/api/auth/password/reset').send({ token, password: 'a-brand-new-password' });
    const stored = await User.findOne({ email: user.email });
    expect(stored.emailVerified).toBe(true);
  });
});

describe('watchlist', () => {
  it('saves a lot, lists it, and drops it again', async () => {
    const seller = await makeUser(app, { seller: true });
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);
    const auth = (r) => r.set('authorization', `Bearer ${ann.token}`);

    expect((await auth(app.put(`/api/items/${item.id}/watch`))).status).toBe(200);

    const list = await auth(app.get('/api/watchlist'));
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(item.id);

    const view = await auth(app.get(`/api/items/${item.id}`));
    expect(view.body.item.watching).toBe(true);

    expect((await auth(app.delete(`/api/items/${item.id}/watch`))).status).toBe(200);
    expect((await auth(app.get('/api/watchlist'))).body.items).toHaveLength(0);
  });

  it('is idempotent - watching twice is watching once', async () => {
    const seller = await makeUser(app, { seller: true });
    const item = await makeItem(app, seller);
    const ann = await makeUser(app);
    const watch = () =>
      app.put(`/api/items/${item.id}/watch`).set('authorization', `Bearer ${ann.token}`);

    await Promise.all([watch(), watch(), watch()]);
    const list = await app.get('/api/watchlist').set('authorization', `Bearer ${ann.token}`);
    expect(list.body.items).toHaveLength(1);
  });

  it('needs an account', async () => {
    expect((await app.get('/api/watchlist')).status).toBe(401);
  });
});
