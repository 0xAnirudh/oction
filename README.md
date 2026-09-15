# Oction

A live auction house for physical goods. Sealed Game Boys, worn-twice
Jordans, a Leica with brassing on the base plate. Thirty seconds on the
clock and five hundred people trying to win the same rung.

```bash
npm install
npm run mongo:dev    # or: docker compose up -d mongo
npm run seed
npm run dev          # api :4200, workers, web :5175
```

Needs Redis on 6379. Copy `.env.example` to `.env` if you want to change
anything; every value has a working default except `JWT_SECRET`, which
you should set before this is reachable by anyone else.

The seed puts six live lots on the board and prints the accounts to bid
with.

---

## What is interesting about it

**One rung, one winner, decided inside Redis.** A bid is read, compared
and written by [a single Lua script](src/redis/lua/bid.lua). Done in
JavaScript - read the price, check it, write it back - two people
clearing $190 in the same millisecond both read $180 and both win. Redis
runs a script to completion before it looks at another client, so the
second one sees what the first one left. Five hundred bidders firing the
same amount at the same instant produce one acceptance and four hundred
and ninety-nine rejections, and `npm run loadtest` is the proof:

```
  $   200.00  accepted   1 / 500   ok
  $   210.00  accepted   1 / 500   ok
  ...ten rungs, ten winners

  requests     5000
  too_low      4985
  accepted        10
  already_leading  5

  latency p50  288.8 ms    p95  409.0 ms    p99  499.6 ms
```

**The close is a fact in Redis, not a job in a queue.** Anti-sniping is
easy to get subtly wrong: extend the auction by pushing the expiry job
out thirty seconds and two late bids stack into an auction that outlives
its own countdown. So the end time lives in the room's hash, a bid inside
the window moves it to a *fixed distance from the bid that caused it*,
and the delayed job is only a prompt. When it fires,
[close.lua](src/redis/lua/close.lua) answers one of three ways - closed,
already closed by somebody else, or still open and here is the new time
to come back at - and the worker reschedules itself. Extensions touch no
queue state at all, so a lost or duplicated job cannot desynchronise the
hammer from the clock everyone is watching.

**There is a bid log, and the system does not work without one.** The
original design kept `currentHighestBid` and `currentWinner` on the item.
That is enough to run an auction and not enough to finish one: when a
winner fails to check out, the item rolls down to the runner-up, and a
field holding one name cannot tell you who that is. So every accepted bid
is appended to [its own collection](src/db/models/Bid.js) with a gap-free
per-item sequence. It buys three things - the roll-down list, a room that
can be rebuilt if Redis is evicted, and `GET /api/items/:id/audit`, which
hands anyone who lost a lot the whole log and the winner recomputed from
it rather than read off a field.

**Money is integer cents, everywhere.** A bid path doing float
arithmetic on dollars eventually rejects `40.15` for being under `40.15`.
It will do it once, in production, at the close of something expensive.

**A bid can be repeated without being repeated.** The Lua script makes a
bid atomic; it does not make it unrepeatable, and those are different
problems. A phone that changes network between sending a bid and reading
the reply has no way to know whether it landed, and the honest thing for
it to do is send it again - which walks the price up twice for one
intent. An `Idempotency-Key` closes that, scoped per lot, replaying the
original answer rather than retrying the action.

**A password reset really does sign out the other devices.** A JWT
cannot be recalled, so each account carries a cutoff and every token
issued before it is refused. The token carries a millisecond claim of
its own, because `iat` is whole seconds and the rounding left a one
second window where a token minted during the reset outlived it.

---

## Layout

```
src/redis/lua/         five scripts: bid, close, ensure_state, rate_limit,
                       idempotency
src/services/          bidding, settlement, catalog, auth, accounts,
                       notifications, rate limiting, idempotency
src/queue/             BullMQ workers, and the sweep that catches lost jobs
src/realtime/          socket.io rooms, keyed auction:{itemId}
src/mail/              two drivers and the message templates
src/db/models/         User, AuctionItem, Bid, Order, Watch, Token, Dispute
src/core/              the increment ladder and money, shared with the web
web/src/               React, Tailwind, one socket per room
loadtest/              the storm, in k6 and in plain Node
tests/                 70 tests
```

```bash
npm test               # in-process mongo, real redis on db 15
npm run loadtest       # prepare, storm, then verify the log
npm run loadtest:k6    # the same claim as a k6 threshold
```

The ladder lives twice - once in JavaScript for the interface, once in
Lua inside the bid script - because the client has to show a minimum bid
without asking the server first. `tests/bidding.test.js` walks a lot up
through the $500 boundary and checks the two never disagree.

---

## Decisions that differ from the brief

**Integer cents, not `Number` dollars.** For the reason above. Fields are
named `startingPriceCents` and so on, so the unit is impossible to
mistake at a call site.

**`images` are objects, not strings.** The brief asked for thumbnails; a
bare URL has nowhere to put one, or the storage handle needed to delete
the file later.

**scrypt from `node:crypto` rather than bcrypt.** A memory-hard KDF in
the standard library, no native build step, and the parameters are
written into the stored hash so they can be raised later without
invalidating existing passwords.

**Proxy bidding is not in here.** An earlier draft of this used
second-price proxy bids - state your maximum once, pay only what it took
to beat the runner-up. The brief specifies direct bidding against a fixed
increment, so that is what this does. The two are not compatible and the
choice is a product decision, not a technical one.

**Cloudinary is wired but not the default.** `MEDIA_DRIVER=local` writes
to `./uploads` so a fresh clone runs with no credentials;
`MEDIA_DRIVER=cloudinary` needs the three keys and never touches the
API's disk. The local driver serves originals rather than real
thumbnails - generating those would mean a native image library for a
path only used in development.

---

## What is not finished

- **Checkout is simulated.** `payOrder` fills a `paymentRef` and moves
  the order to PAID. A real processor slots in there, with the status
  moving on its webhook rather than in the request - and the webhook has
  to be reconciled against the checkout-expiry job, which can be rolling
  the lot down to the runner-up at the same moment the payment confirms.
- **Nobody is ever paid.** Taking money from a buyer and paying a seller
  are different problems, and only the first one is even sketched here.
  The second means KYC per seller, a platform fee, and payouts that a
  processor may hold.
- **Deciding a dispute for the buyer refunds nothing.** It records the
  decision, which is what a refund would hang off once there is money to
  refund.
- **Rate limits are per-process-honest but proxy-naive.** Behind a load
  balancer, set `trust proxy` correctly or the per-IP ceiling applies to
  the balancer and throttles the whole site to twelve bids a second.
- **Sessions cannot be revoked individually,** only all at once per
  account. There is no refresh-token rotation and no per-device list.
- **Nothing stops shill bidding through a second account.** A seller's
  own account is blocked from their lots; an alt is not.
