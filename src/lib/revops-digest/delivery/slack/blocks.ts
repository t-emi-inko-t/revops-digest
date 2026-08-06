import { formatCurrency } from "../../format/currency.js";
import type { RankedDigest, ScoredDeal } from "../../types.js";
import { MAX_DEALS_LISTED_PER_TIER } from "../limits.js";

function dealLine(deal: ScoredDeal, currency: string): string {
  const company = deal.companyName ?? "—";
  const owner = deal.ownerName ?? "—";
  return `*${deal.dealName}* (${company}) — ${formatCurrency(deal.amount, currency)} — _${deal.riskReasons.join("; ")}_ — owner: ${owner}`;
}

function sum(deals: ScoredDeal[]): number {
  return deals.reduce((total, d) => total + d.amount, 0);
}

// Slack section blocks cap mrkdwn text at 3,000 characters — listing every deal in a
// large-flag week would exceed that (and did, in production: a 2,089-deal week). Same fix as
// the email template: top N by exposure (already sorted), remainder summarized in one line.
function tierSection(title: string, emoji: string, deals: ScoredDeal[], currency: string) {
  const shown = deals.slice(0, MAX_DEALS_LISTED_PER_TIER);
  const overflow = deals.slice(MAX_DEALS_LISTED_PER_TIER);
  const lines = shown.map((d) => dealLine(d, currency));
  if (overflow.length > 0) {
    lines.push(`_+ ${overflow.length} more, totaling ${formatCurrency(sum(overflow), currency)} — showing top ${MAX_DEALS_LISTED_PER_TIER} by exposure. Full list in HubSpot._`);
  }

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `${emoji} *${title} (${deals.length})*\n${lines.join("\n")}`,
    },
  };
}

export function buildDigestBlocks(digest: RankedDigest, currency: string): unknown[] {
  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `RevOps Weekly Health Digest — Week of ${digest.weekOf}` },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `${digest.totalDealsScanned} deals scanned` }],
    },
  ];

  if (!digest.hasFlags) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `No risks flagged this week — all ${digest.totalDealsScanned} deals healthy.` },
    });
    return blocks;
  }

  if (digest.high.length > 0) {
    blocks.push({ type: "divider" }, tierSection("HIGH RISK", "🔴", digest.high, currency));
  }
  if (digest.medium.length > 0) {
    blocks.push({ type: "divider" }, tierSection("MEDIUM RISK", "🟡", digest.medium, currency));
  }

  return blocks;
}
