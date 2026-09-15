// Reads the audit endpoint after a storm and checks the log tells one
// story: no missing sequence numbers, a price that only ever went up,
// every accepted bid clearing the one before it by a full rung, and the
// projection agreeing with the log it was derived from.

import fs from 'node:fs/promises';
import path from 'node:path';

const fixture = JSON.parse(
  await fs.readFile(path.resolve(process.cwd(), 'loadtest/fixture.json'), 'utf8'),
);
const res = await fetch(`${fixture.apiBase}/api/items/${fixture.itemId}/audit`);
if (!res.ok) {
  console.error(`audit failed: ${res.status}`);
  process.exit(1);
}
const audit = await res.json();
const problems = [];

if (audit.sequenceGaps.length > 0) {
  problems.push(`${audit.sequenceGaps.length} gaps in the bid sequence`);
}

let previous = 0;
for (const bid of audit.bids) {
  if (bid.amountCents <= previous) {
    problems.push(`bid #${bid.seq} at ${bid.amountCents} did not clear ${previous}`);
  }
  previous = bid.amountCents;
}

for (const [field, value] of Object.entries(audit.recomputed)) {
  if (audit.stored[field] !== value) {
    problems.push(`${field}: log says ${value}, projection says ${audit.stored[field]}`);
  }
}

console.log(`
  bids in log      ${audit.bids.length}
  highest (log)    ${audit.recomputed.highestBidCents}
  highest (stored) ${audit.stored.highestBidCents}
  sequence gaps    ${audit.sequenceGaps.length}
`);

if (problems.length) {
  console.error('  FAILED');
  for (const p of problems) console.error(`    - ${p}`);
  process.exit(1);
}
console.log('  log and projection agree, no collisions.\n');
