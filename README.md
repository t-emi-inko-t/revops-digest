# RevOps Weekly Health Digest

Scans a client's HubSpot CRM every Monday morning and flags at-risk deals — stale (no recent
activity) and overdue (close date passed while still open) — so account owners see exposure
before it turns into churn. Config-driven so the same code runs for every client; only env vars
change between deployments.

## Architecture

Two Trigger.dev tasks, connected by `triggerAndWait`:

1. **`fetch-and-score-hubspot-data`** — runs every Monday 8am (timezone configurable). Pulls
   recent deals from HubSpot, normalizes them, applies risk scoring, and ranks the flagged ones
   by dollar amount. On success, triggers task 2 with the ranked digest. On failure (HubSpot auth
   error, API error), it logs clearly, retries per Trigger.dev's default policy, and **never**
   calls task 2 — a partial or empty scan is never delivered.
2. **`deliver-digest`** — takes the ranked digest and sends it via whichever channel
   `DELIVERY_METHOD` selects (email, Slack, or ClickUp). Scoring/normalization logic never
   touches delivery logic, so adding a fourth channel is a small, isolated addition.

Pure logic (HubSpot normalization, scoring, ranking, currency formatting) lives in `src/lib/` and
has no Trigger.dev or network dependency — it's what makes scoring testable against fixture data
without a live HubSpot token. See `src/lib/revops-digest/scoring/score-deals.ts` for the full
scoring rules and a documented v1 limitation (stage-backward-movement detection).

## Prerequisites

