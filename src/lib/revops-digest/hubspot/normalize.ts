import type { NormalizedDeal } from "../types.js";
import type { RawHubSpotDeal } from "./fetch-deals.js";

/** Pure mapping from raw HubSpot API shape to NormalizedDeal[]. No fetch calls — this is the
 * seam that lets fixtures substitute for a live HubSpot token during local development: any
 * RawHubSpotDeal[] (real or fixture) plus lookup maps produces the same normalized shape that
 * scoreDeals() consumes. */
export function normalizeHubSpotDeals(
  rawDeals: RawHubSpotDeal[],
  companyNames: Map<string, string>,
  ownerNames: Map<string, string>
): NormalizedDeal[] {
  return rawDeals.map((raw) => {
    const p = raw.properties;
    const companyId = raw.associations?.companies?.results[0]?.id ?? null;
    const contactIds = raw.associations?.contacts?.results.map((c) => c.id) ?? [];
    const ownerId = p.hubspot_owner_id ?? null;

    return {
      dealId: raw.id,
      dealName: p.dealname ?? `(unnamed deal ${raw.id})`,
      stageId: p.dealstage ?? "",
      pipelineId: p.pipeline ?? "",
      amount: p.amount ? Number.parseFloat(p.amount) : 0,
      // closedate is a HubSpot "date" property — returned as a plain ISO date string already.
      closeDate: p.closedate ?? null,
      // hs_lastmodifieddate is a HubSpot "datetime" property — the v3 CRM API returns these as
      // ISO-8601 strings already (not epoch milliseconds), so this is a straight pass-through.
      lastActivityDate: p.hs_lastmodifieddate ?? null,
      ownerId,
      ownerName: ownerId ? ownerNames.get(ownerId) ?? null : null,
      companyId,
      companyName: companyId ? companyNames.get(companyId) ?? null : null,
      contactIds,
    };
  });
}
