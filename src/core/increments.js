// The minimum raise. A seller may pin an item to a fixed increment; when
// they do not, the ladder decides, so a $40 keyboard does not move in
// the same steps as a $4,000 camera.

const LADDER = [
  [50_000, 1_000], // under $500  -> $10
];

const ABOVE_LADDER = 5_000; // $500 and up -> $50

export function ladderIncrement(priceCents) {
  for (const [ceiling, step] of LADDER) {
    if (priceCents < ceiling) return step;
  }
  return ABOVE_LADDER;
}

// The increment in force for an item at a given price.
export function incrementFor(item, priceCents) {
  const fixed = item?.bidIncrementCents;
  return fixed && fixed > 0 ? fixed : ladderIncrement(priceCents);
}

// What it would take to bid right now. An item nobody has touched sells
// at its asking price; after that every bid clears the last one by a
// full step.
export function minimumBid(item, currentHighestBidCents) {
  if (!currentHighestBidCents) return item.startingPriceCents;
  return currentHighestBidCents + incrementFor(item, currentHighestBidCents);
}
