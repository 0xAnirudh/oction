// The storm, with no tooling to install.
//
// Every bidder fires the same amount at the same instant, repeatedly,
// one rung at a time. The claim under test is that a rung is won once:
// out of five hundred bids at $100.00, exactly one is accepted and four
// hundred and ninety-nine are told they were late.
//
// The API must be running with the per-address rate limiter raised -
// every one of these requests arrives from 127.0.0.1, and the limiter
// cannot tell a load test from an auto-clicker:
//
//   BID_RATE_MAX=100000 BID_RATE_IP_MAX=100000 npm start

import fs from 'node:fs/promises';
import path from 'node:path';

const fixture = JSON.parse(
  await fs.readFile(path.resolve(process.cwd(), 'loadtest/fixture.json'), 'utf8'),
);
const ROUNDS = Number(process.env.LOADTEST_ROUNDS ?? 10);
const INCREMENT = 1_000; // $10 - the ladder's rung under $500

const latencies = [];
const tally = new Map();
const bump = (code) => tally.set(code, (tally.get(code) ?? 0) + 1);

async function fire(token, amountCents) {
  const started = performance.now();
  try {
    const res = await fetch(`${fixture.apiBase}/api/items/${fixture.itemId}/bids`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ amountCents }),
    });
    latencies.push(performance.now() - started);
    if (res.status === 201) return 'accepted';
    const body = await res.json().catch(() => ({}));
    // Report the rejection the API actually gave. An unexplained bucket
    // in a load test report is a number nobody can trust.
    return body.error ?? `http_${res.status}`;
  } catch (err) {
    return `transport_${err.name}`;
  }
}

// Start from where the item actually is, not from where the fixture was
// written. Re-running the storm against an item already bid up would
// otherwise fire five thousand bids that are all correctly too low, and
// report it as a failure.
const view = await fetch(`${fixture.apiBase}/api/items/${fixture.itemId}`).then((r) => r.json());
const openAt = view.item?.nextMinimumCents ?? fixture.startCents;
if (view.item?.status !== 'ACTIVE') {
  console.error(`item is ${view.item?.status ?? 'missing'} - run: npm run loadtest:prepare`);
  process.exit(1);
}

console.log(
  `storming item ${fixture.itemId} with ${fixture.tokens.length} bidders over ${ROUNDS} rungs`,
);
console.log(`opening rung $${(openAt / 100).toFixed(2)}\n`);

const perRound = [];
for (let round = 0; round < ROUNDS; round += 1) {
  const amount = openAt + round * INCREMENT;
  const results = await Promise.all(fixture.tokens.map((token) => fire(token, amount)));

  const accepted = results.filter((r) => r === 'accepted').length;
  perRound.push({ amount, accepted, of: results.length });
  for (const r of results) bump(r);

  const cents = (amount / 100).toFixed(2);
  const verdict = accepted === 1 ? 'ok' : `PROBLEM: ${accepted} accepted`;
  console.log(
    `  $${cents.padStart(9)}  accepted ${String(accepted).padStart(3)} / ${results.length}   ${verdict}`,
  );
}

latencies.sort((a, b) => a - b);
const at = (q) =>
  latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * q))].toFixed(1);

const outcomes = [...tally.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\n  requests     ${latencies.length}`);
for (const [code, count] of outcomes) {
  console.log(`  ${code.padEnd(16)} ${String(count).padStart(5)}`);
}
console.log(`
  latency p50  ${at(0.5)} ms
  latency p95  ${at(0.95)} ms
  latency p99  ${at(0.99)} ms
`);

// already_leading is the previous rung's winner firing at the next one
// while still ahead. It is the rule working, not a failure.
const bad = perRound.filter((r) => r.accepted !== 1);
if ((tally.get('rate_limited') ?? 0) > 0) {
  console.log(
    '  note: rate limited responses mean the API is not running with the limiter raised.',
  );
}
if (bad.length > 0) {
  console.error(`  FAILED: ${bad.length} rungs did not settle on exactly one winner`);
  process.exitCode = 1;
} else {
  console.log('  every rung settled on exactly one winner.');
}
