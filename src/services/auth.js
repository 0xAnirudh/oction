import crypto from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../db/models/User.js';
import { keys } from '../redis/keys.js';
import { peek, record } from './rateLimit.js';
import { startSession, sessionFor, touch } from './sessions.js';
import { hashIp } from './privacy.js';

const scrypt = promisify(crypto.scrypt);

// scrypt out of node:crypto rather than bcrypt. It is a memory-hard KDF
// in the standard library, which means no native build step and nothing
// to rebuild when Node moves - and the parameters are written into the
// stored string, so they can be raised later without invalidating the
// hashes already on disk.
const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, PARAMS.keylen, PARAMS);
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, N, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const derived = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  // Constant time: a comparison that returns early leaks how much of the
  // hash was right.
  return crypto.timingSafeEqual(derived, expected);
}

// A token with no session behind it. Kept for the one caller that has
// no request context to attach a device to; everything a person signs
// into goes through startSession instead.
export function signToken(user) {
  // `ms` alongside the standard `iat`, because `iat` is whole seconds
  // and the account cutoff is not. Without it, every token minted in
  // the same second as a password reset outlives the reset - a one
  // second hole in the only mechanism that can end a session early.
  return jwt.sign({ sub: user._id.toString(), ms: Date.now() }, config.jwtSecret, {
    expiresIn: config.jwtTtl,
  });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

export async function userFromToken(token) {
  const payload = verifyToken(token);
  if (!payload?.sub) return null;

  const user = await User.findById(payload.sub);
  if (!user) return null;

  // A closed account is not a way back in.
  if (user.deletedAt) return null;

  // A JWT cannot be recalled, but it can be outrun. Anything issued
  // before the account's cutoff is refused, which is what makes a
  // password reset actually sign out the other devices rather than
  // only appearing to.
  if (user.sessionsValidFrom) {
    const cutoff = user.sessionsValidFrom.getTime();
    const issued = typeof payload.ms === 'number' ? payload.ms : (payload.iat ?? 0) * 1000;
    if (issued < cutoff) return null;
  }

  // The finer check: this particular device may have been signed out
  // while the rest of the account's sessions stayed live.
  const { ok, session } = await sessionFor(payload);
  if (!ok) return null;
  touch(session);

  user.currentJti = payload.jti ?? null;
  return user;
}

export async function register({ email, password, displayName }, context = {}) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return { error: 'email_taken' };

  const user = await User.create({
    email: email.toLowerCase(),
    passwordHash: await hashPassword(password),
    displayName,
    // Recorded at the moment of agreement, with the version agreed to.
    termsAcceptedAt: new Date(),
    termsVersion: config.termsVersion,
    signupIpHash: hashIp(context.ip),
  });

  // Imported here rather than at the top: accounts.js imports
  // hashPassword from this file, and a cycle at module load would leave
  // one of the two half-initialised.
  const { sendVerification } = await import('./accounts.js');
  await sendVerification(user).catch(() => {});

  const { token } = await startSession(user, context);
  return { user, token };
}

export async function login({ email, password }, context = {}) {
  const address = email.toLowerCase();
  const { accountMax, accountWindowMs } = config.rateLimit.auth;
  const bucket = keys.authRateAccount(address);

  // Checked before the password is, but only ever *charged* on a
  // failure below - so a stranger cannot spend someone else's allowance
  // and lock them out of their own account.
  const gate = await peek([
    { name: 'account', key: bucket, max: accountMax, windowMs: accountWindowMs },
  ]);
  if (!gate.allowed) {
    return { error: 'rate_limited', retryAfterMs: gate.retryAfterMs };
  }

  const user = await User.findOne({ email: address });
  // Hash anyway on a miss so a missing account and a wrong password take
  // the same time to answer.
  const stored = user?.passwordHash ?? (await hashPassword(crypto.randomUUID()));
  const ok = await verifyPassword(password, stored);
  if (!user || !ok) {
    await record(bucket, accountWindowMs);
    return { error: 'bad_credentials' };
  }
  // A closed account answers the same as a wrong password. Saying
  // "that account was deleted" confirms it existed.
  if (user.deletedAt) {
    await record(bucket, accountWindowMs);
    return { error: 'bad_credentials' };
  }

  const { token } = await startSession(user, context);
  return { user, token };
}
