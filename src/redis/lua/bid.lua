-- Place a bid. The whole decision happens here, start to finish, with
-- nothing interleaved.
--
-- Done in JavaScript - read the price, compare, write it back - two
-- bidders clearing the same rung at the same moment both read the same
-- opening price and both win. Redis runs a script to completion before
-- it looks at another client, so the second bid sees what the first one
-- left. That is the entire reason this file exists.
--
-- KEYS[1] item state hash
--
-- ARGV[1] bidderId
-- ARGV[2] amountCents
-- ARGV[3] now (epoch ms)
-- ARGV[4] softCloseWindowMs
-- ARGV[5] softCloseExtendMs
-- ARGV[6] maxBidCents      -- fat-finger ceiling
--
-- Returns {ok, code, highBid, winnerId, bidCount, seq, endsAt, extended, nextMinimum}

-- Kept in step with src/core/increments.js by tests/increments.test.js,
-- which walks both across the same prices and compares.
local function ladder(price)
  if price < 50000 then return 1000 end
  return 5000
end

local f = redis.call('HMGET', KEYS[1],
  'status', 'sellerId', 'startingPrice', 'increment',
  'highBid', 'winnerId', 'bidCount', 'seq', 'startsAt', 'endsAt')

local status        = f[1]
local sellerId      = f[2] or ''
local startingPrice = tonumber(f[3]) or 0
local increment     = tonumber(f[4]) or 0
local highBid       = tonumber(f[5]) or 0
local winnerId      = f[6] or ''
local bidCount      = tonumber(f[7]) or 0
local seq           = tonumber(f[8]) or 0
local startsAt      = tonumber(f[9]) or 0
local endsAt        = tonumber(f[10]) or 0

local bidder = ARGV[1]
local amount = tonumber(ARGV[2])
local now    = tonumber(ARGV[3])
local window = tonumber(ARGV[4])
local extend = tonumber(ARGV[5])
local maxBid = tonumber(ARGV[6])

local function minimum()
  if highBid == 0 then return startingPrice end
  local step = increment
  if step <= 0 then step = ladder(highBid) end
  return highBid + step
end

local function fail(code)
  return {0, code, highBid, winnerId, bidCount, seq, endsAt, 0, minimum()}
end

if not status then return {0, 'not_found', 0, '', 0, 0, 0, 0, 0} end
if status == 'UPCOMING' or now < startsAt then return fail('not_started') end
if status ~= 'ACTIVE' then return fail('not_active') end
if now >= endsAt then return fail('closed') end
if bidder == sellerId then return fail('seller') end
if bidder == winnerId then return fail('already_leading') end
if amount > maxBid then return fail('above_cap') end
if amount < minimum() then return fail('too_low') end

seq = redis.call('HINCRBY', KEYS[1], 'seq', 1)
bidCount = redis.call('HINCRBY', KEYS[1], 'bidCount', 1)
highBid = amount
winnerId = bidder

-- Anti-sniping. The close moves to a fixed distance from the bid that
-- caused it, never by a delta added to what was already there, so
-- hammering the button in the last second cannot ratchet the auction
-- open forever.
local extended = 0
if endsAt - now <= window then
  endsAt = now + extend
  redis.call('HINCRBY', KEYS[1], 'extensions', 1)
  extended = 1
end

redis.call('HSET', KEYS[1],
  'highBid', highBid,
  'winnerId', winnerId,
  'endsAt', endsAt,
  'lastBidAt', now)

-- Outlive the auction by a day so settlement can still read the room.
redis.call('PEXPIREAT', KEYS[1], endsAt + 86400000)

return {1, 'ok', highBid, winnerId, bidCount, seq, endsAt, extended, minimum()}
