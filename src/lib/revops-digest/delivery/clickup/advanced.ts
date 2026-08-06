import { formatCurrency } from "../../format/currency.js";
import type { RiskTier, ScoredDeal } from "../../types.js";

// ClickUp priority scale: 1 = Urgent, 2 = High, 3 = Normal, 4 = Low.
const PRIORITY_BY_TIER: Record<Extract<RiskTier, "HIGH" | "MEDIUM">, number> = {
  HIGH: 1,
  MEDIUM: 3,
};

const DUE_IN_DAYS = 3;

export interface ClickUpTaskInput {
  name: string;
  description: string;
  priority: number;
  due_date: number;
}

/** One ClickUp task per flagged deal. Task name is the company name per spec — falls back to
 * the deal name if the deal has no associated company, since the spec didn't address that case. */
export function buildAdvancedTaskInput(deal: ScoredDeal, currency: string): ClickUpTaskInput {
  const name = deal.companyName ?? deal.dealName;
  const lastActivity = deal.lastActivityDate ? new Date(deal.lastActivityDate).toISOString().slice(0, 10) : "never";

  return {
    name,
    description: [
      `Deal: ${deal.dealName}`,
      `Amount: ${formatCurrency(deal.amount, currency)}`,
      `Risk: ${deal.riskReasons.join("; ")}`,
      `Last activity: ${lastActivity}`,
    ].join("\n"),
    priority: PRIORITY_BY_TIER[deal.riskTier as "HIGH" | "MEDIUM"],
    due_date: Date.now() + DUE_IN_DAYS * 24 * 60 * 60 * 1000,
  };
}
