import http from 'node:http';
import { config } from './config.js';
import { log } from './log.js';
import { createApp } from './http/app.js';
import { connectMongo, disconnectMongo } from './db/mongo.js';
import { getRedis, closeRedis } from './redis/client.js';
import { initRealtime, closeRealtime } from './realtime/io.js';
import { scheduleSweep, closeQueue } from './queue/index.js';

await connectMongo();
getRedis();

const app = createApp();
const server = http.createServer(app);
initRealtime(server);

// The API asks for the sweep too, so a deployment that forgets to start
// the worker process still activates and closes auctions - late, but it
// does it.
await scheduleSweep().catch((err) => log.warn('sweep not scheduled', { err: err.message }));

server.listen(config.port, () => {
  log.info('api up', { port: config.port, env: config.env });
});

async function shutdown(signal) {
  log.info('api shutting down', { signal });
  server.close();
  await closeRealtime();
  await closeQueue();
  await closeRedis();
  await disconnectMongo();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
