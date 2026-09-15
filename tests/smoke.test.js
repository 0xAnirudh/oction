import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { startStack, stopStack, makeUser } from './helpers.js';

let app;

beforeAll(async () => {
  const stack = await startStack();
  app = supertest(stack.app);
}, 120_000);

afterAll(stopStack);

describe('the stack comes up', () => {
  it('answers health with both stores connected', async () => {
    const res = await app.get('/api/health');
    expect(res.body.checks).toEqual({ mongo: true, redis: true });
    expect(res.status).toBe(200);
  });

  it('registers and recognises a user', async () => {
    const user = await makeUser(app);
    const me = await app.get('/api/auth/me').set('authorization', `Bearer ${user.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(user.email);
  });
});
