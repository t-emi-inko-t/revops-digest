import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { task } from "@trigger.dev/sdk";
import { loadBrandConfig } from "../../lib/revops-digest/config.js";
import { renderDigestHtml } from "../../lib/revops-digest/delivery/email/template.js";
import { scoreFixtureFile } from "../../lib/revops-digest/hubspot/fixtures/load-fixture.js";
import type { ScoringConfig } from "../../lib/revops-digest/types.js";

const OUTPUT_DIR = path.join(process.cwd(), "tmp");

/**
 * Dev-only debug task — NOT part of the production digest flow. Renders the actual email
 * template against fixture data and writes it to a local .html file, so the report design can
 * be reviewed by opening it directly in a browser — no Resend send, no email quota consumed.
 * Trigger with a payload like:
 *   { fixture: "deals-mixed-batch.json" }
 * Safe to delete once the email design is finalized.
 */
export const debugRenderEmailHtml = task({
  id: "debug-render-email-html",
  run: async (payload: {
    fixture: string;
    highInactivityDays?: number;
    mediumInactivityDays?: number;
    closedStageIds?: string[];
  }) => {
    const scoringConfig: ScoringConfig = {
      highInactivityDays: payload.highInactivityDays ?? 14,
      mediumInactivityDays: payload.mediumInactivityDays ?? 7,
      closedStageIds: payload.closedStageIds ?? ["closedwon", "closedlost"],
    };

    const digest = scoreFixtureFile(payload.fixture, scoringConfig);
    const currency = process.env.DIGEST_CURRENCY || "USD";
    const timezone = process.env.DIGEST_TIMEZONE || "America/Sao_Paulo";
    const html = renderDigestHtml(digest, currency, timezone, loadBrandConfig());

    mkdirSync(OUTPUT_DIR, { recursive: true });
    const filePath = path.join(OUTPUT_DIR, "preview-digest.html");
    writeFileSync(filePath, html, "utf-8");

    return { filePath, sizeBytes: Buffer.byteLength(html, "utf-8"), flagged: digest.high.length + digest.medium.length };
  },
});
