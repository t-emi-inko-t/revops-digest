import { formatCurrency } from "../../format/currency.js";
import { formatPreparedAt, formatReportPeriod } from "../../format/date.js";
import type { BrandConfig, RankedDigest, RiskTier, ScoredDeal } from "../../types.js";
import { MAX_DEALS_LISTED_PER_TIER } from "../limits.js";

// Fixed design tokens for the parts of the report that are NOT brand-themable. Status colors in
// particular carry a fixed meaning (risk severity) across every client and are deliberately kept
// out of BrandConfig — same reasoning a design system reserves status colors from its palette.
const INK = "#0b0b0b";
const INK_SECONDARY = "#52514e";
const INK_MUTED = "#898781";
const GRIDLINE = "#e1e0d9";
const BORDER = "rgba(11,11,11,0.10)";
const SURFACE = "#fcfcfb";
const PAGE = "#f9f9f7";
const STATUS_CRITICAL = "#d03b3b";
const STATUS_WARNING = "#fab219";
const STATUS_GOOD = "#0ca30c";

const FONT = `font-family: -apple-system, "Segoe UI", Arial, sans-serif;`;
const TABULAR = `font-variant-numeric: tabular-nums;`;

// Layout constants for the Executive Summary block (heading, Reporting Period line, narrative
// paragraph). Change the values here — nowhere else — to adjust indent or spacer height. Exported
// so verify-email-layout.ts can assert against the same source of truth instead of duplicating
// the literals.
export const SUMMARY_BLOCK_INDENT = 10; // px, left padding applied to each row's <td>, not to the KPI card row
export const SUMMARY_BLOCK_SPACER = 20; // px, height of the spacer row between the KPI card row and the Reporting Period line

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sum(deals: ScoredDeal[]): number {
  return deals.reduce((total, d) => total + d.amount, 0);
}

function statTile(label: string, value: string, subtext: string, accentColor: string): string {
  return `
    <td style="width:25%;padding:0 6px;" valign="top">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-top:3px solid ${accentColor};background:${SURFACE};">
        <tr><td style="padding:14px 12px;">
          <div style="${FONT} font-size:10px;letter-spacing:0.6px;text-transform:uppercase;color:${INK_MUTED};font-weight:600;">${label}</div>
          <div style="${FONT} ${TABULAR} font-size:24px;font-weight:700;color:${INK};margin-top:4px;">${value}</div>
          <div style="${FONT} font-size:11px;color:${INK_SECONDARY};margin-top:2px;">${subtext}</div>
        </td></tr>
      </table>
    </td>`;
}

function renderKpiRow(digest: RankedDigest, currency: string): string {
  const flaggedCount = digest.high.length + digest.medium.length;
  const flaggedPct = digest.totalDealsScanned > 0 ? ((flaggedCount / digest.totalDealsScanned) * 100).toFixed(1) : "0.0";
  const highTotal = sum(digest.high);
  const mediumTotal = sum(digest.medium);

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      ${statTile("Deals Reviewed", digest.totalDealsScanned.toLocaleString("en-US"), "Last 30 days of activity", GRIDLINE)}
      ${statTile("Flagged for Review", flaggedCount.toLocaleString("en-US"), `${flaggedPct}% of pipeline`, GRIDLINE)}
      ${statTile("High Risk Exposure", formatCurrency(highTotal, currency), `${digest.high.length} deal${digest.high.length === 1 ? "" : "s"}`, STATUS_CRITICAL)}
      ${statTile("Medium Risk Exposure", formatCurrency(mediumTotal, currency), `${digest.medium.length} deal${digest.medium.length === 1 ? "" : "s"}`, STATUS_WARNING)}
    </tr></table>`;
}

function renderNarrative(digest: RankedDigest): string {
  const { highInactivityDays, mediumInactivityDays } = digest.thresholds;
  const flaggedCount = digest.high.length + digest.medium.length;
  const flaggedPct = digest.totalDealsScanned > 0 ? ((flaggedCount / digest.totalDealsScanned) * 100).toFixed(1) : "0.0";

  const finding = digest.hasFlags
    ? `Of the ${digest.totalDealsScanned.toLocaleString("en-US")} deals reviewed, ${flaggedCount.toLocaleString("en-US")} (${flaggedPct}%) require attention — detailed below, ranked by dollar exposure within each tier.`
    : `All ${digest.totalDealsScanned.toLocaleString("en-US")} deals reviewed this week are healthy — none crossed either risk threshold.`;

  return `
    <p style="${FONT} font-size:13px;color:${INK_SECONDARY};line-height:1.6;margin:16px 0 0;">
      This report flags open deals showing signs of stalling. <strong style="color:${INK};">High risk</strong> deals have had
      no logged activity in ${highInactivityDays}+ days, or their close date has already passed while the deal remains open.
      <strong style="color:${INK};">Medium risk</strong> deals have had ${mediumInactivityDays}–${highInactivityDays - 1} days
      of inactivity. ${finding}
    </p>`;
}

function riskChip(tier: RiskTier): string {
  const color = tier === "HIGH" ? STATUS_CRITICAL : STATUS_WARNING;
  return `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${color};margin-right:6px;"></span>`;
}

