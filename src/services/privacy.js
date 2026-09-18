import crypto from 'node:crypto';
import { config } from '../config.js';

// Correlating two accounts that act from the same place does not
// require keeping anyone's address.
//
// A salted digest answers "were these the same connection" and nothing
// else: it cannot be reversed, and without the salt it cannot be
// rainbow-tabled either, which a bare SHA-256 of an IPv4 address very
// much can be - there are only four billion of them.
const salt = () => config.ipHashSecret || config.jwtSecret;

export function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHmac('sha256', salt()).update(String(ip)).digest('hex').slice(0, 24);
}

// A device label from a user agent, for a list of sessions. Enough to
// tell a phone from a laptop; deliberately not a fingerprint.
export function describeDevice(userAgent = '') {
  const ua = String(userAgent);
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : /Firefox\//.test(ua)
            ? 'Firefox'
            : null;

  const platform = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;

  if (browser && platform) return `${browser} on ${platform}`;
  return browser ?? platform ?? 'Unknown device';
}
