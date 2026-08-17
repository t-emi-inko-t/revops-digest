import { getMondayOf } from "../../format/date.js";
import { rankDeals } from "../../scoring/rank-deals.js";
import { scoreDeals } from "../../scoring/score-deals.js";
import type { RankedDigest, ScoringConfig } from "../../types.js";
import type { RawHubSpotDeal } from "../fetch-deals.js";
import { normalizeHubSpotDeals } from "../normalize.js";

// Statically imported (not fs.readFileSync'd at runtime) because Trigger.dev's build bundles
// task code into a separate .trigger/tmp/build-*/ directory via esbuild — esbuild only carries
// along files that are actually `import`ed, so a runtime-constructed file path to a fixture
// .json would 404 once deployed/bundled even though it works when running `tsc` directly from
// the source tree. A static import gets compiled straight into the bundle, sidestepping the
// whole question of what directory the code ends up running from.
import dealsHealthy from "./deals-healthy.json" with { type: "json" };
import dealsHighRiskInactive from "./deals-high-risk-inactive.json" with { type: "json" };
import dealsHighRiskOverdue from "./deals-high-risk-overdue.json" with { type: "json" };
import dealsMediumRiskInactive from "./deals-medium-risk-inactive.json" with { type: "json" };
import dealsMixedBatch from "./deals-mixed-batch.json" with { type: "json" };

const FIXTURES: Record<string, RawHubSpotDeal[]> = {
  "deals-healthy.json": dealsHealthy as RawHubSpotDeal[],
  "deals-high-risk-inactive.json": dealsHighRiskInactive as RawHubSpotDeal[],
  "deals-high-risk-overdue.json": dealsHighRiskOverdue as RawHubSpotDeal[],
  "deals-medium-risk-inactive.json": dealsMediumRiskInactive as RawHubSpotDeal[],
  "deals-mixed-batch.json": dealsMixedBatch as RawHubSpotDeal[],
};

/** Shared by the debug tasks (debug-score-fixture, debug-render-email-html) — loads a fixture
 * by name and runs it through the real normalize -> score -> rank pipeline, so both tasks
 * exercise identical logic to what production Task 1 runs, just against fixture data instead
 * of a live HubSpot token. `now` defaults to the live clock — fine here since this is dev-only
 * tooling, unlike the production task where scoreDeals/rankDeals require an explicit `now`. */
export function scoreFixtureFile(fixtureFile: string, scoringConfig: ScoringConfig, now: Date = new Date()): RankedDigest {
  const deals = FIXTURES[fixtureFile];
  if (!deals) {
    throw new Error(`Unknown fixture "${fixtureFile}". Available: ${Object.keys(FIXTURES).join(", ")}`);
  }

  // Synthetic name maps so fixtures don't need real HubSpot company/owner records — every
  // companyId/ownerId referenced in the fixture resolves to a readable placeholder name.
  const companyNames = new Map<string, string>();
  const ownerNames = new Map<string, string>();
  for (const deal of deals) {
    const ownerId = deal.properties.hubspot_owner_id;
    if (ownerId) ownerNames.set(ownerId, `Owner ${ownerId}`);
    for (const company of deal.associations?.companies?.results ?? []) {
      companyNames.set(company.id, `Company ${company.id}`);
    }
  }

  const normalized = normalizeHubSpotDeals(deals, companyNames, ownerNames);
  const scored = scoreDeals(normalized, scoringConfig, now);
  return rankDeals(
    scored,
    getMondayOf(now),
    {
      highInactivityDays: scoringConfig.highInactivityDays,
      mediumInactivityDays: scoringConfig.mediumInactivityDays,
    },
    now
  );
}
