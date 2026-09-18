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
import { login, register } from '../../services/auth.js';
import { startSession, listSessions, revokeSession, revokeAll } from '../../services/sessions.js';
import { erasureBlockers, eraseAccount, BLOCKER_TEXT } from '../../services/erasure.js';
import { config } from '../../config.js';
import {
  confirmVerification,
  requestPasswordReset,
  resetPassword,
  sendVerification,
} from '../../services/accounts.js';

export const authRouter = Router();

authRouter.post('/auth/register', authRateLimit, validate(registerSchema), async (req, res) => {
  const result = await register(req.valid.body, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  if (result.error) {
    return res.status(409).json({
      error: result.error,
      message: 'That email is already registered.',
    });
  }
  res.status(201).json({ token: result.token, user: result.user.toSelf() });
});

authRouter.post('/auth/login', authRateLimit, validate(loginSchema), async (req, res) => {
  const result = await login(req.valid.body, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
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
    const { token } = await startSession(result.user, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.json({ token, user: result.user.toSelf() });
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

// --- asking to become a seller ---------------------------------------

authRouter.post('/me/seller-application', requireAuth, async (req, res) => {
  if (req.user.sellerStatus === 'verified') {
    return res.json({ user: req.user.toSelf() });
  }
  // A confirmed address first. Verification is a human looking at the
  // account, and they need a way to reach it that is known to work.
  if (!req.user.emailVerified) {
    return res.status(409).json({
      error: 'email_not_verified',
      message: 'Confirm your email address before applying to sell.',
    });
  }
  req.user.sellerStatus = 'pending';
  await req.user.save();
  res.json({ user: req.user.toSelf() });
});

// --- terms -----------------------------------------------------------

authRouter.post('/me/accept-terms', requireAuth, async (req, res) => {
  req.user.termsAcceptedAt = new Date();
  req.user.termsVersion = config.termsVersion;
  await req.user.save();
  res.json({ user: req.user.toSelf() });
});

// --- sessions --------------------------------------------------------

authRouter.get('/me/sessions', requireAuth, async (req, res) => {
  const sessions = await listSessions(req.user._id);
  res.json({
    sessions: sessions.map((s) => s.toPublic(req.user.currentJti)),
    serverNow: Date.now(),
  });
});

authRouter.delete('/me/sessions/:id', requireAuth, async (req, res) => {
  const done = await revokeSession(req.user._id, req.params.id);
  if (!done) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

// Everything except the device asking. Signing yourself out of the
// device you are holding would be a surprising thing for a button
// labelled "sign out everywhere else" to do.
authRouter.delete('/me/sessions', requireAuth, async (req, res) => {
  const ended = await revokeAll(req.user._id, { exceptJti: req.user.currentJti });
  res.json({ ended });
});

// --- closing an account ----------------------------------------------

authRouter.get('/me/deletion', requireAuth, async (req, res) => {
  const blockers = await erasureBlockers(req.user);
  res.json({
    canDelete: blockers.length === 0,
    blockers: blockers.map((b) => ({ ...b, message: BLOCKER_TEXT[b.code] })),
  });
});

authRouter.delete('/me', requireAuth, async (req, res) => {
  const result = await eraseAccount(req.user);
  if (result.error) {
    return res.status(409).json({
      error: result.error,
      blockers: result.blockers.map((b) => ({ ...b, message: BLOCKER_TEXT[b.code] })),
    });
  }
  res.json({ closed: true });
});
