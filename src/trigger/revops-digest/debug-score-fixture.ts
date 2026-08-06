import { task } from "@trigger.dev/sdk";
import { scoreFixtureFile } from "../../lib/revops-digest/hubspot/fixtures/load-fixture.js";
import type { ScoringConfig } from "../../lib/revops-digest/types.js";

/**
 * Dev-only debug task — NOT part of the production digest flow. Lets you validate the
 * normalize -> score -> rank pipeline against fixture data (see fixtures/*.json) without a
 * HubSpot token, by triggering this task with a payload like:
 *   { fixture: "deals-mixed-batch.json" }
 * Inspect the returned RankedDigest via get_run_details / list_runs. Safe to delete once you
 * have a real HUBSPOT_ACCESS_TOKEN and no longer need fixture-based scoring validation.
 */
export const debugScoreFixture = task({
  id: "debug-score-fixture",
  run: async (payload: {
    fixture: string;
    highInactivityDays?: number;
    mediumInactivityDays?: number;
    closedStageIds?: string[];
  }) => {
    const scoringConfig: ScoringConfig = {
      highInactivityDays: payload.highInactivityDays ?? 14,
      mediumInactivityDays: payload.mediumInactivityDays ?? 7,
      closedStageIds: payload.closedStageIds ?? ["closedwon", "closedlost"],
    };

    return scoreFixtureFile(payload.fixture, scoringConfig);
  },
});
