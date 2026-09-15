import { keys } from '../../redis/keys.js';
import { config } from '../../config.js';
import { consume } from '../../services/rateLimit.js';

// Sign-in and registration sit behind the same sliding window as bids.
//
// Only the address is counted here. Counting attempts per account would
// hand anyone a way to lock a stranger out of their own login by failing
// at it on purpose, so the per-account bucket is charged on failure
// instead, in the auth service.
export function authRateLimit(req, res, next) {
  const { ipMax, ipWindowMs } = config.rateLimit.auth;

  consume([{ name: 'ip', key: keys.authRateIp(req.ip || 'unknown'), max: ipMax, windowMs: ipWindowMs }])
    .then((result) => {
      if (result.allowed) return next();
      res.set('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
      return res.status(429).json({
        error: 'rate_limited',
        message: 'Too many attempts from this address. Wait a moment.',
      });
    })
    .catch(next);
}
