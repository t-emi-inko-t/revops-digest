import { renderDigestHtml, SUMMARY_BLOCK_INDENT, SUMMARY_BLOCK_SPACER } from "../src/lib/revops-digest/delivery/email/template.js";
import { scoreFixtureFile } from "../src/lib/revops-digest/hubspot/fixtures/load-fixture.js";
import type { BrandConfig, ScoringConfig } from "../src/lib/revops-digest/types.js";

/**
 * Standalone regression check for the Executive Summary block's spacing (no test framework is
 * installed in this project, so this runs directly via tsx instead of jest/vitest). Asserts the
 * three things this layout fix depends on: the left indent on the heading / Reporting Period /
 * narrative rows, the spacer row between the KPI card row and the Reporting Period line, and that
 * the KPI row itself never inherits that same indent (it must stay flush with the card edges).
 * Run: npm run verify:email-layout
 */

let failed = false;
function assert(condition: boolean, message: string): void {
  if (!condition) {
    failed = true;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok — ${message}`);
  }
}

/** Finds the nearest <td ...> that directly wraps `anchor` (no other <td> in between) and
 * returns its opening tag, so we can inspect that specific cell's style attribute. */
function wrappingTd(html: string, anchor: string): string {
  const anchorIndex = html.indexOf(anchor);
  if (anchorIndex === -1) throw new Error(`anchor not found in rendered HTML: "${anchor}"`);
  const tdStart = html.lastIndexOf("<td", anchorIndex);
  const tdEnd = html.indexOf(">", tdStart);
  return html.slice(tdStart, tdEnd + 1);
}

const scoringConfig: ScoringConfig = {
  highInactivityDays: 14,
  mediumInactivityDays: 7,
  closedStageIds: ["closedwon", "closedlost"],
};

const brand: BrandConfig = {
  companyName: "RevOps Intelligence",
  reportTitle: "Weekly Health Digest",
  logoUrl: null,
  headerImageUrl: null,
  primaryColor: "#ffffff",
  onPrimaryColor: "#0b0b0b",
  accentColor: "#2a78d6",
};

const digest = scoreFixtureFile("deals-mixed-batch.json", scoringConfig);
const html = renderDigestHtml(digest, "USD", "America/Sao_Paulo", brand);

const indentAttr = `padding-left:${SUMMARY_BLOCK_INDENT}px;`;
const spacerTd = `<td height="${SUMMARY_BLOCK_SPACER}" style="height:${SUMMARY_BLOCK_SPACER}px;line-height:${SUMMARY_BLOCK_SPACER}px;font-size:0;mso-line-height-rule:exactly;">&nbsp;</td>`;
const kpiRowWrapper = `<tr><td><div style="margin-top:14px;">`;

// 1. The three text blocks each sit in a <td> carrying the indent.
assert(wrappingTd(html, "Executive Summary").includes(indentAttr), `Executive Summary heading's <td> has ${indentAttr}`);
assert(wrappingTd(html, "Reporting Period:").includes(indentAttr), `Reporting Period line's <td> has ${indentAttr}`);
assert(wrappingTd(html, "This report flags open deals").includes(indentAttr), `narrative paragraph's wrapping <td> has ${indentAttr}`);

// 2. Nothing else picked up that same padding-left value — exactly 3 occurrences.
const indentCount = html.split(indentAttr).length - 1;
assert(indentCount === 3, `"${indentAttr}" appears exactly 3 times in the rendered HTML (found ${indentCount})`);

// 3. The KPI row's own wrapping <td> is bare — the indent must not leak onto the cards.
assert(html.includes(kpiRowWrapper), "KPI card row's <td> is unstyled (no padding-left leaked onto it)");

// 4. The spacer row exists, sits after the KPI row and before the Reporting Period line.
const kpiIndex = html.indexOf(kpiRowWrapper);
const spacerIndex = html.indexOf(spacerTd);
const reportingPeriodIndex = html.indexOf("Reporting Period:");
assert(spacerIndex !== -1, `spacer row with height:${SUMMARY_BLOCK_SPACER}px and mso-line-height-rule:exactly is present`);
assert(kpiIndex !== -1 && spacerIndex > kpiIndex, "spacer row renders after the KPI card row");
assert(spacerIndex !== -1 && reportingPeriodIndex > spacerIndex, "spacer row renders before the Reporting Period line");

if (failed) {
  console.error("\nEmail layout verification FAILED.");
  process.exit(1);
} else {
  console.log("\nEmail layout verification passed.");
}
