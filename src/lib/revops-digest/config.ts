import type {
  BrandConfig,
  ClickUpMode,
  DeliveryConfig,
  DeliveryMethod,
  FetchAndScoreConfig,
} from "./types.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) throw new Error(`${name} must be an integer, got "${raw}"`);
  return parsed;
}

/** Called from inside Task 1's run() — never at module scope, so importing this file doesn't
 * itself require HUBSPOT_ACCESS_TOKEN to be set (Task 2 imports loadDeliveryConfig only). */
export function loadFetchAndScoreConfig(): FetchAndScoreConfig {
  const hubspotAccessToken = requireEnv("HUBSPOT_ACCESS_TOKEN");
  const closedStageIds = requireEnv("CLOSED_STAGE_IDS")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const highInactivityDays = intEnv("RISK_HIGH_INACTIVITY_DAYS", 14);
  const mediumInactivityDays = intEnv("RISK_MEDIUM_INACTIVITY_DAYS", 7);

  return {
    hubspotAccessToken,
    scoring: { highInactivityDays, mediumInactivityDays, closedStageIds },
    activityLookbackDays: intEnv("HUBSPOT_ACTIVITY_LOOKBACK_DAYS", 30),
    pipelineId: process.env.HUBSPOT_PIPELINE_ID || undefined,
    digestTimezone: process.env.DIGEST_TIMEZONE || "America/Sao_Paulo",
  };
}

/** Every field has a default so a client can go live with zero BRAND_* vars set — set only the
 * ones that need to change for a given client's identity. Exported (unlike the other private
 * loaders here) because the debug-render-email-html task needs brand defaults without pulling
 * in the rest of loadDeliveryConfig()'s DELIVERY_METHOD/Resend validation. */
export function loadBrandConfig(): BrandConfig {
  return {
    companyName: process.env.BRAND_COMPANY_NAME || "RevOps Intelligence",
    reportTitle: process.env.BRAND_REPORT_TITLE || "Weekly Health Digest",
    logoUrl: process.env.BRAND_LOGO_URL || null,
    headerImageUrl: process.env.BRAND_HEADER_IMAGE_URL || null,
    primaryColor: process.env.BRAND_PRIMARY_COLOR || "#ffffff",
    onPrimaryColor: process.env.BRAND_ON_PRIMARY_COLOR || "#0b0b0b",
    accentColor: process.env.BRAND_ACCENT_COLOR || "#2a78d6",
  };
}

/** Called from inside Task 2's run(). Only validates the credentials for the active
 * DELIVERY_METHOD — a client running email doesn't need to set ClickUp/Slack vars at all. */
export function loadDeliveryConfig(): DeliveryConfig {
  const deliveryMethod = requireEnv("DELIVERY_METHOD") as DeliveryMethod;
  const digestCurrency = process.env.DIGEST_CURRENCY || "USD";
  const digestTimezone = process.env.DIGEST_TIMEZONE || "America/Sao_Paulo";

  const config: DeliveryConfig = {
    deliveryMethod,
    digestCurrency,
    digestTimezone,
    brand: loadBrandConfig(),
    email: null,
    slack: null,
    clickup: null,
  };

  switch (deliveryMethod) {
    case "email":
      config.email = {
        resendApiKey: requireEnv("RESEND_API_KEY"),
        fromEmail: requireEnv("RESEND_FROM_EMAIL"),
        recipientEmail: requireEnv("DIGEST_RECIPIENT_EMAIL"),
      };
      break;
    case "slack":
      config.slack = { webhookUrl: requireEnv("SLACK_WEBHOOK_URL") };
      break;
    case "clickup": {
      const mode = requireEnv("CLICKUP_MODE") as ClickUpMode;
      if (mode !== "simple" && mode !== "advanced") {
        throw new Error(`CLICKUP_MODE must be "simple" or "advanced", got "${mode}"`);
      }
      config.clickup = {
        apiToken: requireEnv("CLICKUP_API_TOKEN"),
        listId: requireEnv("CLICKUP_LIST_ID"),
        mode,
      };
      break;
    }
    default:
      throw new Error(`DELIVERY_METHOD must be "email", "slack", or "clickup", got "${deliveryMethod}"`);
  }

  return config;
}
