-- A sliding window, in the literal sense: the set holds one member per
-- attempt scored by its arrival, everything older than the window is
-- dropped on the way in, and what remains is the count. A fixed bucket
-- would let a script fire `max` at the end of one second and `max` again
-- at the start of the next; this will not.
--
-- KEYS[1] attempt zset
-- ARGV[1] now (epoch ms)
-- ARGV[2] windowMs
-- ARGV[3] max
-- ARGV[4] member (unique per attempt)
--
-- Returns {allowed, used, retryAfterMs}

local now    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max    = tonumber(ARGV[3])
local member = ARGV[4]

if max <= 0 then return {1, 0, 0} end

redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', '(' .. tostring(now - window))
local used = redis.call('ZCARD', KEYS[1])

if used >= max then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  local retry = window
  if oldest[2] then retry = math.max(0, (tonumber(oldest[2]) + window) - now) end
  return {0, used, retry}
end

redis.call('ZADD', KEYS[1], now, member)
redis.call('PEXPIRE', KEYS[1], window)
return {1, used + 1, 0}
