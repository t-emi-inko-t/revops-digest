import type { DeliveryConfig, RankedDigest } from "../../types.js";
import type { DeliveryAdapter } from "../types.js";
import { buildDigestBlocks } from "./blocks.js";

export const slackAdapter: DeliveryAdapter = {
  async deliver(digest: RankedDigest, config: DeliveryConfig): Promise<void> {
    if (!config.slack) throw new Error("Slack delivery selected but slack config is missing");

    const response = await fetch(config.slack.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: buildDigestBlocks(digest, config.digestCurrency) }),
    });

    const body = await response.text();
    if (!response.ok || body !== "ok") {
      throw new Error(`Slack webhook post failed (${response.status}): ${body}`);
    }
  },
};