function renderDealRow(deal: ScoredDeal, currency: string, isLast: boolean): string {
  const border = isLast ? "" : `border-bottom:1px solid ${GRIDLINE};`;
  const lastActivity = deal.daysSinceLastActivity === null
    ? "no activity on record"
    : `${deal.daysSinceLastActivity}d ago${deal.lastActivityDate ? " · " + deal.lastActivityDate.slice(0, 10) : ""}`;

  return `
    <tr>
      <td style="padding:12px 8px;${border}" valign="top">
        <div style="${FONT} font-size:13px;font-weight:600;color:${INK};">${escapeHtml(deal.dealName)}</div>
        <div style="${FONT} font-size:12px;color:${INK_MUTED};margin-top:2px;">${escapeHtml(deal.companyName ?? "No associated company")}</div>
      </td>
      <td style="padding:12px 8px;${border}" valign="top">
        <div style="${FONT} font-size:12px;color:${INK_SECONDARY};">${escapeHtml(deal.ownerName ?? "Unassigned")}</div>
      </td>
      <td style="padding:12px 8px;${border}text-align:right;" valign="top">
        <div style="${FONT} ${TABULAR} font-size:13px;font-weight:700;color:${INK};">${formatCurrency(deal.amount, currency)}</div>
      </td>
      <td style="padding:12px 8px;${border}" valign="top">
        <div style="${FONT} font-size:12px;color:${INK_SECONDARY};line-height:1.5;">${escapeHtml(deal.riskReasons.join(" · "))}</div>
      </td>
      <td style="padding:12px 8px;${border}white-space:nowrap;" valign="top">
        <div style="${FONT} font-size:12px;color:${INK_SECONDARY};">${lastActivity}</div>
      </td>
    </tr>`;
}

function renderOverflowRow(remaining: ScoredDeal[], currency: string): string {
  const remainingTotal = sum(remaining);
  return `
    <tr>
      <td colspan="5" style="padding:12px 8px;${FONT} font-size:12px;color:${INK_SECONDARY};font-style:italic;">
        + ${remaining.length} more, totaling ${formatCurrency(remainingTotal, currency)} — showing the top
        ${MAX_DEALS_LISTED_PER_TIER} by exposure. Full list available in HubSpot.
      </td>
    </tr>`;
}

