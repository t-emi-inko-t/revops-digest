import { task } from "@trigger.dev/sdk";
import { loadDeliveryConfig } from "../../lib/revops-digest/config.js";
import { getDeliveryAdapter } from "../../lib/revops-digest/delivery/registry.js";
import type { RankedDigest } from "../../lib/revops-digest/types.js";

export const deliverDigest = task({
  id: "deliver-digest",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 5000, maxTimeoutInMs: 30_000 },
  run: async (digest: RankedDigest) => {
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
