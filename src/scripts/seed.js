import fs from 'node:fs/promises';
import path from 'node:path';
import { connectMongo, disconnectMongo } from '../db/mongo.js';
import { getRedis, closeRedis } from '../redis/client.js';
import { closeQueue, scheduleAuctionClose } from '../queue/index.js';
import { User } from '../db/models/User.js';
import { AuctionItem } from '../db/models/AuctionItem.js';
import { Bid } from '../db/models/Bid.js';
import { Order } from '../db/models/Order.js';
import { hashPassword } from '../services/auth.js';
import { ensureRoomState, cacheItemMedia } from '../services/catalog.js';
import { ITEM_STATUS } from '../core/status.js';
import { config } from '../config.js';
import { log } from '../log.js';

const PASSWORD = 'oction-demo-password';

// Placeholder art, generated rather than downloaded, so a fresh clone
// has a catalogue with pictures in it and no network round trip.
async function writePlaceholder(dir, name, label, hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="hsl(${hue} 70% 62%)"/>
    <stop offset="100%" stop-color="hsl(${(hue + 45) % 360} 65% 38%)"/>
  </linearGradient></defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <text x="400" y="420" font-family="ui-sans-serif,system-ui,sans-serif" font-size="46"
        font-weight="600" fill="rgba(255,255,255,.92)" text-anchor="middle">${label}</text>
</svg>`;
  await fs.writeFile(path.join(dir, name), svg, 'utf8');
  return {
    url: `/uploads/${name}`,
    thumbUrl: `/uploads/${name}`,
    handle: name,
    width: 800,
    height: 800,
  };
}

const CATALOGUE = [
  {
    title: '1989 Nintendo Game Boy (Sealed)',
    condition: 'Vintage',
    start: 25_000,
    reserve: 40_000,
    hue: 275,
    mins: 12,
    description: 'Factory sealed in original shrink. Corners sharp, seam intact.',
  },
  {
    title: 'Jordan 1 Retro High OG "Chicago"',
    condition: 'Like New',
    start: 18_000,
    reserve: 0,
    hue: 4,
    mins: 25,
    description: 'Worn twice indoors. Original box and spare laces.',
  },
  {
    title: 'HHKB Professional Hybrid Type-S',
    condition: 'Like New',
    start: 12_000,
    reserve: 0,
    hue: 215,
    mins: 40,
    description: 'Silenced Topre 45g. Bluetooth and USB-C, boxed.',
  },
  {
    title: 'Leica M6 Classic 0.72',
    condition: 'Used',
    start: 120_000,
    reserve: 180_000,
    hue: 30,
    mins: 90,
    description: 'Meter accurate, rangefinder aligned. Brassing on the base plate.',
  },
  {
    title: 'Sony WH-1000XM5',
    condition: 'Brand New',
    start: 15_000,
    reserve: 0,
    hue: 150,
    mins: 6,
    description: 'Unopened. Two-year warranty starts on delivery.',
  },
  {
    title: 'Casio F-91W (NOS, 1991)',
    condition: 'Vintage',
    start: 2_500,
    reserve: 0,
    hue: 195,
    mins: 240,
    description: 'New old stock, original battery long dead. Strap unworn.',
  },
];

await connectMongo();
getRedis();

await Promise.all([
  User.deleteMany({}),
  AuctionItem.deleteMany({}),
  Bid.deleteMany({}),
  Order.deleteMany({}),
]);
await getRedis().flushdb();

const uploads = path.resolve(process.cwd(), config.media.localDir);
await fs.mkdir(uploads, { recursive: true });

const passwordHash = await hashPassword(PASSWORD);

const seller = await User.create({
  email: 'seller@oction.test',
  passwordHash,
  displayName: 'Rare Finds Co.',
  sellerStatus: 'verified',
});

const bidders = await User.create(
  ['ana', 'ben', 'chi', 'dev'].map((name) => ({
    email: `${name}@oction.test`,
    passwordHash,
    displayName: name[0].toUpperCase() + name.slice(1),
  })),
);

const now = Date.now();
for (const [index, entry] of CATALOGUE.entries()) {
  const image = await writePlaceholder(
    uploads,
    `seed-${index}.svg`,
    entry.title.split('(')[0].trim(),
    entry.hue,
  );
  const startTime = new Date(now - 60_000);
  const endTime = new Date(now + entry.mins * 60_000);

  const item = await AuctionItem.create({
    title: entry.title,
    description: entry.description,
    condition: entry.condition,
    images: [image],
    sellerId: seller._id,
    startingPriceCents: entry.start,
    reservePriceCents: entry.reserve,
    startTime,
    endTime,
    scheduledEndTime: endTime,
    status: ITEM_STATUS.ACTIVE,
    shippingDetails: { weightKg: 1.2, shipsFrom: 'Bengaluru, IN' },
  });

  await ensureRoomState(item);
  await cacheItemMedia(item);
  await scheduleAuctionClose(item._id.toString(), endTime.getTime());
}

log.info('seeded', { items: CATALOGUE.length, bidders: bidders.length });
console.log(`
  Seeded ${CATALOGUE.length} live items.

  seller   seller@oction.test
  bidders  ana@ / ben@ / chi@ / dev@oction.test
  password ${PASSWORD}
`);

await closeQueue();
await closeRedis();
await disconnectMongo();
