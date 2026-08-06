import { formatCurrency } from "../../format/currency.js";
import type { DeliveryConfig, RankedDigest, ScoredDeal } from "../../types.js";
import type { DeliveryAdapter } from "../types.js";
import { MAX_DEALS_LISTED_PER_TIER } from "../limits.js";
import { buildAdvancedTaskInput } from "./advanced.js";
import { buildSimpleTaskBody } from "./simple.js";

function sum(deals: ScoredDeal[]): number {
  return deals.reduce((total, d) => total + d.amount, 0);
}

async function createTask(
  apiToken: string,
  listId: string,
  input: { name: string; description: string; priority?: number; due_date?: number }
): Promise<void> {
  const response = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
    method: "POST",
    headers: {
      Authorization: apiToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ClickUp task creation failed (${response.status}): ${body}`);
  }
}

export const clickupAdapter: DeliveryAdapter = {
  async deliver(digest: RankedDigest, config: DeliveryConfig): Promise<void> {
    if (!config.clickup) throw new Error("ClickUp delivery selected but clickup config is missing");
    const { apiToken, listId, mode } = config.clickup;

    if (mode === "simple" || !digest.hasFlags) {
      // Zero-flags case falls back to a single summary task in BOTH modes — advanced mode has
      // no per-deal tasks to create on a healthy week, but the client should still see proof
      // the automation ran, same as every other delivery channel.
      await createTask(apiToken, listId, buildSimpleTaskBody(digest, config.digestCurrency));
      return;
    }

    // Advanced mode: one task per flagged deal, HIGH first then MEDIUM, in ranked order — capped
    // per tier. ClickUp has no batch-create endpoint, so each task is a sequential API call;
    // thousands of flagged deals would blow past both ClickUp's rate limit and this task's
    // execution time budget. Deals are already ranked by exposure, so the top N per tier is what
    // actually warrants an individual follow-up task; the rest gets one rollup task instead of
    // being silently skipped.
    const toCreate = [...digest.high.slice(0, MAX_DEALS_LISTED_PER_TIER), ...digest.medium.slice(0, MAX_DEALS_LISTED_PER_TIER)];
    for (const deal of toCreate) {
      await createTask(apiToken, listId, buildAdvancedTaskInput(deal, config.digestCurrency));
    }

    const skipped = [...digest.high.slice(MAX_DEALS_LISTED_PER_TIER), ...digest.medium.slice(MAX_DEALS_LISTED_PER_TIER)];
    if (skipped.length > 0) {
      await createTask(apiToken, listId, {
        name: `Weekly RevOps Digest - ${digest.weekOf} - ${skipped.length} additional flagged deals`,
        description: `${skipped.length} more flagged deals were not created as individual tasks (totaling ${formatCurrency(sum(skipped), config.digestCurrency)}) — showing the top ${MAX_DEALS_LISTED_PER_TIER} per tier by exposure only. See the full list in HubSpot or the email/Slack digest for this week.`,
      });
    }
  },
};
