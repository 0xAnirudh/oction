# Oction

An auction house for physical things. Sealed Game Boys, worn-twice
Jordans, a Leica with brassing on the base plate. Thirty seconds on the
clock and five hundred people trying to win the same rung of the ladder.

This document starts from nothing and ends in the parts that were
genuinely hard. If you have never seen the project, start at the top and
keep going; if you came here for the concurrency model, jump to
[The problem this whole thing exists to solve](#the-problem-this-whole-thing-exists-to-solve).

---

## Contents

**Getting oriented**
1. [What it is, in one page](#what-it-is-in-one-page)
2. [Run it](#run-it)
3. [The words](#the-words)
4. [What happens when somebody sells something](#what-happens-when-somebody-sells-something)

**How it is built**

5. [The shape of it](#the-shape-of-it)
6. [The problem this whole thing exists to solve](#the-problem-this-whole-thing-exists-to-solve)
7. [Atomicity, and why Lua](#atomicity-and-why-lua)
8. [The increment ladder](#the-increment-ladder)
9. [Anti-sniping, and the version that looks right and is wrong](#anti-sniping-and-the-version-that-looks-right-and-is-wrong)
10. [The queue is a prompt, not an authority](#the-queue-is-a-prompt-not-an-authority)
11. [The bid log](#the-bid-log)
12. [Idempotency: atomic is not the same as unrepeatable](#idempotency-atomic-is-not-the-same-as-unrepeatable)
13. [Money](#money)
14. [Sessions, and outrunning a token you cannot recall](#sessions-and-outrunning-a-token-you-cannot-recall)
15. [Rate limiting](#rate-limiting)
16. [Shill detection](#shill-detection)
17. [Erasure, honestly](#erasure-honestly)
18. [Realtime](#realtime)

**Reference**

19. [Every file](#every-file)
20. [Every endpoint](#every-endpoint)
21. [The data model](#the-data-model)
22. [Configuration](#configuration)
23. [Tests](#tests)
24. [Load testing](#load-testing)
25. [The design system](#the-design-system)

**The rest**

26. [Putting it somewhere real](#putting-it-somewhere-real)
27. [What is not finished](#what-is-not-finished)
28. [Glossary](#glossary)

---

## What it is, in one page

A seller lists a **lot** — one physical item — with an asking price and a
closing time. People **bid**. Each bid has to clear the last one by a set
step. When the clock runs out the highest bidder has bought it, and has a
fixed window to pay before the lot is offered to the next bidder down.

Three things make it different from a form with a number in it:

**The clock moves.** A bid in the last fifteen seconds pushes the close
out to thirty seconds from that bid. There is no last moment to arrive
at, so there is no advantage in waiting for it.

**Every bid is decided atomically.** Five hundred people bidding the same
amount in the same millisecond produce exactly one winner and four
hundred and ninety-nine people who are told they were late. This is
proven, not asserted — see [Load testing](#load-testing).

**The record is checkable.** Every accepted bid is written to an
append-only log, and `/lot/:id/audit` recomputes the winner from those
rows rather than reading it off a field. If the two ever disagreed, the
page would say so.

It is a complete application, not a demo: accounts, email confirmation,
password reset, seller verification, photo uploads, a watchlist, email
notices, checkout, disputes, reporting, staff tooling, and detection for
sellers bidding on their own lots. The one thing it does not do is move
money — see [What is not finished](#what-is-not-finished).

---

## Run it

```bash
npm install
npm run dev
```

That is the whole thing. It settles Mongo before starting anything: it
uses the `MONGO_URI` in your `.env` if that answers, and if it does not,
it says why and starts a throwaway in-memory one with the catalogue
seeded into it. Either way you end up with the API on `:4200`, the
workers, and the web app on `:5175`.

The fallback is loud on purpose. A dev script that quietly swaps your
database for an empty one has you debugging missing data instead of
reading one line of output.

**Redis on 6379 is the one thing it does not arrange for you.** On a Mac:

```bash
brew services start redis
```

Other useful commands:

```bash
npm run dev:offline          # ignore MONGO_URI, always use the throwaway one
docker compose up -d mongo   # a local mongo that survives a restart
npm run seed                 # refill the catalogue
npm test                     # 87 tests
npm run loadtest             # prepare, storm, verify
```

Copy `.env.example` to `.env` to change anything. Every value has a
working default except `JWT_SECRET`, which you should set before this is
reachable by anyone but you.

### The seeded accounts

Password for all of them is `oction-demo-password`.

| Account | What it is for |
|---|---|
| `staff@oction.test` | Admin. The seller, report, dispute and integrity queues. |
| `seller@oction.test` | A verified seller. Owns all the seeded lots. |
| `ana@oction.test` | **Unconfirmed address** — use her to walk into the verification gates. |
| `ben@oction.test` | Has a seller application already waiting in the staff queue. |
| `chi@`, `dev@oction.test` | Ordinary bidders. |

`MAIL_DRIVER=log` by default, which means **verification and password
reset links are printed in your terminal**, in the `[api]` pane. That is
how you complete those flows locally without configuring a mail provider.

---

## The words

If you have not built an auction before, these are the terms the code
uses, and they are used precisely.

**Lot** — one item being sold. Not a product with a quantity; an auction
sells this specific camera, once.

**Asking price / starting price** — what the first bid has to be. Not a
guide price and not a minimum sale price.

**Reserve** — a secret floor the seller sets. If bidding ends below it,
the lot does not sell. Bidders are told *whether* it has been met, never
what it is. A reserve below the asking price is meaningless and is
refused.

**Increment** — the minimum step between one bid and the next. A lot at
$150 with a $10 increment cannot take a bid of $155. Without increments
an auction can be walked up one cent at a time.

**Rung** — one step of the ladder. "One acceptance per rung" is the
central correctness claim of this codebase.

**Soft close / anti-sniping** — a bid near the end pushes the end back.
Named for **sniping**: bidding in the final second so nobody has time to
respond, which rewards timing rather than valuation.

**Hammer** — the moment the auction closes. Comes from the auctioneer's
gavel.

**Roll-down** — when the winner fails to pay in time and the lot is
offered to the next bidder at *their own* bid.

**Shill bidding** — a seller bidding on their own lot, usually through a
second account, to push the price up. Fraud, and the thing that most
undermines an auction's meaning.

**Idempotency** — sending the same request twice having the same effect
as sending it once.

---

## What happens when somebody sells something

The whole lifecycle, in order.

**1. The seller is verified.** Anyone can bid; listing needs a verified
seller account. A user applies from settings (which requires a confirmed
email address), staff see it in a queue, and a person decides. There is
no automatic approval.

**2. The lot is listed.** Title, condition, photographs, asking price,
optional reserve, optional fixed increment, an opening and a closing
time. If it opens immediately the room is created in Redis there and
then; otherwise a sweep picks it up when its start time arrives.

**3. Bidding.** Each bid goes through one Lua script inside Redis, which
either accepts it or rejects it with a reason. Accepted bids are appended
to a durable log in Mongo, broadcast to everyone in the room over a
socket, and, if somebody lost the lead, queued as an email to them.

**4. The clock moves, maybe.** A bid inside the final fifteen seconds
moves the close to thirty seconds from that bid.

**5. The hammer falls.** A delayed job fires, asks Redis whether the time
has actually come, and — if it has — closes the room, once, even if two
workers ask simultaneously.

**6. The outcome.** No bids, or the reserve was not met, and the lot is
unsold. Otherwise an order is cut for the winner with a fifteen-minute
hold on it, and they are emailed.

**7. Checkout, or roll-down.** The winner confirms a shipping address and
pays. If the hold expires first, the order is marked expired and the lot
is offered to the next eligible bidder — never below the reserve, however
far down the list that walks. If nobody is left, the lot is unsold.

**8. Afterwards.** The buyer can open a dispute against a paid order.
Anyone can report the listing itself. Both land in staff queues.

---

## The shape of it

```
                    browser (React)
                      |        |
                 REST |        | socket.io
                      v        v
                 ┌──────────────────┐
                 │   Express API    │
                 └────┬────────┬────┘
                      │        │
          decisions   │        │   durability
                      v        v
                 ┌────────┐  ┌─────────┐
                 │ Redis  │  │ MongoDB │
                 │        │  │         │
                 │ live   │  │ bid log │
                 │ price  │  │ users   │
                 │ + Lua  │  │ orders  │
                 └───▲────┘  └────▲────┘
                     │            │
                 ┌───┴────────────┴───┐
                 │  BullMQ workers    │
                 │  closes, expiries, │
                 │  notices, sweep    │
                 └────────────────────┘
```

The division of labour is the important part:

**Redis decides.** The live price, who is leading, and when the lot
closes live in a Redis hash. Every decision about a bid is made by a Lua
script operating on that hash.

**Mongo remembers.** Users, lots, orders, and the append-only bid log.
Written behind the decision, never in front of it.

**BullMQ prompts.** Delayed jobs for closing an auction and expiring a
checkout, plus a repeating sweep that catches anything a lost job
dropped. Jobs never *decide* anything — see
[The queue is a prompt](#the-queue-is-a-prompt-not-an-authority).

**Socket.io tells everyone.** Rooms keyed `auction:{itemId}`, with a
Redis adapter so a bid accepted on one API process reaches watchers held
open on another.

---

## The problem this whole thing exists to solve

Everything else in this codebase is ordinary web development. This part
is not, and it is worth understanding from first principles even if you
have never hit it.

Here is the naive way to accept a bid:

```js
const item = await Item.findById(id);           // 1. read the price
if (amount < item.price + increment) throw;     // 2. check it
item.price = amount;                            // 3. write it back
await item.save();
```

That code is correct when one person bids at a time. It is wrong the
moment two do, and the way it is wrong is silent.

Two bidders, Ann and Bo, both bid $200 on a lot standing at $190.

```
time    Ann's request              Bo's request
────────────────────────────────────────────────────────
t0      read price -> $190
t1                                read price -> $190
t2      $200 >= $200? yes
t3                                $200 >= $200? yes
t4      write price = $200
t5                                write price = $200
```

Both bids are accepted. Both people are told they won that rung. The
price moved once. One of them is going to find out later that they are
not the buyer, and the bid log now has two rows at the same price with no
way to say which one counted.

This is a **race condition**, and specifically a *read-modify-write*
race. The window between step 1 and step 3 is small — a millisecond or
two — but an auction's final seconds is precisely when every bid in the
system arrives at once, so the rare case becomes the normal case exactly
when it matters most.

Three things do not fix it:

- **Being fast.** A smaller window is still a window.
- **A transaction around the read and the write**, unless it is at an
  isolation level that actually serialises them; the default in most
  databases will happily let both commit.
- **A unique index.** There is nothing unique to constrain — two bids at
  $200 are legitimately two different rows.

What fixes it is making the read, the decision and the write **one
indivisible operation** that nothing can interleave with.

---

## Atomicity, and why Lua

Redis runs commands one at a time, on one thread. And critically: **it
runs a Lua script from start to finish without interleaving anything
else**. No other client gets served in the middle of your script.

So the entire decision moves inside the script:

```lua
-- src/redis/lua/bid.lua, in essence
local high = tonumber(redis.call('HGET', KEYS[1], 'highBid'))
if amount < high + increment then
  return { 0, 'too_low' }          -- rejected, nothing written
end
redis.call('HSET', KEYS[1], 'highBid', amount, 'winnerId', bidder)
return { 1, 'ok' }
```

Now the timeline cannot interleave:

```
time    Ann's request              Bo's request
────────────────────────────────────────────────────────
t0      ┌ script starts
t1      │ read $190
t2      │ check, accept
t3      └ write $200, done
t4                                ┌ script starts
t5                                │ read $200    <- sees Ann's write
t6                                │ $200 >= $210? no
t7                                └ return too_low
```

Bo is told he was late, which is true. One rung, one winner.

The real script ([`bid.lua`](src/redis/lua/bid.lua)) does rather more in
that same indivisible window — checks status and start time, refuses the
seller, refuses the current leader bidding against themselves, applies
the ladder, applies the fat-finger ceiling, allocates a gap-free sequence
number, moves the closing time if the bid is late, and returns the party
that just lost the lead so they can be emailed. All of it happens with
nothing else touching that lot.

**The general lesson:** when correctness depends on read-check-write
being indivisible, you need a primitive that gives you that. Redis with
Lua is one. `SELECT ... FOR UPDATE` in Postgres is another. A compare-
and-swap loop is a third. Writing it in application code and hoping is
not.

---

## The increment ladder

The minimum raise. A seller can pin a lot to a fixed increment; when they
do not, a ladder decides, so a $40 keyboard does not move in the same
steps as a $4,000 camera.

| Price | Step |
|---|---|
| Under $500 | $10 |
| $500 and up | $50 |

It is deliberately a small table in
[`src/core/increments.js`](src/core/increments.js) and deliberately
easy to extend.

**The interesting part is that this logic exists twice.** The browser has
to show you the minimum bid without asking the server first, so the
ladder is in JavaScript. The bid script has to enforce it atomically, so
the ladder is also in Lua. Two implementations of one rule is a bug
waiting to happen — the day they disagree, the interface tells people to
place bids the server rejects.

So there is a test that walks a lot up through the $500 boundary,
computing each next minimum with the JavaScript copy and submitting it to
the Lua copy, asserting a cent under is refused and the minimum itself is
taken. If they ever drift, that test fails.

---

## Anti-sniping, and the version that looks right and is wrong

**Sniping** is bidding in the final second so nobody can respond. It
rewards fast connections and scripts over actually valuing the thing.

The fix is a **soft close**: a bid inside the last fifteen seconds moves
the closing time. The obvious implementation is wrong in a way that only
shows up under load.

**The version that looks right:**

> When a late bid arrives, push the close out by thirty seconds.

Three bids in the final ten seconds, and you have pushed it out by ninety
seconds. Bids keep arriving because the auction keeps not ending. The
close is now a moving target that recedes faster than it approaches, and
the countdown everyone is watching is wrong.

**What this does instead:**

> When a late bid arrives, set the close to thirty seconds **from that
> bid**.

Not a delta — an assignment. Three bids in a row leave the finish line
thirty seconds out, not ninety. The auction still cannot be sniped,
because there is no final instant to arrive at, but it also cannot be
ratcheted open forever.

```lua
if endsAt - now <= window then
  endsAt = now + extend       -- assignment, never endsAt + extend
end
```

There is a test named for exactly this: *does not let repeated late bids
ratchet the auction open forever*.

---

## The queue is a prompt, not an authority

If the closing time can move, then a delayed job scheduled against the
old closing time is scheduled against a lie.

The tempting fix is to reschedule the job whenever a bid extends the
auction: cancel the old one, add a new one. That puts the authoritative
end time inside a queue, which is the wrong place for it. Queue
operations can fail, arrive out of order, or be duplicated, and now your
auction's end time can be too.

So:

- **Redis holds the end time.** It is part of the lot's live state and it
  is moved by the same atomic script that accepts the bid.
- **The job only asks.** When it fires it calls
  [`close.lua`](src/redis/lua/close.lua), which answers one of three
  ways:

| Answer | Meaning | What the worker does |
|---|---|---|
| `ok` | Closed it, and you were the one who did | Settle the lot |
| `not_active` | Somebody else already closed it | Nothing |
| `still_open` | A late bid moved the close; here is the new time | Reschedule itself |

**Extensions touch no queue state at all.** A duplicated job is harmless
— the second one gets `not_active`. A lost job is caught by a repeating
five-second sweep that looks for lots past their end time. A job firing
early gets `still_open` and comes back.

This is worth internalising as a pattern: *let the durable store own the
decision, and let the scheduler only ask whether it is time.* It makes
the whole system tolerant of a scheduler that is merely best-effort,
which every scheduler is.

---

## The bid log

There is a collection that stores every accepted bid. It is not in the
obvious data model — you can run an auction with just `currentHighestBid`
and `currentWinner` on the lot — and the system does not work without it.

**Reason one: the roll-down needs it.** When a winner fails to pay, the
lot goes to the runner-up. `currentWinner` holds one name. Finding who
was second requires the ordered history of distinct bidders, which is
exactly what the log is.

**Reason two: Redis is not durable enough to be the only copy.** The live
price lives in Redis, where an eviction or an unclean shutdown can take
it. With a log in Mongo, the room is rebuildable; without one, the price
was the only copy of itself.

**Reason three, and the interesting one: it makes the result checkable.**
`GET /api/items/:id/audit` returns every bid in sequence *and* recomputes
the winner from those rows, next to what the lot record says. If the two
disagree, or if there is a gap in the sequence numbers, the response says
so explicitly.

That matters because the person most motivated to doubt an auction's
result is the person who lost it, and "trust the field in our database"
is not an answer. Handing them the rows and the arithmetic is.

The sequence number comes from `HINCRBY` inside the bid script, so it is
gap-free and strictly increasing per lot. A unique index on
`(itemId, seq)` means a retried write after a timeout lands once.

---

## Idempotency: atomic is not the same as unrepeatable

The Lua script guarantees a rung is won once. It does **not** guarantee
that one person's single intent produces one bid, and those are different
properties.

Consider a phone that switches from wifi to cellular between sending a
bid and receiving the reply. The bid landed. The phone has no way to know
that. The honest thing for a client to do is retry — and a retry walks
the price up a second time for one intent.

So `POST /items/:id/bids` accepts an `Idempotency-Key` header:

```bash
curl -X POST localhost:4200/api/items/$ITEM/bids \
  -H "authorization: Bearer $TOKEN" \
  -H "idempotency-key: 4f3a-uuid-here" \
  -d '{"amountCents": 20000}'
```

Send it three times, get three `201`s, and one bid is placed. The second
and third responses carry `Idempotent-Replay: true`.

The mechanics, in [`idempotency.lua`](src/redis/lua/idempotency.lua) and
[`src/services/idempotency.js`](src/services/idempotency.js):

1. Claim the key atomically. Three answers: *new* (you are first),
   *in flight* (an identical request is still running), or *done* (here
   is the reply the first one got).
2. Do the work.
3. Store the response against the key for ten minutes.

Two details that are easy to get wrong:

- **The key is scoped per lot as well as per user**, so a client reusing
  one key across two lots cannot be handed the wrong lot's answer.
- **Rejections are replayed too.** If the first attempt was `too_low`,
  the replay is also `too_low` rather than a fresh attempt that might now
  succeed. Same request, same answer. But an unexpected *server* error
  releases the claim, so a genuine failure can be retried rather than
  being told it is still in flight for ten minutes.

---

## Money

Every amount in this system is an integer number of cents. There is no
floating-point arithmetic anywhere near a price.

This is not fastidiousness. `0.1 + 0.2` is `0.30000000000000004` in every
language that uses IEEE-754 doubles, which is all of them by default. In
an auction that means a bid of `40.15` can be stored as
`40.149999999999999` and then rejected for being under `40.15`. It will
happen once, in production, at the close of something expensive, and the
bug report will say "it said my bid was too low but it wasn't".

So: `startingPriceCents`, `amountCents`, `reservePriceCents`. The unit is
in the name, at every call site, so nobody has to remember.
[`parseAmount`](src/core/money.js) turns `"1,234.50"` into `123450`
without ever constructing a float — it splits on the decimal point and
does integer arithmetic on the halves.

---

## Sessions, and outrunning a token you cannot recall

A JWT is a signed statement that the server does not store. That is the
point of it — any process with the secret can verify it without a
database round trip — and it is also the problem: **you cannot take one
back.** Until it expires, it is valid.

Two mechanisms, for two different jobs.

**The account cutoff, for "sign out everywhere".** Each user carries a
`sessionsValidFrom` timestamp. Any token issued before it is refused.
Setting it to now invalidates every outstanding token at once, which is
exactly what a password reset should do.

There is a subtlety here that a test caught. The standard `iat` claim is
in **whole seconds**. If the reset happens at `12:00:00.500` and a new
token is minted at `12:00:00.600`, that token's `iat` floors to
`12:00:00` — which is *before* the cutoff, so the brand-new token is
rejected. Round the other way and a token minted just before the reset
survives it.

The fix is a millisecond claim of our own alongside `iat`:

```js
jwt.sign({ sub: user._id.toString(), jti, ms: Date.now() }, secret, ...)
```

Now the comparison is exact and there is no window in either direction.

**Session rows, for "sign out my old laptop".** The cutoff is all-or-
nothing. Each sign-in also creates a `Session` row with a `jti` that the
token names; revoking the row refuses that token and no others. Settings
shows the list, with the current device marked, and "sign out everywhere
else" deliberately keeps the device you are asking from.

Sessions store a device *label* derived from the user agent — "Chrome on
macOS" — and a salted digest of the IP, never the IP. Enough to recognise
a device in a list, not enough to be a fingerprint.

---

## Rate limiting

A **sliding window**, in the literal sense: a Redis sorted set holds one
member per attempt, scored by arrival time. Everything older than the
window is dropped on the way in, and what remains is the count.

The alternative — a fixed bucket that resets on the minute — lets a
script fire its whole allowance at `00:59.9` and again at `01:00.1`,
which is twice the limit in a fifth of a second.

Two dimensions on the bid path (per bidder, and a looser one per address
as a backstop against one machine cycling throwaway accounts), checked in
one pipelined round trip.

**The auth endpoints have a subtlety worth copying.** Sign-in is limited
per address on every attempt, *and* per account — but the account bucket
is **only charged when the password is wrong**.

If you count every attempt against an account, you have handed anyone a
way to lock a stranger out of their own login by failing at their email
address on purpose. So the account bucket is *read* without being spent
(`peek`), and only `record`ed after the password turns out to be wrong.
The Lua script grew a `charge` flag for precisely that distinction.

---

## Shill detection

A seller bidding on their own lot to push the price up. The direct case
is already refused — the bid script will not take a bid from the account
that listed the lot. The case that matters is a **second account**, and
no single fact proves it.

[`src/services/integrity.js`](src/services/integrity.js) gathers the
facts that tend to travel with it, weights them, and puts the result in
front of a person:

| Signal | Weight |
|---|---|
| Bid from the same connection the seller signed up from | 55 |
| Account opened from the same connection as the seller | 45 |
| Bids often on this seller and almost never takes the item | 30 |
| Has bid on nothing outside this seller | 25 |
| Account opened shortly before it started bidding here | 10 |

It accuses nobody. A high score is a reason to look, not a finding, and
the staff screen shows the reasons rather than just the number.

**It never touches an IP address.** Bids and accounts carry a salted
HMAC digest of one. That answers "were these the same connection" and
nothing else — it cannot be reversed, and the salt means it cannot be
rainbow-tabled either, which a bare SHA-256 of an IPv4 address very much
can be, there being only four billion of them.

---

## Erasure, honestly

Closing an account has to reckon with something: **a right to erasure is
not a right to unwind a finished auction.**

Your bids are not only about you. They are what a price other people
relied on was built from, and what a dispute they were party to would be
decided on. Deleting those rows rewrites the history of a transaction
somebody else was in.

So closing an account **anonymises** rather than deletes:

| Removed entirely | Kept, with the name replaced |
|---|---|
| Email address | Bid rows (`displayName` → "Closed account") |
| Display name | Orders, for the contractual record |
| Saved shipping address | Disputes already decided |
| Watchlist, pending tokens | |
| Shipping on past orders | |

And it is **refused outright** while a lot of theirs is running, an order
is unpaid, or a dispute is open — closing then would strand somebody
else. `GET /api/me/deletion` reports those blockers so the interface can
explain rather than just fail.

This is the narrow exception the law actually makes: erase the personal
data, keep what is genuinely needed for a contract the person was party
to. The privacy notice in the app says so in as many words.

---

## Realtime

Socket.io, with rooms keyed `auction:{itemId}` and the Redis adapter, so
a bid accepted on one API process reaches watchers held open on another.

| Event | Fired when |
|---|---|
| `BID_ACCEPTED` | A bid is taken; carries price, leader, count, next minimum, end time |
| `TIMER_EXTENDED` | A late bid moved the close |
| `AUCTION_ENDED` | The hammer fell |
| `CHECKOUT_ROLLED` | A hold expired and the lot moved to the next bidder |
| `ITEM_SETTLED` | Paid for, or finally unsold |
| `ROOM_PRESENCE` | Somebody joined or left the room |

Watching is public — an unauthenticated visitor gets the live countdown.
Only bidding needs an account.

**One bug here is worth recording**, because it cost real debugging time
and the symptom pointed the wrong way. The client had:

```js
io({ auth: () => ({ token }) })     // wrong
```

socket.io-client's function form **invokes that function with a
callback** and ignores whatever it returns. So the namespace handshake
never completed: the engine opened, `transport` reported `websocket`, and
`socket.connected` stayed `false` forever with no error anywhere. The
correct form is:

```js
io({ auth: (cb) => cb({ token }) }) // right
```

The lesson is not about socket.io. It is that "it looks connected" and
"it is connected" are different questions, and the fastest way to tell
them apart was to bypass the app entirely and drive a standalone client
against the same server.

---

## Every file

```
src/
  config.js              every tunable, named and commented
  log.js                 structured JSON lines
  server.js              API entry point
  core/                  pure logic, no I/O, shared with the browser
    money.js             integer cents, parsing and formatting
    increments.js        the ladder, and the minimum-bid rule
    status.js            the item, order and unsold-reason enums
  redis/
    client.js            ioredis connections; BullMQ needs its own options
    keys.js              every key name in one place
    scripts.js           loads the Lua, parses the replies
    lua/
      bid.lua            the whole bid decision, atomically
      close.lua          bring the hammer down, once
      ensure_state.lua   load a room without clobbering a live one
      rate_limit.lua     sliding window, with a peek mode
      idempotency.lua    claim a request key, or replay its answer
  db/
    mongo.js             connection
    models/
      User.js            accounts, terms, seller status, notify prefs
      AuctionItem.js     the lot; prices in cents, reserve never serialised
      Bid.js             the append-only log
      Order.js           a claim on an item, with a clock
      Watch.js           saved lots
      Token.js           single-use links, stored as hashes
      Dispute.js         a buyer unhappy with a paid order
      Session.js         one row per sign-in, revocable
      Report.js          somebody flagging a listing
  services/
    auth.js              scrypt, JWTs, register and sign in
    accounts.js          verification and password reset
    sessions.js          start, verify, revoke
    erasure.js           closing an account, and what survives it
    catalog.js           rooms, media cache, live state
    bidding.js           the bid path end to end
    settlement.js        closing, offering, rolling down, withdrawing
    notifications.js     what to send, and when not to
    integrity.js         shill signals
    rateLimit.js         the shared limiter
    idempotency.js       claim, finish, release
    privacy.js           salted IP digests, device labels
    ms.js               '7d' to milliseconds
  queue/
    index.js             queues and scheduling
    handlers.js          what each job does
    run.js               the worker process
  realtime/
    io.js                socket.io, rooms, presence
    events.js            the wire vocabulary
  mail/
    mailer.js            log / resend / silent / capture drivers
    templates.js         the messages themselves
  media/
    storage.js           local disk and Cloudinary behind one shape
  http/
    app.js               the Express app
    schemas.js           every request shape, in zod
    middleware/          auth, validation, uploads, rate limiting
    routes/              auth, items, bids, orders, watchlist, admin, health
  scripts/
    dev.mjs              settles Mongo, then runs the three processes
    seed.js              six lots and the demo accounts
    mongo-dev.mjs        a standalone in-memory Mongo

web/src/
  main.jsx  App.jsx  api.js  socket.js  auth.jsx  format.js  styles.css
  components/   ui, icons, Shell, Countdown, Carousel, BidPanel,
                BidLog, ItemCard, WatchButton, ReportDialog
  pages/        Catalog, ItemRoom, Audit, Watchlist, Orders,
                SellerDashboard, NewListing, Settings, Admin,
                SignIn, Verify, Reset, Legal

tests/          87 tests across 8 files
loadtest/       prepare, storm (node), bid-storm (k6), verify
```

---

## Every endpoint

All under `/api`. Authentication is a bearer token.

### Accounts

| Method | Path | Notes |
|---|---|---|
| `POST` | `/auth/register` | Requires `acceptTerms: true` |
| `POST` | `/auth/login` | Rate limited per address and per account |
| `GET` | `/auth/me` | |
| `POST` | `/auth/verify/request` | Resend the confirmation link |
| `POST` | `/auth/verify/confirm` | `{ token }` |
| `POST` | `/auth/password/forgot` | Always answers the same, existing account or not |
| `POST` | `/auth/password/reset` | `{ token, password }`; ends every other session |
| `POST` | `/me/accept-terms` | For a new terms version |
| `PATCH` | `/me/notifications` | Per-notice on/off |
| `POST` | `/me/seller-application` | Needs a confirmed address |
| `GET` | `/me/sessions` | |
| `DELETE` | `/me/sessions/:id` | One device |
| `DELETE` | `/me/sessions` | Everything except this device |
| `GET` | `/me/deletion` | What is blocking closure |
| `DELETE` | `/me` | Close the account |

### Catalogue and bidding

| Method | Path | Notes |
|---|---|---|
| `GET` | `/items` | `status`, `q`, `condition`, `sellerId`, `sort`, `limit`, `page` |
| `GET` | `/items/:id` | Live state merged over the stored record |
| `GET` | `/items/:id/bids` | Newest first |
| `GET` | `/items/:id/audit` | The log, plus the winner recomputed from it |
| `GET` | `/items/mine` | A seller's own lots, including their reserves |
| `POST` | `/items` | Verified sellers only |
| `POST` | `/items/:id/images` | Multipart, up to 8, fixed once bidding starts |
| `DELETE` | `/items/:id/images/:handle` | |
| `POST` | `/items/:id/bids` | Accepts `Idempotency-Key` |
| `POST` | `/items/:id/report` | One open report per person per lot |
| `PUT` | `/items/:id/watch` | Idempotent |
| `DELETE` | `/items/:id/watch` | |
| `GET` | `/watchlist` | Closing soonest first |

### Orders

| Method | Path | Notes |
|---|---|---|
| `GET` | `/orders/mine` | With the remaining hold time |
| `GET` | `/orders/sold` | The seller's side |
| `GET` | `/orders/:id` | Buyer, seller or staff |
| `POST` | `/orders/:id/checkout` | `{ shipping }`; simulated payment |
| `POST` | `/orders/:id/dispute` | Paid orders only |
| `GET` | `/orders/:id/dispute` | |

### Staff

Every route answers **404** rather than 403 to a signed-in non-admin.
Telling a stranger that a route exists is telling them what to attack.

| Method | Path |
|---|---|
| `GET` | `/admin/overview` |
| `GET` | `/admin/sellers?status=pending` |
| `POST` | `/admin/sellers/:id/verify` · `/reject` |
| `GET` | `/admin/reports` |
| `POST` | `/admin/reports/:id/resolve` |
| `GET` | `/admin/disputes` |
| `POST` | `/admin/disputes/:id/resolve` |
| `GET` | `/admin/integrity` · `/admin/integrity/sellers/:id` |
| `POST` | `/admin/items/:id/withdraw` |

`GET /api/health` reports both stores and is unauthenticated.

### Bid rejection codes

`POST /items/:id/bids` returns one of these with a human message and the
current price, so a client can repaint rather than guess.

| Code | HTTP | Meaning |
|---|---|---|
| `too_low` | 409 | Below the next rung |
| `already_leading` | 409 | You are the highest bidder |
| `seller` | 403 | Your own lot |
| `closed` | 409 | The clock ran out |
| `not_started` | 409 | Not open yet |
| `not_active` | 409 | Withdrawn or already settled |
| `above_cap` | 422 | Over the fat-finger ceiling |
| `rate_limited` | 429 | With `Retry-After` |
| `in_flight` | 409 | An identical idempotent request is still running |

---

## The data model

**User** — email, scrypt hash, display name, `sellerStatus`
(`unverified` / `pending` / `verified`), `isAdmin`, email confirmation,
terms version and timestamp, notification preferences, default shipping,
`sessionsValidFrom`, `signupIpHash`, `deletedAt`.

**AuctionItem** — title, description, condition, images, seller,
`startingPriceCents`, `reservePriceCents` (never serialised to a bidder),
`bidIncrementCents` (null uses the ladder), the projection
(`currentHighestBidCents`, `currentWinner`, `bidCount`), `startTime`,
`endTime` and `scheduledEndTime`, `extensionCount`, status, shipping
details, and a settlement sub-document.

**Bid** — item, bidder, display name, `amountCents`, gap-free `seq`,
`placedAt`, `ipHash`, and what it did to the closing time. Unique on
`(itemId, seq)`.

**Order** — item, buyer, seller, `amountCents`, status, `offerRank`
(1 is the winner, 2 the runner-up), `reservedAt` / `expiresAt` /
`paidAt`, shipping, payment reference. A partial unique index keeps it to
one `PENDING` order per item.

**Watch**, **Token**, **Session**, **Dispute**, **Report** — as described
in their sections above.

### The states a lot moves through

```
UPCOMING ──> ACTIVE ──> ENDED ──┬──> SETTLED     (paid for)
                                └──> UNSOLD      (no bids, reserve not met,
                                                  nobody paid, or withdrawn)
```

`ENDED` is the interesting one: the hammer has fallen but the item is not
yet anybody's, because the winner still has to pay for it.

---

## Configuration

Everything lives in [`src/config.js`](src/config.js) with a comment
saying why the number is the number. Copy `.env.example` to `.env`.

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `4200` | |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/oction` | Unreachable → `npm run dev` falls back |
| `REDIS_URL` | `redis://127.0.0.1:6379` | |
| `JWT_SECRET` | dev value | **Set this before anyone else can reach it** |
| `JWT_TTL` | `7d` | |
| `SOFT_CLOSE_WINDOW_MS` | `15000` | A bid inside this moves the close |
| `SOFT_CLOSE_EXTEND_MS` | `30000` | To this far from the bid |
| `CHECKOUT_TTL_MS` | `900000` | How long a winner holds the lot |
| `CLOSING_SOON_LEAD_MS` | `300000` | Watchlist notice lead time |
| `BID_RATE_MAX` · `_WINDOW_MS` | `2` · `1000` | Bids per bidder |
| `BID_RATE_IP_MAX` | `12` | Bids per address |
| `AUTH_RATE_IP_MAX` · `_WINDOW_MS` | `20` · `60000` | Auth attempts per address |
| `AUTH_RATE_ACCOUNT_MAX` · `_WINDOW_MS` | `10` · `900000` | **Failures** per account |
| `MAX_BID_CENTS` | `100000000` | Fat-finger ceiling ($1m) |
| `IDEMPOTENCY_TTL_MS` | `600000` | How long a replay returns the first answer |
| `VERIFY_TTL_MS` · `RESET_TTL_MS` | `86400000` · `3600000` | Link lifetimes |
| `TERMS_VERSION` | a date | Bump to ask everyone to re-accept |
| `TRUST_PROXY_HOPS` | `0` | Proxies in front. **Not `true`** — see below |
| `IP_HASH_SECRET` | falls back to `JWT_SECRET` | Salts the address digests |
| `MEDIA_DRIVER` | `local` | or `cloudinary` |
| `MAIL_DRIVER` | `log` | `log` prints links to the terminal; `resend` sends |
| `APP_URL` | `http://localhost:5175` | Where email links point |

**On `TRUST_PROXY_HOPS`:** behind a load balancer, `req.ip` is the
balancer unless Express is told how many hops to trust — and a per-IP
rate limit against the balancer throttles your entire site to twelve bids
a second. Set it to the number of proxies in front of the app. Do not set
Express's `trust proxy` to `true`, which trusts any client that sends an
`X-Forwarded-For` header, handing the rate limiter a value the caller
chose.

---

## Tests

```bash
npm test
```

87 tests across 8 files. Mongo runs in-process via
`mongodb-memory-server`, so the suite needs no services of its own.
**Redis is the real thing**, on database 15 — the bid path is a Lua
script, and a fake would be testing the fake.

| File | Covers |
|---|---|
| `smoke.test.js` | The stack comes up; registration and recognition |
| `bidding.test.js` | Rejections, the ladder, the JS/Lua parity walk, **40 simultaneous identical bids**, a gap-free log under a crowd, rate limiting |
| `settlement.test.js` | Soft close, the ratchet, two workers racing to close, offers, reserves, checkout, roll-down |
| `hardening.test.js` | Idempotent bids, per-lot key scoping, replayed rejections, auth limiting, failures-not-attempts |
| `accounts.test.js` | Verification, reset, session revocation, enumeration resistance, watchlist |
| `notifications.test.js` | Outbid/won/rolled/closing-soon, premise re-checks, preferences |
| `admin.test.js` | The 404 gate, verification flow, withdrawal, disputes |
| `governance.test.js` | Terms, sessions, erasure and its blockers, reporting, shill signals |

Some are worth reading as documentation of the tricky parts —
*accepts exactly one bid per rung when forty arrive at once*,
*does not let repeated late bids ratchet the auction open forever*,
*counts failures against an account but not attempts*, and
*anonymises rather than deleting, so the bid log still adds up*.

---

## Load testing

```bash
npm run loadtest      # prepare a fixture, storm it, verify the log
npm run loadtest:k6   # the same claim as a k6 threshold
```

Start the API with the address limiter raised first — every request comes
from one machine, and the limiter cannot tell a load test from an
auto-clicker:

```bash
BID_RATE_MAX=100000 BID_RATE_IP_MAX=100000 npm start
```

Real output, 500 bidders firing the same amount at the same instant, ten
rungs in a row:

```
  $   200.00  accepted   1 / 500   ok
  $   210.00  accepted   1 / 500   ok
  ... ten rungs, ten winners

  requests          5000
  too_low           4985
  accepted            10
  already_leading      5

  latency p50  288.8 ms    p95  409.0 ms    p99  499.6 ms

  every rung settled on exactly one winner.
```

Then `verify.mjs` reads the audit endpoint and checks the log tells one
story: no gaps in the sequence, a price that only ever went up, and the
projection agreeing with the rows it was derived from.

The k6 scenario states the claim as a build failure:

```js
thresholds: { accepted_bids: ['count==1'], throttled_bids: ['count==0'] }
```

500 VUs, 1 acceptance, 499 `too_low`, p95 84ms.

**`already_leading` is the rule working, not a failure**: it is the
previous rung's winner firing at the next rung while still ahead.

---

## The design system

The direction is **a printed auction catalogue that is alive** — calm and
typographic by default, changing temperature only when a lot enters its
final seconds. Urgency is earned rather than the resting state.

| | |
|---|---|
| **Ground** | `--paper` `#FBFAF7`, `--raised`, `--sunk` |
| **Ink** | `--ink` `#16150F`, `--ink-soft`, `--graphite` |
| **Rules** | `--rule`, `--rule-strong` — hairlines, not cards |
| **Live** | `--live` `#A8301B` — the clock running out, and being outbid. Nothing else. |
| **Held** | `--held` `#1C6044` — you are winning, the reserve is met |
| **Display** | Instrument Serif, tightening as it grows |
| **Body** | Inter, tabular figures on every price and clock |

A full dark palette ships with it, keyed on `prefers-color-scheme`.

Things that took deliberate effort and are easy to skip:

- **The surfaces the browser draws for you** — text selection, the caret,
  scrollbars, focus rings, underline offset — are themed from the
  palette. Left alone they are Chrome's blue, which belongs to no design
  system.
- **One authored motion moment per screen.** On a lot page it is the
  soft-close crossing: the countdown goes oxblood and tightens its
  tracking, the rail's top rule changes colour, and a hairline at the top
  of the page breathes. Everything else is a transition that gets out of
  the way, and all of it collapses under `prefers-reduced-motion`.
- **Loading and empty are drawn**, because both are states the page
  spends real time in. Skeletons keep the shape of what is coming so the
  layout does not jump.
- **One icon set**, on a 16-unit grid at 1.5 stroke, drawn rather than
  imported — a 2px icon set next to a 1px rule is two designs.
- **On a phone the bidding rail is a screen and a half below the fold**,
  so the price and the clock come back to the thumb in a sticky bar.

---

## Putting it somewhere real

Things that are genuinely required before anyone but you can use this,
beyond payments:

**Legal.** Terms and a privacy notice ship in the app and are accepted at
registration with the version recorded — but they are written for this
project, not reviewed by a lawyer for your jurisdiction. A prohibited-
items policy is not written at all; the reporting queue that would
enforce one is.

**Backups.** The bid log is the source of truth for every settled
auction. Losing it loses every dispute you could ever defend. Atlas free
tiers have no backups by default.

**Secrets.** `.env` on disk is fine locally and wrong in production.

**Error tracking.** Right now a 500 in the bid path is a JSON line on
stdout that nobody reads.

**`trust proxy`.** See [Configuration](#configuration). Get this wrong
and your rate limiter throttles the whole site.

**Redis durability.** One instance, no Sentinel or Cluster. The rooms are
rebuildable from Mongo, but nothing automates that on a real outage.

---

## What is not finished

- **Nothing moves money.** `payOrder` fills a `paymentRef` and marks the
  order paid. A real processor slots in there — and the webhook that
  confirms payment has to be reconciled against the checkout-expiry job,
  which can be rolling the lot down to the runner-up at the same moment
  the payment confirms. Both sides need version-checked writes.
- **Nobody is ever paid out.** Taking money from a buyer and paying a
  seller are different problems, and only the first is even sketched.
  The second means KYC per seller, a platform fee, and payouts a
  processor may hold.
- **Deciding a dispute for the buyer refunds nothing.** It records the
  decision, which is what a refund would hang off once there is money.
- **No proxy bidding.** An earlier draft used second-price proxy bids —
  state your maximum once, pay only what it took to beat the runner-up.
  The chosen mechanic is direct bidding against a fixed increment. The
  two are not compatible, and it is a product decision rather than a
  technical one.
- **Local media has no thumbnails.** The local driver serves originals
  and lets the browser scale them; Cloudinary does it properly in the
  URL. Real thumbnails locally would mean a native image library for a
  path only used in development.
- **Sessions cannot be listed across devices you have lost access to**,
  only revoked from one you still have.

---

## Glossary

| Term | Meaning |
|---|---|
| **Atomic** | Happens completely or not at all, with nothing interleaved |
| **BullMQ** | The Redis-backed job queue used for closes, expiries and email |
| **Hammer** | The moment an auction closes |
| **Idempotent** | Doing it twice has the same effect as doing it once |
| **jti** | The id a JWT carries naming its session row |
| **Lot** | One item being sold |
| **Lua** | The scripting language Redis runs atomically |
| **Projection** | A cached copy derived from a source of truth; here, the price on the item, derived from the bid log |
| **Race condition** | A bug where the outcome depends on the timing of concurrent operations |
| **Reserve** | A secret minimum sale price |
| **Roll-down** | Offering a lot to the next bidder when the winner does not pay |
| **Rung** | One step of the increment ladder |
| **scrypt** | The memory-hard password hashing function used here, from `node:crypto` |
| **Shill bidding** | A seller bidding on their own lot to push the price up |
| **Sliding window** | A rate limit measured over the trailing N seconds rather than a fixed bucket |
| **Sniping** | Bidding at the last possible instant so nobody can respond |
| **Soft close** | Extending an auction when a bid arrives near the end |
