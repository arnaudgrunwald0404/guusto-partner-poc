# R&R Tracking Plan

**Owner:** Product Analytics, ClearCompany
**Status:** v1 — instrumentation-ready
**Scope:** Recognition (social) + Rewards (monetary, Guusto-backed) module across CC web, server APIs, and the Guusto poller.

---

## Constraints from API reality

Three constraints from the Guusto API audit (`guusto-docs-report.md`) shape this plan and are non-negotiable for the engineer instrumenting it:

1. **No webhooks from Guusto.** The docs explicitly omit any async/push notification surface. Order-state events (`COMPLETED`, `FAILED`) are derived from CC's polling worker hitting `GET /api/v1/orders/status/{requestId}` on a cadence (target: 2 min for first hour, exponential backoff to 30 min). Every "redemption / order-state" event in this plan is therefore *poller-derived*, idempotent on `(requestId, terminal_state)`, and carries a `polling_lag_seconds` property so funnel analysis can correct for observation lag.
2. **No catalog API.** The Guusto Rewards Catalog is exposed only via iFrame in Phase 1. CC has no visibility into in-catalog browse, filter, or product-detail interactions. We do **not** instrument synthetic catalog events; merchant choice is observed only after redemption appears in `GET /api/v1/reports/teams/activity` or last-recognized reports.
3. **Locale and currency are constrained.** Only `CAD`/`USD` and `EN_CA`/`FR_CA`/`ES_MX` are supported. `EN_US` is silently absent. Channel/locale properties on delivery and redemption events must be enums against the documented set so we can surface "unsupported locale" failures explicitly rather than as silent drops.

Additional environmental constraint: **frontline workers never log into ClearCompany.** Any tracking that depends on the browser SDK loading (page views, clicks) is invisible for them. Notification opens, link clicks, and redemption start must be captured **server-side** via a signed-token endpoint that CC owns and that redirects to the Guusto iFrame.

---

## Goals → Metrics → Events map

| PRD Goal | PRD §9 Metric | Primary events that move it |
|---|---|---|
| Goal 1 — Churn reduction | M6 Coverage Rate, M9 DAU Lift, M10 Churn Differential, M11 Recipient Sat | `recognition_received`, `recognition_reacted`, `gift_redeemed`, `post_recognition_survey_submitted` |
| Goal 2 — Recognition as data layer | M4 Send Rate, M7 Profile-View Rate | `recognition_sent`, `profile_recognition_tab_viewed` |
| Goal 3 — Consistent coverage | M1 Manager Activation, M2 Notification-to-Action, M3 Time-to-First, M4 Send Rate, M6 Coverage, M8 Budget Util | `recognition_composed`, `recognition_sent`, `gift_link_delivered`, `gift_link_opened`, `gift_redeemed` |
| Goal 4 — HR visibility | M5 Admin Dashboard Engagement, M6 Coverage, M8 Budget Util | `manager_insight_viewed`, `budget_allocated`, `budget_committed` |
| Goal 5 — Partnership validation | M1, M2, M4, M5, M8, M9, M11 | `gift_order_submitted`, `gift_order_status_observed`, `guusto_order_failed`, `guusto_api_call` |

---

## Event taxonomy (21 events — resist bloat)

### Recognition lifecycle (CC-native, client + server)
- `recognition_composed` — compose surface opened with intent (recipient + draft text). Drives M3.
- `recognition_sent` — server-side commit. The single event behind M4 send rate.
- `recognition_received` — server-derived per-recipient fan-out. Drives M6, M10, M11.
- `recognition_reacted` — peer reaction (emoji/comment). Engagement-loop signal.
- `recognition_approval_requested` — fires only when program has approval policy on (OQ-9). Drives funnel diagnostics, not a top-line metric.
- `recognition_approval_decided` — approve/decline outcome. Surfaces approval bottleneck failure signals.

