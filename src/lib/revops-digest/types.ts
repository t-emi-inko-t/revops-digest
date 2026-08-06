export type RiskTier = "HIGH" | "MEDIUM" | "LOW";

export type DeliveryMethod = "email" | "slack" | "clickup";

export type ClickUpMode = "simple" | "advanced";

/** A deal as pulled from HubSpot and mapped into a shape the rest of the pipeline understands. */
export interface NormalizedDeal {
  dealId: string;
  dealName: string;
  stageId: string;
  pipelineId: string;
  amount: number;
  closeDate: string | null; // ISO date
  lastActivityDate: string | null; // ISO date, null = no activity ever logged
  ownerId: string | null;
  ownerName: string | null;
  companyId: string | null;
  companyName: string | null;
  contactIds: string[];
}

export interface ScoredDeal extends NormalizedDeal {
  riskTier: RiskTier;
  /** One entry per rule that fired, e.g. both inactivity and overdue close date can fire at once. */
  riskReasons: string[];
  daysSinceLastActivity: number | null;
  daysPastCloseDate: number | null;
  isOpen: boolean;
}

export interface RankedDigest {
  generatedAt: string; // ISO timestamp
  weekOf: string; // ISO date (Monday) this run represents — also used as the idempotency key
  high: ScoredDeal[]; // sorted by amount descending
  medium: ScoredDeal[]; // sorted by amount descending
  totalDealsScanned: number;
  hasFlags: boolean;
  // Carried through from ScoringConfig so delivery templates can explain, in plain English,
  // exactly what triggered each tier — without delivery code needing its own copy of the
  // thresholds (which are configured per-client and could drift out of sync otherwise).
  thresholds: { highInactivityDays: number; mediumInactivityDays: number };
}

export interface ScoringConfig {
  highInactivityDays: number;
  mediumInactivityDays: number;
  closedStageIds: string[];
}

/** What Task 1 (fetch-and-score-hubspot-data) needs. Validated inside that task's run(). */
export interface FetchAndScoreConfig {
  hubspotAccessToken: string;
  scoring: ScoringConfig;
  activityLookbackDays: number;
  pipelineId: string | undefined;
  digestTimezone: string;
}

/** Per-client visual identity for delivered digests. Status colors (HIGH/MEDIUM/healthy) are
 * deliberately NOT part of this — they carry fixed meaning (risk severity) across every client
 * and are never themed, same as how a design system reserves status colors from its brand
 * palette. Only "chrome" — masthead, company name, accent — is swappable per client. */
export interface BrandConfig {
  companyName: string;
  reportTitle: string;
  logoUrl: string | null;
  primaryColor: string; // masthead background
  onPrimaryColor: string; // text color against primaryColor — must stay high-contrast
  accentColor: string; // section-label underline, small accents
}

/** What Task 2 (deliver-digest) needs. Validated inside that task's run() — deliberately
 * separate from FetchAndScoreConfig so each task only requires the env vars it actually uses. */
export interface DeliveryConfig {
  deliveryMethod: DeliveryMethod;
  digestCurrency: string;
  digestTimezone: string;
  brand: BrandConfig;
  email: {
    resendApiKey: string;
    fromEmail: string;
    recipientEmail: string;
  } | null;
  slack: {
    webhookUrl: string;
  } | null;
  clickup: {
    apiToken: string;
    listId: string;
    mode: ClickUpMode;
  } | null;
}