function renderSection(numeral: string, title: string, tier: RiskTier, deals: ScoredDeal[], currency: string): string {
  if (deals.length === 0) return "";
  const accentColor = tier === "HIGH" ? STATUS_CRITICAL : STATUS_WARNING;
  const shown = deals.slice(0, MAX_DEALS_LISTED_PER_TIER);
  const overflow = deals.slice(MAX_DEALS_LISTED_PER_TIER);

  return `
    <div style="margin-top:32px;">
      <div style="${FONT} font-size:11px;letter-spacing:0.6px;text-transform:uppercase;color:${INK_MUTED};font-weight:600;">
        ${riskChip(tier)}${numeral}. ${title} <span style="color:${INK_MUTED};font-weight:400;">(${deals.length})</span>
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;border-top:2px solid ${accentColor};">
        <tr>
          <td style="padding:8px;${FONT} font-size:10px;letter-spacing:0.4px;text-transform:uppercase;color:${INK_MUTED};border-bottom:1px solid ${GRIDLINE};">Deal</td>
          <td style="padding:8px;${FONT} font-size:10px;letter-spacing:0.4px;text-transform:uppercase;color:${INK_MUTED};border-bottom:1px solid ${GRIDLINE};">Owner</td>
          <td style="padding:8px;${FONT} font-size:10px;letter-spacing:0.4px;text-transform:uppercase;color:${INK_MUTED};border-bottom:1px solid ${GRIDLINE};text-align:right;">Exposure</td>
          <td style="padding:8px;${FONT} font-size:10px;letter-spacing:0.4px;text-transform:uppercase;color:${INK_MUTED};border-bottom:1px solid ${GRIDLINE};">Risk Signal</td>
          <td style="padding:8px;${FONT} font-size:10px;letter-spacing:0.4px;text-transform:uppercase;color:${INK_MUTED};border-bottom:1px solid ${GRIDLINE};">Last Activity</td>
        </tr>
        ${shown.map((d, i) => renderDealRow(d, currency, i === shown.length - 1 && overflow.length === 0)).join("")}
        ${overflow.length > 0 ? renderOverflowRow(overflow, currency) : ""}
      </table>
    </div>`;
}

function renderHealthyCard(digest: RankedDigest): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid ${BORDER};border-left:3px solid ${STATUS_GOOD};background:${SURFACE};">
      <tr><td style="padding:16px 18px;">
        <div style="${FONT} font-size:13px;font-weight:700;color:${INK};">All clear</div>
        <div style="${FONT} font-size:12px;color:${INK_SECONDARY};margin-top:4px;line-height:1.5;">
          No deals crossed either risk threshold this week. ${digest.totalDealsScanned.toLocaleString("en-US")} deals were reviewed.
        </div>
      </td></tr>
    </table>`;
}

function renderFooter(digest: RankedDigest, timezone: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;border-top:1px solid ${GRIDLINE};">
      <tr><td style="padding-top:16px;">
        <div style="${FONT} font-size:10px;letter-spacing:0.6px;text-transform:uppercase;color:${INK_MUTED};font-weight:600;">Methodology</div>
        <div style="${FONT} font-size:11px;color:${INK_MUTED};line-height:1.6;margin-top:4px;">
          Risk tiers are based on days since last logged activity and close-date status. Stage-history
          (deals that moved backward a stage) is not yet tracked — see project README for details.
        </div>
        <div style="${FONT} font-size:11px;color:${INK_MUTED};margin-top:12px;">
          Prepared ${formatPreparedAt(digest.generatedAt, timezone)} · Automated analysis of HubSpot CRM data.
        </div>
      </td></tr>
    </table>`;
}

/** When brand.headerImageUrl is set, the whole masthead is the client's own designed banner
 * image — no text overlay, since the image already carries the branding. Falls back to a plain
 * text masthead (with an optional small logo) for clients who haven't supplied a header image
 * yet. */
function renderMasthead(brand: BrandConfig): string {
  if (brand.headerImageUrl) {
    // Left-aligned at the same 32px inset as the body content below it (not centered) so the
    // banner's left edge lines up with "Executive Summary" and everything else in the card.
    return `
      <tr><td style="padding:28px 32px 0;line-height:0;font-size:0;">
        <img src="${escapeHtml(brand.headerImageUrl)}" alt="${escapeHtml(brand.companyName)}" width="600" style="display:block;max-width:100%;height:auto;border:0;" />
      </td></tr>`;
  }

  const logo = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.companyName)}" height="28" style="display:block;margin-bottom:10px;border:0;" />`
    : "";

  return `
    <tr><td class="header-band" style="background:${brand.primaryColor};padding:28px 32px;border-bottom:1px solid ${BORDER};">
      ${logo}
      <div class="header-text" style="${FONT} font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${brand.onPrimaryColor};opacity:0.75;font-weight:600;">${escapeHtml(brand.companyName)}</div>
      <div class="header-text" style="${FONT} font-size:22px;font-weight:700;color:${brand.onPrimaryColor};margin-top:6px;">${escapeHtml(brand.reportTitle)}</div>
    </td></tr>`;
}