### Monetary lifecycle (CC + polled state from Guusto)
- `budget_reserved` — CC ledger hold at compose time.
- `budget_committed` — CC ledger debit on order success (terminal `COMPLETED`).
- `budget_released` — CC ledger return on `FAILED` or expired-reserve. Surfaces M8 leakage.
- `gift_order_submitted` — CC `POST /api/v1/orders` returned 2xx with `requestId`.
- `gift_order_status_observed` — poller observed a **terminal** transition (`COMPLETED` or `FAILED`). Non-terminal polls are *not* product events; they go to `guusto_poll_attempt` only.
- `gift_link_delivered` — CC's outbound notifier confirmed handoff to email/SMS provider for a signed-token URL.
- `gift_link_opened` — server-side; signed-token endpoint hit. The frontline-safe equivalent of a click event.
- `gift_redeemed` — derived: poller observed an updated `lastRecognizedDate`/redemption record in `GET /api/v1/reports/teams/activity` for that `requestId`.

### Admin / Manager
- `budget_allocated` — HR admin set or changed a manager/program budget.
- `approval_policy_updated` — program approval setting toggled (OQ-9 instrumentation).
- `manager_insight_viewed` — Manager Insights / Last-Recognized report consumed.
- `dashboard_viewed` — HR admin loaded the analytics dashboard. Direct M5 driver.
- `profile_recognition_tab_viewed` — recipient opened their recognition history. Direct M7 driver.
- `post_recognition_survey_submitted` — 48-hr micro-survey response. Direct M11 driver.

### System / reliability
- `guusto_api_call` — rolled-up wrapper event. One row per outbound call (endpoint, status, latency, 429 flag). Sampling at 100% is fine — call volume is bounded by order volume.
- `guusto_poll_attempt` — every poll tick (terminal or not), keyed by `(requestId, attempt#)`. Lets us measure polling lag distributions.
- `guusto_order_failed` — terminal `FAILED` with error code. Carved out from `gift_order_status_observed` so reliability dashboards alert on this name without consumers needing to filter.

**Total: 21 events.**

**Explicitly NOT tracked** (and why): catalog browse / product view (no API surface, iFrame blocks instrumentation); merchant selection (same); GIF picker interactions (cosmetic, won't change a roadmap call); every keystroke in compose (`recognition_composed` at intent + `recognition_sent` at commit is enough); every non-terminal poll as a product event (it's reliability noise, lives in `guusto_poll_attempt`).

---

## Per-event spec — top 15 highest-leverage events

