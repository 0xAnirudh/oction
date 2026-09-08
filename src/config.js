// Every tunable in one place. The numbers that shape how the auction
// feels - the sniping window, the checkout leash, the bid rate limit -
// are design decisions, so they are named and commented rather than
// buried as literals three calls deep.

const str = (v, fallback) => (v === undefined || v === '' ? fallback : v);
const int = (v, fallback) => (v === undefined || v === '' ? fallback : Number.parseInt(v, 10));

const env = str(process.env.NODE_ENV, 'development');

export const config = {
  env,
  isProduction: env === 'production',
  isTest: env === 'test',
  port: int(process.env.PORT, 4200),

  mongoUri: str(process.env.MONGO_URI, 'mongodb://127.0.0.1:27017/oction'),
  redisUrl: str(process.env.REDIS_URL, 'redis://127.0.0.1:6379'),

  jwtSecret: str(process.env.JWT_SECRET, 'dev-secret-change-me'),
  jwtTtl: str(process.env.JWT_TTL, '7d'),

  // Anti-sniping. A bid inside the window pushes the close out to
  // `extendToMs` from the moment it landed - not by a fixed delta, so a
  // flurry of bids in the last second cannot stack extensions into an
  // auction that never ends.
  softClose: {
    windowMs: int(process.env.SOFT_CLOSE_WINDOW_MS, 15_000),
    extendToMs: int(process.env.SOFT_CLOSE_EXTEND_MS, 30_000),
  },

  // How long the winner holds the item before it rolls down.
  checkoutTtlMs: int(process.env.CHECKOUT_TTL_MS, 15 * 60 * 1000),

  // Bids per bidder and per IP. Enough for a human hammering a button,
  // not enough for a script walking the ladder.
  rateLimit: {
    bids: {
      max: int(process.env.BID_RATE_MAX, 2),
      windowMs: int(process.env.BID_RATE_WINDOW_MS, 1000),
      // A whole office, a campus or a phone network arrives as one
      // address, so the per-IP ceiling is a multiple of the per-user one.
      // It is there to stop one machine, not to punish a shared exit.
      ipMax: int(process.env.BID_RATE_IP_MAX, 12),
    },
  },

  // Fat-finger ceiling. An extra zero on a keyboard bid is a typo, and a
  // typo that wins an auction is a support ticket and a refund.
  maxBidCents: int(process.env.MAX_BID_CENTS, 100_000_000),

  media: {
    driver: str(process.env.MEDIA_DRIVER, 'local'), // 'local' | 'cloudinary'
    localDir: str(process.env.MEDIA_LOCAL_DIR, 'uploads'),
    maxBytes: int(process.env.MEDIA_MAX_BYTES, 8 * 1024 * 1024),
    maxPerItem: int(process.env.MEDIA_MAX_PER_ITEM, 8),
    cloudinary: {
      cloudName: str(process.env.CLOUDINARY_CLOUD_NAME, ''),
      apiKey: str(process.env.CLOUDINARY_API_KEY, ''),
      apiSecret: str(process.env.CLOUDINARY_API_SECRET, ''),
      folder: str(process.env.CLOUDINARY_FOLDER, 'oction'),
    },
  },
};
