-- Bring the hammer down, once.
--
-- The expiry job is a prompt, not an authority: it was scheduled against
-- an end time that a late bid may since have moved. So the worker asks
-- this script, and the script answers with the truth - closed, already
-- closed by somebody else, or still open and here is the new end time to
-- come back at. Two workers racing produce one close.
--
-- KEYS[1] item state hash
-- ARGV[1] now (epoch ms)
--
-- Returns {closed, code, highBid, winnerId, bidCount, endsAt}

local f = redis.call('HMGET', KEYS[1], 'status', 'highBid', 'winnerId', 'bidCount', 'endsAt')
local status   = f[1]
local highBid  = tonumber(f[2]) or 0
local winnerId = f[3] or ''
local bidCount = tonumber(f[4]) or 0
local endsAt   = tonumber(f[5]) or 0
local now      = tonumber(ARGV[1])

if not status then return {0, 'not_found', 0, '', 0, 0} end
if status ~= 'ACTIVE' then return {0, 'not_active', highBid, winnerId, bidCount, endsAt} end
if now < endsAt then return {0, 'still_open', highBid, winnerId, bidCount, endsAt} end

redis.call('HSET', KEYS[1], 'status', 'ENDED', 'closedAt', now)
return {1, 'ok', highBid, winnerId, bidCount, endsAt}
