import type { DeliveryConfig, RankedDigest } from "../types.js";

/** Every delivery channel implements this. Adding a 4th channel later means: one new folder
 * implementing this interface, one new `case` in registry.ts, and one new block of env vars —
 * no changes to Task 1, scoring, or the other adapters. */
export interface DeliveryAdapter {
  deliver(digest: RankedDigest, config: DeliveryConfig): Promise<void>;
}
