// k6 run loadtest/bid-storm.js
//
// Five hundred bidders arrive at the same rung in the same instant. The
// threshold is the whole point: accepted_bids must come out at exactly
// one. Two would mean the ladder was climbed twice for one step, which
// is the collision this architecture exists to prevent.
//
// Run `node loadtest/prepare.mjs` first, and start the API with the
// per-address limiter raised - every request here comes from one machine:
//
//   BID_RATE_MAX=100000 BID_RATE_IP_MAX=100000 npm start

import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const fixture = JSON.parse(open('./fixture.json'));

const accepted = new Counter('accepted_bids');
const tooLate = new Counter('too_late_bids');
const throttled = new Counter('throttled_bids');

export const options = {
  scenarios: {
    one_rung: {
      executor: 'per-vu-iterations',
      vus: fixture.tokens.length,
      iterations: 1,
      maxDuration: '30s',
    },
  },
  thresholds: {
    // The claim, as a build failure.
    accepted_bids: ['count==1'],
    throttled_bids: ['count==0'],
    'http_req_duration{expected_response:true}': ['p(95)<500'],
  },
};

export default function bidOnce() {
  const token = fixture.tokens[(__VU - 1) % fixture.tokens.length];

  const res = http.post(
    `${fixture.apiBase}/api/items/${fixture.itemId}/bids`,
    JSON.stringify({ amountCents: fixture.startCents }),
    {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      tags: { name: 'place-bid' },
    },
  );

  if (res.status === 201) accepted.add(1);
  else if (res.status === 429) throttled.add(1);
  else tooLate.add(1);

  check(res, {
    'settled one way or the other': (r) => r.status === 201 || r.status === 409,
  });
}
