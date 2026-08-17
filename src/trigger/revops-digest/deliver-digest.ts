import { task } from "@trigger.dev/sdk";
import { loadDeliveryConfig } from "../../lib/revops-digest/config.js";
import { getDeliveryAdapter } from "../../lib/revops-digest/delivery/registry.js";
import { MAX_DIGEST_AGE_HOURS } from "../../lib/revops-digest/delivery/limits.js";
import type { RankedDigest } from "../../lib/revops-digest/types.js";

export const deliverDigest = task({
  id: "deliver-digest",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 5000, maxTimeoutInMs: 30_000 },
  run: async (digest: RankedDigest) => {
    // This task trusts its entire payload and does no date computation of its own — a replayed
    // or manually re-triggered run with a stale digest would otherwise deliver understated risk
    // ages with zero warning. See MAX_DIGEST_AGE_HOURS for the incident this guards against.
    const ageHours = (Date.now() - new Date(digest.generatedAt).getTime()) / (60 * 60 * 1000);
    if (ageHours > MAX_DIGEST_AGE_HOURS) {
      throw new Error(
        `Refusing to deliver digest generated ${ageHours.toFixed(1)}h ago (generatedAt: ${digest.generatedAt}, weekOf: ${digest.weekOf}) — ` +
          `exceeds MAX_DIGEST_AGE_HOURS (${MAX_DIGEST_AGE_HOURS}h). This is almost always a replayed or stale manually-triggered run — ` +
          `every days-since-activity figure in this payload would understate real risk if sent.`
      );
    }

    const config = loadDeliveryConfig();
    const adapter = getDeliveryAdapter(config.deliveryMethod);

    try {
      await adapter.deliver(digest, config);
    } catch (err) {
      // Structured one-line summary first, so the failure is diagnosable from the Trigger.dev
      // dashboard run list without having to open the full stack trace.
      console.error(`Delivery via ${config.deliveryMethod} failed`, {
        weekOf: digest.weekOf,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    return { delivered: true, method: config.deliveryMethod, weekOf: digest.weekOf };
  },
});
