import path from 'node:path';
import express from 'express';
import { config } from './../config.js';
import { authenticate } from './middleware/authenticate.js';
import { authRouter } from './routes/auth.js';
import { itemsRouter } from './routes/items.js';
import { bidsRouter } from './routes/bids.js';
import { ordersRouter } from './routes/orders.js';
import { watchlistRouter } from './routes/watchlist.js';
import { adminRouter } from './routes/admin.js';
import { healthRouter } from './routes/health.js';
import { log } from '../log.js';

export function createApp() {
  const app = express();

  // Behind a proxy req.ip is the load balancer, and a per-IP rate limit
  // against the load balancer limits the whole site to two bids a second.
  app.set('trust proxy', config.isProduction ? 1 : false);
  app.disable('x-powered-by');

  app.use(express.json({ limit: '256kb' }));
  app.use(authenticate);

  // Only the local media driver serves its own files; Cloudinary URLs
  // never touch this process.
  if (config.media.driver === 'local') {
    app.use(
      '/uploads',
      express.static(path.resolve(process.cwd(), config.media.localDir), {
        maxAge: '7d',
        immutable: true,
      }),
    );
  }

  app.use('/api', healthRouter);
  app.use('/api', authRouter);
  app.use('/api', itemsRouter);
  app.use('/api', bidsRouter);
  app.use('/api', ordersRouter);
  app.use('/api', watchlistRouter);
  app.use('/api', adminRouter);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'no_such_route' }));

  // eslint-disable-next-line no-unused-vars -- express identifies the
  // error handler by arity, so `next` has to stay.
  app.use((err, _req, res, _next) => {
    const status = err.status ?? (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    if (status >= 500) log.error('unhandled', { err: err.message, stack: err.stack });
    res.status(status).json({
      error: err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : err.message || 'server_error',
    });
  });

  return app;
}
