import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    // Each file boots its own in-process Mongo and shares the local
    // Redis, so they run one at a time rather than fighting over db 15.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      REDIS_URL: 'redis://127.0.0.1:6379/15',
      // Off by default. The one test that cares about the limiter turns
      // it back on for itself, so every other test can fire a hundred
      // bids from one address without being throttled for it.
      BID_RATE_MAX: '100000',
      BID_RATE_IP_MAX: '100000',
      AUTH_RATE_IP_MAX: '100000',
      AUTH_RATE_ACCOUNT_MAX: '100000',
      // Registering forty bidders for a concurrency test is forty
      // sign-ups from one address, which is exactly what the limiter is
      // built to stop. tests/hardening.test.js turns it back on for
      // itself rather than leaving it on for everyone.
      MAIL_DRIVER: 'silent',
    },
  },
});
