-- Load a room into Redis if it is not already there, and hand back what
-- is in it either way.
--
-- The refusal to overwrite is the point. An item's live price lives in
-- this hash; a lazy load racing a bid - someone opening the page at the
-- moment someone else bids - must not reset the room to its opening
-- figures. Existing state always wins, and Mongo is what rebuilds a room
-- that genuinely went missing.
--
-- KEYS[1] item state hash
-- ARGV[1..12] status, sellerId, startingPrice, reservePrice, increment,
--             highBid, winnerId, bidCount, seq, startsAt, endsAt,
--             scheduledEndsAt
-- ARGV[13] expireAt (epoch ms)

local FIELDS = {
  'status', 'sellerId', 'startingPrice', 'reservePrice', 'increment',
  'highBid', 'winnerId', 'bidCount', 'seq', 'startsAt', 'endsAt',
  'scheduledEndsAt', 'extensions',
}

if redis.call('EXISTS', KEYS[1]) == 0 then
  redis.call('HSET', KEYS[1],
    'status', ARGV[1],
    'sellerId', ARGV[2],
    'startingPrice', ARGV[3],
    'reservePrice', ARGV[4],
    'increment', ARGV[5],
    'highBid', ARGV[6],
    'winnerId', ARGV[7],
    'bidCount', ARGV[8],
    'seq', ARGV[9],
    'startsAt', ARGV[10],
    'endsAt', ARGV[11],
    'scheduledEndsAt', ARGV[12],
    'extensions', 0)
  redis.call('PEXPIREAT', KEYS[1], tonumber(ARGV[13]))
end

return redis.call('HMGET', KEYS[1], unpack(FIELDS))