/** Wraps the report body in a complete HTML document with explicit dark-mode opt-out. Without
 * this, Gmail/Outlook.com's automatic dark-mode remapping can repaint inline colors on a text
 * masthead into something illegible — the `color-scheme` meta tags and the `[data-ogsc]`
 * override below are the standard fix, forcing the client to render our colors as-authored
 * instead of "helpfully" inverting them. Only applies to the text-masthead fallback; a
 * headerImageUrl banner is a plain image and isn't affected by inline-color remapping. */
function wrapDocument(bodyHtml: string, brand: BrandConfig): string {
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<meta name="darkreader-lock" />
<title>${escapeHtml(brand.reportTitle)}</title>
<style>
  :root { color-scheme: light; supported-color-schemes: light; }
  body { margin: 0; padding: 0; }
  /* Gmail app / Outlook.com dark mode tag inline elements with [data-ogsc]; pin our colors. */
  [data-ogsc] .header-band { background: ${brand.primaryColor} !important; }
  [data-ogsc] .header-text { color: ${brand.onPrimaryColor} !important; }
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE};">
${bodyHtml}
</body>
</html>`;
}

/** Executive Summary heading, KPI card row, Reporting Period line, and narrative paragraph as
 * their own table rows — not sibling divs — so the SUMMARY_BLOCK_INDENT left padding can be
 * scoped to individual <td>s (heading / Reporting Period / narrative) without leaking onto the
 * KPI row's <td>, and the SUMMARY_BLOCK_SPACER gap is a dedicated spacer row rather than a
 * margin that Outlook's Word rendering engine can drop. */
function renderSummaryBlock(digest: RankedDigest, currency: string, brand: BrandConfig): string {
  const heading = `<div style="${FONT} font-size:11px;letter-spacing:0.6px;text-transform:uppercase;color:${INK_MUTED};font-weight:600;border-bottom:2px solid ${brand.accentColor};display:inline-block;padding-bottom:4px;">Executive Summary</div>`;
  const reportingPeriod = `<div style="${FONT} font-size:12px;color:${INK_MUTED};">Reporting Period: ${formatReportPeriod(digest.weekOf)}</div>`;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding-left:${SUMMARY_BLOCK_INDENT}px;">${heading}</td></tr>
      <tr><td><div style="margin-top:14px;">${renderKpiRow(digest, currency)}</div></td></tr>
      <tr><td height="${SUMMARY_BLOCK_SPACER}" style="height:${SUMMARY_BLOCK_SPACER}px;line-height:${SUMMARY_BLOCK_SPACER}px;font-size:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>
      <tr><td style="padding-left:${SUMMARY_BLOCK_INDENT}px;">${reportingPeriod}</td></tr>
      <tr><td style="padding-left:${SUMMARY_BLOCK_INDENT}px;">${renderNarrative(digest)}</td></tr>
    </table>`;
}

export function renderDigestHtml(digest: RankedDigest, currency: string, timezone: string, brand: BrandConfig): string {
  const sections = digest.hasFlags
    ? `${renderSection("I", "High Risk — Immediate Attention Required", "HIGH", digest.high, currency)}${renderSection("II", "Medium Risk — Monitor Closely", "MEDIUM", digest.medium, currency)}`
    : renderHealthyCard(digest);

  const body = `
    <div style="${FONT} background:${PAGE};padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:0 auto;background:${SURFACE};border:1px solid ${BORDER};">
        ${renderMasthead(brand)}
        <tr><td style="padding:28px 32px;">
          ${renderSummaryBlock(digest, currency, brand)}
          ${sections}
          ${renderFooter(digest, timezone)}
        </td></tr>
      </table>
    </div>`;

  return wrapDocument(body, brand);
}

export function renderDigestSubject(digest: RankedDigest): string {
  const flaggedCount = digest.high.length + digest.medium.length;
  return digest.hasFlags
    ? `RevOps Weekly Digest — ${flaggedCount} deal${flaggedCount === 1 ? "" : "s"} flagged (${formatReportPeriod(digest.weekOf)})`
    : `RevOps Weekly Digest — All clear (${formatReportPeriod(digest.weekOf)})`;
}
