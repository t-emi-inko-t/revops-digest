import { scoreDeals } from "../src/lib/revops-digest/scoring/score-deals.js";
import { rankDeals } from "../src/lib/revops-digest/scoring/rank-deals.js";
import { getMondayOf } from "../src/lib/revops-digest/format/date.js";
import { MAX_DIGEST_AGE_HOURS } from "../src/lib/revops-digest/delivery/limits.js";
import type { NormalizedDeal, ScoringConfig } from "../src/lib/revops-digest/types.js";

/**
 * Standalone regression check (no test framework installed in this project — see
 * verify-email-layout.ts for the same pattern) asserting that generatedAt, every
 * daysSinceLastActivity/daysPastCloseDate figure, and the threshold text all derive from the
 * exact same `now` passed in — not independent new Date() calls that could drift apart. This is
 * the bug class behind the Aug-7-generated-digest-delivered-Aug-15 incident: deliverDigest trusts
 * its payload completely, so anything that lets a run's internal timestamps disagree with each
 * other, or with actual delivery time, quietly understates every deal's risk age.
 * Run: npm run verify:digest-anchor
 */

let failed = false;
function assert(condition: boolean, message: string): void {
  if (!condition) {
    failed = true;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok — ${message}`);
  }
}

const now = new Date("2026-08-15T12:00:00.000Z");

const scoringConfig: ScoringConfig = {
  highInactivityDays: 14,
  mediumInactivityDays: 7,
  closedStageIds: ["closedwon", "closedlost"],
};

// One deal with a known lastActivityDate and closeDate so days-since figures are hand-checkable.
const deals: NormalizedDeal[] = [
  {
    dealId: "1",
    dealName: "Anchor test deal",
    stageId: "open",
    pipelineId: "default",
    amount: 1000,
    closeDate: "2026-08-01T00:00:00.000Z", // 14 days before `now`
    lastActivityDate: "2026-07-26T00:00:00.000Z", // 20 days before `now`
    ownerId: null,
    ownerName: null,
    companyId: null,
    companyName: null,
    contactIds: [],
  },
];

const scored = scoreDeals(deals, scoringConfig, now);
const weekOf = getMondayOf(now);
const digest = rankDeals(scored, weekOf, scoringConfig, now);

// 1. generatedAt is exactly `now` — not a separately-called new Date().
assert(digest.generatedAt === now.toISOString(), `generatedAt (${digest.generatedAt}) equals the passed-in now (${now.toISOString()})`);

// 2. daysSinceLastActivity is computed against the same `now`, not a different clock read.
assert(scored[0]!.daysSinceLastActivity === 20, `daysSinceLastActivity (${scored[0]!.daysSinceLastActivity}) is 20, computed against the same now`);

// 3. daysPastCloseDate likewise.
assert(scored[0]!.daysPastCloseDate === 14, `daysPastCloseDate (${scored[0]!.daysPastCloseDate}) is 14, computed against the same now`);

// 4. Threshold comparison text embeds the same day count derived from that now — HIGH tier since
// 20 >= highInactivityDays (14).
assert(scored[0]!.riskTier === "HIGH", `riskTier is HIGH (20d inactivity >= 14d threshold, both anchored to the same now)`);
assert(
  scored[0]!.riskReasons.some((r) => r.includes("20 days")),
  `risk reason text embeds the same 20-day figure derived from now (reasons: ${JSON.stringify(scored[0]!.riskReasons)})`,
);

// 5. Re-running with a DIFFERENT now produces different, but internally self-consistent, values —
// proving these aren't cached/frozen from a prior call.
const laterNow = new Date("2026-08-22T12:00:00.000Z"); // 7 days later
const scoredLater = scoreDeals(deals, scoringConfig, laterNow);
const digestLater = rankDeals(scoredLater, getMondayOf(laterNow), scoringConfig, laterNow);
assert(digestLater.generatedAt === laterNow.toISOString(), "a different now produces a different generatedAt (not cached)");
assert(scoredLater[0]!.daysSinceLastActivity === 27, `a different now recomputes daysSinceLastActivity fresh (27, got ${scoredLater[0]!.daysSinceLastActivity})`);

// 6. The freshness-guard math (mirrors the inline check in deliver-digest.ts — must stay in sync
// if that formula ever changes) correctly classifies the exact incident that prompted it: a
// digest generated ~8 days (192h) before "now" must exceed MAX_DIGEST_AGE_HOURS, while one
// generated an hour ago must not.
function ageHoursOf(generatedAt: string, deliveredAt: Date): number {
  return (deliveredAt.getTime() - new Date(generatedAt).getTime()) / (60 * 60 * 1000);
}
const deliveredAt = new Date("2026-08-15T00:19:00.000Z");
const staleGeneratedAt = "2026-08-07T00:19:00.000Z"; // the actual incident: ~8 days stale
const freshGeneratedAt = new Date(deliveredAt.getTime() - 60 * 60 * 1000).toISOString(); // 1h old

assert(ageHoursOf(staleGeneratedAt, deliveredAt) > MAX_DIGEST_AGE_HOURS, `an 8-day-old digest (${ageHoursOf(staleGeneratedAt, deliveredAt).toFixed(1)}h) exceeds MAX_DIGEST_AGE_HOURS (${MAX_DIGEST_AGE_HOURS}h) — deliverDigest would refuse it`);
assert(ageHoursOf(freshGeneratedAt, deliveredAt) <= MAX_DIGEST_AGE_HOURS, `a 1-hour-old digest does not exceed MAX_DIGEST_AGE_HOURS — deliverDigest would send it`);

if (failed) {
  console.error("\nDigest anchor verification FAILED.");
  process.exit(1);
} else {
  console.log("\nDigest anchor verification passed.");
}