- Node.js 20+
- A [Trigger.dev](https://trigger.dev) account and project
- A HubSpot account with a Private App token (or a Sales Hub with API access)
- Credentials for whichever delivery channel you're using: a [Resend](https://resend.com) API
  key + verified sender (email), a Slack Incoming Webhook URL (Slack), or a ClickUp Personal API
  Token + target List ID (ClickUp)

## Local Setup

```bash
npm install
cp .env.example .env
# fill in .env with real values — see the table below
```

Also set `project` in `trigger.config.ts` to your Trigger.dev project ref (Dashboard -> Project
Settings -> starts with `proj_`).

## Running Locally (Dev Mode)

```bash
npx trigger.dev@latest dev
```

This starts the Trigger.dev dev server and registers all tasks. From another terminal (or via
Claude Code's Trigger.dev MCP tools if you have them connected), you can fire test runs:

```bash
npx trigger.dev@latest deploy --dry-run   # sanity-check the build without deploying
```

Or trigger a task directly via the Trigger.dev dashboard's "Test" tab once `dev` is running.

### Validating scoring logic without a HubSpot token

Trigger `debug-score-fixture` with a payload like:

```json
{ "fixture": "deals-mixed-batch.json" }
```

It runs the fixture through the real normalize -> score -> rank pipeline and returns the
`RankedDigest` — inspect the run output to confirm deals land in the expected tier. Fixtures live
in `src/lib/revops-digest/hubspot/fixtures/` and cover: high-risk (inactive), high-risk (overdue),
medium-risk (inactive), healthy (including a stale *closed* deal, to prove closed deals are never
flagged), and a mixed batch for testing cross-deal ranking.

> Fixture dates are fixed timestamps set at build time. If you're testing this long after the
> project was built, the "healthy / recent activity" fixture may have aged into MEDIUM/HIGH —
> regenerate its `hs_lastmodifieddate` to a recent timestamp if so. This is a debug-only concern;
> production scoring always uses live data and today's date.

`debug-score-fixture` is dev tooling, not part of the production flow — safe to delete once
you've validated scoring and have a real HubSpot token.

### Previewing the email report without sending anything

Trigger `debug-render-email-html` with the same kind of payload:

```json
{ "fixture": "deals-mixed-batch.json" }
```

It runs a fixture through the real pipeline, renders it with the actual email template (brand
config, KPI tiles, tables — everything), and writes the result to `tmp/preview-digest.html` in
the project root. Open that file directly in a browser to review the report design — no Resend
API call, no email quota consumed, no inbox involved. Useful for iterating on the template itself,
or for confirming a layout/color change before spending a real send on it.

`debug-render-email-html` is also dev tooling, not part of the production flow — safe to delete
once the report design is finalized. `tmp/` is gitignored.

## Environment Variables

| Var | Required | Default | Notes |
|---|---|---|---|
| `HUBSPOT_ACCESS_TOKEN` | Yes | — | Private App token. Never log or hardcode. |
| `CLOSED_STAGE_IDS` | Yes | — | Comma-separated closed stage IDs, e.g. `closedwon,closedlost`. Portal-specific — see onboarding checklist below. |
| `HUBSPOT_PIPELINE_ID` | No | all pipelines | Restrict the scan to one pipeline. |
| `HUBSPOT_ACTIVITY_LOOKBACK_DAYS` | No | `30` | How far back to fetch deals from. |
| `RISK_HIGH_INACTIVITY_DAYS` | No | `14` | Inactivity threshold for HIGH risk. |
| `RISK_MEDIUM_INACTIVITY_DAYS` | No | `7` | Inactivity threshold for MEDIUM risk. |
| `DIGEST_TIMEZONE` | No | `America/Sao_Paulo` | IANA timezone for the Monday 8am cron. |
| `DIGEST_CURRENCY` | No | `USD` | Drives locale-native currency formatting (`USD`, `BRL`, `CAD`, `EUR`, `GBP` supported out of the box — add more in `src/lib/revops-digest/format/currency.ts`). |
| `BRAND_COMPANY_NAME`, `BRAND_REPORT_TITLE`, `BRAND_LOGO_URL`, `BRAND_PRIMARY_COLOR`, `BRAND_ON_PRIMARY_COLOR`, `BRAND_ACCENT_COLOR` | No | see `.env.example` | Per-client visual identity for the email digest — masthead color, logo, company name. Does not affect risk-tier colors (those are fixed severity indicators, not brand elements). Only used by the email channel today. |
| `DELIVERY_METHOD` | Yes | — | `email`, `slack`, or `clickup`. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `DIGEST_RECIPIENT_EMAIL` | If `email` | — | Resend send credentials. |
| `SLACK_WEBHOOK_URL` | If `slack` | — | Incoming Webhook URL. |
| `CLICKUP_API_TOKEN`, `CLICKUP_LIST_ID`, `CLICKUP_MODE` | If `clickup` | — | `CLICKUP_MODE` is `simple` or `advanced`. |

Full descriptions are in `.env.example`.

## Adding Env Vars to the Trigger.dev Dashboard

Local `.env` is only for `npx trigger.dev dev`. Production and staging read from the dashboard —
**this is the #1 cause of production failures**, so don't skip it:

1. Go to `cloud.trigger.dev` -> your project -> **Environment Variables**.
2. Add every var from the table above.
3. Switch environment (top of the page) and repeat for both **Staging** and **Production** — the
   values can differ per environment (e.g. a test Resend key in staging).

## Testing Each Delivery Method Independently

Set `DELIVERY_METHOD` to the channel you're testing, fill in that channel's credentials, run
`npx trigger.dev@latest dev`, then trigger `deliver-digest` directly with a hand-built
`RankedDigest` payload (you can reuse `debug-score-fixture`'s output, or build one by hand):

```json
{
  "generatedAt": "2026-08-05T00:00:00.000Z",
  "weekOf": "2026-08-03",
  "high": [],
  "medium": [],
  "totalDealsScanned": 12,
  "hasFlags": false
}
```

- **Email**: confirm the run succeeds, then check the inbox at `DIGEST_RECIPIENT_EMAIL` for the
  HTML digest (or the "no risks flagged" one-liner if `hasFlags: false`).
- **Slack**: confirm a message posts to the target channel, rendered as sections per risk tier
  via Block Kit, not a wall of text.
- **ClickUp**: confirm task(s) appear in `CLICKUP_LIST_ID` — one summary task in `simple` mode
  (or in `advanced` mode on a zero-flags week), one task per flagged deal in `advanced` mode with
  priority Urgent (HIGH) / Normal (MEDIUM) and a due date 3 days out.

To test the full chain (`fetch-and-score-hubspot-data` -> `deliver-digest`) you need a real
`HUBSPOT_ACCESS_TOKEN`. Trigger `fetch-and-score-hubspot-data` and inspect both the parent run and
the linked `deliver-digest` child run in the dashboard.

## Onboarding a New Client

Each client gets its own Trigger.dev project (or at minimum its own isolated set of env vars) so
credentials never cross between clients:

1. **HubSpot token**: create a Private App in the client's HubSpot portal (Settings ->
   Integrations -> Private Apps) with scopes `crm.objects.deals.read`,
   `crm.objects.companies.read`, `crm.objects.contacts.read`, `crm.objects.owners.read`. Set
   `HUBSPOT_ACCESS_TOKEN`.
2. **Closed stage IDs**: in the client's HubSpot, go to Settings -> Deals -> Pipelines, open their
   pipeline, and note the internal IDs of every "closed" stage (usually `closedwon`/`closedlost`,
   but custom pipelines can differ). Set `CLOSED_STAGE_IDS`.
3. **Risk thresholds**: ask the client what "stale" means for their sales cycle — default 14/7
   days is a starting point, not a universal truth. Adjust `RISK_HIGH_INACTIVITY_DAYS` /
   `RISK_MEDIUM_INACTIVITY_DAYS` if needed.
4. **Delivery method**: pick one of `email` / `slack` / `clickup`, set `DELIVERY_METHOD`, and
   gather that channel's credentials (Resend key + recipient, Slack webhook, or ClickUp token +
   list ID + mode).
5. **Timezone + currency**: set `DIGEST_TIMEZONE` and `DIGEST_CURRENCY` if the client isn't
   `America/Sao_Paulo` / `USD`.
6. **Brand kit** (email only): if the client has brand guidelines, set `BRAND_COMPANY_NAME`,
   `BRAND_PRIMARY_COLOR` (masthead background), `BRAND_ON_PRIMARY_COLOR` (masthead text — keep
   this high-contrast against `BRAND_PRIMARY_COLOR`, since a bad pairing here is exactly what
   causes invisible header text), `BRAND_ACCENT_COLOR`, and optionally `BRAND_LOGO_URL`. Leave
   unset for the default neutral look. This does not touch risk-tier colors (red/amber), which
   stay fixed across every client since they carry severity meaning, not brand identity.
6. Test locally (see above sections), add every var to the Trigger.dev dashboard for both
   environments, get explicit sign-off that the digest looks right, then deploy.

## Known Limitations (v1)

- **Stage-backward-movement rule is not implemented.** HubSpot's standard Deals API only returns
  a deal's current stage, not its history — detecting "moved backward a stage" needs one extra,
  non-batchable API call per deal (Property History API). Skipped for v1 to keep API usage
  bounded; see the comment above `scoreDeal()` in `score-deals.ts` for exactly how to add it.
- **`CLOSED_STAGE_IDS` is a single global list per deployment**, not scoped per pipeline. Fine for
  the common case of one deployment per client with one primary pipeline; a client running
  multiple pipelines with different closed-stage IDs would need this extended to a per-pipeline
  map.
- **"Last activity" uses `hs_lastmodifieddate`** (any field edit), not the more semantically
  accurate `hs_last_activity_date` (a Sales Hub Pro+ calculated engagement property), because the
  latter isn't available on every subscription tier. If the client's portal has it, swap the
  constant in `src/lib/revops-digest/hubspot/fetch-deals.ts`.

## Deploying

Push to `master` — GitHub Actions auto-deploys via `.github/workflows/deploy.yml`. Before you do:

- [ ] Repo pushed to GitHub, with a `TRIGGER_ACCESS_TOKEN` secret set (repo Settings -> Secrets
      and variables -> Actions -> New repository secret). Get the token value from
      [cloud.trigger.dev/account/tokens](https://cloud.trigger.dev/account/tokens) (Personal
      Access Tokens tab) — this is what lets the GitHub Actions runner deploy on your behalf.
- [ ] Every env var added to the Trigger.dev dashboard for both Staging and Production
- [ ] Tested locally, at least one successful run per task
- [ ] **You've explicitly confirmed** the digest looks correct and approved the deploy
- [ ] `.env` is gitignored (it is, by default — see `.gitignore`)

After deploying, confirm the first run succeeds (dashboard run list) and that the schedule shows
up under the Schedules tab with the right cron + timezone.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Task fails immediately with "X is not set" | Env var missing from the Trigger.dev dashboard for that environment |
| HubSpot 401/403 | Token expired, revoked, or missing a required scope |
| No deals ever flagged | `CLOSED_STAGE_IDS` wrong for this portal — everything is being treated as closed |
| Slack message never arrives | Webhook URL revoked or channel archived — check for a 404 in the run logs |
| ClickUp task creation fails | `CLICKUP_LIST_ID` wrong, or token lacks access to that List |
