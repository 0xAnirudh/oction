import { Worker } from 'bullmq';
import { QUEUE_NAME, scheduleSweep, closeQueue } from './index.js';
import { handleJob } from './handlers.js';
import { connectMongo, disconnectMongo } from '../db/mongo.js';
import { createRedis, closeRedis } from '../redis/client.js';
import { log } from '../log.js';

// The worker process. Runs alongside the API rather than inside it: a
// close that takes a second must not sit in front of a bid.

await connectMongo();
const connection = createRedis('worker');

const worker = new Worker(QUEUE_NAME, handleJob, {
  connection,
  concurrency: 8,
});

worker.on('failed', (job, err) =>
  log.error('job failed', { name: job?.name, id: job?.id, err: err.message }),
);
worker.on('completed', (job) => log.debug('job done', { name: job.name, id: job.id }));

await scheduleSweep();
log.info('workers up', { queue: QUEUE_NAME });

async function shutdown(signal) {
  log.info('workers shutting down', { signal });
  await worker.close();
  await closeQueue();
  await connection.quit().catch(() => connection.disconnect());
  await closeRedis();
  await disconnectMongo();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
