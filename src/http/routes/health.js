import { Router } from 'express';
import mongoose from 'mongoose';
import { getRedis } from '../../redis/client.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const checks = { mongo: mongoose.connection.readyState === 1, redis: false };
  try {
    checks.redis = (await getRedis().ping()) === 'PONG';
  } catch {
    checks.redis = false;
  }
  const ok = checks.mongo && checks.redis;
  res.status(ok ? 200 : 503).json({ ok, checks, serverNow: Date.now() });
});
