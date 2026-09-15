-- Claim a request key, or hand back what the first attempt answered.
--
-- A bid is not safe to repeat. A phone that changes network between
-- sending a bid and reading the reply has no way to know whether it
-- landed, and the honest thing for it to do is send it again - which,
-- without this, walks the price up twice for one intent.
--
-- Three answers: the caller is first and should proceed, an identical
-- request is still in flight, or here is the reply the first one got.
--
-- KEYS[1] idempotency key
-- ARGV[1] ttl in ms
--
-- Returns {state, payload} where state is new | in_flight | done

local IN_FLIGHT = '__in_flight__'

local existing = redis.call('GET', KEYS[1])
if existing then
  if existing == IN_FLIGHT then return { 'in_flight', '' } end
  return { 'done', existing }
end

redis.call('SET', KEYS[1], IN_FLIGHT, 'PX', tonumber(ARGV[1]))
return { 'new', '' }
