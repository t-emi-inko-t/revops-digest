/** Max deals listed individually per risk tier across every delivery channel. Without this,
 * a portal that flags thousands of deals in one run produces: an email HTML body large enough
 * to get rejected outright by the sending provider (hit in production — a 2,089-deal run built
 * a 3.4MB email that Resend/SES failed with no bounce reason), a Slack message that exceeds
 * Block Kit's ~3,000-character text limit per block, or (in ClickUp advanced mode) thousands of
 * sequential task-creation API calls that would blow past Trigger.dev's task duration limit.
 * Deals are already ranked by dollar exposure descending, so truncating to the top N surfaces
 * exactly the deals that matter most; the remainder is summarized instead of dropped silently. */
export const MAX_DEALS_LISTED_PER_TIER = 25;
