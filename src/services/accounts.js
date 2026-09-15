import crypto from 'node:crypto';
import { config } from '../config.js';
import { User } from '../db/models/User.js';
import { Token } from '../db/models/Token.js';
import { hashPassword } from './auth.js';
import { send } from '../mail/mailer.js';
import * as templates from '../mail/templates.js';
import { log } from '../log.js';

const hash = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

async function issue(user, kind, ttlMs) {
  // 32 random bytes, url-safe. Long enough that guessing is not a
  // strategy, short enough to survive being pasted out of an email
  // client that wraps lines.
  const raw = crypto.randomBytes(32).toString('base64url');

  // One live token per purpose per person: asking for a second reset
  // link retires the first, so an old email in an inbox stops working.
  await Token.deleteMany({ userId: user._id, kind, usedAt: null });
  await Token.create({
    userId: user._id,
    kind,
    tokenHash: hash(raw),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return raw;
}

async function redeem(raw, kind) {
  if (typeof raw !== 'string' || raw.length < 16) return null;
  const token = await Token.findOne({ tokenHash: hash(raw), kind, usedAt: null });
  if (!token) return null;
  if (token.expiresAt.getTime() <= Date.now()) return null;

  // Marked used before anything is done with it, and guarded on still
  // being unused, so two requests racing the same link redeem it once.
  const claimed = await Token.findOneAndUpdate(
    { _id: token._id, usedAt: null },
    { $set: { usedAt: new Date() } },
  );
  if (!claimed) return null;

  return User.findById(token.userId);
}

export async function sendVerification(user) {
  if (user.emailVerified) return { alreadyVerified: true };
  const raw = await issue(user, 'verify_email', config.tokens.verifyTtlMs);
  await send(templates.verifyEmail(user, raw));
  return { sent: true };
}

export async function confirmVerification(raw) {
  const user = await redeem(raw, 'verify_email');
  if (!user) return { error: 'invalid_token' };
  if (!user.emailVerified) {
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    await user.save();
  }
  return { user };
}

export async function requestPasswordReset(email) {
  const user = await User.findOne({ email: String(email).toLowerCase() });

  // Always the same answer. Telling a stranger whether an address has an
  // account turns this endpoint into a way to enumerate customers.
  if (!user) {
    log.info('password reset requested for unknown address');
    return { sent: true };
  }

  const raw = await issue(user, 'password_reset', config.tokens.resetTtlMs);
  await send(templates.resetPassword(user, raw));
  return { sent: true };
}

export async function resetPassword(raw, password) {
  const user = await redeem(raw, 'password_reset');
  if (!user) return { error: 'invalid_token' };

  user.passwordHash = await hashPassword(password);
  // Anything issued before now stops working. Whoever prompted the reset
  // loses their session along with everyone else's.
  user.sessionsValidFrom = new Date();

  // Reaching the link proves control of the mailbox, which is the same
  // thing verification proves.
  if (!user.emailVerified) {
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
  }
  await user.save();

  log.info('password reset', { userId: user._id.toString() });
  return { user };
}
