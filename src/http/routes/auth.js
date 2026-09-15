import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/authenticate.js';
import { authRateLimit } from '../middleware/rateLimit.js';
import {
  confirmTokenSchema,
  loginSchema,
  registerSchema,
  notifyPrefsSchema,
  requestResetSchema,
  resetPasswordSchema,
} from '../schemas.js';
import { login, register, signToken } from '../../services/auth.js';
import {
  confirmVerification,
  requestPasswordReset,
  resetPassword,
  sendVerification,
} from '../../services/accounts.js';

export const authRouter = Router();

authRouter.post('/auth/register', authRateLimit, validate(registerSchema), async (req, res) => {
  const result = await register(req.valid.body);
  if (result.error) {
    return res.status(409).json({
      error: result.error,
      message: 'That email is already registered.',
    });
  }
  res.status(201).json({ token: result.token, user: result.user.toSelf() });
});

authRouter.post('/auth/login', authRateLimit, validate(loginSchema), async (req, res) => {
  const result = await login(req.valid.body);
  if (result.error === 'rate_limited') {
    res.set('Retry-After', String(Math.ceil((result.retryAfterMs ?? 60_000) / 1000)));
    return res.status(429).json({
      error: 'rate_limited',
      message: 'Too many failed attempts on this account. Try again shortly.',
    });
  }
  if (result.error) {
    return res.status(401).json({
      error: result.error,
      message: 'Those details do not match an account.',
    });
  }
  res.json({ token: result.token, user: result.user.toSelf() });
});

authRouter.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toSelf() });
});

// --- email verification -------------------------------------------

authRouter.post('/auth/verify/request', authRateLimit, requireAuth, async (req, res) => {
  const result = await sendVerification(req.user);
  // The same answer whether it was sent or the address was already
  // confirmed, so this cannot be used to probe account state.
  res.json({ ok: true, alreadyVerified: Boolean(result.alreadyVerified) });
});

authRouter.post(
  '/auth/verify/confirm',
  authRateLimit,
  validate(confirmTokenSchema),
  async (req, res) => {
    const result = await confirmVerification(req.valid.body.token);
    if (result.error) {
      return res.status(400).json({
        error: result.error,
        message: 'That link has expired or has already been used.',
      });
    }
    res.json({ user: result.user.toSelf() });
  },
);

// --- password reset -----------------------------------------------

authRouter.post(
  '/auth/password/forgot',
  authRateLimit,
  validate(requestResetSchema),
  async (req, res) => {
    await requestPasswordReset(req.valid.body.email);
    // Always the same answer. Anything else turns this into a way to
    // find out which addresses have accounts.
    res.json({ ok: true });
  },
);

authRouter.post(
  '/auth/password/reset',
  authRateLimit,
  validate(resetPasswordSchema),
  async (req, res) => {
    const result = await resetPassword(req.valid.body.token, req.valid.body.password);
    if (result.error) {
      return res.status(400).json({
        error: result.error,
        message: 'That link has expired or has already been used.',
      });
    }
    // A fresh session for the device that did the reset; every other
    // token for this account is now refused.
    res.json({ token: signToken(result.user), user: result.user.toSelf() });
  },
);

// --- notification preferences ---------------------------------------

authRouter.patch(
  '/me/notifications',
  requireAuth,
  validate(notifyPrefsSchema),
  async (req, res) => {
    const wanted = req.valid.body;
    for (const key of ['outbid', 'won', 'closingSoon']) {
      if (typeof wanted[key] === 'boolean') req.user.notify[key] = wanted[key];
    }
    await req.user.save();
    res.json({ user: req.user.toSelf() });
  },
);
