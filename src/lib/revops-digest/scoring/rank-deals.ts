import type { RankedDigest, ScoredDeal } from "../types.js";

/** Groups scored deals into HIGH/MEDIUM (LOW is dropped — it's never delivered), sorting each
 * group by dollar amount descending so the biggest exposure is always first. `now` is required
 * (not an internal new Date()) and should be the exact same Date instance passed to scoreDeals()
 * for this run, so generatedAt and every days-since-activity figure in `scored` are guaranteed to
 * share one anchor rather than two independent clock reads. */
export function rankDeals(
  scored: ScoredDeal[],
  weekOf: string,
  thresholds: { highInactivityDays: number; mediumInactivityDays: number },
  now: Date
): RankedDigest {
  const high = scored.filter((d) => d.riskTier === "HIGH").sort((a, b) => b.amount - a.amount);
  const medium = scored.filter((d) => d.riskTier === "MEDIUM").sort((a, b) => b.amount - a.amount);

  return {
    generatedAt: now.toISOString(),
    weekOf,
    high,
    medium,
    totalDealsScanned: scored.length,
    hasFlags: high.length + medium.length > 0,
    thresholds,
  };
}
