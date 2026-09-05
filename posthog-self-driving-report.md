# PostHog Self-driving setup report

## Summary

PostHog Self-driving is configured for this web application. Session Replay and Error Tracking were already enabled, Support was enabled, native health/error/support responders were enabled, and GitHub Issues now syncs into the data warehouse and inbox.

Five built-in scouts and two Replay Vision monitors are active. Findings should begin appearing in the [Self-driving inbox](https://us.posthog.com/project/594678/inbox) within about 30 minutes.

## AI data processing

Approved by the organization-level setup gate.

## GitHub

GitHub Issues was **connected by this setup** for `Daelars/foleyard` using the existing GitHub App integration.

- Warehouse source: `01a06f88-ace6-0000-b872-257ce9ed69ca`
- Synced table: `issues` only; the first sync has started.
- The GitHub Issues responder is enabled and currently running.
- Additional GitHub tables can be enabled later in PostHog’s data-source settings if needed.

## Products enabled

| Product | Result | Notes |
| --- | --- | --- |
| Session Replay | Already enabled | Browser `posthog.init` has no setting that disables recording. Recent web recordings exist. |
| Error Tracking | Already enabled | Browser `posthog.init` has no setting that disables exception capture. |
| Support (Conversations) | Enabled | An inbound email, inbox, or Slack channel must be connected before support tickets arrive. |

## Signal sources

| Signal source | Action |
| --- | --- |
| `signals_scout` / `cross_source_issue` | Already enabled by PostHog’s default scout gate; no opt-out row was created. |
| `health_checks` / `health_issue` | Enabled. |
| `error_tracking` / `issue_created` | Enabled. |
| `error_tracking` / `issue_reopened` | Enabled. |
| `error_tracking` / `issue_spiking` | Enabled. |
| `conversations` / `ticket` | Enabled; remains idle until an inbound Support channel is connected. |
| `github` / `issue` | Enabled; GitHub source is syncing. |
| Session replay source row | Deliberately skipped: Replay Vision monitors provide its Self-driving route. |

## Connected tools

| Tool | Selection and connection state |
| --- | --- |
| GitHub Issues | Connected by this setup (warehouse source `01a06f88-ace6-0000-b872-257ce9ed69ca`; first sync started). |
| Linear, Jira, Sentry, Zendesk, and other tools | Not used; they were not selected. |

## Scout troop

**Enabled (5)**

| Scout | Why it is active |
| --- | --- |
| `signals-scout-general` | Cross-product patterns and surfaces without a specialist owner. |
| `signals-scout-product-analytics` | Product-flow conversion and engagement regressions. |
| `signals-scout-web-analytics` | Traffic, attribution, landing-page health, and 404 patterns. |
| `signals-scout-health-checks` | Actionable PostHog setup-health issues. |
| `signals-scout-data-warehouse` | The GitHub warehouse import’s failures, staleness, and volume cliffs. |

**Disabled (22)**

| Scout | Reason |
| --- | --- |
| `signals-scout-ai-observability` | No confirmed AI-observability telemetry. |
| `signals-scout-anomaly-detection` | No established saved-insight watchlist; the focused web and product scouts cover the current needs. |
| `signals-scout-apm` | No confirmed distributed-tracing surface. |
| `signals-scout-conversations` | Support has no connected inbound channel yet. |
| `signals-scout-csp-violations` | No CSP violation reporting found. |
| `signals-scout-customer-analytics` | No confirmed account/group analytics surface. |
| `signals-scout-data-pipelines` | No confirmed CDP or export pipeline. |
| `signals-scout-error-tracking` | Covered by the native Error Tracking sources. |
| `signals-scout-experiments` | No active experiment evidence. |
| `signals-scout-feature-flags` | No active feature-flag usage found in the app. |
| `signals-scout-inbox-validation` | Fresh setup; there are no resolved Self-driving reports to validate yet. |
| `signals-scout-insight-alerts` | No configured insight-alert surface was confirmed. |
| `signals-scout-logs` | No confirmed logs ingestion. |
| `signals-scout-mcp-tool-calls` | No confirmed MCP telemetry use. |
| `signals-scout-observability-gaps` | Kept selective at launch; enable when event coverage expands. |
| `signals-scout-replay-vision` | Kept off: the new Replay Vision monitors own replay findings directly. |
| `signals-scout-revenue-analytics` | No payment or revenue data found. |
| `signals-scout-session-replay` | Covered by the Replay Vision monitors. |
| `signals-scout-skills-store` | No project-specific skills-store hygiene need identified. |
| `signals-scout-surveys` | Surveys are not enabled and none exist. |
| `signals-scout-tasks` | No confirmed PostHog Tasks workload. |
| `signals-scout-web-vitals` | No confirmed web-vitals monitoring surface. |

The verified early-access budget is **100 runs/day**, with **0 used** and **100 remaining** at setup time. The project banner states: “Scouts are in early access. Each project gets up to 100 scout runs a day. Contact team-self-driving@posthog.com if you need more.”

## Custom scouts

No custom scouts were created. Two candidates were proposed and declined:

- Waitlist confirmation delivery: a liveness check for sustained gaps between successful waitlist joins and confirmation emails.
- Download email delivery: a liveness check for sustained gaps between download-link requests and email delivery.

These were the strongest product-specific candidates because the application’s waitlist and download flows trigger asynchronous email fulfillment in `components/waitlist-form.tsx`, `convex/waitlist.ts`, `convex/downloadSignup.ts`, `convex/waitlistEmail.ts`, and `convex/downloadEmail.ts`. Generic product analytics owns broad flow regressions but does not specifically discriminate “promise made, fulfillment missing.”

If a custom scout is enabled in the future and proves noisy, set its config’s `emit` value to `false` in PostHog to run it in dry-run mode.

## Replay Vision scanners

A scanner is an LLM that watches individual session recordings on a schedule and pushes clear defects to the inbox. These are the only objects created in this setup that consume Replay Vision quota. Each finding carries half weight, so independent corroboration is needed before it is promoted into a report.

| Monitor | Status | Scope | Sampling | Estimate |
| --- | --- | --- | --- | --- |
| Foleyard landing flow breakage | Created | Recordings whose current URL contains `/`, covering the landing completion flow where visitors join the waitlist or request a download link. | 50% | 15 observations/month; 75 credits/month (5 credits/observation). |
| Foleyard landing flow frustration | Created | Recordings containing `$rageclick`, with no URL filter. | 100% | 0 observations/month at the current observed volume; 0 credits/month. |

The organization has 2,500 Replay Vision credits remaining in the current period and is not exhausted. The breakage estimate is a small fraction of the available budget. Recent recordings exist, so the monitors are armed immediately.

## Files modified or created

- Created `posthog-self-driving-report.md`.
- No application source files were modified.

## Follow-ups

- [ ] Connect an inbound Support channel (email, inbox, or Slack) in PostHog so the enabled Support responder can receive tickets.
- [ ] Reauthorize the PostHog MCP connection with `property_definition:read` if event-schema verification is needed for future custom scouts. The current connection did not have that scope.
- [ ] Consider enabling the custom waitlist-confirmation or download-email-delivery scout later if asynchronous email fulfillment becomes business-critical.

## What happens next

The scout coordinator should pick up the new configurations within about 30 minutes. Scout runs consume the shared daily budget, findings cluster into reports in the [Self-driving inbox](https://us.posthog.com/project/594678/inbox), and immediately actionable reports can begin coding tasks.
