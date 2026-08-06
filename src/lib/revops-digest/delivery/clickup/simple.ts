import { formatCurrency } from "../../format/currency.js";
import type { RankedDigest, ScoredDeal } from "../../types.js";
import { MAX_DEALS_LISTED_PER_TIER } from "../limits.js";

function sum(deals: ScoredDeal[]): number {
  return deals.reduce((total, d) => total + d.amount, 0);
}

function dealLine(deal: ScoredDeal, currency: string): string {
  const company = deal.companyName ?? "—";
  const owner = deal.ownerName ?? "—";
  return `- **${deal.dealName}** (${company}) — ${formatCurrency(deal.amount, currency)} — ${deal.riskReasons.join("; ")} — owner: ${owner}`;
}

// Caps the listed deals per tier — a large-flag week (thousands of deals) would otherwise
// produce a description too large to be a useful ClickUp task. Deals are already ranked by
// exposure, so the top N is the part worth reading; the rest is summarized, not dropped.
function dealList(deals: ScoredDeal[], currency: string): string {
  const shown = deals.slice(0, MAX_DEALS_LISTED_PER_TIER);
  const overflow = deals.slice(MAX_DEALS_LISTED_PER_TIER);
  const lines = shown.map((d) => dealLine(d, currency));
  if (overflow.length > 0) {
    lines.push(`- _+ ${overflow.length} more, totaling ${formatCurrency(sum(overflow), currency)} — showing top ${MAX_DEALS_LISTED_PER_TIER} by exposure. Full list in HubSpot._`);
  }
  return lines.join("\n");
}

export function buildSimpleTaskBody(digest: RankedDigest, currency: string): { name: string; description: string } {
  const name = `Weekly RevOps Digest - ${digest.weekOf}`;

  if (!digest.hasFlags) {
    return {
      name,
      description: `No risks flagged this week — all ${digest.totalDealsScanned} deals reviewed are healthy.`,
    };
  }

  const sections: string[] = [];
  if (digest.high.length > 0) {
    sections.push(`## HIGH RISK (${digest.high.length})\n${dealList(digest.high, currency)}`);
  }
  if (digest.medium.length > 0) {
    sections.push(`## MEDIUM RISK (${digest.medium.length})\n${dealList(digest.medium, currency)}`);
  }

  return {
    name,
    description: `${digest.totalDealsScanned} deals scanned.\n\n${sections.join("\n\n")}`,
  };
}
