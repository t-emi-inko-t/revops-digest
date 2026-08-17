/** Max deals listed individually per risk tier across every delivery channel. Without this,
 * a portal that flags thousands of deals in one run produces: an email HTML body large enough
 * to get rejected outright by the sending provider (hit in production — a 2,089-deal run built
 * a 3.4MB email that Resend/SES failed with no bounce reason), a Slack message that exceeds
 * Block Kit's ~3,000-character text limit per block, or (in ClickUp advanced mode) thousands of
 * sequential task-creation API calls that would blow past Trigger.dev's task duration limit.
 * Deals are already ranked by dollar exposure descending, so truncating to the top N surfaces
 * exactly the deals that matter most; the remainder is summarized instead of dropped silently. */
export const MAX_DEALS_LISTED_PER_TIER = 25;

/** Max age (hours) of a RankedDigest.generatedAt that deliverDigest will actually send. Hit in
 * production — an Aug-7-computed digest was replayed/re-triggered on Aug 15 and delivered with
 * every days-since-activity figure and the footer timestamp silently anchored to Aug 7, quietly
 * understating every deal's real risk age by over a week. deliverDigest trusts its entire payload
 * (it does no date computation of its own), so a Trigger.dev dashboard "Replay" of an old run, or
 * any manual re-trigger reusing a stale payload, sails through with no warning otherwise. 48h is
 * generous for legitimate retries/delays around the weekly cron while still catching a
 * multi-day-stale replay. */
export const MAX_DIGEST_AGE_HOURS = 48;