### Event: `recognition_composed`
**Trigger:** Compose drawer/page opened AND a recipient has been selected (we don't fire on empty-state opens — too noisy).
**Source:** client.
**Drives metrics:** M3 Time-to-First (start of the timer that ends at `recognition_sent`).
**Properties:**
| Name | Type | Required | Notes / PII |
|---|---|---|---|
| `sender_employee_id` | string (CC ID) | yes | internal ID, not email |
| `sender_role` | enum: ic\|manager\|hr_admin\|exec | yes | from CC role table |
| `recipient_count` | int | yes | 1 for individual, >1 for group |
| `program_id` | string | yes | which R&R program (P0-10) |
| `monetary_intent` | bool | yes | gift attached at compose time |
| `entry_surface` | enum: dashboard_cta\|profile\|directory\|nudge\|deep_link | yes | drives "where do recognitions originate" |
| `first_session_for_user` | bool | yes | needed to bound M3 to first sessions |
**Failure signals it surfaces:** drop-off between composed → sent (M3 failure: <30% first-session conversion).
**Sampling:** 100%.

### Event: `recognition_sent`
**Trigger:** Server-side commit of the recognition record. Fires once per send action regardless of recipient count.
**Source:** server.
**Drives metrics:** M1 Manager Activation, M3 Time-to-First, M4 Send Rate.
**Properties:**
| Name | Type | Required | Notes / PII |
|---|---|---|---|
| `recognition_id` | string | yes | CC primary key, joins all downstream events |
| `sender_employee_id` | string | yes | |
| `sender_role` | enum | yes | |
| `recipient_employee_ids` | string[] | yes | array; fan-out happens in `recognition_received` |
| `recipient_count` | int | yes | |
| `program_id` | string | yes | |
| `value_tag_ids` | string[] | optional | company values referenced |
| `has_message` | bool | yes | did sender include free-text |
| `has_media` | bool | yes | GIF/image attached |
| `monetary_attached` | bool | yes | true → expect `gift_order_submitted` to follow |
| `monetary_amount_cents` | int | conditional | required if `monetary_attached` |
| `monetary_currency` | enum: USD\|CAD | conditional | required if `monetary_attached` |
| `requires_approval` | bool | yes | true → expect `recognition_approval_requested` |
| `compose_to_send_ms` | int | yes | enables M3 without a derived-event join |
**Failure signals:** spike-and-decline pattern in M4 (week 5–8); manager-role activation <25% by day 30.
**Sampling:** 100%.

### Event: `recognition_received`
**Trigger:** Server-side fan-out — one event per recipient per `recognition_id`. Fires after any approval gate clears (or immediately if no approval).
**Source:** server.
**Drives metrics:** M6 Coverage, M10 Churn Differential, M11 Sat survey trigger.
**Properties:**
| Name | Type | Required | Notes / PII |
|---|---|---|---|
| `recognition_id` | string | yes | |
| `recipient_employee_id` | string | yes | |
| `recipient_segment` | enum: frontline\|desk | yes | required for the frontline/desk gap failure signal in M6 |
| `sender_employee_id` | string | yes | |
| `sender_relationship` | enum: peer\|manager\|skip_level\|cross_functional | yes | |
| `delivery_channels` | enum[]: in_app\|email\|sms | yes | what we attempted; doesn't imply success |
| `monetary_attached` | bool | yes | |
| `value_tag_ids` | string[] | optional | |
**Failure signals:** M6 <30%, or >20pp gap between frontline and desk coverage.
**Sampling:** 100%.

### Event: `recognition_approval_decided`
**Trigger:** Approver clicks Approve or Decline on a pending recognition.
**Source:** server.
**Drives metrics:** OQ-9 instrumentation; surfaces approval as a recognition-funnel choke point.
**Properties:**
| Name | Type | Required | Notes / PII |
|---|---|---|---|
| `recognition_id` | string | yes | |
| `approver_employee_id` | string | yes | |
| `decision` | enum: approved\|declined | yes | |
| `decline_reason_code` | enum | conditional | required if declined |
| `time_in_queue_ms` | int | yes | drives "approval bottleneck" alerts |
**Failure signals:** median `time_in_queue_ms` > 24h → approval policy is killing momentum.
**Sampling:** 100%.

### Event: `gift_order_submitted`
**Trigger:** CC's gift orchestrator received a 2xx from Guusto `POST /api/v1/orders` with a `requestId`. Fires before any polling has happened.
**Source:** server.
**Drives metrics:** M8 Budget Utilization (numerator), M2 (start of frontline funnel), partnership reliability.
**Properties:**
| Name | Type | Required | Notes / PII |
|---|---|---|---|
| `recognition_id` | string | yes | |
| `request_id` | string | yes | Guusto `requestId`, the join key for all polled events |
| `workspace_id` | string | yes | `X-Workspace-id` header value |
| `amount_cents` | int | yes | sum of all line items |
| `currency` | enum: USD\|CAD | yes | |
| `recipient_count` | int | yes | 1–20 per Guusto limit |
| `delivery_method` | enum: email\|sms\|print\|qr | yes | |
| `recipient_locale` | enum: EN_CA\|FR_CA\|ES_MX\|fallback | yes | `fallback` when sender requested EN_US |
| `locale_fallback_applied` | bool | yes | true → EN_US silently downgraded; alert signal |
| `api_latency_ms` | int | yes | |
**Failure signals:** `locale_fallback_applied=true` rate >5%; submission failure rate >2% triggers reliability review.
**Sampling:** 100%.

### Event: `gift_order_status_observed`
**Trigger:** Polling worker observes a **terminal** Guusto status (`COMPLETED` or `FAILED`) on `GET /api/v1/orders/status/{requestId}`. **Idempotent** on `(request_id, terminal_status)` — we deduplicate at write time so retries don't double-count.
**Source:** poller.
**Drives metrics:** M8 Budget Utilization (commit/release decision), partnership reliability.
**Properties:**
| Name | Type | Required | Notes / PII |
|---|---|---|---|
| `request_id` | string | yes | |
| `recognition_id` | string | yes | |
| `terminal_status` | enum: COMPLETED\|FAILED | yes | |
| `polling_lag_seconds` | int | yes | (now - `gift_order_submitted.timestamp`); critical for funnel analysis |
| `poll_attempts` | int | yes | how many polls before terminal |
| `error_code` | string | conditional | required if FAILED; from Guusto error taxonomy |
| `order_step` | string | optional | Guusto `orderStep` if present |
**Failure signals:** median `polling_lag_seconds` > 300; `FAILED` rate > 1%.
**Sampling:** 100%.
**Lag note:** funnels using this event must visualize on a delay of at least the 95th-percentile `polling_lag_seconds` to avoid undercounting recent orders.

### Event: `gift_link_delivered`
**Trigger:** CC's outbound notifier received a 2xx from the email/SMS provider for the signed-token URL. **Not** a "recipient saw it" event.
**Source:** server.
**Drives metrics:** M2 Notification-to-Action denominator.
**Properties:**
| Name | Type | Required | Notes / PII |
|---|---|---|---|
| `recognition_id` | string | yes | |
| `request_id` | string | yes | |
| `recipient_employee_id` | string | yes | |
| `channel` | enum: email\|sms | yes | tracked separately per PRD M2 |
| `provider_message_id` | string | yes | for support escalation, not analysis |
| `recipient_segment` | enum: frontline\|desk | yes | |
**PII guardrail:** do NOT include the recipient's email or phone number on this event. Use `recipient_employee_id`.
**Sampling:** 100%.

### Event: `gift_link_opened`
**Trigger:** Server-side handler at the signed-token redirect endpoint. Fires on first hit per token; subsequent hits within 24h are deduplicated.
**Source:** server.
**Drives metrics:** M2 Notification-to-Action numerator (the "viewed" half).
**Properties:**
| Name | Type | Required | Notes / PII |
|---|---|---|---|
| `recognition_id` | string | yes | resolved from token |
| `request_id` | string | yes | |
| `recipient_employee_id` | string | yes | |
| `channel` | enum: email\|sms | yes | from the token's channel binding |
| `delivered_to_opened_seconds` | int | yes | |
| `user_agent_class` | enum: mobile_browser\|desktop_browser\|email_prefetch\|unknown | yes | suppress email_prefetch from action conversion |
**Failure signals:** M2 <35% (frontline notification breaking — spam, broken link, account-gated).
**Sampling:** 100%.
**Why server-side:** frontline recipients have no CC SDK in their browser. This is the only reliable open signal.

### Event: `gift_redeemed`
**Trigger:** Polling worker observes a redemption record (updated `lastRecognizedDate` or activity entry) attributable to this `request_id` from `GET /api/v1/reports/teams/activity` or `GET /api/v1/reports/members/last-recognized`. Idempotent on `(request_id, redemption_id)`.
**Source:** poller (derived).
**Drives metrics:** M2 Notification-to-Action numerator (the "redemption_started" half), M8 Budget Utilization confirmation.
**Properties:**
| Name | Type | Required | Notes / PII |
|---|---|---|---|
| `recognition_id` | string | yes | |
| `request_id` | string | yes | |
| `recipient_employee_id` | string | yes | |
| `amount_redeemed_cents` | int | yes | partial redemption supported |
| `currency` | enum: USD\|CAD | yes | |
| `is_partial` | bool | yes | |
| `polling_lag_seconds` | int | yes | observation delay; same caveat as `gift_order_status_observed` |
| `merchant_category` | string | optional | only if Phase-3 merchant-category access is negotiated; otherwise omit |
**Failure signals:** redemption rate <40% of `gift_link_opened` cohort within 14 days.
**Sampling:** 100%.
**Lag note:** Guusto activity reports update on their own cadence; expect lag of minutes to hours separate from poll cadence. Treat this as the most lag-affected event in the plan.

### Event: `guusto_order_failed`
**Trigger:** Same observation as `gift_order_status_observed` with `terminal_status=FAILED`. Emitted as a separate named event so reliability alerts can subscribe by name.
**Source:** poller.
**Drives metrics:** Partnership reliability dashboard; triggers `budget_released`.
**Properties:**
| Name | Type | Required | Notes / PII |
|---|---|---|---|
| `request_id` | string | yes | |
| `recognition_id` | string | yes | |
| `error_code` | enum: insufficient_balance\|settings_restriction\|invalid_account\|invalid_field\|invalid_format\|security_error\|unknown | yes | from Guusto error taxonomy |
| `error_message_redacted` | string | optional | scrub any token/account values before logging |
| `amount_cents` | int | yes | for budget release accounting |
| `currency` | enum | yes | |
**Failure signals:** any single `error_code` > 0.5% of orders → operational issue; `insufficient_balance` spike → workspace funding alert.
**Sampling:** 100%.

### Event: `budget_committed`
**Trigger:** CC ledger debit when a `gift_order_status_observed` with `COMPLETED` is processed. Idempotent.
**Source:** server.
**Drives metrics:** M8 Budget Utilization.
**Properties:**
| Name | Type | Required | Notes / PII |
|---|---|---|---|
| `recognition_id` | string | yes | |
| `request_id` | string | yes | |
| `manager_employee_id` | string | yes | the budget owner; the unit M8 measures over |
| `program_id` | string | yes | |
| `amount_cents` | int | yes | |
| `currency` | enum | yes | |
| `fiscal_period_id` | string | yes | for tax/compliance per-employee annual rollups |
**Failure signals:** M8 <25% overall, or >40% of managers at 0% utilization at 90 days.
**Sampling:** 100%.

### Event: `budget_allocated`
**Trigger:** HR admin saves a budget allocation change (create or modify) for a manager or program.
**Source:** server.
**Drives metrics:** Denominator for M1 (eligible managers) and M8 (allocated total).
**Properties:**
| Name | Type | Required | Notes / PII |
|---|---|---|---|
| `actor_employee_id` | string | yes | the HR admin |
| `target_type` | enum: manager\|program\|workspace | yes | |
| `target_id` | string | yes | |
| `previous_amount_cents` | int | yes | for delta analysis |
| `new_amount_cents` | int | yes | |
| `currency` | enum | yes | |
| `effective_period_id` | string | yes | |
**Sampling:** 100%.

### Event: `manager_insight_viewed`
**Trigger:** Manager loads the Manager Insights surface (any tab) AND the Last-Recognized data has rendered (we don't fire on skeleton loads).
**Source:** client.
**Drives metrics:** M5 Admin Dashboard Engagement (manager slice); informs whether the Last-Recognized report is consumed enough to justify the polling cost on `GET /api/v1/reports/members/last-recognized`.
**Properties:**
| Name | Type | Required | Notes / PII |
|---|---|---|---|
| `manager_employee_id` | string | yes | |
| `tab` | enum: your_activity\|direct_reports\|team_history\|delivery\|approvals | yes | |
| `direct_reports_in_view` | int | yes | scale signal |
| `pending_approvals_in_view` | int | yes | drives "approvals queue is the actual draw" hypothesis |
**Failure signals:** if no manager opens `direct_reports` more than once → the Last-Recognized integration isn't earning its API cost.
**Sampling:** 100%.

### Event: `dashboard_viewed`
**Trigger:** HR admin loads the R&R analytics dashboard AND first chart has rendered.
**Source:** client.
**Drives metrics:** M5 Admin Dashboard Engagement (the canonical event in the metric definition).
**Properties:**
| Name | Type | Required | Notes / PII |
|---|---|---|---|
| `actor_employee_id` | string | yes | |
| `user_role` | enum: hr_admin\|exec\|manager | yes | M5 filters on `hr_admin` |
| `view_id` | enum: overview\|coverage\|equity\|budget\|reliability | yes | |
| `time_range` | enum: 7d\|30d\|90d\|custom | yes | |
**Failure signals:** M5 <30% weekly admin engagement at day 60.
**Sampling:** 100%.

### Event: `post_recognition_survey_submitted`
**Trigger:** Recipient submits the 48-hour micro-survey (in-app or via SMS reply handler).
**Source:** server (SMS reply handler) or client (in-app).
**Drives metrics:** M11 Post-Recognition Satisfaction.
**Properties:**
| Name | Type | Required | Notes / PII |
|---|---|---|---|
| `recognition_id` | string | yes | |
| `recipient_employee_id` | string | yes | |
| `recipient_segment` | enum: frontline\|desk | yes | required to compute frontline-specific response rate |
| `score` | int 1–5 | yes | |
| `channel` | enum: in_app\|sms | yes | |
| `hours_since_received` | int | yes | sanity-bound responses to the 48h window |
**Failure signals:** net score <+20; response rate <10% from frontline SMS specifically.
**Sampling:** 100%.

---

## Remaining 6 events (one-line specs)

- **`recognition_reacted`** — `{recognition_id, reactor_employee_id, reaction_type: emoji|comment, sender_relationship_to_reactor}`. Engagement-loop signal feeding into M9 DAU lift attribution.
- **`recognition_approval_requested`** — `{recognition_id, approver_employee_id, monetary_attached, amount_cents?, currency?}`. Pairs with `recognition_approval_decided` for queue-time analysis.
- **`budget_reserved`** — `{recognition_id, manager_employee_id, program_id, amount_cents, currency}`. Surfaces compose-time leakage when reservations expire without a `gift_order_submitted`.
- **`budget_released`** — `{recognition_id, request_id?, manager_employee_id, program_id, amount_cents, currency, reason: order_failed|reserve_expired|cancelled}`. Tied to `guusto_order_failed`; needed for M8 accuracy.
- **`approval_policy_updated`** — `{program_id, actor_employee_id, previous_policy, new_policy}`. OQ-9 telemetry; rare event but high-leverage for cohort comparisons.
- **`profile_recognition_tab_viewed`** — `{viewer_employee_id, profile_employee_id, is_self_view, recognitions_in_view}`. Direct M7 driver.
- **`guusto_api_call`** — `{endpoint, http_status, latency_ms, was_429, request_id?, workspace_id}`. Reliability rollup; one per outbound call.
- **`guusto_poll_attempt`** — `{request_id, attempt_number, observed_status, latency_ms, was_429}`. All polls (terminal and non-terminal); used only for polling-cadence tuning, not product funnels.

---

## Frontline / server-side capture pattern

Frontline recipients receive an email or SMS containing a signed-token URL of the form:

```
https://rr.clearcompany.com/r/{signed_token}
```

The token is a JWT (or equivalent) signed by CC and carries: `recognition_id`, `request_id`, `recipient_employee_id`, `channel` (email|sms), `issued_at`, `expires_at`. The endpoint:

1. Verifies signature and expiry.
2. Emits `gift_link_opened` server-side **before** the redirect, with `user_agent_class` derived from the request's UA header (so we can suppress email-prefetch hits from M2's numerator).
3. Resolves the recipient's session (stub identity for frontline-only users) and redirects to the Guusto iFrame redemption surface.

This pattern is the **only** reliable way to attribute opens for users who never load the CC web app. It also gives us the join key (`recognition_id`) needed to walk back to send-side properties without ever sending the recipient's PII to the analytics pipeline.

**No JS dependency.** Do not attempt to instrument opens via tracking pixels in the email body — frontline mail clients block them inconsistently, and SMS has no equivalent. The signed-token redirect is load-bearing for M2.

---

## Polling-derived events note

CC's poller is the source of truth for three product events: `gift_order_status_observed`, `guusto_order_failed`, and `gift_redeemed`.

**Cadence (current plan):** every 2 minutes for the first hour after `gift_order_submitted`, exponential backoff to every 30 minutes through 24 hours, then hourly until 7 days. Backoff is mandatory because of (undocumented) Guusto rate limits — the `guusto_api_call.was_429` flag is our canary.

**Idempotency.** Events are written with a deterministic key:
- `gift_order_status_observed`: `hash(request_id, terminal_status)`
- `guusto_order_failed`: `hash(request_id, "FAILED")`
- `gift_redeemed`: `hash(request_id, redemption_id)` (with `redemption_id` derived from the activity report row)

A retried poll that observes the same terminal state must not produce a duplicate event.

**Funnel implication.** Any funnel involving `gift_order_submitted → gift_order_status_observed → gift_link_opened → gift_redeemed` must:
1. Carry `polling_lag_seconds` through to dashboards.
2. Use a "as of N minutes ago" data freshness watermark equal to the 95th percentile poll-to-terminal lag (target: ≤ 5 min for status, ≤ 30 min for redemption).
3. Never report on the trailing 30 minutes of data — undercounting will mislead.

---

## Compliance / PII guardrails

**Must never appear in event properties:**
- Gift card numbers, redemption codes, or merchant gift card serials.
- Full external-recipient email or phone (frontline workers' personal contact info). Use `recipient_employee_id` plus a one-way hash if any external attribution is genuinely needed.
- Guusto bearer tokens, `X-Workspace-id` values for production tenants in plaintext error logs (workspace_id is OK as an opaque identifier on events but must not appear in error_message strings).
- Free-text recognition message bodies. We track `has_message: bool` only. The recognition text lives in CC's primary store, not in analytics.

**Hashing rules.** If a frontline recipient identifier (email/phone) ever needs to leave the primary store for attribution, it must be HMAC-SHA256'd with a tenant-scoped salt rotated annually. Raw values are forbidden in the analytics pipeline.

**Tax / IRS rollup.** Per OQ-3, gift cards are taxable compensation. The schema must support per-employee annual rollups. This is why every monetary event carries `recipient_employee_id` (or `manager_employee_id` for committed-budget rollups), `amount_cents`, `currency`, and `fiscal_period_id`. Do not aggregate these at the event level — keep them granular so finance can roll up at any granularity required by the Legal memo.

---

## Dashboard sketch (day-1)

**Recognition funnel** — `recognition_composed → recognition_sent → recognition_received → recognition_reacted`. Filter by sender_role and recipient_segment. Drives M3, M4, M6.

**Monetary funnel** — `budget_reserved → gift_order_submitted → gift_order_status_observed (COMPLETED) → gift_link_opened → gift_redeemed`. Annotate each step's median lag. Drives M2, M8.

**Reliability** — p50/p95 polling lag, 429 rate by endpoint, FAILED order rate by `error_code`, `locale_fallback_applied` rate. The single dashboard that decides whether the partnership is operationally healthy enough to scale.

**Adoption** — WAU recognizers (distinct senders/week), % of managers with ≥1 send in trailing 30 days (M1), frontline reach (distinct frontline `recognition_received` recipients / total frontline headcount, segmented from desk for the M6 gap signal).

**Approvals queue** — pending count, median `time_in_queue_ms`, decline rate. Diagnostic only; flips to top-line if `approval_policy_updated` adoption exceeds 25% of programs.
