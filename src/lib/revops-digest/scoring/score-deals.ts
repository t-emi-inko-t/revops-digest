import type { NormalizedDeal, ScoredDeal, ScoringConfig } from "../types.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * Pure risk-scoring function — `now` is required (no internal Date.now()/new Date() default) so
 * every call site is forced to pass the SAME anchor it uses for rankDeals()'s generatedAt. Two
 * independent "fresh" clock reads a few lines apart is how a run's footer timestamp and its
 * days-since-activity figures can end up computed at technically-different moments — harmless in
 * the normal case (milliseconds apart), but exactly the kind of implicit default that lets a
 * caller forget to pass a shared anchor at all.
 * Contractor handoff notes:
 *
 * Rules implemented (see requirements doc for the full spec this was built against):
 *   HIGH   — no activity in >= highInactivityDays (deal is open)
 *   HIGH   — close date has passed and the deal is still open ("stale/overdue")
 *   MEDIUM — no activity in [mediumInactivityDays, highInactivityDays) (deal is open), and no
 *            HIGH reason already fired for that deal (HIGH supersedes MEDIUM, a deal never
 *            appears in both tiers)
 *   LOW    — everything else, including every closed deal regardless of staleness
 *
 * A deal with `lastActivityDate === null` (never had any activity logged) is treated as
 * infinitely stale rather than excluded — it satisfies "no activity in N+ days" by definition,
 * and a deal with zero engagement history is exactly the kind of risk this automation exists to
 * surface.
 *
 * v1 LIMITATION — stage-backward-movement rule is NOT implemented.
 * HubSpot's standard Deals API (GET/POST .../crm/v3/objects/deals) only returns each deal's
 * CURRENT stage — it does not include stage-change history. Detecting "moved backward in the
 * last 30 days" requires an extra call PER DEAL to the Property History API:
 *   GET /crm/v3/objects/deals/{dealId}?propertiesWithHistory=dealstage
 * which returns a timestamped list of every value `dealstage` has held. That endpoint is not
 * batchable, so adding this rule means one extra HTTP request per deal in the scan window —
 * a meaningful increase in HubSpot API usage / rate-limit exposure for portals with many deals.
 * Skipped for v1 per the original product requirement. To add it later: fetch
 * `propertiesWithHistory=dealstage` per deal in fetch-deals.ts, pass the ordered stage-history
 * array into NormalizedDeal, fetch each pipeline's stage `displayOrder` via
 * GET /crm/v3/pipelines/deals, and in this function flag any transition within the last 30 days
 * where the new stage's order is LOWER than a stage it previously held — push a MEDIUM reason.
 */
export function scoreDeals(deals: NormalizedDeal[], config: ScoringConfig, now: Date): ScoredDeal[] {
  return deals.map((deal) => scoreDeal(deal, config, now));
}

function scoreDeal(deal: NormalizedDeal, config: ScoringConfig, now: Date): ScoredDeal {
  const isOpen = !config.closedStageIds.includes(deal.stageId);

  const daysSinceLastActivity = deal.lastActivityDate
    ? daysBetween(new Date(deal.lastActivityDate), now)
    : null;
  const daysPastCloseDate = deal.closeDate ? daysBetween(new Date(deal.closeDate), now) : null;

  if (!isOpen) {
    return {
      ...deal,
      riskTier: "LOW",
      riskReasons: [],
      daysSinceLastActivity,
      daysPastCloseDate,
      isOpen,
    };
  }

  const reasons: { tier: "HIGH" | "MEDIUM"; text: string }[] = [];

  const isInactiveHigh = daysSinceLastActivity === null || daysSinceLastActivity >= config.highInactivityDays;
  if (isInactiveHigh) {
    reasons.push({
      tier: "HIGH",
      text:
        daysSinceLastActivity === null
          ? "No activity has ever been logged on this deal"
          : `No activity logged in ${daysSinceLastActivity} days (threshold: ${config.highInactivityDays})`,
    });
  }

  if (daysPastCloseDate !== null && daysPastCloseDate > 0) {
    reasons.push({
      tier: "HIGH",
      text: `Close date passed ${daysPastCloseDate} day(s) ago, deal is still open`,
    });
  }

  if (
    !isInactiveHigh &&
    daysSinceLastActivity !== null &&
    daysSinceLastActivity >= config.mediumInactivityDays
  ) {
    reasons.push({
      tier: "MEDIUM",
      text: `No activity logged in ${daysSinceLastActivity} days (threshold: ${config.mediumInactivityDays})`,
    });
  }

  const riskTier = reasons.some((r) => r.tier === "HIGH")
    ? "HIGH"
    : reasons.some((r) => r.tier === "MEDIUM")
      ? "MEDIUM"
      : "LOW";

  return {
    ...deal,
    riskTier,
    riskReasons: reasons.map((r) => r.text),
    daysSinceLastActivity,
    daysPastCloseDate,
    isOpen,
  };
}
