import { hubspotRequest } from "./client.js";

/** The HubSpot property used as "last activity date" for the inactivity risk rules.
 * Defaults to hs_lastmodifieddate because it's present on every portal regardless of
 * subscription tier. If the client's HubSpot has hs_last_activity_date (a calculated
 * property available on Sales Hub Pro+), that's a more semantically accurate signal of
 * actual engagement (calls, emails, meetings) rather than "any field was edited" — swap
 * the constant below to use it for that client. This is a per-client build-time swap, not
 * an env var, because it depends on the client's HubSpot subscription tier, not preference. */
const LAST_ACTIVITY_PROPERTY = "hs_lastmodifieddate";

const DEAL_PROPERTIES = [
  "dealname",
  "dealstage",
  "pipeline",
  "amount",
  "closedate",
  "hubspot_owner_id",
  LAST_ACTIVITY_PROPERTY,
];

export interface RawHubSpotDeal {
  id: string;
  properties: Record<string, string | null>;
  associations?: {
    companies?: { results: { id: string }[] };
    contacts?: { results: { id: string }[] };
  };
}

interface HubSpotSearchResponse {
  results: { id: string }[];
  paging?: { next?: { after: string } };
}

interface HubSpotBatchReadResponse {
  results: RawHubSpotDeal[];
}

interface HubSpotOwner {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

interface HubSpotOwnersResponse {
  results: HubSpotOwner[];
  paging?: { next?: { after: string } };
}

export interface FetchRecentDealsResult {
  deals: RawHubSpotDeal[];
  companyNames: Map<string, string>;
  ownerNames: Map<string, string>;
}

/** Searches for deal IDs modified within the lookback window, batch-reads them with company
 * and contact associations, then resolves company and owner names. All lookups are batched
 * (one companies/batch/read call, one owners list) rather than N per-deal calls, to keep API
 * usage bounded for portals with many deals. */
export async function fetchRecentDeals(
  token: string,
  opts: { lookbackDays: number; pipelineId?: string }
): Promise<FetchRecentDealsResult> {
  const dealIds = await searchRecentDealIds(token, opts);
  if (dealIds.length === 0) {
    return { deals: [], companyNames: new Map(), ownerNames: new Map() };
  }

  const deals = await batchReadDeals(token, dealIds);

  const companyIds = new Set<string>();
  for (const deal of deals) {
    for (const company of deal.associations?.companies?.results ?? []) {
      companyIds.add(company.id);
    }
  }

  const [companyNames, ownerNames] = await Promise.all([
    batchReadCompanyNames(token, [...companyIds]),
    listOwnerNames(token),
  ]);

  return { deals, companyNames, ownerNames };
}

async function searchRecentDealIds(
  token: string,
  opts: { lookbackDays: number; pipelineId?: string }
): Promise<string[]> {
  const since = Date.now() - opts.lookbackDays * 24 * 60 * 60 * 1000;

  const filters: Record<string, unknown>[] = [
    { propertyName: LAST_ACTIVITY_PROPERTY, operator: "GTE", value: String(since) },
  ];
  if (opts.pipelineId) {
    filters.push({ propertyName: "pipeline", operator: "EQ", value: opts.pipelineId });
  }

  const ids: string[] = [];
  let after: string | undefined;

  do {
    const response = await hubspotRequest<HubSpotSearchResponse>(
      token,
      "/crm/v3/objects/deals/search",
      {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [{ filters }],
          properties: DEAL_PROPERTIES,
          limit: 100,
          after,
        }),
      }
    );

    ids.push(...response.results.map((r) => r.id));
    after = response.paging?.next?.after;
  } while (after);

  return ids;
}

async function batchReadDeals(token: string, dealIds: string[]): Promise<RawHubSpotDeal[]> {
  const deals: RawHubSpotDeal[] = [];

  for (let i = 0; i < dealIds.length; i += 100) {
    const chunk = dealIds.slice(i, i + 100);
    const response = await hubspotRequest<HubSpotBatchReadResponse>(
      token,
      "/crm/v3/objects/deals/batch/read",
      {
        method: "POST",
        body: JSON.stringify({
          inputs: chunk.map((id) => ({ id })),
          properties: DEAL_PROPERTIES,
          associations: ["companies", "contacts"],
        }),
      }
    );
    deals.push(...response.results);
  }

  return deals;
}

async function batchReadCompanyNames(
  token: string,
  companyIds: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (companyIds.length === 0) return names;

  for (let i = 0; i < companyIds.length; i += 100) {
    const chunk = companyIds.slice(i, i + 100);
    const response = await hubspotRequest<{ results: { id: string; properties: { name?: string } }[] }>(
      token,
      "/crm/v3/objects/companies/batch/read",
      {
        method: "POST",
        body: JSON.stringify({ inputs: chunk.map((id) => ({ id })), properties: ["name"] }),
      }
    );
    for (const company of response.results) {
      if (company.properties.name) names.set(company.id, company.properties.name);
    }
  }

  return names;
}

async function listOwnerNames(token: string): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  let after: string | undefined;

  do {
    const query = new URLSearchParams({ limit: "100" });
    if (after) query.set("after", after);

    const response = await hubspotRequest<HubSpotOwnersResponse>(
      token,
      `/crm/v3/owners?${query.toString()}`
    );

    for (const owner of response.results) {
      const name = [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email;
      if (name) names.set(owner.id, name);
    }
    after = response.paging?.next?.after;
  } while (after);

  return names;
}
