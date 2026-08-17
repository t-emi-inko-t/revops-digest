import { schedules } from "@trigger.dev/sdk";
import { loadFetchAndScoreConfig } from "../../lib/revops-digest/config.js";
import { getMondayOf } from "../../lib/revops-digest/format/date.js";
import { fetchRecentDeals } from "../../lib/revops-digest/hubspot/fetch-deals.js";
import { normalizeHubSpotDeals } from "../../lib/revops-digest/hubspot/normalize.js";
import { rankDeals } from "../../lib/revops-digest/scoring/rank-deals.js";
import { scoreDeals } from "../../lib/revops-digest/scoring/score-deals.js";
import { deliverDigest } from "./deliver-digest.js";

// Declarative cron — Trigger.dev syncs this schedule on every deploy. The timezone is read at
// module load time from DIGEST_TIMEZONE (defaults to America/Sao_Paulo), so the Monday 8am
// evaluation happens in the client's local time, DST-aware, not UTC.
export const fetchAndScoreHubspotData = schedules.task({
  id: "fetch-and-score-hubspot-data",
  cron: {
    pattern: "0 8 * * 1",
    timezone: process.env.DIGEST_TIMEZONE || "America/Sao_Paulo",
  },
  run: async (payload) => {
    const config = loadFetchAndScoreConfig();

    // Single anchor for this run — scoreDeals()'s days-since-activity/threshold math and
    // rankDeals()'s generatedAt both derive from this exact Date instance, so they can never
    // drift apart within a run. weekOf deliberately stays anchored to payload.timestamp (the
    // SCHEDULED fire time) rather than `now` — that's what protects the reported calendar week
    // from misattribution if execution is delayed or retried across a day boundary.
    const now = new Date();

    let rawResult;
    try {
      rawResult = await fetchRecentDeals(config.hubspotAccessToken, {
        lookbackDays: config.activityLookbackDays,
        pipelineId: config.pipelineId,
      });
    } catch (err) {
      // HubSpot auth/API failure — log clearly and re-throw WITHOUT calling deliverDigest, so
      // a partial or empty scan is never delivered. Trigger.dev retries this run per its
      // default retry policy on the thrown error.
      console.error("HubSpot fetch failed — digest will NOT be delivered for this run.", {
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    const normalized = normalizeHubSpotDeals(rawResult.deals, rawResult.companyNames, rawResult.ownerNames);
    const scored = scoreDeals(normalized, config.scoring, now);
    const weekOf = getMondayOf(payload.timestamp);
    const digest = rankDeals(
      scored,
      weekOf,
      {
        highInactivityDays: config.scoring.highInactivityDays,
        mediumInactivityDays: config.scoring.mediumInactivityDays,
      },
      now
    );

    const result = await deliverDigest.triggerAndWait(digest, {
      idempotencyKey: `revops-digest-${weekOf}`,
    });

    if (!result.ok) {
      console.error("deliver-digest failed:", { weekOf, error: result.error });
      throw new Error(`Delivery failed for week of ${weekOf}: ${result.error}`);
    }

    return { weekOf, flagged: digest.high.length + digest.medium.length, delivered: true };
  },
});
