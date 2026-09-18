import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import ms from './ms.js';
import { config } from '../config.js';
import { Session } from '../db/models/Session.js';
import { hashIp, describeDevice } from './privacy.js';

// A session per sign-in, so one can be ended without ending the rest.
//
// The account-wide cutoff on User is still there and still right for a
// password reset - it ends everything at once. This is the finer
// instrument: each token names a session, and a revoked session refuses
// the token that names it.

export async function startSession(user, { ip, userAgent } = {}) {
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ms(config.jwtTtl));

  await Session.create({
    userId: user._id,
    jti,
    label: describeDevice(userAgent),
    ipHash: hashIp(ip),
    expiresAt,
    lastSeenAt: new Date(),
  });

  const token = jwt.sign(
    // `ms` alongside the standard `iat`, because `iat` is whole seconds
    // and the account cutoff is not.
    { sub: user._id.toString(), jti, ms: Date.now() },
    config.jwtSecret,
    { expiresIn: config.jwtTtl },
  );

  return { token, jti };
}

// Tokens minted before sessions existed carry no jti. Those are allowed
// through on the account cutoff alone rather than being invalidated by
// a deployment - the alternative is signing everybody out to ship a
// feature.
export async function sessionFor(payload) {
  if (!payload?.jti) return { ok: true, session: null };
  const session = await Session.findOne({ jti: payload.jti });
  if (!session) return { ok: false };
  if (session.revokedAt) return { ok: false };
  return { ok: true, session };
}

// Written at most once a minute. A timestamp that is accurate to the
// minute is worth a fraction of a write per request; one that is
// accurate to the millisecond is a write on every request.
const TOUCH_EVERY_MS = 60_000;

export function touch(session) {
  if (!session) return;
  if (Date.now() - session.lastSeenAt.getTime() < TOUCH_EVERY_MS) return;
  Session.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
}

export function listSessions(userId) {
  return Session.find({ userId, revokedAt: null }).sort({ lastSeenAt: -1 }).limit(50);
}

export async function revokeSession(userId, sessionId) {
  const result = await Session.updateOne(
    { _id: sessionId, userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  return result.modifiedCount > 0;
}

export async function revokeAll(userId, { exceptJti = null } = {}) {
  const filter = { userId, revokedAt: null };
  if (exceptJti) filter.jti = { $ne: exceptJti };
  const result = await Session.updateMany(filter, { $set: { revokedAt: new Date() } });
  return result.modifiedCount;
}
