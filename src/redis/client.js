import Redis from 'ioredis';
import { config } from '../config.js';
import { log } from '../log.js';
import { attachScripts } from './scripts.js';

// BullMQ insists on maxRetriesPerRequest: null - a blocking worker
// connection must not have its BRPOPLPUSH torn out from under it.
const OPTIONS = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
};

let shared;

export function createRedis(role = 'client') {
  const client = new Redis(config.redisUrl, OPTIONS);
  client.on('error', (err) => log.error('redis error', { role, err: err.message }));
  return client;
}

// The one the API talks to. Scripts are attached here; pub/sub
// connections are duplicated off it and never run commands.
export function getRedis() {
  if (!shared) {
    shared = createRedis('main');
    attachScripts(shared);
  }
  return shared;
}

export async function closeRedis() {
  if (!shared) return;
  await shared.quit().catch(() => shared.disconnect());
  shared = undefined;
}
