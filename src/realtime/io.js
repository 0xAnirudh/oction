import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createRedis } from '../redis/client.js';
import { keys } from '../redis/keys.js';
import { EVENTS } from './events.js';
import { userFromToken } from '../services/auth.js';
import { AuctionItem } from '../db/models/AuctionItem.js';
import { ensureRoomState, readCachedMedia, cacheItemMedia } from '../services/catalog.js';
import { minimumBid } from '../core/increments.js';
import { config } from '../config.js';
import { log } from '../log.js';

let io;
let pub;
let sub;

export function initRealtime(httpServer, { cors } = {}) {
  io = new Server(httpServer, {
    cors: cors ?? { origin: true, credentials: true },
    // A bidder on a train loses the socket constantly. Let the client
    // reconnect into the same session rather than re-joining cold.
    connectionStateRecovery: { maxDisconnectionDuration: 60_000 },
  });

  // The adapter is what makes this survive a second API process: a bid
  // accepted on one node has to reach watchers held open on another.
  pub = createRedis('pub');
  sub = pub.duplicate();
  io.adapter(createAdapter(pub, sub));

  // Watching is public; bidding is not. An unauthenticated socket is
  // allowed in so the countdown works for a browsing visitor.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next();
    try {
      const user = await userFromToken(token);
      if (user)
        socket.data.user = {
          id: user._id.toString(),
          displayName: user.displayName,
        };
    } catch (err) {
      log.warn('socket auth failed', { err: err.message });
    }
    next();
  });

  io.on('connection', (socket) => {
    socket.on('room:join', async ({ itemId } = {}, ack) => {
      try {
        const item = await AuctionItem.findById(itemId);
        if (!item) return ack?.({ error: 'not_found' });

        const room = keys.room(itemId);
        await socket.join(room);

        // The room opens with everything needed to paint it: the live
        // figures and the photo set, the latter out of the media cache
        // so a hundred people arriving at a drop do not each go and ask
        // Mongo for the same eight URLs.
        const state = await ensureRoomState(item);
        const media = (await readCachedMedia(itemId)) ?? (await cacheItemMedia(item));

        ack?.({
          itemId,
          status: state.status,
          currentHighestBidCents: state.highBidCents,
          currentWinner: state.winnerId,
          bidCount: state.bidCount,
          endTime: new Date(state.endsAt),
          extensionCount: state.extensions,
          nextMinimumCents: minimumBid(
            {
              startingPriceCents: state.startingPriceCents,
              bidIncrementCents: state.incrementCents,
            },
            state.highBidCents,
          ),
          reserveMet:
            state.reservePriceCents === 0 || state.highBidCents >= state.reservePriceCents,
          media,
          softCloseWindowMs: config.softClose.windowMs,
          serverNow: Date.now(),
        });

        await broadcastPresence(itemId);
      } catch (err) {
        log.error('room join failed', { itemId, err: err.message });
        ack?.({ error: 'join_failed' });
      }
    });

    socket.on('room:leave', async ({ itemId } = {}) => {
      if (!itemId) return;
      await socket.leave(keys.room(itemId));
      await broadcastPresence(itemId);
    });

    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('auction:')) {
          const itemId = room.slice('auction:'.length);
          // The socket is still in the room at this point, so count one
          // fewer than the adapter reports.
          setTimeout(() => broadcastPresence(itemId), 0);
        }
      }
    });
  });

  return io;
}

async function broadcastPresence(itemId) {
  if (!io) return;
  try {
    const sockets = await io.in(keys.room(itemId)).allSockets();
    io.to(keys.room(itemId)).emit(EVENTS.ROOM_PRESENCE, {
      itemId,
      watchers: sockets.size,
    });
  } catch (err) {
    log.warn('presence broadcast failed', { itemId, err: err.message });
  }
}

// Safe to call before the server exists - tests exercise the bid path
// without a socket server, and a bid that cannot be broadcast is still a
// bid that happened.
export function emitToRoom(itemId, event, payload) {
  io?.to(keys.room(itemId)).emit(event, payload);
}

export function getIo() {
  return io;
}

export async function closeRealtime() {
  if (io) await io.close();
  await Promise.all([
    pub?.quit().catch(() => pub?.disconnect()),
    sub?.quit().catch(() => sub?.disconnect()),
  ]);
  io = undefined;
  pub = undefined;
  sub = undefined;
}
