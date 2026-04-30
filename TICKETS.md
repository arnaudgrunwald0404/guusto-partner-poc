# R&R Engineering Backlog

**Source PRD:** `PRD-rewards-recognition.md` v0.9
**Source API audit:** `guusto-docs-report.md` (April 29, 2026)
**Owner (eng lead):** TBD
**Squad size assumed:** 6 engineers (3 BE, 2 FE, 1 platform/SRE)
**Last revised:** 2026-04-28

---

## Conventions
- **Ticket IDs:** RR-### sequential. Do not renumber on insertion — append.
- **T-shirt sizes:** XS (≤1d), S (1–3d), M (3–5d), L (5–10d), XL (must split before pickup).
- **Each ticket includes:** Goal, Technical approach, Acceptance criteria (Given/When/Then), Unit tests, Dependencies, Out of scope.
- **`[DESIGN NOTES]`** placeholder for design partner; **`[TRACKING]`** placeholder for analytics/PM.
- **`[ASSUMED]`** marks an engineering call where PRD or API docs are silent. Each one becomes a row in RR-100 (Open Questions Tracker).
- **PRD contradictions:** when PRD assumes a Guusto capability that the API audit disproves, the engineering decision overrides the PRD; the contradiction is logged in RR-100.

---

## API constraints summary (read this before writing any ticket)

The Guusto public API is **8 endpoints, no webhooks, no catalog API, no auth/rate-limit docs**. Build accordingly.

| Group | Method | Path | Notes |
|---|---|---|---|
| Balance | GET | `/api/v1/balances/workspaces/currencies/{currency}` | Workspace-level balance |
| Balance | GET | `/api/v1/balances/members/{employeeNumber}/currencies/{currency}` | Single member balance |
| Balance | GET | `/api/v1/balances/members/currencies/{currency}` | All members, paginated |
| Order | POST | `/api/v1/orders` | 1–20 items per call; async |
| Order | GET | `/api/v1/orders/status/{requestId}` | Lightweight status |
| Order | GET | `/api/v1/orders/{requestId}` | Full details, paginated |
| Reports | GET | `/api/v1/reports/teams/activity` | Activity feed, paginated |
| Reports | GET | `/api/v1/reports/members/last-recognized` | Last-recognized dates |

**Order async lifecycle:** `ACCEPTED → WAITING_PROCESSING → PROCESSING_IN_PROGRESS → COMPLETED | FAILED`. State transitions are undocumented; treat any non-terminal status as polling work.

**Authentication:** `Authorization: Bearer <token>` + `X-Workspace-id: <workspace>` headers. Token format, expiry, and rotation are undocumented. Treat the token as opaque; externalize to a secret manager; build a manual rotation runbook.

**Rate limits:** undocumented. **[ASSUMED]** 60 rpm/token until Guusto confirms; client-side throttle + 429 alerting; back off exponentially.

**Currencies:** CAD, USD only.
**Languages:** ES_MX, FR_CA, EN_CA. **No EN_US.** Build a locale-mapping layer that falls back to EN_CA for EN_US users (and document the mapping).

**`employeeNumber`:** docs are ambiguous. **[ASSUMED]** CC sends a customer-supplied identifier (the CC `employee_external_id` field), and Guusto echoes it back. Confirm before commercial signing.

**No catalog API.** Recipient picks the gift card on Guusto's redemption page (Guusto-hosted). CC composes monetary value; CC never renders the catalog.

**No webhooks.** Polling is the only documented integration pattern. Order completion, redemption events, and balance changes are **not pushed** by Guusto. This invalidates several PRD acceptance criteria (P0-5 webhook-based redemption tracking, §6.4 redemption webhook). Plan: build polling-first; track webhook negotiation as a Phase 3 epic and as RR-100 entries.

**Pagination:** `page` / `size` / `totalElements` / `totalPages` envelope across paginated endpoints. Reports endpoint caps `size` at 50; balances endpoint cap is undocumented. **[ASSUMED]** treat 50 as the universal max until tested.

**Environments:** `docs.guusto.com/_mock/...` (mock), `api-demo.guusto.io` (demo), `api.guusto.com` (prod). All pre-prod work goes through demo.

---

# Phase 0 — Hackathon (1 week)

**Scope:** Gong call → AI classification → manager one-click approval → Guusto reward + CC recognition. End-to-end, email delivery only, $25 fixed reward, demo environment. Throwaway code acceptable; data-model decisions are not.

**The story:** A customer raves about a support engineer on a Gong call. Before the manager's next coffee, that engineer has a recognition on their CC profile and a $25 reward in their inbox.

**What's hardcoded for the POC:** reward amount ($25 USD), Guusto bearer token + workspace ID (env vars), locale (EN_CA — no EN_US in Guusto's API), email delivery only, single employee resolver strategy (fuzzy name match).

---

### RR-H1 — Gong webhook receiver (size: S)
**Epic:** Hackathon prototype
**Phase:** 0
**Goal:** Accept Gong's call-completed webhook, validate the signature, persist the raw payload, and ACK within 200ms. Everything downstream is async — Gong must not time out.

**Technical approach:**
- New endpoint `POST /api/rr/gong-webhook`, feature-flagged under `rr_hackathon`.
- Validate Gong HMAC signature from `X-Gong-Signature` header (secret from env `GONG_WEBHOOK_SECRET`). Return 401 on failure.
- Persist raw JSON body to `rr_h_gong_events` table: `(id UUID, received_at, payload JSONB, status TEXT DEFAULT 'pending')`.
- Return 200 immediately. Enqueue async job for RR-H2.
- **[ASSUMED]** Gong sends a `transcript` or `snippets` array in the webhook payload. If Gong sends only a call ID (requiring a pull), add a `GET /gong/calls/{id}/transcript` fetch step before enqueue — document in findings.

**Acceptance criteria:**
- GIVEN a valid Gong signature, WHEN the webhook fires, THEN a row is persisted with `status='pending'` and 200 returned within 200ms.
- GIVEN an invalid signature, WHEN the webhook fires, THEN 401 returned and nothing persisted.
- GIVEN a duplicate call ID within 5 minutes, WHEN received, THEN idempotent (no duplicate row created, 200 still returned).

**Unit tests:**
- `test_valid_signature_persists_and_acks()`
- `test_invalid_signature_returns_401()`
- `test_duplicate_call_id_is_idempotent()`
- `test_missing_payload_returns_400()`

**Dependencies:** none
**Out of scope:** Gong OAuth, pull-based transcript fetch (confirm with Gong during ticket).

**Design notes:** Design: n/a — backend endpoint.
**Tracking:** n/a — hackathon. Note for Phase 2: this becomes the source-of-truth event for `gong_call_received`; add to tracking taxonomy if Gong integration productizes.

---

### RR-H2 — Claude classifier: exceptional praise detection (size: M)
**Epic:** Hackathon prototype
**Phase:** 0
**Goal:** Analyze a Gong call transcript/snippet and determine (a) whether it contains genuine exceptional customer praise about a named CC employee, (b) who that employee is, (c) a verbatim evidence quote, and (d) a draft recognition message written in the customer's voice.

**Technical approach:**
- Reads a `pending` row from `rr_h_gong_events`. Processes one at a time (no concurrency needed for POC).
- Calls Claude API (`claude-sonnet-4-5` or equivalent) with a structured prompt. Include prompt caching on the system prompt (it's large and static). Use tool use / structured output to get a typed JSON response:

```json
{
  "is_exceptional_praise": true,
  "confidence": 0.91,
  "employee_name_mentioned": "John Kim",
  "evidence_quote": "He's the best support engineer we've ever worked with.",
  "sentiment_magnitude": "very_high",
  "recognition_draft": "John — a customer just told us on a call: 'He's the best support engineer we've ever worked with.' That kind of feedback is rare. Thank you.",
  "reasoning": "Customer used superlative language, named the employee directly, unprompted."
}
```

- **Threshold:** `confidence < 0.75` → mark event `status='below_threshold'`, log reasoning, stop. Do not alert manager.
- **Ambiguous employee name** (no name mentioned, or name too generic like "the guy") → mark `status='no_employee_identified'`, stop.
- **Prompt requirements:**
  - System: role (CC recognition system), task, output schema, examples of what IS and IS NOT exceptional praise (compliments vs. "this product is great" — must name an employee and express exceptional individual performance).
  - User: raw transcript or snippet.
  - Temperature: 0 (deterministic classification).
- On success: mark `status='classified'`, write structured output to `rr_h_classifications` table, enqueue RR-H3.

**Acceptance criteria:**
- GIVEN a transcript with "John is the best support engineer we've ever worked with", WHEN classified, THEN `is_exceptional_praise=true`, `confidence≥0.75`, `employee_name_mentioned="John"`.
- GIVEN a transcript with "great product, love the interface", WHEN classified, THEN `is_exceptional_praise=false` and event is marked `below_threshold`.
- GIVEN a transcript with no employee name, WHEN classified, THEN `status='no_employee_identified'`.
- GIVEN Claude API returns 5xx or times out (>10s), WHEN the job runs, THEN event is marked `status='classification_error'` and retried once after 60s. After 2 failures → `status='failed'`, alert to Slack/log.
- GIVEN `confidence=0.74`, WHEN threshold applied, THEN event is NOT forwarded to RR-H3.

**Unit tests:**
- `test_high_confidence_praise_classifies_correctly()`
- `test_product_compliment_not_classified_as_employee_praise()`
- `test_no_employee_name_sets_no_employee_identified()`
- `test_api_timeout_triggers_retry_then_fails()`
- `test_confidence_below_threshold_stops_pipeline()`
- `test_structured_output_schema_validates()`
- `test_prompt_cache_header_present()` — verify `cache_control` on system prompt block.

**Dependencies:** RR-H1, Claude API credentials in env.
**Out of scope:** fine-tuning, model selection UI, confidence threshold configuration (hardcoded 0.75 for POC).

**Design notes:** Design: n/a — backend AI classification job.
**Tracking:** n/a — hackathon. For Phase 2 production: classification results feed a new `recognition_ai_detected` event (proposed taxonomy extension) with `confidence`, `sentiment_magnitude`, `manager_actioned` (bool set after RR-H4 resolves).

---

### RR-H3 — CC employee resolver (size: S)
**Epic:** Hackathon prototype
**Phase:** 0
**Goal:** Map the employee name extracted by Claude to a real CC employee record (employee_id, manager_id, email). Feed the manager approval flow.

**Technical approach:**
- Reads `employee_name_mentioned` from `rr_h_classifications`.
- Fuzzy match against CC's employee directory (`first_name + last_name` concatenated). Use token-sort ratio ≥ 0.80 as match threshold (or equivalent string similarity library).
- **Zero matches** → mark classification `status='employee_not_found'`, stop. Log the unmatched name for hackathon findings.
- **Multiple matches above threshold** → mark `status='employee_ambiguous'`, stop. Log all candidates.
- **Exactly one match** → persist `employee_id`, `manager_id`, `employee_email` to `rr_h_classifications`. Mark `status='resolved'`. Enqueue RR-H4.
- **[ASSUMED]** CC has an accessible employee directory query. If not (access controls block it), fall back to a hardcoded 3-employee stub for the demo — document in findings.

**Acceptance criteria:**
- GIVEN "John Kim" with one matching CC employee, WHEN resolved, THEN `employee_id`, `manager_id`, `employee_email` are populated and status is `resolved`.
- GIVEN "John" matching three employees, WHEN resolved, THEN status is `employee_ambiguous` and pipeline stops.
- GIVEN "Xyz Qrst" matching no employee, WHEN resolved, THEN status is `employee_not_found`.
- GIVEN a match with similarity 0.79, WHEN threshold applied, THEN it is not treated as a match.

**Unit tests:**
- `test_exact_name_match_resolves()`
- `test_ambiguous_name_stops_pipeline()`
- `test_no_match_stops_pipeline()`
- `test_similarity_threshold_boundary()`
- `test_resolved_row_has_all_required_fields()`

**Dependencies:** RR-H2, CC employee directory access.
**Out of scope:** multi-workspace resolution, preferred-name / nickname handling (add to findings doc).

**Design notes:** Design: n/a — backend resolver.
**Tracking:** n/a — hackathon.

---

### RR-H4 — Manager approval email + one-click approve (size: M)
**Epic:** Hackathon prototype
**Phase:** 0
**Goal:** Send the manager a one-click approval email when the classifier detects exceptional praise. Manager clicks Approve → reward fires. No response in 48h → expires silently. This is the human-in-the-loop gate before any money moves.

**Technical approach:**
- On `resolved` classification: generate a signed approval token (HMAC-SHA256, 48h TTL) stored in `rr_h_approvals` table: `(id, classification_id, token_hash, expires_at, decided_at, decision TEXT)`.
- Send approval email to `manager_email` via existing CC email infrastructure:
  - **Subject:** `Recognition opportunity: [Employee Name] praised by a customer`
  - **Body:** employee name, evidence quote (verbatim), Claude's recognition draft, fixed reward amount ($25 USD), three CTAs:
    - `[Approve & Send — $25 reward]` → signed URL `GET /api/rr/approve?token=...`
    - `[Edit first]` → signed URL to a minimal edit page (RR-H4b below)
    - `[Dismiss]` → signed URL `GET /api/rr/dismiss?token=...`
- **Approve endpoint** (`GET /api/rr/approve?token=...`):
  - Validate token (not expired, not already decided).
  - Mark `decision='approved'`, `decided_at=now()`.
  - Enqueue RR-H5 (Guusto order).
  - Return a simple "Recognition sent! John will receive a $25 reward." confirmation page (static HTML, no CC chrome needed).
- **Dismiss endpoint**: mark `decision='dismissed'`, return "Got it — no recognition sent." page.
- **Edit page (RR-H4b, optional stretch)**: render the recognition draft in a textarea + Approve button. On submit: update `recognition_message` in classification row, then proceed as Approve. Skip if time-constrained — leave Edit CTA pointing to a "coming soon" page.
- **Expiry job**: runs hourly, marks tokens past `expires_at` as `decision='expired'`.

**Acceptance criteria:**
- GIVEN a resolved classification, WHEN the approval job runs, THEN manager receives an email within 60s containing the quote, draft, and all three CTAs.
- GIVEN manager clicks Approve with a valid token, WHEN processed, THEN `decision='approved'`, RR-H5 is enqueued, and a confirmation page renders.
- GIVEN manager clicks Approve with an expired token (>48h), WHEN processed, THEN 410 Gone page renders and no order is placed.
- GIVEN the same token is clicked twice, WHEN the second request arrives, THEN 409 Conflict page renders and no duplicate order is placed.
- GIVEN no manager action in 48h, WHEN expiry job runs, THEN `decision='expired'` and no order is placed.
- GIVEN manager clicks Dismiss, WHEN processed, THEN `decision='dismissed'` and no order is placed.

**Unit tests:**
- `test_approval_email_contains_quote_draft_and_three_ctas()`
- `test_valid_token_approve_enqueues_order()`
- `test_expired_token_returns_410()`
- `test_double_click_returns_409()`
- `test_dismiss_sets_decision_dismissed()`
- `test_expiry_job_marks_stale_tokens()`
- `test_token_is_hmac_signed_and_tamper_resistant()`

**Dependencies:** RR-H3, CC email infrastructure.
**Out of scope:** Slack notification (add to Phase 2), multi-approver flows, approval UI inside CC (link is email-only for POC).

**Design notes:** Approval email is the primary UI surface for the manager in Phase 0. Minimal, functional, on-brand.
- **Email template:** CC-branded header (logo + accent color), 3-section layout: (1) what happened — employee name + quote in a blockquote style, (2) proposed recognition — draft text + "$25 reward via email", (3) three CTA buttons stacked (Approve primary, Edit secondary, Dismiss tertiary).
- **Confirmation page:** static HTML. CC logo, one-line confirmation, no nav. ~10 lines of markup. Not worth a full CC page render.
- **Reference:** `screenshots/05_components/04_milestones--ui-05.png` (milestone confirmation tone); `screenshots/05_components/09_employee-recognition--ui-04.png` (reward framing).
- **Microcopy:** "A customer said something exceptional about [Name] on a recent call. One click sends them a $25 recognition reward." UX writing collab on CTA copy — "Approve & Send" must feel human, not robotic.
- **A11y:** CTA buttons must render as real `<a>` links with descriptive text (not "click here"). Works in Outlook.

**Tracking:** n/a — hackathon. For Phase 2: `approval_requested`, `approval_decided` (decision: approved|dismissed|expired) events proposed; `time_to_decision_minutes` property key for manager-friction analysis.

---

### RR-H5 — Guusto order + status poller (size: S)
**Epic:** Hackathon prototype
**Phase:** 0
**Goal:** On manager approval, place a $25 USD email order with Guusto and poll until terminal state. Update the CC recognition record with delivery status.

**Technical approach:**
- Reads approved classification: `employee_email`, `recognition_message`, `cc_gift_id` (UUID generated at row creation).
- Calls `POST /api/v1/orders` on `api-demo.guusto.io`:
  ```json
  {
    "items": [{
      "recipientEmail": "<employee_email>",
      "amount": 2500,
      "currency": "USD",
      "language": "EN_CA",
      "message": "<recognition_draft>",
      "externalReference": "<cc_gift_id>"
    }]
  }
  ```
  Headers: `Authorization: Bearer $GUUSTO_BEARER_TOKEN`, `X-Workspace-id: $GUUSTO_WORKSPACE_ID`.
- **[ASSUMED]** `EN_CA` is acceptable for US recipients. Document locale gap in findings.
- **[ASSUMED]** `recipientEmail` is a valid order field. Confirm from demo environment response — if field name differs, fix and document.
- On 2xx: persist `guusto_request_id` to `rr_h_orders` table alongside `cc_gift_id`.
- **Poll loop:** every 30s, call `GET /api/v1/orders/status/{requestId}`. Max 40 attempts (20 min total).
  - `COMPLETED` → update order row `status='delivered'`, trigger RR-H6 update.
  - `FAILED` → update `status='failed'`, send manager a "Reward failed to deliver" email (plain text).
  - Non-terminal after 40 attempts → `status='poll_timeout'`, alert Slack/log for hackathon findings.
- Verify `externalReference` round-trip: after `COMPLETED`, call `GET /api/v1/orders/{requestId}` and assert `cc_gift_id` is echoed back. Document result in findings (validates Phase 2 data-join contract).

**Acceptance criteria:**
- GIVEN a valid approval, WHEN the order is placed, THEN Guusto returns a `requestId` and the row is persisted within 5s.
- GIVEN `COMPLETED` status observed, WHEN poll exits, THEN `rr_h_orders.status='delivered'` and `cc_gift_id` round-trip is confirmed and logged.
- GIVEN `FAILED` status observed, WHEN poll exits, THEN `status='failed'` and manager receives failure email.
- GIVEN Guusto returns 429, WHEN encountered during polling, THEN back off 60s and retry (counts as one attempt).
- GIVEN `externalReference` in full-details response matches `cc_gift_id`, WHEN asserted, THEN finding is logged as "round-trip confirmed".

**Unit tests:**
- `test_order_payload_serializes_correctly()` — all required fields present, amount=2500, currency=USD.
- `test_poll_exits_on_completed()`
- `test_poll_exits_on_failed_and_sends_email()`
- `test_429_triggers_backoff_not_failure()`
- `test_poll_timeout_after_40_attempts()`
- `test_cc_gift_id_round_trip_assertion()`

**Dependencies:** RR-H4, Guusto demo credentials in env.
**Out of scope:** retry on order creation failure (log and stop for POC), real budget ledger (Phase 2 RR-050).

**Design notes:** Design: n/a — backend order + polling job.
**Tracking:** n/a — hackathon. Note: `cc_gift_id` → `guusto_request_id` join pattern proven here feeds Phase 2 `gift_order_submitted.request_id` property in TRACKING-PLAN.md.

---

### RR-H6 — Recognition record + employee profile badge (size: XS)
**Epic:** Hackathon prototype
**Phase:** 0
**Goal:** When a reward is delivered, surface a visible "Recognized" indicator on the employee's CC profile so the demo has a tangible in-product moment. Minimal UI; not production-quality.

**Technical approach:**
- Write a `rr_h_recognitions` row on approval (not on delivery — optimistic): `employee_id`, `manager_id`, `source='gong_ai'`, `evidence_quote`, `message`, `reward_amount_cents=2500`, `reward_status` (pending → delivered | failed).
- FE: poll `GET /api/rr/demo/recognition-status?employee_id=...` every 10s (simple client-side interval, no WebSocket needed for POC). Updates badge without page reload.
- On employee profile page, add a banner beneath the employee header (feature-flagged `rr_hackathon`):
  - `pending`: "🎉 Recognition in progress — reward sending…"
  - `delivered`: "🏆 Recognized by [Manager] · $25 reward sent via email · '[evidence quote]'"
  - `failed`: "⚠️ Recognition reward failed to deliver — see manager."
- Banner is read-only. No actions. No persistence beyond the hackathon feature flag.

**Acceptance criteria:**
- GIVEN `reward_status='pending'`, WHEN employee profile loads, THEN "Recognition in progress" banner renders.
- GIVEN `reward_status` transitions to `delivered`, WHEN the FE polls next, THEN banner updates to delivered state without page reload.
- GIVEN feature flag `rr_hackathon` is off, WHEN profile loads, THEN no banner renders.

**Unit tests:**
- `test_banner_not_rendered_without_flag()`
- `test_status_endpoint_returns_correct_state()`
- `test_delivered_state_includes_quote_and_amount()`

**Dependencies:** RR-H5.
**Out of scope:** activity feed, notification to employee, permanent recognition history (all Phase 1+).

**Design notes:** Hackathon-quality — one banner, three states. Reuse existing CC Banner component.
- **CC components:** Banner (info/success/warning variant per state), Avatar (manager), Tag ("AI-detected").
- **Reference:** `screenshots/05_components/04_milestones--ui-01.png` (celebration card tone); `screenshots/08_video-frames/product-demo-frame-011.png` (recognition feed item tone).
- **States:** pending (info, spinner), delivered (success, checkmark, quote in blockquote), failed (warning, no blame copy).
- **Microcopy:** delivered state — "Recognized by [Manager] for exceptional customer feedback · $25 reward sent." No emoji in production; emoji here is for demo legibility only.

**Tracking:** n/a — hackathon. `rr_h_recognitions` table is the Phase 2 seed schema for the production `recognitions` table (RR-010). Document column mapping in findings.

---

### RR-H7 — Hackathon findings + commercial evidence pack (size: S)
**Epic:** Hackathon prototype
**Phase:** 0
**Goal:** Document what worked, what broke, what must be negotiated with Guusto before Phase 2. Output feeds both Joe's pressure-test call and RR-100 (Open Questions Tracker).

**Technical approach:**
- Output: `/docs/rr/hackathon-findings.md`. Required sections:
  1. **API surface confirmed** — actual field names used vs. assumed (especially `recipientEmail`, `externalReference`, `language`).
  2. **`cc_gift_id` round-trip** — confirmed or not. Evidence: raw API response snippet.
  3. **Locale reality** — EN_CA for US recipients in demo. Observed UX in recipient email.
  4. **Polling latency** — observed time from `ACCEPTED` → `COMPLETED` in demo environment.
  5. **Claude classifier performance** — test set of 10 Gong snippets (mix of exceptional/generic/no-name): recall, precision, notable misclassifications.
  6. **Employee resolver gaps** — names that didn't match. Nickname/preferred-name problem quantified.
  7. **Contractual asks for Phase 2** — minimum 8 items (e.g., webhook support, EN_US locale, merchant category in completion response, rate limit confirmation, `employeeNumber` mapping SLA).
  8. **Schema → production mapping** — `rr_h_*` tables → Phase 1/2 production equivalents.
- Triage every gap into RR-100.

**Acceptance criteria:**
- GIVEN the hackathon ends, WHEN the doc is reviewed, THEN all 8 sections are populated and ≥8 contractual asks are listed with evidence.
- GIVEN a gap is found, WHEN triaged, THEN a corresponding entry exists in RR-100.

**Unit tests:** N/A — documentation deliverable.

**Dependencies:** RR-H1 through RR-H6.
**Out of scope:** any production code.

**Design notes:** Design: n/a — findings document.
**Tracking:** n/a — documentation. The classifier performance section (section 5) is the seed data for a future `recognition_ai_detected` event `confidence` distribution analysis.

---

# Phase 1 — Social Recognition MVP (no monetary)

**Premise:** All Phase 1 features are CC-native. Guusto is not in the critical path. Monetary attach is feature-flagged off. Phase 1 ships P0-1, P0-2, P0-3, P0-7, P0-9, P0-10 (per PRD §7) and P1-1, P1-3, P1-4, P1-5, P1-6.

---

## Epic: Recognition Compose & Feed

### RR-010 — Recognition data model + tenant-scoped tables (size: M)
**Epic:** Recognition Compose & Feed
**Phase:** 1
**Goal:** Land the canonical schema for recognitions, values, and tags. Every later ticket reads from these tables — get them right.

**Technical approach:**
- Tables (Postgres, tenant-scoped via `tenant_id` column + RLS or app-layer enforcement):
  - `recognition` (`id` UUID PK, `tenant_id`, `sender_employee_id`, `recipient_employee_id`, `message_text`, `visibility` enum [`company`,`team`,`private`], `created_at`, `parent_recognition_id` for fan-out tracking, `monetary_attachment_id` nullable FK)
  - `recognition_value_tag` (`recognition_id` FK, `value_id` FK, `value_label_snapshot` text NOT NULL — denormalized for historical correctness per P0-2)
  - `program_value` (`id`, `tenant_id`, `label`, `is_active`, `sort_order`)
- Indexes: `(tenant_id, created_at desc)`, `(tenant_id, recipient_employee_id, created_at desc)`, `(tenant_id, sender_employee_id, created_at desc)`.
- Multi-recipient sends create N rows linked by `parent_recognition_id` (per PRD P0-1 technical considerations).
- Migration is reversible.

**Acceptance criteria:**
- GIVEN a multi-recipient send of 3, WHEN persisted, THEN 3 rows exist sharing `parent_recognition_id`.
- GIVEN a value is later deactivated, WHEN historical recognitions are read, THEN `value_label_snapshot` returns the original label.
- GIVEN an attempt to read across tenants, WHEN the query lacks tenant scope, THEN the query errors or returns empty.

**Unit tests:**
- `test_multi_recipient_creates_linked_rows()`
- `test_value_label_snapshot_immutable_on_value_deactivation()`
- `test_tenant_scope_enforced_on_read()`
- `test_visibility_enum_rejects_unknown_value()`

**Dependencies:** none
**Out of scope:** monetary attachment table (RR-050), audit log (RR-085).

**Tracking:** n/a — pure schema ticket; no events emitted from this layer. Downstream consumers (RR-012, RR-040) emit `recognition_sent` / `recognition_received` keyed on `recognition.id`; ensure that PK is exposed on the event bus.

---

### RR-011 — Recipient search endpoint (size: S)
**Epic:** Recognition Compose & Feed
**Phase:** 1
**Goal:** P0-1 recipient lookup against the live employee directory, ≤500ms p95, terminated employees excluded in real time.

**Technical approach:**
- New endpoint `GET /api/rr/recipients?q=...&limit=20`.
- Backed by existing `employee` table; filter `status = 'active'` and `tenant_id`.
- Trigram index on `(full_name)` and `(email)`.
- Return `id`, `full_name`, `avatar_url`, `department`, `manager_full_name`.

**Acceptance criteria:**
- GIVEN a query "mar", WHEN executed against 50k employees, THEN p95 latency ≤500ms.
- GIVEN an employee was terminated 1 minute ago, WHEN searched, THEN they are not returned.
- GIVEN a non-admin user from tenant A, WHEN searching, THEN no tenant B employees are returned.

**Unit tests:**
- `test_search_excludes_terminated()`
- `test_search_tenant_scoped()`
- `test_search_orders_by_name_relevance()`
- `test_search_caps_at_limit()`

**Dependencies:** RR-010
**Out of scope:** recipient picker UI (RR-013).

**Tracking:** n/a — read-only directory endpoint, no product event. Standard CC API logs only.

---

### RR-012 — Compose API: send recognition (size: M)
**Epic:** Recognition Compose & Feed
**Phase:** 1
**Goal:** P0-1 server endpoint for the compose form. Handles fan-out, value validation, visibility.

**Technical approach:**
- `POST /api/rr/recognitions` body: `{recipient_ids: [], message: string, value_ids: [], visibility, monetary_attachment_request: nullable}`.
- Validate: 1–500 recipients, message 1–500 chars, ≥1 value_id, all values active in tenant.
- Single DB transaction wraps all fan-out rows + tag rows.
- Idempotency: client supplies `Idempotency-Key` header; reject duplicates within 60s.
- Emit `recognition.created` event per row to the internal event bus (consumed by notifications, audit, analytics).
- Monetary path is feature-flagged behind `rr_monetary` (Phase 2); Phase 1 returns 422 if requested.

**Acceptance criteria:**
- GIVEN a valid payload with 3 recipients, WHEN POSTed, THEN 200 returned and 3 records exist.
- GIVEN no value_id, WHEN POSTed, THEN 422 with field-level error.
- GIVEN message length 501, WHEN POSTed, THEN 422.
- GIVEN the same `Idempotency-Key` twice within 60s, WHEN both submitted, THEN second returns the original response without duplicate writes.
- GIVEN a 5xx mid-transaction, WHEN retried, THEN no partial fan-out persists.

**Unit tests:**
- `test_compose_fanout_atomic()`
- `test_compose_rejects_inactive_value()`
- `test_compose_rejects_missing_value()`
- `test_compose_rejects_message_too_long()`
- `test_compose_rejects_terminated_recipient()`
- `test_compose_idempotency_key_dedupes()`
- `test_compose_emits_event_per_recipient()`

**Dependencies:** RR-010, RR-011
**Out of scope:** notifications (RR-030), AI drafting (RR-014), monetary (Phase 2).

**Events fired:** `recognition_sent` (once per send), `recognition_received` (fan-out, one per recipient), `recognition_approval_requested` (only if program approval policy is on).
**Key properties:** `recognition_id`, `recipient_count`, `monetary_attached`, `requires_approval`, `compose_to_send_ms`. Fan-out event also carries `recipient_segment` (frontline|desk) and `delivery_channels[]`.
**Owner:** server.

---

### RR-013 — Compose UI: form, recipient picker, value chips (size: M)
**Epic:** Recognition Compose & Feed
**Phase:** 1
**Goal:** The compose modal. Single-screen send flow optimized for ≤90 seconds (Trevor persona).

**Technical approach:**
- Component `RecognitionComposeModal` accessible from global nav, profile pages, and goal-completion nudge contexts.
- Recipient picker: typeahead against RR-011, multi-select chips, max 20 in UI (server allows more).
- Value chips: max 8 visible per PRD §6.1 design decision; required selection (server-validated).
- Visibility radio: company / team / private (default company).
- Live char counter with soft warn at 400, hard block at 500.
- Submits via RR-012; on success, optimistic insert into local feed cache.

**Acceptance criteria:**
- GIVEN no value selected, WHEN sender clicks Send, THEN button disabled and inline error visible.
- GIVEN a successful submit, WHEN the modal closes, THEN the new card appears at the top of the feed without full reload.
- GIVEN a 5xx response, WHEN the form re-enters, THEN all input is preserved.

**Unit tests (component):**
- `test_send_disabled_when_no_value()`
- `test_send_disabled_when_no_message()`
- `test_send_disabled_when_no_recipient()`
- `test_form_state_preserved_on_500()`
- `test_char_counter_updates_on_input()`

**Dependencies:** RR-011, RR-012
**Out of scope:** AI draft (RR-014), monetary attach UI (Phase 2).

**Events fired:** `recognition_composed` (fired once recipient has been selected; do not fire on empty drawer opens — taxonomy is explicit about this).
**Key properties:** `entry_surface` (dashboard_cta|profile|directory|nudge|deep_link), `recipient_count`, `monetary_intent`, `first_session_for_user`. Start the M3 timer here; `compose_to_send_ms` is computed server-side at RR-012.
**Owner:** client.

**Design notes:** Right-anchored Drawer (480px desktop / bottom sheet mobile), launchable from global nav, profile, and goal-completion nudges. Single-screen send, ≤90s target.
- **CC components:** Drawer, Combobox (multi-select recipient typeahead, AvatarStack preview), Chip set (max 8 values, required), Textarea (autosize, counter from 350, hard cap 500), RadioGroup (visibility), Banner (RR-026 self-mod), Button (primary "Send" / secondary "Save draft").
- **Reference:** `screenshots/05_components/02_how-it-works--ui-02.png`; `screenshots/05_components/09_employee-recognition--ui-03.png`; `screenshots/08_video-frames/showcase-2026-frame-021.png`.
- **Key states:** empty (Send disabled with reason tooltip); validation inline; self-mod warn (non-blocking); submitting; success → toast "Recognition sent" + optimistic feed prepend; 5xx preserves all input.
- **Microcopy:** Send button label changes to "Send recognition + gift" when monetary attached (RR-061). Disabled-state tooltips explain why ("Pick a value to send"). UX writing collab needed.
- **A11y:** first focus on recipient Combobox; chips arrow-key navigable; live region announces char count past 450 and "Recognition sent" on success.
- **Open Q:** "Save draft" — local-storage only for v1; revisit after telemetry.

---

### RR-014 — AI drafting assist (opt-in, ghost suggestion) (size: M)
**Epic:** Recognition Compose & Feed
**Phase:** 1
**Goal:** P1 user story (Trevor P2): generate a starter message from selected recipient + value tags. Sender always edits and confirms. Never auto-posts.

**Technical approach:**
- Endpoint `POST /api/rr/draft-suggestions` body: `{recipient_id, value_ids[]}` → 2–3 candidate messages from the existing CC LLM provider.
- Rate limit per sender: 10/min.
- UI: inline ghost text in the message field; "Accept", "Regenerate", "Dismiss". AI badge always visible.
- Telemetry: **no new top-level events.** AI outcome is folded into `recognition_sent` as properties: `ai_draft_used` (bool), `ai_draft_outcome` (enum: `accepted_as_is | accepted_and_edited | regenerated | dismissed | not_shown`), `ai_draft_show_count` (int). The Suggest button click fires no event; only the eventual `recognition_sent` carries the AI signal. This keeps the 21-event taxonomy stable.

**Acceptance criteria:**
- GIVEN a sender selects a recipient and value, WHEN they click "Suggest", THEN a draft appears in ≤3s p95.
- GIVEN a sender accepts and edits, WHEN sent, THEN `recognition_sent` carries `ai_draft_outcome=accepted_and_edited`; accepted-as-is sends carry `accepted_as_is`. No separate AI events are emitted.
- GIVEN no value selected, WHEN suggest clicked, THEN button disabled.
- GIVEN the LLM provider returns 5xx or times out (>5s), WHEN the user clicked Suggest, THEN an inline non-blocking error appears with a retry CTA and the user can still hand-write and send the recognition.
- GIVEN the user has hit the 10/min rate limit, WHEN Suggest is clicked, THEN button shows a tooltip with seconds remaining and does not call the endpoint.

**Unit tests:**
- `test_draft_endpoint_requires_value()`
- `test_draft_endpoint_rate_limit()`
- `test_draft_telemetry_distinguishes_accept_vs_overwrite()`
- `test_llm_timeout_does_not_block_send()`
- `test_rate_limit_shows_countdown_tooltip()`

**Dependencies:** RR-013
**Out of scope:** model fine-tuning, prompt optimization (separate ML ticket).

**Tracking:** No new events. AI outcome is captured as properties on `recognition_sent`: `ai_draft_used`, `ai_draft_outcome`, `ai_draft_show_count`. Resolves the prior taxonomy gap — taxonomy stays at 21 events; M3/M4 unaffected; AI adoption analysis runs as a property breakdown on the existing `recognition_sent` event.
**Owner:** client (sets properties on the existing client-side `recognition_sent` emission).

**Design notes:** Inline ghost-text assist beneath the message Textarea in the RR-013 drawer.
- **CC components:** Button (tertiary "Suggest"), Badge ("AI"), Button trio "Accept / Regenerate / Dismiss", Skeleton, InfoTooltip; 🆕 NEW: GhostTextField — overlay rendering grayed suggestion accepted via Tab.
- **Reference:** No Guusto reference (not in captures). Mirror CC's existing AI patterns from performance review drafting.
- **Key states:** disabled (prerequisites missing) → idle → loading skeleton (≤3s p95) → suggestion shown → accepted (badge persists until first edit) → regenerating → LLM error (inline "Try again", non-blocking) → rate-limited (10/min — tooltip with countdown).
- **Microcopy:** Tooltip "AI suggestion — edit before sending." UX writing collab needed for tone (warm not robotic).
- **A11y:** Badge announced as "AI-generated suggestion"; ghost text excluded from accessibility tree until accepted; Tab inserts, Esc dismisses.
- **Open Q:** Show one candidate at a time with Regenerate cycling (recommended for v1) vs. carousel of 2–3.

---

### RR-015 — Recognition feed API (paginated) (size: S)
**Epic:** Recognition Compose & Feed
**Phase:** 1
**Goal:** P1-3 feed endpoint. Filterable, paginated, visibility-enforced server-side.

**Technical approach:**
- `GET /api/rr/feed?cursor=...&limit=20&value_id=&department_id=&from=&to=&has_reward=`.
- Cursor-based pagination on `(created_at, id)`.
- Visibility filter applied server-side: `private` only to sender/recipient, `team` to recipient's team + admins, `company` to all.
- Returns sender, recipient, message, values, reactions count, `has_monetary_attachment` boolean (no amount).

**Acceptance criteria:**
- GIVEN a peer not in recipient's team, WHEN feed queried, THEN `team`-scoped items are not returned.
- GIVEN cursor is omitted, WHEN feed queried, THEN newest 20 returned.
- GIVEN the dataset has 100k rows, WHEN page 1 fetched, THEN p95 ≤300ms.

**Unit tests:**
- `test_feed_excludes_private_for_non_participant()`
- `test_feed_team_visibility_enforced()`
- `test_feed_pagination_stable_under_inserts()` — new rows during paging don't shift cursors.
- `test_feed_filter_by_value_works()`

**Dependencies:** RR-010
**Out of scope:** real-time push (RR-016), reactions/comments (RR-020).

**Tracking:** n/a — feed read endpoint, no product event. (Feed-engagement metrics, if needed later, would attach to a new event; resist bloat.)

---

### RR-016 — Live "X new recognitions" banner (size: S)
**Epic:** Recognition Compose & Feed
**Phase:** 1
**Goal:** P1-3: show a banner when new feed items arrive without forcing a reload.

**Technical approach:**
- Lightweight polling: client polls `GET /api/rr/feed/since?cursor=<top_known>` every 30s.
- Banner shows count; click prepends new items.
- **[ASSUMED]** WebSocket push deferred to a later epic; polling is fine for MVP.

**Acceptance criteria:**
- GIVEN the user is on the feed, WHEN a new recognition is posted by another user, THEN within 30s a banner appears.
- GIVEN the `/feed/since` endpoint returns 5xx, WHEN polling fails, THEN the banner state is unchanged (no flicker), the error is logged, and polling backs off to 60s for the next 3 attempts before resuming the 30s cadence.
- GIVEN no new items, WHEN polled, THEN no banner is shown and no DOM update occurs.

**Unit tests:**
- `test_since_endpoint_returns_only_newer()`
- `test_banner_clears_on_click()`
- `test_5xx_does_not_clear_banner_state()`
- `test_polling_backoff_after_failure()`

**Dependencies:** RR-015
**Out of scope:** WebSocket transport.

**Tracking:** n/a — passive UI affordance; no taxonomy event. If banner-click → feed-prepend conversion becomes interesting, fold into a property of an existing event rather than minting a new one.

**Design notes:** Sticky pill banner at the top of the feed, below the feed header.
- **CC components:** Banner (compact, info-style, clickable) with subtle entrance fade/slide; entire pill is the click target.
- **Reference:** `screenshots/05_components/02_how-it-works--ui-01.png`; `screenshots/05_components/09_employee-recognition--ui-01.png`.
- **States:** hidden (count = 0) → visible (count > 0) → clicked (prepend items, fade out, optional scroll-to-top).
- **Microcopy:** "3 new recognitions" / singular "1 new recognition." Pluralization edge case for UX writing.
- **A11y:** `role="status"` `aria-live="polite"`; Enter/Space activates; do not steal focus on appearance.

---

## Epic: Recognition Values & Tags

### RR-020 — Admin values configuration UI + API (size: M)
**Epic:** Recognition Values & Tags
**Phase:** 1
**Goal:** P0-10: admins can CRUD company values. Hard cap 8 active values per tenant (PRD §6.1).

**Technical approach:**
- `GET/POST/PATCH/DELETE /api/rr/admin/values` admin-only.
- Soft-delete (set `is_active=false`) — never hard-delete (history relies on snapshot but FK references remain).
- Validation: ≤8 active values per tenant.
- UI lives in R&R Settings.

**Acceptance criteria:**
- GIVEN 8 active values, WHEN admin tries to create a 9th, THEN 409 returned.
- GIVEN a value is deactivated, WHEN compose loads, THEN it is not selectable.
- GIVEN a value is deactivated, WHEN historical recognitions are rendered, THEN they still show the snapshotted label.

**Unit tests:**
- `test_max_8_active_values_enforced()`
- `test_deactivated_value_hidden_from_compose()`
- `test_deactivated_value_visible_in_history()`
- `test_admin_only_endpoint()`

**Dependencies:** RR-010
**Out of scope:** value-level analytics (RR-021).

**Events fired:** `approval_policy_updated` (only when admin toggles the program's approval policy here — OQ-9 telemetry).
**Key properties:** `program_id`, `actor_employee_id`, `previous_policy`, `new_policy`. Rare event; high-leverage for cohort comparisons.
**Owner:** server.

**Design notes:** R&R Settings → "Values" tab — list + add/edit modal. Hard cap 8 active values.
- **CC components:** PageHeader, DataTable (label, Badge Active/Inactive, sort order, last-edited; row actions edit/deactivate), Button (primary "Add value"), Modal (label Input ≤30 chars + sort + active Toggle), Banner (info on deactivation behavior), EmptyState; 🆕 NEW: DragHandle if DataTable lacks reorder.
- **Reference:** `screenshots/05_components/05_manager-budgets--ui-01.png`; `screenshots/08_video-frames/showcase-2026-frame-033.png`.
- **Key states:** empty (onboarding CTA) → 1–7 active (Add enabled) → cap reached (Add disabled, tooltip "Deactivate one to add another") → edit modal → deactivate confirm modal ("Historical recognitions keep this label") → saved toast.
- **Microcopy:** Deactivation banner and confirm modal need UX writing — make clear that history is preserved.
- **A11y:** Drag-reorder needs keyboard alternative (move-up/move-down buttons in row menu); modal focus trap.

---

### RR-021 — Values distribution analytics chart (P1-6) (size: S)
**Epic:** Recognition Values & Tags
**Phase:** 1
**Goal:** Bar chart of recognition count per value, ranked desc, configurable date range. Admin and manager scope.

**Technical approach:**
- `GET /api/rr/analytics/values?from=&to=&scope=tenant|team`.
- For manager scope, filter to recognitions where recipient is a direct or indirect report.
- Returns `[{value_id, label_snapshot, count}]`, sorted desc.

**Acceptance criteria:**
- GIVEN a manager scopes to their team, WHEN chart loads, THEN only their reports' recognitions are counted.
- GIVEN a tenant has no recognitions in range, WHEN queried, THEN empty array returned (not error).

**Unit tests:**
- `test_values_analytics_team_scope_filters_to_reports()`
- `test_values_analytics_uses_snapshot_label()`
- `test_values_analytics_empty_range()`

**Dependencies:** RR-010, RR-074 (manager dashboard frame)
**Out of scope:** values-vs-performance correlation (Phase 3).

**Events fired:** `dashboard_viewed` (when chart loads inside admin dashboard) and `manager_insight_viewed` (when chart is in manager scope).
**Key properties:** `view_id=overview|equity` and `time_range`; for manager view, `tab=team_history` + `direct_reports_in_view`. Do not double-fire when a user toggles between team/tenant scope — debounce.
**Owner:** client.

**Design notes:** Chart card embedded in admin dashboard (RR-089) and manager dashboard (RR-074).
- **CC components:** Card, DatePicker (range, presets 30d/90d/quarter/year), Tabs ("All" / "My team" — manager-only), horizontal Bar chart (ranked desc, label + count + % of total), EmptyState, Skeleton, Button (tertiary "Export CSV").
- **Reference:** `screenshots/01_marketing/06_reports-analytics--full.png`; `screenshots/08_video-frames/showcase-2026-frame-031.png`; `screenshots/08_video-frames/showcase-2026-frame-035.png`.
- **Key states:** loading skeleton bars → populated (1–8 bars) → empty in range → manager scope (filtered to direct reports). Hover on bar shows tooltip + click drills to filtered feed.
- **A11y:** Bar chart needs accessible data-table fallback toggle ("View as table"); keyboard nav across bars; never rely on color alone for ranking.

---

## Epic: Approvals & Moderation

### RR-025 — Recognition deletion / moderation by admin (size: S)
**Epic:** Approvals & Moderation
**Phase:** 1
**Goal:** Admins can soft-delete a recognition (e.g., inappropriate content). Sender and recipient receive a notification.

**Technical approach:**
- `DELETE /api/rr/recognitions/{id}` admin-only; sets `deleted_at` and `deleted_by_admin_id`.
- Audit entry written.
- Feed and profile views filter `deleted_at IS NULL`.
- Notification to sender ("removed by admin") + optional admin reason field.

**Acceptance criteria:**
- GIVEN a non-admin tries to delete, WHEN attempted, THEN 403.
- GIVEN an admin deletes, WHEN feed re-queried, THEN row is absent.
- GIVEN an admin deletes, WHEN audit log queried, THEN entry exists with reason.

**Unit tests:**
- `test_delete_admin_only()`
- `test_deleted_excluded_from_feed()`
- `test_delete_writes_audit()`

**Dependencies:** RR-010, RR-085
**Out of scope:** automated content moderation; appeal flow.

**Tracking:** n/a from the 21-event taxonomy (admin moderation is rare; rolled into the audit log RR-085, not the product analytics pipeline). PM flag if moderation rate becomes a top-line concern.

**Design notes:** Admin-only kebab on recognition cards opens destructive confirm flow.
- **CC components:** Button (icon kebab, admin-only via permission check), Menu, Modal (destructive variant), Textarea (reason ≤200 chars, internal), Button (destructive "Remove"), Toast (success), CalloutBox in modal ("Sender and recipient will be notified").
- **Reference:** No Guusto reference for admin moderation. Reuse CC's destructive-action pattern from performance reviews.
- **Key states:** non-admin (no kebab visible — permission-denied is silent) → admin default → confirm modal → submitting → success (card removed from feed + toast) → error (modal stays, inline error).
- **Microcopy:** Modal title "Remove this recognition?"; toast "Recognition removed; sender notified." Textarea label must read "Internal note (not shown to sender)."
- **A11y:** Modal focus trap; destructive button meets contrast AA; primary action is "Cancel" (safer default focus).

---

### RR-026 — Pre-send self-moderation guardrails (size: XS)
**Epic:** Approvals & Moderation
**Phase:** 1
**Goal:** Inline warning when a message contains profanity or PII patterns. Soft warning, not blocking (avoid recognition friction).

**Technical approach:**
- Use existing CC content-policy library (the same one applied to performance review comments).
- UI shows a yellow banner; sender can dismiss and proceed.

**Acceptance criteria:**
- GIVEN a flagged message, WHEN typed, THEN warning is shown.
- GIVEN the sender ignores the warning, WHEN sent, THEN message is persisted normally.

**Unit tests:**
- `test_profanity_triggers_warning()`
- `test_warning_does_not_block_send()`

**Dependencies:** RR-013
**Out of scope:** real ML moderation.

**Tracking:** n/a — purely client-side guardrail; no event. If "warning shown then sent anyway" becomes interesting, add as boolean property on `recognition_sent` rather than a new event.

**Design notes:** Inline yellow Banner inside the RR-013 compose drawer, above Send. Soft warning only — never blocks.
- **CC components:** Banner (warning, dismissible, alert-triangle icon), Button (tertiary inline "Edit message" — focuses Textarea).
- **Reference:** N/A — reuse CC's self-moderation banner pattern from performance review comments.
- **Key states:** no flag (hidden) → flagged (banner visible with category-specific copy) → dismissed (hidden for draft, Send still enabled).
- **Microcopy:** "This may contain language that could be misinterpreted." Tone is collaborative not punitive — UX writing collab needed.
- **A11y:** `role="alert"` for SR announcement; close button keyboard-reachable; appearance must not move Send button (no layout shift / focus jump).

---

## Epic: Notifications & Email

### RR-030 — In-app notification + email on recognition received (size: M)
**Epic:** Notifications & Email
**Phase:** 1
**Goal:** P0-3: in-app within 60s, email within 5min, no synchronous dispatch in compose path.

**Technical approach:**
- Consume `recognition.created` event from RR-012.
- Worker writes to `notification` table (existing CC infra) → in-app delivery.
- Separate worker enqueues email job via existing transactional provider; render Liquid template `rr_recognition_received`.
- Dead-letter to `notification_dlq` after 3 retries with exponential backoff (1m, 5m, 30m).
- Recipient's email is unverified or null → log undeliverable, continue (no exception).
- Deep links sign a short-lived token redirecting through CC SSO if not authenticated.

**Acceptance criteria:**
- GIVEN a recognition is created, WHEN 60s elapses, THEN an in-app notification exists.
- GIVEN the same event, WHEN 5 min elapses, THEN an email has been sent (or logged undeliverable).
- GIVEN the email worker errors 3 times, WHEN max retries hit, THEN job is in DLQ and an alert fires.
- GIVEN an unauthenticated user clicks the email deep link, WHEN they authenticate, THEN they land on the recognition detail page.

**Unit tests:**
- `test_in_app_notification_created_on_event()`
- `test_email_job_enqueued_on_event()`
- `test_unverified_email_logged_no_throw()`
- `test_dlq_after_three_retries()`
- `test_deep_link_signed_short_lived()`

**Dependencies:** RR-012
**Out of scope:** SMS (RR-035), Slack/Teams (RR-031).

**Events fired:** `gift_link_delivered` (when applicable — fires on monetary recognitions where the email path is the signed-token URL). Plain non-monetary email is **not** a taxonomy event.
**Key properties:** `channel=email`, `recipient_segment` (frontline|desk), `provider_message_id`, `recognition_id`. PII guardrail: do NOT log recipient email — use `recipient_employee_id`.
**Owner:** server.

**Design notes:** Two surfaces — (1) in-app NotificationItem in CC's existing notification center; (2) transactional email `rr_recognition_received`.
- **CC components:** NotificationItem (sender Avatar, headline, excerpt, timestamp, unread dot), Button (tertiary "View"). Email uses CC's existing transactional template primitives.
- **Email structure:** Subject "{Sender first} recognized you for {Value}" (<50 chars); preview = first 90 chars of message; hero = sender Avatar + headline; value chips as colored pills with image fallback; quoted message; primary CTA "See your recognition" (signed deep link, mandatory plain-text fallback); footer with unsubscribe to in-app prefs (not email).
- **Reference:** `screenshots/05_components/04_milestones--ui-06.png` (mobile celebration tone); `screenshots/05_components/09_employee-recognition--ui-06.png`.
- **Key states:** in-app unread → read → batched (same sender within 5min); email standard / monetary-variant (Phase 2) / undeliverable (silent); deep link unauthenticated → SSO → detail.
- **Microcopy:** UX writing collab — celebratory tone without saccharine; CTA never "Click here."
- **A11y:** Avatar alt text; chips meet contrast; mobile-first email (single column, ≥44px touch targets).
- **Frontline:** N/A here — frontline channel handled by RR-035.

---

### RR-031 — Slack outbound recognition card (P1-1) (size: M)
**Epic:** Notifications & Email
**Phase:** 1
**Goal:** When a recognition is posted, push a Slack message to the recipient (DM) and optionally a configured channel.

**Technical approach:**
- Use existing CC Slack app installation per tenant (already integrated for performance reviews).
- New event subscriber: posts a Block Kit message with sender, message, value chips. Link back to CC.
- Tenant admin config: enable / disable, channel ID for company-wide cards.
- Recipient must have linked Slack identity; otherwise skip silently and email-only.

**Acceptance criteria:**
- GIVEN tenant has Slack enabled, WHEN recognition posted, THEN DM arrives within 5min p95.
- GIVEN recipient has no Slack link, WHEN event fires, THEN no error and email path still runs.
- GIVEN Slack API returns 429 or 5xx, WHEN posting fails, THEN job retries with exponential backoff (1m, 5m, 30m) and DLQs after 3 attempts; email path runs independently.
- GIVEN tenant's Slack token has been revoked, WHEN posting attempted, THEN admin receives a "reconnect Slack" notification and recognition delivery still completes via email.

**Unit tests:**
- `test_slack_card_block_kit_renders()`
- `test_slack_skipped_when_no_link()`
- `test_slack_disabled_per_tenant_skips()`

**Dependencies:** RR-030
**Out of scope:** inbound `/recognize` slash command (RR-032).

**Tracking:** n/a directly — Slack DM is an additional CC-side delivery surface, not a 21-event taxonomy event. If recipient_count of Slack-linked frontline matters for M2, fold into a `delivery_channels` enum value on `recognition_received` (already supported: in_app|email|sms — propose adding `slack` only after taxonomy review).

**Design notes:** Slack-native Block Kit message (DM + optional channel). CC owns only the admin config and the message template.
- **Slack message:** Header "You've been recognized" (channel variant names both parties); Section with Avatar accessory + sender name + value tags; quoted message; Actions primary "View in CC" + secondary "React"; Context "Recognized via ClearCompany."
- **Admin config (R&R Settings → Integrations):** Toggle (Enable Slack), Combobox (channel picker via Slack search), Banner ("Recipients without linked Slack receive email only").
- **Reference:** `screenshots/04_features/07_integrations--full.png`; `screenshots/05_components/02_how-it-works--ui-01.png` (card visual to mirror).
- **Key states:** linked → DM; channel-enabled → DM + channel post; unlinked → silent skip + email fallback; outage → DLQ (no user surface).
- **A11y:** Value tags must be text not image-only; Slack Action button labels descriptive (not "Click").

---

### RR-032 — `/recognize` Slack slash command (P1-2) (size: M)
**Epic:** Notifications & Email
**Phase:** 1
**Goal:** Sender invokes `/recognize @user message #value` from Slack and a recognition is created.

**Technical approach:**
- New Slack slash handler; parses recipient mention, message, hashtag value.
- Resolves Slack user → CC employee via existing identity-link table; rejects if unlinked.
- Calls RR-012 with `source = "slack"`.
- Returns ephemeral confirmation to sender; the standard outbound card (RR-031) becomes the visible artifact.

**Acceptance criteria:**
- GIVEN `/recognize @x great work #craft`, WHEN sent by linked user, THEN recognition created with value `craft`.
- GIVEN unknown hashtag value, WHEN sent, THEN ephemeral error explains valid values.
- GIVEN unlinked sender, WHEN sent, THEN ephemeral error with link instructions.

**Unit tests:**
- `test_slash_command_parses_mention_message_value()`
- `test_slash_command_rejects_unknown_value()`
- `test_slash_command_rejects_unlinked_user()`

**Dependencies:** RR-031, RR-012
**Out of scope:** Slack-side gift attach (deferred per PRD).

**Events fired:** `recognition_composed` then `recognition_sent` via the standard server commit (RR-012). The slash command is the entry surface.
**Key properties:** `entry_surface=deep_link` (or add new enum `slack_slash` after taxonomy review), `recipient_count`, `program_id`. Server fills `compose_to_send_ms`.
**Owner:** server (slash handler runs server-side).

**Design notes:** Slack-native ephemeral response to the sender; the public artifact is RR-031's outbound card. Pure copy/template work.
- **Slack components:** ephemeral text + Action buttons (Slack-native, not CC-DS).
- **Ephemeral copy variants:** success ("Recognition sent to @{recipient} for {Value}" + link); unknown value (lists valid values as clickable hashtags); unlinked sender ("Link your CC account" button → CC identity-link); unlinked recipient (warning "they'll still receive email").
- **Help text:** `/recognize` with no args returns usage, two examples, and the list of valid values.
- **Reference:** N/A — Slack-native surface.
- **Microcopy:** UX writing collab on error tone — must be actionable, not punitive.
- **Open Q:** Interactive Block Kit modal (instead of one-line parsing) — defer to v2 unless usability testing shows parsing failure rate >20%.

---

### RR-033 — Microsoft Teams outbound card (P1-1) (size: M)
**Epic:** Notifications & Email
**Phase:** 3
**Priority adjusted:** PRD §11 explicitly places Teams integration in Phase 3 ("Microsoft Teams integration: outbound shoutout cards + bi-directional reaction sync + lightweight recognize action"). Phase 1 ships Slack only per PRD §11 Phase 1 scope. Moving here aligns ticket with PRD phasing.
**Goal:** Mirror of RR-031 for Teams.

**Technical approach:**
- Adaptive Card via existing CC Teams app installation.
- Tenant config flag separate from Slack.
- Same fallback rules.

**Acceptance criteria, tests, deps:** mirror RR-031, **plus** explicit failure ACs:
- GIVEN Teams API returns 429 or 5xx, WHEN posting fails, THEN message is enqueued for retry with exponential backoff (1m, 5m, 30m) and DLQs after 3 attempts.
- GIVEN tenant's Teams app token has expired, WHEN posting attempted, THEN admin receives a "reconnect Teams" notification and the failure does NOT block the email-path notification.

**Tracking:** Mirror RR-031 — no separate taxonomy event. Same delivery-channel enum question applies.

**Design notes:** Teams Adaptive Card v1.5 mirroring RR-031 — chat to recipient + optional channel.
- **Adaptive Card:** Large/Bolder TextBlock headline; ColumnSet sender Avatar (Person style) + name + value tags; wrapped message body in subtle styling; ActionSet primary "View in CC" + secondary "React"; subtle "Recognized via ClearCompany" footer.
- **Admin config (R&R Settings → Integrations):** Toggle (Enable Teams — independent of Slack toggle), Combobox (team channel picker).
- **Reference:** `screenshots/04_features/07_integrations--full.png`.
- **Key states:** mirror RR-031 (linked / unlinked / channel-enabled / outage).
- **A11y:** Adaptive Card honors host theme; every Image needs `altText`; do not rely on color alone.

---

### RR-035 — Frontline SMS / personal-email delivery (size: L)
**Epic:** Frontline Delivery (SMS / personal email)
**Phase:** 1
**Goal:** P0-1 frontline coverage (Maria persona). Send recognition to personal email or SMS for employees flagged `is_frontline = true`. **Non-monetary in Phase 1.**

**Technical approach:**
- Recipient resolution order: corporate email → personal email → SMS, driven by tenant policy.
- SMS via existing CC Twilio integration; render templated text + signed short-link to a public CC mini-page (RR-036).
- Personal email: separate suppression list / consent table — `personal_contact_consent` (`employee_id`, `channel`, `granted_at`). Send only if consent exists.
- `notification_attempt` table tracks every channel send + outcome.

**Acceptance criteria:**
- GIVEN a frontline recipient with no corporate email but a consented personal email, WHEN recognition sent, THEN personal email is sent and an attempt row recorded.
- GIVEN no consent on any channel, WHEN attempted, THEN attempt row records `undeliverable_no_consent` and admin is surfaced this in delivery dashboard.
- GIVEN SMS bounces/errors, WHEN detected via Twilio webhook, THEN `notification_attempt.status = bounced` and a re-attempt to the next channel is enqueued (PRD: "options to resend via SMS or QR").

**Unit tests:**
- `test_channel_resolution_prefers_corporate_email()`
- `test_no_consent_records_undeliverable()`
- `test_sms_bounce_triggers_fallback_attempt()`
- `test_attempt_log_immutable()`

**Dependencies:** RR-030
**Out of scope:** monetary delivery (Phase 2 RR-052), QR code mode (RR-037).

**Events fired:** `gift_link_delivered` (one per channel attempt — taxonomy enum is `email|sms`; "personal email" is still `email`).
**Key properties:** `channel`, `recipient_segment=frontline`, `provider_message_id`, `recognition_id`. **Critical:** never include the recipient's email/phone in event payload — taxonomy PII rule. Bounce → re-attempt produces a second event with new `provider_message_id`.
**Owner:** server.

**Design notes:** Frontline (Maria) coverage — three deliverables: SMS template, personal-email template, admin delivery health panel. **Mobile-first.**
- **SMS template (≤160 chars):** "{Sender first} recognized you at {Company} — {cc.co/r/token}". No value/message excerpt — the signed short link drives the RR-036 mini-page (design ownership: CC).
- **Personal-email `rr_recognition_received_personal`:** From-name "{Company} Recognition" (not "ClearCompany"); CTA targets RR-036 (no-login); footer explains personal-email use + manage-preferences link. Plain-text fallback mandatory.
- **Admin delivery panel (in RR-089):** Card "Frontline delivery health", DataTable (recipient, channel, outcome, timestamp, row-action retry), Badge (Delivered/Bounced/No consent/Retrying), FilterRail (date, outcome, department).
- **Reference:** `screenshots/05_components/04_milestones--ui-06.png`; `screenshots/01_marketing/06_reports-analytics--full.png` (admin reporting reference); manager insights reference: `screenshots/08_video-frames/showcase-2026-frame-031.png`.
- **Key states:** channel resolution preview; consent missing → row CTA "Request consent"; bounce → re-attempt indicator; success → green Delivered badge.
- **Microcopy:** UX writing critical — frontline recipients may not know "ClearCompany." Lead with company brand. Plain language only.
- **Frontline:** SMS + personal email are the recipient surface — both CC-owned templates feeding the CC-owned RR-036 page. No Guusto handoff in Phase 1.

---

### RR-036 — Frontline mini-page (no login required) for recognition view (size: M)
**Epic:** Frontline Delivery
**Phase:** 1
**Goal:** Recipient clicks SMS/email link, sees the recognition detail without logging into CC. Maria persona's "under three minutes" target.

**Technical approach:**
- Public route `/r/<signed_token>` — token is HMAC-signed, 30-day TTL, single-use? **[ASSUMED]** multi-use within TTL (link sharing not a security risk for non-monetary recognitions; revisit for monetary).
- Page renders sender, message, values, branding. Server-side endpoint emits `gift_link_opened` (taxonomy event) before page renders — this is the only frontline-safe open signal.
- Mobile-first.

**Acceptance criteria:**
- GIVEN a valid token, WHEN visited unauthenticated, THEN the recognition is shown.
- GIVEN an expired token, WHEN visited, THEN a friendly "expired" page renders with support contact.
- GIVEN a tampered token, WHEN visited, THEN 404.

**Unit tests:**
- `test_token_validates_hmac()`
- `test_expired_token_rejected()`
- `test_view_emits_gift_link_opened_event()`
- `test_email_prefetch_user_agent_is_classified()`
- `test_duplicate_open_within_24h_is_deduped()`

**Dependencies:** RR-035
**Out of scope:** login wall, redemption (Phase 2).

**Events fired:** `gift_link_opened` (server-side at the signed-token endpoint, before the page renders). This is the frontline-safe equivalent of a click event — the only reliable open signal for users with no CC SDK.
**Key properties:** `delivered_to_opened_seconds`, `user_agent_class` (mobile_browser|desktop_browser|email_prefetch|unknown — suppress `email_prefetch` from M2 numerator), `channel`, `recognition_id` (resolved from token). Dedupe within 24h per token.
**Owner:** server.

**Design notes:** Public, mobile-first, no-login bridging surface — CC-owned. Minimal, celebratory, tenant-branded. **Design ownership: CC** (Phase 2 hands redemption off to Guusto).
- **CC components:** Card (centered, max-width 480px), Avatar (64px), Chip set (read-only values), tenant logo footer + "via ClearCompany" wordmark. No global CC chrome.
- **Reference:** `screenshots/06_mobile/01_home-mobile.png`; `screenshots/05_components/04_milestones--ui-06.png` (target tone); `screenshots/05_components/09_employee-recognition--ui-06.png`.
- **Key states:** standard (valid token) → expired ("This link has expired" + support contact) → tampered/invalid (404 friendly page) → brief loading skeleton.
- **Microcopy:** UX writing collab — celebratory but not patronizing for blue-collar/frontline recipients. Avoid emoji-heavy.
- **A11y:** single H1; AA contrast; no autoplay; OG tags sanitized so link previews don't leak sensitive content.
- **Frontline:** This IS the frontline surface. Test on iOS Mail / Gmail / SMS preview / WhatsApp. Tenant branding = logo + accent color in v1 (no full theme).

---

### RR-037 — QR-code recognition delivery (size: S)
**Epic:** Frontline Delivery
**Phase:** 1
**Goal:** Manager prints a QR poster; QR resolves to a peer-nomination form (Maria P4).

**Technical approach:**
- Admin tool generates a tenant-scoped QR linking to `/r/nominate/<tenant_token>`.
- Form: nominator name, recipient (typeahead from public-safe employee list — first name + last initial only), message.
- Submissions go to a moderation queue (admin-approved before becoming a recognition).

**Acceptance criteria:**
- GIVEN a valid QR, WHEN scanned, THEN nominate form renders.
- GIVEN a submission, WHEN saved, THEN it appears in admin moderation queue and does NOT auto-post.
- GIVEN admin approves, WHEN approved, THEN a recognition is created.

**Unit tests:**
- `test_qr_token_resolves_to_correct_tenant()`
- `test_nomination_does_not_auto_publish()`
- `test_admin_approval_creates_recognition()`

**Dependencies:** RR-036
**Out of scope:** SMS-back nomination flow.

**Tracking:** Approval-path emits `recognition_approval_requested` on submission and `recognition_approval_decided` on admin approve/decline. On approval, downstream `recognition_sent` fires through the standard RR-012 path with `entry_surface=qr_nomination` (propose enum addition).
**Key properties:** `approver_employee_id`, `decision`, `time_in_queue_ms`, `decline_reason_code`.
**Owner:** server.

**Design notes:** Three surfaces — admin QR generator, public nomination form (mobile-first, no login), admin moderation queue.
- **CC components:** Card + PreviewArea (QR + poster template), Select (poster size), Button (download PDF/QR), CalloutBox (approval notice); public form uses Card + Input + Combobox (safe-public list — "Sarah M.") + Textarea (≤500 chars) + tenant logo/accent + Button; queue uses PageHeader + DataTable (bulk-select) + Toolbar (Approve/Reject) + Drawer (review detail with required value chip picker) + EmptyState.
- **Reference:** `screenshots/05_components/02_how-it-works--ui-02.png` (send pattern mirror); `screenshots/06_mobile/01_home-mobile.png`.
- **Key states:** public form empty → filled → submitting → success "Thanks! Your nomination is awaiting review." → rate-limited → tenant-disabled. Queue: empty → populated → approving (value required before save) → rejecting (optional reason).
- **Microcopy:** UX writing — public form must read as "thank a colleague," not corporate workflow.
- **A11y:** Poster prints short URL alongside QR (non-camera fallback); required-field indicators explicit; bulk actions keyboard-reachable.
- **Frontline:** Public nomination form is **CC-owned**, mobile-only. Approval gate is mandatory — never auto-publish.

---

## Epic: Profile & History

### RR-040 — Recognition tab on employee profile (P0-7) (size: M)
**Epic:** Profile & History
**Phase:** 1
**Goal:** Show received recognitions on employee profile, paginated 20/page, with proper visibility filtering at the serializer.

**Technical approach:**
- New tab in existing employee profile component.
- `GET /api/rr/employees/{id}/recognitions?type=received|sent&cursor=&limit=20`.
- Server-side: filter by viewer's relationship (self, manager, admin, peer); strip monetary amount fields at serializer for non-permitted viewers.
- Cards link into feed detail.

**Acceptance criteria:**
- GIVEN a peer (non-manager, non-admin) views recipient profile, WHEN amount field is fetched, THEN the JSON response excludes it (verified at API layer, not just UI).
- GIVEN admin views, WHEN amount is fetched, THEN it's present.
- GIVEN visibility=private, WHEN peer queries, THEN row is omitted entirely.

**Unit tests:**
- `test_peer_serializer_strips_amount()`
- `test_admin_serializer_includes_amount()`
- `test_private_recognitions_hidden_from_peers()`
- `test_pagination_stable()`

**Dependencies:** RR-010, RR-050 (for monetary field — feature-flagged)
**Out of scope:** sender's profile timeline ordering tweaks (handled in RR-041).

**Events fired:** `profile_recognition_tab_viewed` (direct M7 driver — fires when tab renders with data; suppress on skeleton).
**Key properties:** `viewer_employee_id`, `profile_employee_id`, `is_self_view`, `recognitions_in_view`. Drive M7 Profile-View Rate.
**Owner:** client.

**Design notes:** New "Recognition" tab inside the existing employee profile alongside Performance, Goals.
- **CC components:** Tabs (extend profile tabs with count badge), inner Tabs ("Received" / "Sent"), recognition Card list (sender Avatar, value chips, excerpt, timestamp, optional gift Badge), Badge (gift indicator — visibility-gated server-side), EmptyState (viewer-contextual CTA), Pagination ("Load more"), Skeleton (3-card placeholder).
- **Reference:** `screenshots/05_components/09_employee-recognition--ui-01.png`; `screenshots/05_components/09_employee-recognition--ui-02.png`.
- **Key states:** self-view (received + sent) → peer-view (no amounts, private hidden) → manager-view (full team scope) → admin-view (all incl. amounts) → empty per viewer type → loading skeleton → load-more spinner. Permission-denied is silent (private items simply absent).
- **Microcopy:** Empty states branch by viewer relationship — peer sees "Be the first to recognize {Name}"; manager sees gap reminder linking to RR-046.
- **A11y:** Tab focus indication; sender name is the card heading (h3); private content has visually-hidden "Private" label for SR clarity.

---

### RR-041 — Recognition detail view (size: S)
**Epic:** Profile & History
**Phase:** 1
**Goal:** Single recognition page accessible from feed, profile, and email deep links.

**Technical approach:**
- `GET /api/rr/recognitions/{id}` returns full record honoring visibility.
- React route + share-friendly OG tags.

**Acceptance criteria:**
- GIVEN unauthorized viewer, WHEN GET, THEN 404 (not 403, to avoid existence leak).
- GIVEN authorized viewer, WHEN GET, THEN full payload.

**Unit tests:**
- `test_detail_404_for_unauthorized()`
- `test_detail_full_for_authorized()`

**Dependencies:** RR-040
**Out of scope:** comment thread (RR-045).

**Tracking:** n/a — single-resource detail view; not a top-line metric. If deep-link arrival becomes interesting, fold into `entry_surface` upstream rather than minting a new event.

**Design notes:** Full-page detail at `/recognition/{id}` (CC-authenticated) — deep-link target from email/Slack/Teams.
- **CC components:** PageHeader (breadcrumb: Recognition feed > Detail), Card (max-width 720px, sender Avatar + value chips + message in larger type + recipient Avatar(s) + timestamp), AvatarStack (multi-recipient), Badge (gift, if visible), Button (tertiary "Share" — copy link), embedded ReactionBar (from RR-045).
- **Reference:** `screenshots/05_components/09_employee-recognition--ui-02.png`; `screenshots/08_video-frames/showcase-2026-frame-021.png`.
- **Key states:** authorized (full content) → unauthorized → **404, not 403** (existence privacy) → deleted → "This recognition is no longer available."
- **A11y:** Single H1 summarizing sender + value; Share button explicit aria-label. OG tags sanitized so share previews don't leak private message text.

---

### RR-045 — Reactions on recognitions (P1-5, reactions only — comments deferred) (size: M)
**Epic:** Profile & History
**Phase:** 1
**Goal:** Emoji reactions (PRD-specified set: thumbs up, applause, star). Notify sender + recipient.

**Technical approach:**
- `recognition_reaction` table (`recognition_id`, `actor_employee_id`, `reaction_type`, unique on those three).
- `POST /api/rr/recognitions/{id}/reactions {type}` toggles.
- Notification to sender and recipient (in-app, batched 5min window to avoid noise).

**Acceptance criteria:**
- GIVEN a reaction is added, WHEN re-added with same type, THEN it is removed (toggle).
- GIVEN 10 reactions arrive in 5min, WHEN notification window closes, THEN one batched notification is delivered (not 10).

**Unit tests:**
- `test_reaction_toggles()`
- `test_reaction_unique_per_actor_per_type()`
- `test_reaction_notifications_batched()`

**Dependencies:** RR-010, RR-030
**Out of scope:** comments (P1-5 partially deferred — see RR-100).

**Events fired:** `recognition_reacted` (one per reaction toggle-on; do NOT fire on toggle-off — that's a removal, not an engagement signal).
**Key properties:** `recognition_id`, `reactor_employee_id`, `reaction_type` (emoji|comment), `sender_relationship_to_reactor`. Engagement-loop signal feeding M9 DAU lift attribution.
**Owner:** server.

**Design notes:** Reactions row attached to every recognition card (feed, profile tab, detail view).
- **CC components:** Avatar tooltip (up to 5 names + "and N others"), Toast (first-own-reaction); 🆕 NEW: ReactionBar — horizontal emoji buttons (thumbs / applause / star) with count + actor popover. Reusable across feed/profile/detail.
- **Reference:** `screenshots/05_components/02_how-it-works--ui-01.png`; `screenshots/05_components/09_employee-recognition--ui-01.png`.
- **Key states:** none (faded add-affordance) → reactions present (counts; viewer's own highlighted) → hover count → reactor popover → toggle off (re-click removes) → optimistic update (instant; reconciled on server response).
- **A11y:** Each reaction button needs descriptive aria-label ("Applaud — 5 people"); both emoji and count readable; Enter/Space toggles; touch targets ≥44px; popover becomes bottom sheet on tap.

---

## Epic: Manager Insights (P1-4)

### RR-046 — "Not recognized in 30 days" manager view (size: M)
**Epic:** Manager Insights
**Phase:** 1
**Goal:** Manager sees a list of direct reports who haven't received a recognition in N days (default 30, admin-configurable).

**Technical approach:**
- `GET /api/rr/manager/recognition-gaps?threshold_days=30` returns direct reports + last-recognized date.
- Threshold stored in tenant settings.
- Weekly digest email (Monday 9am tenant TZ) batches the same data.

**Acceptance criteria:**
- GIVEN 8 reports, 3 with no recognition in 35 days, WHEN endpoint queried, THEN those 3 are returned.
- GIVEN tenant overrides threshold to 14, WHEN queried, THEN reports recognized 15 days ago are flagged.

**Unit tests:**
- `test_gap_threshold_respected()`
- `test_gap_uses_received_not_sent()`
- `test_digest_scheduled_for_tenant_tz()`

**Dependencies:** RR-010
**Out of scope:** Phase 3 Guusto `last-recognized` API integration (RR-090).

**Events fired:** `manager_insight_viewed` (fires when widget renders with data; suppress on skeleton).
**Key properties:** `manager_employee_id`, `tab=direct_reports`, `direct_reports_in_view`, `pending_approvals_in_view`. The "are managers actually using direct_reports?" signal — drives the decision on whether RR-092's Last-Recognized poll is earning its API cost.
**Owner:** client.

**Design notes:** Two surfaces — manager dashboard widget + weekly digest email. **Manager-facing.**
- **CC components (widget):** Card "Team members not recognized recently"; compact list (Avatar + name + role + last-recognized + days-since pill); Badge (red >threshold, yellow approaching); per-row Button (tertiary "Recognize" → opens RR-013 drawer prefilled); EmptyState (celebratory); InfoTooltip explaining threshold.
- **Email `rr_manager_recognition_gap`:** Subject "{N} of your team haven't been recognized in {threshold} days"; preview "Take a moment to acknowledge {first 2 names}…"; per-row "Recognize {name}" deep links; footer "Adjust threshold or unsubscribe in CC settings."
- **Reference:** `screenshots/05_components/04_milestones--ui-02.png` (upcoming-milestones panel pattern); `screenshots/01_marketing/06_reports-analytics--full.png`; `screenshots/08_video-frames/showcase-2026-frame-031.png` (manager insights).
- **Key states:** empty (celebratory tone) → 1–3 flagged (compact list) → 4+ (scrollable) → loading skeleton → click Recognize → drawer opens prefilled.
- **Microcopy:** UX writing critical — must read as helpful nudge, never punitive. "32 days since last recognition" not "ignored 32 days."
- **A11y:** Days-since pill needs text equivalent (not color-only); positive empty state; never single out reports as "neglected."
- **Open Q:** Direct vs. skip-level reports — PRD says direct only; confirm before build.

---

# Phase 2 — Monetary Rewards (Guusto integration)

**Premise:** Phase 2 unblocks behind feature flag `rr_monetary`. Every ticket below assumes the polling-only reality of the Guusto API.

---

## Epic: Budget Ledger (CC-native, two-phase reserve/commit)

### RR-050 — Budget ledger schema + double-entry model (size: M)
**Epic:** Budget Ledger
**Phase:** 2
**Goal:** P0-6: ledger-based budget that supports reserve/commit/release with no overdraft under concurrency.

**Technical approach:**
- Tables:
  - `budget_account` (`id`, `tenant_id`, `owner_employee_id` nullable for org pool, `period_start`, `period_end`, `currency`)
  - `budget_entry` (`id`, `account_id`, `kind` enum [`allocation`,`reserve`,`commit`,`release`,`adjustment`], `amount_cents` signed, `recognition_id` nullable, `idempotency_key` unique, `created_at`, `actor_id`)
- Available balance = `SUM(amount_cents) WHERE account_id=X` over `allocation` + `commit` + `adjustment`; reserved = `SUM` over `reserve` − `release` − `commit` (per reservation).
- Two-phase: on compose, write `reserve`. On Guusto order COMPLETED, swap to `commit` (single transaction: insert `commit`, insert offsetting `release` for the original reserve). On FAILED or rollback, write `release`.
- Concurrency: use `SELECT ... FOR UPDATE` on `budget_account` row before computing-and-writing. PostgreSQL advisory lock keyed on `account_id` as belt-and-suspenders.

**Acceptance criteria:**
- GIVEN account balance $100 and two concurrent $60 reserves, WHEN both submitted, THEN exactly one succeeds; the other receives `INSUFFICIENT_BALANCE`.
- GIVEN a reserve, WHEN order COMPLETED, THEN the reserve is released and a commit is written for the same amount in the same transaction.
- GIVEN a reserve, WHEN order FAILED, THEN reserve is released and account balance is unchanged from pre-reserve.
- GIVEN the same `idempotency_key` is submitted twice, WHEN both processed, THEN only one entry exists.

**Unit tests:**
- `test_concurrent_reserves_no_overdraft()` — uses real Postgres with two transactions.
- `test_commit_replaces_reserve_atomically()`
- `test_failed_order_releases_reserve()`
- `test_idempotency_key_unique()`
- `test_balance_query_excludes_released_reserves()`
- `test_advisory_lock_serializes_writers()`

**Dependencies:** RR-010
**Out of scope:** rollover/expiry logic (RR-053), admin allocation UI (RR-054).

**Tracking:** n/a — pure schema/concurrency ticket. Downstream services (RR-052) emit `budget_reserved`, `budget_committed`, `budget_released`. Schema must expose `manager_employee_id`, `program_id`, `fiscal_period_id`, `amount_cents` so those events can be populated without join gymnastics.

---

### RR-051 — Budget allocation API (admin) (size: S)
**Epic:** Budget Ledger
**Phase:** 2
**Goal:** Admin allocates budget to a manager (writes an `allocation` ledger entry). Idempotent; auditable.

**Technical approach:**
- `POST /api/rr/admin/budgets/{employee_id}/allocations {amount_cents, period_start, period_end, currency}`.
- Allocation creates the `budget_account` if absent.
- Audit-log entry per allocation.

**Acceptance criteria:**
- GIVEN a new allocation, WHEN POSTed, THEN balance increases by amount.
- GIVEN duplicate `idempotency_key`, WHEN POSTed twice, THEN one entry exists.
- GIVEN a non-admin actor, WHEN POSTed, THEN 403.

**Unit tests:**
- `test_allocation_writes_entry()`
- `test_allocation_idempotent()`
- `test_allocation_admin_only()`

**Dependencies:** RR-050, RR-085
**Out of scope:** bulk allocation upload (separate ticket if scope grows).

**Events fired:** `budget_allocated` (one per save — both create and modify).
**Key properties:** `actor_employee_id`, `target_type` (manager|program|workspace), `target_id`, `previous_amount_cents`, `new_amount_cents`, `currency`, `effective_period_id`. Drives M1 (eligible-managers denominator) and M8 (allocated total).
**Owner:** server.

---

### RR-052 — Budget reserve/commit/release service (size: M)
**Epic:** Budget Ledger
**Phase:** 2
**Goal:** Service API used by the order pipeline to do the three ledger operations safely.

**Technical approach:**
- Internal service `BudgetService` with `reserve(account, amount, recognition_id, key)`, `commit(reserve_id)`, `release(reserve_id, reason)`.
- All three operate inside a DB transaction with `SELECT FOR UPDATE`.
- Emits events `budget.reserved`, `budget.committed`, `budget.released` for the audit/observability subsystems.

**Acceptance criteria:**
- GIVEN a reserve fails balance check, WHEN called, THEN raises `InsufficientBalance` and writes nothing.
- GIVEN a commit on a non-existent reserve, WHEN called, THEN raises `ReserveNotFound`.
- GIVEN a double-commit, WHEN called twice, THEN second call is a no-op (idempotent).

**Unit tests:**
- `test_reserve_raises_on_insufficient_balance()`
- `test_commit_idempotent()`
- `test_release_idempotent()`
- `test_release_after_commit_raises()`

**Dependencies:** RR-050
**Out of scope:** API surface for senders (handled in RR-061).

**Events fired:** `budget_reserved` (compose-time hold), `budget_committed` (on COMPLETED), `budget_released` (on FAILED, reserve-expired, or cancelled).
**Key properties:** `recognition_id`, `request_id` (on commit/release tied to a Guusto order), `manager_employee_id`, `program_id`, `amount_cents`, `currency`, `fiscal_period_id`, plus `reason` enum on release (order_failed|reserve_expired|cancelled). All three events idempotent on `idempotency_key`.
**Owner:** server.

---

### RR-053 — Budget period rollover & expiry job (P1-7) (size: M)
**Epic:** Budget Ledger
**Phase:** 2
**Goal:** At period end, apply tenant-configured policy: forfeit / roll over (capped) / return to org pool. Idempotent.

**Technical approach:**
- Scheduled job per tenant at `period_end` boundary.
- Strategies: `FORFEIT` writes a negative `adjustment` zeroing remaining balance; `ROLLOVER_CAPPED` writes a new-period `allocation` capped at min(remaining, cap); `RETURN_TO_POOL` debits manager and credits org pool account.
- Job records a `period_close` audit row; re-running on the same period is a no-op.

**Acceptance criteria:**
- GIVEN a manager with $30 remaining and `FORFEIT` policy, WHEN period closes, THEN balance becomes $0 and a `period_close` row is recorded.
- GIVEN re-running the close job for the same period, WHEN executed, THEN no additional ledger writes.

**Unit tests:**
- `test_forfeit_zeros_balance()`
- `test_rollover_capped_at_limit()`
- `test_return_to_pool_credits_org_account()`
- `test_period_close_idempotent()`

**Dependencies:** RR-050
**Out of scope:** policy admin UI (RR-054).

**Events fired:** `budget_released` (one per remaining reservation forfeited or returned-to-pool; `reason=reserve_expired`). The `period_close` audit row lives in RR-085, not the analytics pipeline.
**Key properties:** `manager_employee_id`, `program_id`, `amount_cents`, `currency`, `reason`. Job idempotent on `(period_id, account_id)`.
**Owner:** server.

---

### RR-054 — Admin budget configuration UI (size: M)
**Epic:** Budget Ledger
**Phase:** 2
**Goal:** Admin sets org-level budget, allocation model, periods, rollover policy. PRD §6.3.

**Technical approach:**
- New section in R&R Settings: org budget, period type, rollover policy, IRS notice copy.
- Compliance copy "Reminder: gift card rewards are taxable…" rendered prominently per PRD §8.6.

**Acceptance criteria:**
- GIVEN admin saves a quarterly $100k budget, WHEN allocations sum to $100k, THEN no warning; WHEN sum exceeds, THEN warning banner.
- GIVEN admin changes rollover policy mid-period, WHEN saved, THEN policy applies at next period close, not retroactively.

**Unit tests (component + integration):**
- `test_budget_warning_when_allocations_exceed_org()`
- `test_rollover_policy_change_does_not_alter_current_period()`
- `test_irs_notice_visible()`

**Dependencies:** RR-051, RR-053
**Out of scope:** per-employee budget views (handled by manager dashboard).

**Events fired:** `dashboard_viewed` when admin lands on Budgets tab (`view_id=budget`); `budget_allocated` fires from RR-051 when allocations are saved through this UI.
**Key properties:** `actor_employee_id`, `user_role=hr_admin`, `view_id=budget`, `time_range`. Do not double-emit `budget_allocated` from the UI — it lives on the server commit.
**Owner:** client (for `dashboard_viewed`); server (for `budget_allocated`).

**Design notes:** R&R Settings → "Budgets" tab — multi-section: org summary, period config, allocation table, rollover policy, compliance copy. **Admin-facing.**
- **CC components:** PageHeader, Card (Org budget summary), ProgressIndicator (allocated/total — color-shift at 90% and 100%), Banner (over-allocation warning), Select (period type) + DatePicker (period start), DataTable (Manager allocations: manager, allocated, spent, remaining), Drawer (edit allocation: MoneyInput + currency, idempotency-safe save), RadioGroup (Forfeit / Roll over capped / Return to org pool — with per-option helper copy), Input (cap amount, conditional), CalloutBox (compliance, prominent), Toast, Modal (policy-change confirm).
- **Reference:** `screenshots/01_marketing/08_manager-budgets--full.png`; `screenshots/04_features/05_manager-budgets--full.png`; `screenshots/05_components/05_manager-budgets--ui-01.png`.
- **Key states:** initial setup (Stepper-guided empty state) → configured/under (green) → over-allocation (yellow Banner + ProgressIndicator overflow) → edit drawer → policy-change pending confirm → read-only for non-admin actors.
- **Microcopy:** Compliance callout copy is mandatory per PRD §8.6 — UX writing collab with legal: "Gift card rewards are taxable income. Track totals for W-2 reporting." Policy change confirm: "Applies at next period close, not retroactively."
- **A11y:** CalloutBox `role="note"` and in tab order; ProgressIndicator has accessible value text (not just color); destructive policy changes require explicit confirm.
- **Open Q:** CSV bulk allocation upload — defer to v2 unless requested.

---

## Epic: Guusto API Client

### RR-055 — Guusto HTTP client with auth + throttling (size: M)
**Epic:** Guusto API Client
**Phase:** 2
**Goal:** Single library wrapping all 8 endpoints. Bearer + `X-Workspace-id` injection, client-side rate limiting, structured error handling.

**Technical approach:**
- Library `guusto_client` with one method per endpoint.
- Token + workspace id resolved per-tenant via secret manager (RR-080); never logged.
- Token-bucket throttle, default 60 rpm/token; configurable per env. Throttle key: tenant.
- Retry policy: 429 → exponential backoff (1s, 2s, 4s, 8s, 16s, then DLQ); 5xx → 3 retries with jitter; 4xx → no retry except 429.
- Maps Guusto error taxonomy to typed exceptions: `InsufficientBalance`, `SettingsRestriction`, `InvalidAccount`, `InvalidField`, `InvalidFormat`, `SecurityError`.
- Emits metrics: `guusto.request.duration`, `guusto.request.status`, `guusto.throttle.deferred`.

**Acceptance criteria:**
- GIVEN 100 calls in 1 minute, WHEN throttle is 60rpm, THEN 40 are deferred (queued or delayed) and none drop.
- GIVEN 429 response, WHEN retried, THEN backoff observed and metric incremented.
- GIVEN secret rotation, WHEN new token loaded, THEN no in-flight request fails (graceful swap).

**Unit tests:**
- `test_bearer_and_workspace_headers_set()`
- `test_throttle_defers_excess()`
- `test_429_triggers_backoff()`
- `test_5xx_retries_three_times()`
- `test_4xx_no_retry()`
- `test_token_rotation_no_inflight_failure()`
- `test_error_taxonomy_mapping()`

**Dependencies:** RR-080
**Out of scope:** specific endpoint orchestration (per-endpoint tickets below).

**Events fired:** `guusto_api_call` (one row per outbound call — taxonomy mandates 100% sampling, call volume is bounded).
**Key properties:** `endpoint`, `http_status`, `latency_ms`, `was_429`, `request_id?`, `workspace_id`. Token, bearer, and full URL with query secrets MUST be redacted before emission. `was_429` is the canary that drives backoff tuning.
**Owner:** server.

---

### RR-056 — Locale & currency mapping layer (size: S)
**Epic:** Guusto API Client
**Phase:** 2
**Goal:** Map CC user locale to Guusto-supported language; reject unsupported currencies up front.

**Technical approach:**
- Mapping function:
  - `en_CA → EN_CA`, `en_US → EN_CA` (with annotation), `en_* → EN_CA`
  - `fr_CA → FR_CA`, `fr_* → FR_CA`
  - `es_MX → ES_MX`, `es_* → ES_MX`
  - everything else → `EN_CA` with a logged warning.
- Currency: only `CAD`, `USD` accepted; reject at compose with explicit error.
- Surface mapping decisions in admin settings preview ("US English recipients will receive Canadian English templates").

**Acceptance criteria:**
- GIVEN `en_US` recipient, WHEN order built, THEN language is `EN_CA` and a `locale.fallback` metric is emitted.
- GIVEN `EUR` requested, WHEN order built, THEN raises `UnsupportedCurrency`.

**Unit tests:**
- `test_en_us_maps_to_en_ca()`
- `test_unsupported_currency_raises()`
- `test_unknown_locale_falls_back_with_warning()`

**Dependencies:** RR-055
**Out of scope:** message-template translation (separate localization ticket).

**Tracking:** This layer doesn't fire its own events but **populates two critical properties** on `gift_order_submitted`: `recipient_locale` (EN_CA|FR_CA|ES_MX|fallback) and `locale_fallback_applied` (true when EN_US silently downgraded). Reliability dashboard alert fires when `locale_fallback_applied=true` rate exceeds 5%.
**Owner:** server (properties populated at order-build time, emitted by RR-060).

---

### RR-057 — Demo / Prod environment routing (size: XS)
**Epic:** Guusto API Client
**Phase:** 2
**Goal:** Per-tenant config of Guusto base URL (demo vs prod) and credentials selection.

**Technical approach:**
- Tenant setting `guusto_environment` ∈ {`demo`,`prod`}.
- Client factory selects URL + secret prefix accordingly.
- Refuses to start in `prod` if secrets are placeholders.

**Acceptance criteria:**
- GIVEN tenant set to demo, WHEN client created, THEN base URL is `api-demo.guusto.io`.
- GIVEN prod with placeholder secret, WHEN client created, THEN raises at startup.

**Unit tests:**
- `test_env_routing_demo_vs_prod()`
- `test_prod_placeholder_rejected()`

**Dependencies:** RR-055
**Out of scope:** per-region routing.

**Tracking:** n/a — config layer. Surface `environment` (demo|prod) on `guusto_api_call` so demo traffic can be filtered out of reliability dashboards. Property addition only; no new event.

---

## Epic: Order Submission

### RR-060 — `POST /api/v1/orders` order builder + batching (size: M)
**Epic:** Order Submission
**Phase:** 2
**Goal:** Build a Guusto order from one or more pending CC monetary recognitions, respecting the 1–20 items/call limit.

**Technical approach:**
- New table `monetary_attachment` (`id`, `recognition_id` FK, `cc_gift_id` UUID, `amount_cents`, `currency`, `recipient_email`, `recipient_phone`, `delivery_method` enum [`email`,`sms`,`qr`], `language`, `guusto_request_id` nullable, `guusto_status` enum mirroring API states, `created_at`).
- Service `OrderSubmissionService.submit(attachments[])`: chunks into ≤20, calls `POST /orders`, persists `guusto_request_id` per attachment.
- Pre-call: budget reserve (RR-052); on 2xx: keep reserve; on non-2xx: release and mark failed.
- Each item carries `cc_gift_id` in `externalReference` (verified by RR-004 hackathon spike).
- Idempotency: dedupe by `cc_gift_id` at the DB level (unique index).

**Acceptance criteria:**
- GIVEN 25 attachments, WHEN submitted, THEN 2 API calls (20 + 5) with no items lost.
- GIVEN Guusto returns 4xx (`InsufficientBalance`), WHEN handled, THEN all reserves in that batch are released and attachments marked `FAILED_PRECHECK`.
- GIVEN duplicate `cc_gift_id` from a retry, WHEN persistence attempted, THEN unique constraint prevents double order.

**Unit tests:**
- `test_chunks_into_max_20()`
- `test_4xx_releases_reserves()`
- `test_2xx_keeps_reserves_until_completion()`
- `test_duplicate_cc_gift_id_prevented()`
- `test_external_reference_round_trip()`

**Dependencies:** RR-050, RR-052, RR-055, RR-056
**Out of scope:** polling for completion (RR-065).

**Events fired:** `gift_order_submitted` (once per successful 2xx with `requestId` — fires before any polling). `guusto_api_call` (per outbound call — handled in RR-055). On 4xx pre-flight failure, **no** `gift_order_submitted` is emitted (the order didn't reach Guusto).
**Key properties:** `recognition_id`, `request_id`, `workspace_id`, `amount_cents`, `currency`, `recipient_count`, `delivery_method`, `recipient_locale`, `locale_fallback_applied`, `api_latency_ms`. `request_id` is the join key for ALL polled events downstream.
**Owner:** server.

---

### RR-061 — Send-flow: monetary attachment UI (size: M)
**Epic:** Send Flow with Monetary Attachment
**Phase:** 2
**Goal:** Compose form gains "Add a gift" with amount, delivery method, real-time balance.

**Technical approach:**
- Extends RR-013 with a panel: dollar input clamped to remaining balance; delivery method radio defaulting from recipient profile; "review and send" preview.
- Calls `POST /api/rr/monetary/preview` (RR-062) for live balance check before submit.
- On submit: same RR-012 endpoint with `monetary_attachment_request` populated; server fans out to RR-060.

**Acceptance criteria:**
- GIVEN balance $50 remaining, WHEN amount $51 typed, THEN input clamped and warning shown.
- GIVEN balance $0, WHEN gift toggled, THEN gift toggle disabled with tooltip.
- GIVEN successful send, WHEN response received, THEN feed shows the recognition with "gift pending" badge.

**Unit tests (component):**
- `test_amount_input_clamped_to_balance()`
- `test_gift_toggle_disabled_when_balance_zero()`
- `test_pending_badge_after_send()`

**Dependencies:** RR-013, RR-052, RR-060, RR-062
**Out of scope:** standalone (no-message) gift send (PRD requires message — confirmed in §6.2).

**Tracking:** Sets `monetary_intent=true` on `recognition_composed` (RR-013) and `monetary_attached=true` on `recognition_sent` (RR-012). Server-side commit triggers RR-060's `gift_order_submitted`. No new client events.
**Key properties:** `monetary_amount_cents`, `monetary_currency`, `delivery_method` flow into the send/order events.
**Owner:** client (property setters); server (event emission).

**Design notes:** Collapsible "Add a gift" panel at the bottom of the RR-013 compose drawer, above Send. Phase 2, behind `rr_monetary` flag.
- **CC components:** Toggle ("Attach a gift" — disabled when balance=$0 or flag off), MoneyInput (currency-prefixed, clamped to balance via RR-062, `inputmode="decimal"`), Chip ("$X remaining of $Y this period" — live-updates), RadioGroup (delivery: Email / SMS / QR — defaults from recipient profile; unavailable options grayed), CalloutBox (catalog transparency), CalloutBox (tax/W-2 compliance), Card (review preview), Button (label flips to "Send recognition + gift").
- **Reference:** `screenshots/05_components/04_milestones--ui-04.png` (catalog post-handoff); `screenshots/05_components/04_milestones--ui-05.png` (confirmation); `screenshots/05_components/09_employee-recognition--ui-04.png`; `screenshots/08_video-frames/showcase-2026-frame-022.png`; `screenshots/01_marketing/09_gift-cards--full.png`.
- **Key states:** toggle off (default) → toggle on, balance available → balance zero (disabled + tooltip + "Request budget" link) → amount > balance (clamp + inline "Capped at remaining $X") → multi-recipient (per-recipient × N total preview, warn over balance) → submitting → post-send "Gift pending" badge → gift-failed (recognition stands, retry CTA via RR-069).
- **Microcopy:** PRD §6.2 transparency callout: "Recipient will pick from Guusto's gift card catalog at redemption." Tax/W-2 callout per §8.6. UX writing collab — "gift" not "reward" (warmer).
- **A11y:** Live region announces balance changes; delivery radios labeled with channel + masked recipient hint ("Email — sarah@company.com"); MoneyInput has explicit currency prefix label.
- **Frontline:** SMS/QR delivery options here funnel to RR-035/RR-076 templates (CC-owned) and ultimately RR-075 redemption iframe (Guusto-owned).

---

### RR-062 — Real-time balance preview API (size: XS)
**Epic:** Send Flow
**Phase:** 2
**Goal:** Light endpoint for the compose UI to show current available balance.

**Technical approach:**
- `GET /api/rr/budget/me` returns `{available_cents, currency, period_end}` for the calling user's primary budget account. Cached 5s.

**Acceptance criteria:**
- GIVEN concurrent reserves, WHEN preview called, THEN values reflect uncommitted reserves.

**Unit tests:**
- `test_preview_excludes_released_reserves()`
- `test_preview_5s_cache()`

**Dependencies:** RR-050
**Out of scope:** historical balance.

**Tracking:** n/a — read-only balance read with 5s cache. Standard CC API logs only.

---

## Epic: Order Status Polling (job runner)

### RR-065 — Polling job runner: framework (size: L)
**Epic:** Order Status Polling
**Phase:** 2
**Goal:** First-class polling subsystem. Idempotent, observable, dead-letterable. This is the nervous system of the Guusto integration — get it right.

**Technical approach:**
- Workers consume a `polling_task` table (`id`, `kind`, `target_id`, `next_poll_at`, `attempts`, `state`, `last_response_status`, `next_backoff_seconds`, `tenant_id`).
- Kinds: `order_status` (RR-066), `order_details` (RR-067), `workspace_balance` (RR-070), `member_balance` (RR-071), `activity_feed` (RR-090), `last_recognized` (RR-091).
- Workers: dequeue oldest `next_poll_at <= now()`, take row-level lock, call handler, write next state.
- Backoff: per-task, starts at handler's default, grows exp on 5xx/429, resets on 2xx.
- Dead-letter after 20 attempts → `polling_dead_letter` table, alert fires.
- Metrics: `polling.task.duration`, `polling.task.deferred`, `polling.dlq.size`.

**Acceptance criteria:**
- GIVEN 10 workers and 1 task, WHEN dequeued, THEN exactly one worker processes it (row lock).
- GIVEN a handler raises, WHEN the loop catches, THEN attempts increment and `next_poll_at` is pushed by backoff.
- GIVEN 20 failed attempts, WHEN the next attempt is made, THEN it is moved to DLQ instead.
- GIVEN a DLQ row, WHEN admin "retry from DLQ" is invoked, THEN task is requeued at attempts=0.

**Unit tests:**
- `test_single_worker_processes_each_task()`
- `test_backoff_growth_on_failure()`
- `test_backoff_reset_on_success()`
- `test_dlq_after_20_attempts()`
- `test_admin_dlq_requeue()`
- `test_handler_exception_does_not_crash_loop()`

**Dependencies:** none
**Out of scope:** specific handlers (RR-066+).

**Tracking:** n/a — infrastructure. The framework is the substrate; per-handler tickets (RR-066/067/070/071/090/091) emit the polling-derived product events. Framework should expose `polling_lag_seconds` (now − created_at of the source `gift_order_submitted`) and `attempt_number` as standard fields available to handlers.

---

### RR-066 — Order status poller (`GET /orders/status/{requestId}`) (size: S)
**Epic:** Order Status Polling
**Phase:** 2
**Goal:** On `order_status` task, fetch lightweight status; on terminal, hand to RR-067 for full details + commit.

**Technical approach:**
- Initial poll 30s after order create; then 60s, 2m, 5m, capped at 15m.
- On `COMPLETED` → enqueue `order_details` task; mark `monetary_attachment.guusto_status = COMPLETED_PENDING_DETAILS`.
- On `FAILED` → release reserves (RR-052), mark `FAILED`, write audit, alert sender.
- On non-terminal → reschedule.

**Acceptance criteria:**
- GIVEN status `COMPLETED`, WHEN handled, THEN order_details task enqueued.
- GIVEN status `FAILED`, WHEN handled, THEN reserves released, sender notification queued.
- GIVEN status `WAITING_PROCESSING`, WHEN handled, THEN task rescheduled per cadence.
- GIVEN Guusto returns 429, WHEN polled, THEN backoff is observed per RR-055's policy and `was_429=true` is recorded; the reserve is NOT released.
- GIVEN the order has been polled 20 times without terminal state (~24h elapsed), WHEN the next attempt is made, THEN the task is moved to DLQ, an alert fires, and the reserve is held pending manual reconciliation (NOT auto-released — could double-spend if order completes after DLQ).
- GIVEN a malformed Guusto response (missing `status` field), WHEN handled, THEN the handler logs the raw response, increments attempts, and reschedules — does not crash the worker.

**Unit tests:**
- `test_completed_enqueues_details()`
- `test_failed_releases_reserve()`
- `test_failed_writes_audit_entry()`
- `test_non_terminal_reschedules()`
- `test_429_triggers_backoff_holds_reserve()`
- `test_dlq_holds_reserve_pending_manual()`
- `test_malformed_response_does_not_crash()`

**Dependencies:** RR-065, RR-067, RR-052, RR-085
**Out of scope:** detailed per-item status (handled in RR-067).

**Events fired:** `guusto_poll_attempt` (every poll tick — terminal or not), `gift_order_status_observed` (on terminal `COMPLETED` or `FAILED`; idempotent on `(request_id, terminal_status)`), `guusto_order_failed` (carved-out terminal-FAILED so reliability alerts can subscribe by name). `budget_released` fires via RR-052 on FAILED.
**Key properties:** `request_id`, `recognition_id`, `terminal_status`, `polling_lag_seconds` (critical — funnels must visualize on a 95p-lag delay), `poll_attempts`, `error_code` (required if FAILED).
**Owner:** poller.

---

### RR-067 — Order details fetch (`GET /orders/{requestId}`) + commit (size: M)
**Epic:** Order Status Polling
**Phase:** 2
**Goal:** Fetch full order details (paginated), reconcile per-item status, commit budget.

**Technical approach:**
- Fetch all pages; for each item, look up `monetary_attachment` by `cc_gift_id` (in `externalReference`).
- For each item: set per-item status, then commit budget reserve via RR-052.
- Idempotent: re-running on the same `requestId` yields no duplicate commits (RR-052 commit is idempotent).

**Acceptance criteria:**
- GIVEN a 25-item order, WHEN paginated 50/page, THEN single result page is processed in one task.
- GIVEN re-run, WHEN same data fetched, THEN no duplicate ledger entries.
- GIVEN an item lacks `cc_gift_id` in response, WHEN processed, THEN that item is logged to a reconciliation queue and the rest commit.
- GIVEN Guusto returns 429 mid-pagination, WHEN encountered, THEN the task is rescheduled with backoff and resumes at the last unfetched page (no double-commit on already-processed pages).
- GIVEN a malformed page payload, WHEN parsed, THEN the task is rescheduled (not marked successful) and the failure is logged with the offending page number.

**Unit tests:**
- `test_pagination_consumes_all_pages()`
- `test_commit_idempotent_on_rerun()`
- `test_missing_external_reference_logged()`
- `test_429_resumes_at_last_page()`
- `test_malformed_page_does_not_mark_success()`

**Dependencies:** RR-065, RR-052
**Out of scope:** redemption status (not retrievable via API; see RR-068).

**Events fired:** `budget_committed` fires via RR-052 on each per-item COMPLETED reconciled. `guusto_api_call` per outbound call. No new top-level events from this ticket.
**Key properties (on `budget_committed`):** `recognition_id`, `request_id`, `manager_employee_id`, `program_id`, `amount_cents`, `currency`, `fiscal_period_id`. Required granular for IRS rollups (taxonomy compliance section).
**Owner:** poller (orchestrator); server (RR-052 emits the commit event).

---

### RR-068 — Redemption status: explicit non-tracking + UI surface (size: S)
**Epic:** Order Status Polling
**Phase:** 2
**Goal:** PRD P0-5 assumes a redemption webhook. The Guusto API does not provide one. Make this absence first-class in the product instead of pretending we have data.

**Technical approach:**
- Introduce `monetary_attachment.redemption_status` enum with values `UNKNOWN_NO_API`, `MANUALLY_MARKED_REDEEMED` (admin tool only).
- UI shows "Delivered to recipient (redemption status not yet integrated)" instead of fake "redeemed."
- Admin tool to manually mark redeemed for audit / support cases.
- File RR-100 entry: contractual ask for webhook + redemption status endpoint.

**Acceptance criteria:**
- GIVEN an order COMPLETED, WHEN sender views recognition, THEN status reads "Delivered" not "Redeemed."
- GIVEN admin marks manually, WHEN saved, THEN audit row written and status changes.

**Unit tests:**
- `test_default_status_is_unknown_no_api()`
- `test_admin_manual_mark_audited()`

**Dependencies:** RR-067, RR-085
**Out of scope:** any inference of redemption from undocumented signals.

**Tracking:** Admin manual-mark action goes to RR-085 audit log only — **not** the analytics pipeline. The actual `gift_redeemed` event fires from RR-090 (Phase 3 activity-feed poller), keyed on `request_id`. This ticket explicitly creates no synthetic `gift_redeemed` events from undocumented signals — that boundary is product-load-bearing.
**Owner:** n/a — no product-event emission from this ticket.

**Design notes:** Honest status indicator on every monetary recognition + admin-only manual mark tool. Don't fake "redeemed" — Guusto has no webhook.
- **CC components:** Badge ("Delivered" green / "Manually marked redeemed" neutral / "Gift pending" yellow / "Failed" red), InfoTooltip (i icon → FAQ link), admin Button (tertiary "Mark as redeemed"), Modal (confirmation w/ optional reason Textarea), Toast.
- **Reference:** N/A — unique to CC, no Guusto reference.
- **Key states:** order COMPLETED → "Delivered"; admin manual mark → "Manually marked redeemed" (attribution tooltip); FAILED → red (RR-069); pending → yellow.
- **Microcopy:** Critical UX writing — must be honest without alarming. Badge tooltip: "Redemption status not yet integrated with Guusto." Admin modal: "This is for audit/support purposes only — Guusto does not push redemption events." Avoid the word "redeemed" by default.
- **A11y:** Badge text is the source of truth (not color); tooltip via aria-describedby; admin action requires explicit confirm.
- **Open Q:** FAQ link target — recommend CC-hosted help article for consistency over tenant-customizable.

---

### RR-069 — Sender failure notification + retry UX (size: S)
**Epic:** Order Status Polling
**Phase:** 2
**Goal:** When `FAILED`, notify sender with the Guusto error class and a "retry" or "remove gift" action.

**Technical approach:**
- In-app + email notification template `monetary_failed`.
- Retry creates a new `monetary_attachment` (new `cc_gift_id`); does not reuse the failed one.
- Error class displayed as user-friendly text: `InsufficientBalance` → "Your workspace Guusto account has insufficient funds — contact your admin," etc.

**Acceptance criteria:**
- GIVEN FAILED with `InsufficientBalance`, WHEN sender notified, THEN message references admin top-up.
- GIVEN retry, WHEN executed, THEN new request is independent (new cc_gift_id).

**Unit tests:**
- `test_error_message_localized_per_class()`
- `test_retry_creates_new_attachment()`

**Dependencies:** RR-066
**Out of scope:** admin-side workspace top-up UX (out — Guusto-portal-only).

**Tracking:** n/a — UI/notification surface; no new event. Notification dispatch reuses RR-030's plumbing. Retry creates a new `monetary_attachment` which produces a fresh `gift_order_submitted` (with new `recognition_id`-linked `request_id`).

**Design notes:** Two surfaces — sender notification (in-app + email `monetary_failed`) + inline retry affordance on the failed recognition card. The recognition stays intact regardless of gift outcome.
- **CC components:** NotificationItem; email Button (primary "Retry gift" / secondary "Remove gift, keep recognition"); on-card Banner (red — "Gift failed: {short reason}") + Button trio (Retry / Remove gift); Modal (Remove confirm).
- **Reference:** N/A — reuse CC's transactional-error template style.
- **Key states:** failure surfaced (banner + notification) → retry submitting (button loading, banner persists) → retry succeeded (brief "Gift sent" → standard pending) → retry failed again (banner updates; max-retry guidance after 3) → removed (banner cleared, subtle "Gift removed by sender" footnote on card).
- **Microcopy:** UX writing critical — translate Guusto error taxonomy to plain English. Never surface raw codes. Examples: `InsufficientBalance` → "Your workspace's Guusto account doesn't have enough funds. Contact your admin to top up." `InvalidAccount` → "Recipient could not be reached. Check the recipient's email or phone."
- **A11y:** Error banner `role="alert"`; no jargon strings like "InsufficientBalance" surfaced; Retry aria-label includes recipient name ("Retry gift to Sarah Martinez").
- **Open Q:** Confirm with finance whether "Remove gift" requires admin approval — per RR-052 release is automatic, so no extra gate by default.

---

## Epic: Balance Reconciliation

### RR-070 — Workspace balance sync poller (size: S)
**Epic:** Balance Reconciliation
**Phase:** 2
**Goal:** Sync the Guusto workspace balance every N minutes for admin visibility (and to gate sends if the workspace is out of funds).

**Technical approach:**
- Polling task `workspace_balance`, cadence 15min.
- Stores most recent balance per tenant + currency in `guusto_workspace_balance_cache`.
- If balance < threshold (admin-configurable), raise `LowWorkspaceBalance` alert; gate new sends with banner.

**Acceptance criteria:**
- GIVEN balance below threshold, WHEN admin loads R&R, THEN warning banner is shown.
- GIVEN balance recovers, WHEN polled next, THEN banner clears within 15min.
- GIVEN the balances endpoint returns 429 or 5xx, WHEN polling fails for >2 consecutive cycles (>30min), THEN cached balance is shown with a "data may be stale (last updated Xm ago)" indicator and a warn alert fires.
- GIVEN a malformed response, WHEN parsed, THEN the cache is NOT updated and the failure is recorded as a `guusto_api_call` event with non-2xx status.

**Unit tests:**
- `test_below_threshold_raises_alert()`
- `test_recovery_clears_alert()`
- `test_cache_updated_per_currency()`

**Dependencies:** RR-065
**Out of scope:** auto top-up (no API).

**Events fired:** `guusto_api_call` (per poll) and `guusto_poll_attempt` (per tick) only. Workspace-balance threshold alerts go to ops dashboards, not the product-event pipeline.
**Key properties (on `guusto_api_call`):** `endpoint=/balances/workspaces`, `http_status`, `was_429`, `latency_ms`, `workspace_id`.
**Owner:** poller.

---

### RR-071 — Member balance reconciliation (paginated) (size: S)
**Epic:** Balance Reconciliation
**Phase:** 2
**Goal:** Pull all member balances from Guusto once daily for sanity-check against CC's own ledger.

**Technical approach:**
- Daily polling task `member_balance` — paginated through `/balances/members`.
- Compare to CC ledger; flag deltas > $0.01 to a reconciliation report for HR admin.
- Page size 50 [ASSUMED max].

**Acceptance criteria:**
- GIVEN a delta exists, WHEN report generated, THEN admin sees a flagged row with both values.
- GIVEN pagination interrupted, WHEN job resumes, THEN it continues from last page.

**Unit tests:**
- `test_delta_flagged()`
- `test_pagination_resumable()`
- `test_zero_delta_not_flagged()`

**Dependencies:** RR-050, RR-065
**Out of scope:** auto-correction.

**Events fired:** `guusto_api_call` and `guusto_poll_attempt` per page. Reconciliation deltas surface in an admin report, not the analytics pipeline.
**Key properties:** standard reliability rollup props. **PII:** do not include member emails/phones in poll-attempt events even when the response payload contains them.
**Owner:** poller.

---

### RR-072 — Activity-feed poller for `gift_redeemed` (minimum viable, Phase 2) (size: M)
**Epic:** Balance Reconciliation
**Phase:** 2
**Goal:** Make M2 (Notification-to-Action) and M8 (Redemption rate) measurable at Phase 2 GA. Without this, redemption funnel is blind for ~2 quarters until Phase 3's full activity-feed integration (RR-090) lands. Scope: minimum viable redemption observability, not the full activity reporting epic.

**Pulled forward from Phase 3 by PM coverage review** — derisks Phase 2 launch metrics.

**Technical approach:**
- New polling task `redemption_activity` registered with the RR-065 job runner. Cadence: every 15 minutes (configurable; defaults from PRD §11 polling tier).
- Calls `GET /api/v1/reports/teams/activity` paginated. Filters server-side response for entries representing redemptions.
- Maintains a high-water mark per workspace: `last_observed_activity_id` + `last_observed_at`. Resumes from watermark on each run; never re-fetches.
- For each new redemption observed: look up local `request_id`/CC gift record, write a `gift_redeemed` row to the redemption table (idempotent on `(workspace_id, guusto_activity_id)`), and emit the `gift_redeemed` taxonomy event with `polling_lag_seconds`, `request_id`, `recipient_user_id` (or hashed external id for frontline), `amount_cents`, `currency`, `merchant_category` (if present in response — else null; revisit in Phase 3 RR-090).
- 429 holds the watermark and backs off (RR-065 framework handles).
- **[ASSUMED]** activity-feed entries include enough payload to identify a redemption event vs other activity types. If not — escalate to RR-100 and Guusto contact; fallback is to compare member-balance deltas (RR-071) against committed-but-not-redeemed gifts.

**Acceptance criteria:**
- GIVEN a recipient redeems a gift, WHEN the next poll runs, THEN `gift_redeemed` is emitted within polling_cadence + 60s and persisted to the redemption table.
- GIVEN the same activity entry appears across two poll cycles, WHEN the second is processed, THEN no duplicate `gift_redeemed` event is emitted (idempotent on `guusto_activity_id`).
- GIVEN Guusto returns 429 mid-pagination, WHEN the job retries, THEN the watermark is unchanged and resumption picks up from the same activity_id.
- GIVEN an activity entry can't be matched to a known `request_id`, WHEN observed, THEN it is logged to a "orphan redemptions" admin report (RR-087 channel) and does NOT fire `gift_redeemed`.
- GIVEN Phase 3 (RR-090) ships, WHEN the full activity-feed integration takes over, THEN this task can be disabled via feature flag without data loss (watermarks transferred).

**Unit tests:**
- `test_new_redemption_emits_gift_redeemed_once()`
- `test_duplicate_activity_id_does_not_re_emit()`
- `test_429_holds_watermark()`
- `test_orphan_activity_logged_not_emitted()`
- `test_polling_lag_seconds_property_set()`
- `test_high_water_mark_persists_across_restart()`

**Dependencies:** RR-050, RR-065, RR-067 (commit lifecycle), RR-087 (orphan report channel).
**Out of scope:** merchant category breakdown beyond "if present in response" (Phase 3 RR-090); reaction/comment activity (Phase 3); manual mark-redeemed (RR-068 explicitly forbids synthetic `gift_redeemed`).

**Tracking:** Emits `gift_redeemed` (taxonomy) with `polling_lag_seconds`, `request_id`, `amount_cents`, `currency`, `merchant_category`, `time_to_redemption_hours`. Resolves the prior coverage gap — M2 numerator and M8 measurable from Phase 2 GA. Idempotency keyed on `(workspace_id, guusto_activity_id)`. **Owner:** poller.

**Design notes:** Design: n/a — backend ticket. Orphan-redemption admin view is part of RR-087 observability scope.

---

## Epic: Recipient Redemption Handoff

### RR-075 — Redemption iframe shell (Phase 2 production) (size: M)
**Epic:** Recipient Redemption Handoff
**Phase:** 2
**Goal:** Production version of RR-001's hackathon shell: signed-token iframe to Guusto's redemption page.

**Technical approach:**
- Route `/r/redeem/<signed_token>` resolves a CC-issued JWT and renders iframe to Guusto redemption URL with the recipient's gift link.
- JWT carries `cc_gift_id`, `recipient_employee_id`, expires 30 days.
- Public route (no CC login required) to support frontline recipients.
- postMessage listener captures any Guusto signals (load complete, error) and logs them; **does not** drive business logic (no webhooks, can't trust the iframe).

**Acceptance criteria:**
- GIVEN a valid token, WHEN visited unauthenticated, THEN iframe renders with the recipient's redemption URL.
- GIVEN expired token, WHEN visited, THEN graceful expiry page.
- GIVEN tampered token, WHEN visited, THEN 404.

**Unit tests:**
- `test_jwt_validation_rejects_tampered()`
- `test_expired_token_rejected()`
- `test_iframe_src_hostname_allowlisted()`

**Dependencies:** RR-067
**Out of scope:** SSO into Guusto (Guusto-side configuration; tracked in RR-100).

**Events fired:** `gift_link_opened` (server-side at the signed-token endpoint, BEFORE iframe redirect — exactly the taxonomy's "frontline-safe" pattern). One event per first hit per token; dedupe within 24h.
**Key properties:** `recognition_id`, `request_id`, `recipient_employee_id`, `channel`, `delivered_to_opened_seconds`, `user_agent_class` (suppress `email_prefetch` from M2). postMessage signals from Guusto are logged for debug only — they do NOT drive product events (no webhook trust).
**Owner:** server.

---

### RR-076 — Recipient delivery email/SMS templates (monetary) (size: S)
**Epic:** Recipient Redemption Handoff
**Phase:** 2
**Goal:** CC-sent notification points the recipient at the redemption iframe (or directly at Guusto's link if `redemption_via_iframe=false`).

**Technical approach:**
- New templates `monetary_recognition_email`, `monetary_recognition_sms`, with merge fields: sender name, message, value tags, redemption link, expiry date.
- Per PRD §6.6 / §8.2: co-branded "recognized by [Company] · powered by Guusto".

**Acceptance criteria:**
- GIVEN a recognition with $25 attached, WHEN delivered, THEN email contains the redemption link and tax notice.
- GIVEN frontline recipient with SMS only, WHEN delivered, THEN SMS body ≤ 160 chars + short link.

**Unit tests:**
- `test_email_template_renders_all_merge_fields()`
- `test_sms_under_160_chars()`
- `test_co_brand_string_included()`

**Dependencies:** RR-035, RR-075
**Out of scope:** Guusto's own email (Guusto sends independently per PRD §6.6).

**Events fired:** `gift_link_delivered` (per channel attempt — provider 2xx confirms handoff; this is NOT a "recipient saw it" event).
**Key properties:** `recognition_id`, `request_id`, `recipient_employee_id`, `channel` (email|sms), `provider_message_id`, `recipient_segment`. **PII guardrail strict:** never include the recipient's email/phone on the event.
**Owner:** server.

---

## Epic: Tax Reporting & Compliance

### RR-078 — Per-employee annual reward export (W-2) (size: M)
**Epic:** Tax Reporting & Compliance
**Phase:** 2
**Goal:** PRD §8.6: surface total annual gift card value per employee for W-2 reporting. Required, not optional.

**Technical approach:**
- New report: `GET /api/rr/admin/reports/tax-totals?tax_year=2026`.
- Aggregates `monetary_attachment.amount_cents` per recipient where `guusto_status = COMPLETED` and `created_at` in tax year.
- CSV export: `employee_id`, `external_employee_id`, `full_name`, `total_amount_cents`, `currency`, `gift_count`.
- Written behind admin role; audit row on every export.
- Compliance notice ("Reminder: gift card rewards are taxable…") rendered above the export and embedded in the CSV header rows.

**Acceptance criteria:**
- GIVEN 2026 has 12 completed gifts to employee X totaling $300, WHEN exported, THEN row shows $300.
- GIVEN gifts in `FAILED` status, WHEN exported, THEN they are excluded.
- GIVEN export run, WHEN completed, THEN audit row records actor and tax year.

**Unit tests:**
- `test_export_only_includes_completed()`
- `test_export_aggregates_per_employee()`
- `test_export_writes_audit()`
- `test_export_admin_only()`

**Dependencies:** RR-067, RR-085
**Out of scope:** payroll system push (P2-4 deferred); 1099 reporting (vendors, not employees).

**Tracking:** n/a — admin export tool; row goes to RR-085 audit log on every export. Underlying aggregation reads from `budget_committed` events / `monetary_attachment.guusto_status=COMPLETED`. Do not re-emit anything on export.

---

### RR-079 — Compliance notices and DPA hooks (size: XS)
**Epic:** Tax Reporting & Compliance
**Phase:** 2
**Goal:** Surface required compliance text in admin and recipient flows.

**Technical approach:**
- Static compliance copy module loaded into admin budget page, recipient redemption page, and CSV exports.
- Tenant flag `eu_dpa_signed` gates monetary send for tenants with EU recipients (per PRD §8.6 DPA requirement).

**Acceptance criteria:**
- GIVEN tenant lacks EU DPA, WHEN admin tries to send to an EU recipient, THEN send blocked with policy message.

**Unit tests:**
- `test_eu_recipient_blocked_without_dpa()`
- `test_compliance_copy_present_on_admin_page()`

**Dependencies:** RR-061
**Out of scope:** DPA signing flow (legal/ops, not engineering).

**Tracking:** n/a — static copy + a tenant gate. EU-blocked-send case should set `compose_to_send_ms=null` and add `dpa_blocked=true` as a property on a server-emitted attempt event (or just rely on the absence of `recognition_sent`); do not invent a new event.

---

# Phase 3 — Integrations & Deep Analytics

(Epic-level only; tickets sized when phase is committed.)

### Epic: Activity Feed Sync — `GET /reports/teams/activity`
- RR-090 — Daily activity feed pull → CC analytics warehouse
- RR-091 — Reconcile Guusto activity vs CC events; flag drift

### Epic: Last-Recognized Insights
- RR-092 — Pull `/reports/members/last-recognized` to enrich RR-046 manager view with Guusto-side recognitions
- RR-093 — Manager dashboard widget: blended last-recognized signal

### Epic: HRIS Sync (employee directory ↔ employeeNumber)
- RR-095 — Map CC `employee_external_id` to Guusto `employeeNumber` at write time, with backfill job
- RR-096 — Onboarding/termination sync: ensure terminated employees cannot receive new gifts

### Epic: Webhook Negotiation & Migration
- RR-097 — When/if Guusto ships webhooks: signed receiver, replay protection, dual-source reconciliation against pollers
- RR-098 — Polling-to-webhook cutover plan (keep pollers as belt-and-suspenders for 60 days)

### Epic: Recognition × Performance Correlation Analytics (P2-5)
- RR-099 — Long-cycle analytics build on warehouse data (deferred — requires 2 quarters of data)

---

# Cross-cutting

---

### RR-080 — Secret manager integration for Guusto credentials (size: S)
**Epic:** Security & PII
**Phase:** cross-cutting
**Goal:** Externalize bearer token and `X-Workspace-id` per tenant per environment. Build a documented manual rotation runbook (no automated rotation per Guusto docs).

**Technical approach:**
- AWS Secrets Manager (or existing CC vault) keyed by `rr/guusto/<tenant>/<env>/{token,workspace_id}`.
- Cache TTL 5min in-process; force refresh on 401.
- Runbook: `/docs/rr/runbooks/rotate-guusto-token.md`.

**Acceptance criteria:**
- GIVEN a 401 from Guusto, WHEN encountered, THEN client refreshes secret and retries once.
- GIVEN logging anywhere in the request path, WHEN a token is present, THEN it is redacted to `***`.

**Unit tests:**
- `test_401_triggers_refresh_and_retry()`
- `test_token_redacted_in_logs()`
- `test_secret_cache_5min_ttl()`

**Dependencies:** none
**Out of scope:** automated rotation (Guusto docs provide no rotation API).

**Tracking:** n/a — pure infra/secret management. **Critical PII rule:** assert in tests that bearer tokens and `X-Workspace-id` values never appear in event payloads (`guusto_api_call.error_message_redacted` etc.). Workspace ID may appear as opaque identifier; tokens never.

---

### RR-085 — Append-only audit log for monetary actions (P0-8) (size: M)
**Epic:** Security & PII
**Phase:** cross-cutting
**Goal:** All monetary-side actions are logged immutably for 7 years.

**Technical approach:**
- `monetary_audit_log` table; INSERT-only; DB role for app users has no UPDATE/DELETE.
- Captures: actor, action, target, before/after if applicable, request IDs, timestamps, IP.
- Writes happen *outside* the main transaction (separate connection) to avoid coupling per PRD P0-8 considerations.
- Periodic snapshot to immutable storage (S3 Object Lock, 7-year retention).

**Acceptance criteria:**
- GIVEN an UPDATE attempt by app user, WHEN executed, THEN DB rejects.
- GIVEN a budget allocation, WHEN saved, THEN an audit row exists even if the allocation transaction rolled back? — No, per design: audit logs the *attempt and outcome*. Verify both cases.
- GIVEN snapshot job runs, WHEN complete, THEN S3 object exists with Object Lock enabled.

**Unit tests:**
- `test_app_user_cannot_update_audit_row()`
- `test_audit_records_failed_attempts()`
- `test_audit_records_successful_attempts()`
- `test_snapshot_creates_immutable_object()`

**Dependencies:** RR-050
**Out of scope:** non-monetary audit (existing CC audit covers).

**Tracking:** n/a — audit log is a separate compliance-grade store, NOT the analytics pipeline. Do not double-write audit rows as product events; analytics events covered by `budget_*` and `gift_order_*` taxonomy events. Audit and analytics serve different consumers and retention regimes.

---

### RR-086 — Recipient PII contracts (data minimization to Guusto) (size: S)
**Epic:** Security & PII
**Phase:** cross-cutting
**Goal:** Guusto receives only what is necessary for fulfillment: name, email/phone, amount, language. No employment data, no manager, no department.

**Technical approach:**
- Single serializer `GuustoOrderItemSerializer` with an explicit allowlist; assert on every test that no extra fields leak.

**Acceptance criteria:**
- GIVEN an order is built, WHEN inspected, THEN the payload contains only the allowlisted fields.

**Unit tests:**
- `test_payload_field_allowlist()` — fails if a new field is added without test update.
- `test_no_employment_metadata_in_payload()`

**Dependencies:** RR-060
**Out of scope:** Guusto-side data handling (contractual, not engineering).

**Tracking:** n/a — outbound data-minimization layer. Add a unit test asserting `gift_order_submitted` event payload also conforms to taxonomy allowlist (no employment metadata, no free-text recognition message bodies).

---

### RR-087 — Observability: polling health, 429 alerting, FAILED orders (size: M)
**Epic:** Observability
**Phase:** cross-cutting
**Goal:** A single dashboard the on-call sees first.

**Technical approach:**
- Datadog (or existing CC observability) dashboard with: polling task throughput, DLQ size by kind, p95 latency by Guusto endpoint, 429 rate, FAILED order count, audit log write rate.
- Alerts:
  - DLQ size > 0 for >10min → page
  - 429 rate > 1% over 5min → warn
  - FAILED order rate > 5% over 1h → warn
  - Polling worker heartbeat absent > 5min → page

**Acceptance criteria:**
- GIVEN a synthetic 429 storm, WHEN run in staging, THEN warn fires within 5min.
- GIVEN a synthetic DLQ insert, WHEN run, THEN page fires within 10min.

**Unit tests:** N/A (alert config is verified by synthetic drills, not unit tests). Capture drill results in `/docs/rr/runbooks/observability-drills.md`.

**Dependencies:** RR-055, RR-065
**Out of scope:** customer-facing status page.

**Tracking:** n/a — operational dashboard CONSUMES events (`guusto_api_call`, `guusto_poll_attempt`, `guusto_order_failed`, `gift_order_status_observed.polling_lag_seconds`). No new emission. Dashboard must visualize on the 95p `polling_lag_seconds` watermark per taxonomy guidance — never report on the trailing 30 minutes raw.

---

### RR-088 — Feature flags & rollout controls (size: S)
**Epic:** Feature Flags & Rollout
**Phase:** cross-cutting
**Goal:** Every Phase 1 and Phase 2 feature is gated. Rollout is per-tenant.

**Technical approach:**
- Flags: `rr_module`, `rr_compose`, `rr_feed`, `rr_slack`, `rr_teams`, `rr_frontline_sms`, `rr_monetary`, `rr_redemption_iframe`, `rr_admin_dashboard`, `rr_ai_drafting`.
- Per-tenant overrides; default off until tenant is enabled.
- Kill switch documented in runbook.

**Acceptance criteria:**
- GIVEN `rr_monetary` off for tenant, WHEN compose loads, THEN gift toggle is hidden and server returns 422 if requested.

**Unit tests:**
- `test_flag_off_hides_ui()`
- `test_flag_off_blocks_server()`
- `test_per_tenant_override_takes_precedence()`

**Dependencies:** none
**Out of scope:** A/B testing infrastructure.

**Tracking:** n/a — flag plumbing. **Add `feature_flags_active[]` as a standard property on every product event** so cohort analysis by flag is possible without joins. Implementation belongs in the analytics SDK wrapper, not in this ticket — but call out the contract here.

---

### RR-089 — Reporting / admin dashboard backbone (P0-9) (size: L)
**Epic:** Observability / Reporting
**Phase:** cross-cutting (lands in Phase 1, extended in Phase 2)
**Goal:** Admin-facing dashboard with the metrics PRD P0-9 requires + drill-down.

**Technical approach:**
- Read replica or materialized rollup tables (`rr_daily_summary`).
- Endpoints: `/api/rr/admin/dashboard?from=&to=&dept=`.
- Async CSV export job; polling endpoint for download URL.
- Freshness timestamp displayed.

**Acceptance criteria:**
- GIVEN 1 year of data, WHEN dashboard queried, THEN p95 ≤ 3s.
- GIVEN export of >10k rows, WHEN requested, THEN background job runs and download URL is returned within 60s.

**Unit tests:**
- `test_summary_excludes_deleted_recognitions()`
- `test_export_excludes_pii_fields()`
- `test_async_export_url_signed_short_lived()`

**Dependencies:** RR-010, RR-050 (extended once monetary lands)
**Out of scope:** correlation analytics (Phase 3).

**Events fired:** `dashboard_viewed` (canonical M5 driver — fires when first chart renders, NOT on skeleton).
**Key properties:** `actor_employee_id`, `user_role=hr_admin|exec|manager`, `view_id` (overview|coverage|equity|budget|reliability), `time_range`. Failure signal: M5 < 30% weekly admin engagement at day 60.
**Owner:** client.

---

### RR-101 — 48-hour post-recognition micro-survey (size: M)
**Epic:** Recognition Compose & Feed (cross-cutting with Frontline Delivery)
**Phase:** 1
**Goal:** Make M11 (recipient sentiment) measurable. Captures recipient response to recognition with a single-question micro-survey 48h after delivery. Without this ticket, M11 cannot be measured.

**Added by PM coverage review** to close the `post_recognition_survey_submitted` gap — the only event in TRACKING-PLAN.md not previously emitted by any ticket.

**Technical approach:**
- Schedule a survey send job 48h after `recognition_received` for each recipient. Idempotent on `(recognition_id, recipient_id)`.
- **In-app prompt** (CC-logged-in recipients): one-question NPS-style scale (1–5 or thumbs up/down — pick one in design review) shown once on next CC login within a 14-day window after scheduling. Dismissible. Re-prompt limit: 0 (single shot).
- **SMS recipients (frontline)** with no CC login: send a short SMS via the existing CC Twilio integration: "Quick question: how did receiving this recognition make you feel? Reply 1 (great) – 5 (didn't matter). Reply STOP to opt out." Server-side reply parser maps replies 1–5 to scores; ignores other content; honors STOP at the Twilio integration layer.
- **Personal-email recipients:** send a one-question email with five clickable signed-token links (one per score). Same 14-day window.
- All paths POST to a single internal endpoint `POST /api/rr/survey-responses` that emits `post_recognition_survey_submitted` with `score`, `recipient_segment` (logged_in|sms|personal_email), `channel`, `hours_since_received`, `recognition_id`.
- Response storage in CC; not sent to Guusto.
- Suppress survey if the recognition was deleted, the recipient opted out of recognition surveys (settings — defaulted on for logged-in users, opt-in for SMS), or the recipient has received >2 surveys in the last 30 days (cap to prevent fatigue).

**Acceptance criteria:**
- GIVEN a recognition delivered to a logged-in recipient, WHEN they next log in within 14 days after the 48h mark, THEN the prompt appears once and submitting it emits `post_recognition_survey_submitted`.
- GIVEN an SMS recipient replies "3" to the survey SMS, WHEN parsed, THEN a `post_recognition_survey_submitted` event fires with `score=3`, `recipient_segment=sms`.
- GIVEN an SMS reply contains text like "thanks 4!", WHEN parsed, THEN the parser extracts `score=4`. Replies with no clear score are dropped silently (logged for tuning, no event emitted).
- GIVEN STOP is received via SMS at any time, WHEN processed, THEN the recipient is opted out of all future R&R surveys.
- GIVEN a recipient already received 2 surveys in the trailing 30 days, WHEN a third would schedule, THEN it is suppressed (no send, no event).
- GIVEN a recognition is deleted before 48h, WHEN the survey job runs, THEN the survey is suppressed.
- GIVEN a personal-email recipient clicks a score link, WHEN the signed-token endpoint receives the request, THEN `post_recognition_survey_submitted` is emitted server-side with `recipient_segment=personal_email`.
- GIVEN duplicate scheduling (job re-queue), WHEN both run, THEN only one survey is sent and only one event ever fires per `(recognition_id, recipient_id)`.

**Unit tests:**
- `test_in_app_prompt_renders_once_only()`
- `test_sms_reply_parser_extracts_score_1_5()`
- `test_sms_reply_no_score_drops_silently()`
- `test_stop_keyword_opts_out()`
- `test_30_day_cap_suppresses_survey()`
- `test_deleted_recognition_suppresses_survey()`
- `test_email_score_link_signed_token_validates()`
- `test_idempotent_per_recognition_recipient_pair()`
- `test_event_properties_complete()`

**Dependencies:** RR-012 (recognition_received), RR-030 (in-app/email infra), RR-035 (SMS), RR-036 (signed-token endpoint pattern), RR-088 (feature flag — `rr_post_recognition_survey`).
**Out of scope:** open-ended comment field (Phase 2+); survey result analytics dashboard (consumed by existing CC analytics tools); per-tenant survey copy customization (v1 = default copy for all tenants).

**Tracking:** Emits `post_recognition_survey_submitted` (taxonomy) with `score` (1–5), `recipient_segment` (logged_in|sms|personal_email), `channel`, `hours_since_received`, `recognition_id`. Resolves the M11 measurability gap. Send-side telemetry: send attempts/failures roll up under `guusto_api_call`-style reliability events at the Twilio/email transport layers (already covered). **Owner:** server (in-app prompt: client emits via existing client-side event channel).

**Design notes:** In-app prompt — minimal, single-question, dismissible card surfaced inside CC's existing notification center pattern. Public score-link landing page (frontline path) shares the RR-036 signed-token pattern with a single confirmation state ("Thanks for the feedback").
- **CC components:** Card (in-app prompt), Button group (5 score buttons or thumbs Up/Down — finalize in design review), Toast (post-submit confirm), inline DismissButton. Reuse RR-036 page chrome for personal-email score-link landing.
- **Reference:** `screenshots/06_mobile/01_home-mobile.png` (frontline tone); CC's existing in-app survey patterns from performance-review NPS.
- **Key states:** prompt shown → submitting → confirmed (toast) → dismissed; expired (>14d window) state never renders. Email score-link: confirmed page only — no re-vote.
- **Microcopy:** UX writing collab — phrasing must be neutral and short. Avoid "rate this recognition" framing (rates the recognition, not the experience). One-line guidance: "How did receiving this make you feel?"
- **A11y:** keyboard-navigable button group; score buttons announce score value + label; dismissible via Esc.
- **Frontline:** SMS copy must be ≤160 chars including STOP guidance. Localize per RR-056 mapping (CAD/USD locales only in v1; EN_US falls back to EN_CA).
- **Open Q:** 1–5 scale vs. binary thumbs — finalize before instrumentation. Affects M11 measurement bands.

---

### RR-100 — Open Questions Tracker (size: XS, ongoing)
**Epic:** Open Questions Tracker
**Phase:** cross-cutting
**Goal:** A single living artifact tracking every assumption, gap, and contractual ask. Owner: eng lead. Reviewed weekly.

**Technical approach:**
- File `/docs/rr/open-questions.md`. Each row: ID, question, source (PRD section / API gap), owner, status, resolution.
- Bootstrap entries (must exist before Phase 2 starts):

| ID | Question / Gap | Source |
|---|---|---|
| OQ-1 | `employeeNumber` semantics: customer-supplied or Guusto-internal? | API audit §2.5 |
| OQ-2 | Guusto rate limits: confirm assumed 60rpm/token | API audit §2.5 |
| OQ-3 | Token rotation procedure | API audit §6.1 |
| OQ-4 | Webhook availability roadmap (PRD P0-5 contradicted by API) | PRD §6.4, §8.4 |
| OQ-5 | EN_US locale fallback acceptable for US recipients? | API audit |
| OQ-6 | Pagination max `size` for balances endpoints | API audit |
| OQ-7 | SSO into Guusto redemption page (PRD §8.7 hackathon question) | PRD §8.1 |
| OQ-8 | Merchant category in completion response (negotiable per PRD §6.4) | PRD §6.4 |
| OQ-9 | Order status state-machine validity (undocumented transitions) | API audit §4 |
| OQ-10 | DPA signed for EU recipients (gates monetary send) | PRD §8.6 |
| OQ-11 | Redemption status retrievability (P0-5 vs API reality) | PRD §7 |
| OQ-12 | `externalReference` field name in POST /orders (verify in hackathon) | RR-004 |

**Acceptance criteria:**
- GIVEN any new assumption marked `[ASSUMED]` in the codebase, WHEN added, THEN a corresponding OQ row exists in this file.

**Unit tests:** N/A (process artifact).

**Dependencies:** none — but blocks Phase 2 commercial signing.

**Tracking:** n/a — process artifact, not an instrumented surface.

---

## PRD requirement → ticket coverage matrix

| PRD ID | Requirement | Tickets |
|---|---|---|
| P0-1 | Social Recognition Send Flow | RR-010, RR-011, RR-012, RR-013 |
| P0-2 | Company Values Tagging | RR-010, RR-020 |
| P0-3 | In-App + Email Notifications | RR-030 |
| P0-4 | Guusto Monetary Reward Attachment | RR-050, RR-052, RR-055, RR-060, RR-061 |
| P0-5 | Gift Delivery + Redemption Tracking (webhook NOT available — see RR-068) | RR-066, RR-067, RR-068, RR-097 (future) |
| P0-6 | Budget Management — Real-Time, No Overdraft | RR-050, RR-051, RR-052, RR-054, RR-062 |
| P0-7 | Recognition on Employee Profile | RR-040, RR-041 |
| P0-8 | Audit Trail for Monetary Rewards | RR-085 |
| P0-9 | Basic Admin Reporting | RR-021, RR-089 |
| P0-10 | Admin Configuration | RR-020, RR-054, RR-088 |
| P1-1 | Slack/Teams notifications | RR-031, RR-033 |
| P1-2 | Send recognition from Slack | RR-032 |
| P1-3 | Recognition feed | RR-015, RR-016 |
| P1-4 | Manager participation gap view | RR-046, RR-092 |
| P1-5 | Comments + reactions | RR-045 (reactions only — comments deferred, see RR-100) |
| P1-6 | Values analytics | RR-021 |
| P1-7 | Budget rollover & expiry | RR-053, RR-054 |

**Total ticket count:** ~80 (Phase 0: 5, Phase 1: ~30, Phase 2: ~30, cross-cutting + Phase 3 epics: ~15).

---

## Open contradictions between PRD and API reality (resolved here)

1. **PRD P0-5 specifies a Guusto redemption webhook with HMAC verification.** The API audit confirms no webhooks exist. Resolution: RR-068 surfaces "delivery confirmed" without claiming "redeemed"; RR-097 will integrate webhooks if/when Guusto ships them. RR-100 OQ-4 / OQ-11 are the contractual asks.
2. **PRD §6.4 references receiving a redemption webhook.** Same resolution.
3. **PRD §8.7 hackathon goal "iframe SSO with no second login"** — the API audit confirms no documented SSO path. RR-100 OQ-7 carries this as a contractual ask; RR-001 / RR-075 fall back to public signed-token URLs in the meantime.
4. **PRD assumes EN_US is supported** (US-headquartered customers). API audit shows EN_CA, FR_CA, ES_MX only. RR-056 implements EN_US → EN_CA fallback with admin disclosure.
5. **PRD assumes Guusto rate limits will not constrain bulk sends.** API audit shows undocumented limits. RR-055 implements client-side throttle conservatively at 60rpm/token until confirmed.

---

## PM coverage review

**Reviewer:** ClearCompany PM, final pre-handoff pass.
**Date:** 2026-04-29.

### Tracking coverage (vs. 21-event taxonomy)

Covered by at least one ticket: `recognition_composed` (RR-013), `recognition_sent` (RR-012), `recognition_received` (RR-012), `recognition_reacted` (RR-045), `recognition_approval_requested` (RR-037), `recognition_approval_decided` (RR-037), `budget_reserved`/`budget_committed`/`budget_released` (RR-052/053), `budget_allocated` (RR-051/054), `approval_policy_updated` (RR-020), `manager_insight_viewed` (RR-021/046), `dashboard_viewed` (RR-021/054/089), `profile_recognition_tab_viewed` (RR-040), `gift_order_submitted` (RR-060), `gift_order_status_observed` (RR-066), `guusto_order_failed` (RR-066), `gift_link_delivered` (RR-030/035/076), `gift_link_opened` (RR-036/075), `guusto_api_call` (RR-055), `guusto_poll_attempt` (RR-066/070/071).

**Gaps:**
- **`post_recognition_survey_submitted`** — direct M11 driver. No ticket exists for the 48-hour micro-survey infrastructure (in-app + SMS reply handler). Stub: **RR-101 — 48-hour post-recognition micro-survey** (Phase 1, size: M). Server endpoint + in-app prompt + Twilio SMS reply parser; emits the event with `score`, `recipient_segment`, `channel`, `hours_since_received`. Without this, M11 cannot be measured.
- **`gift_redeemed`** — covered only as a Phase 3 epic stub (RR-090). Stub-level OK if Phase 2 launches without redemption funnel completeness, but the M2 numerator and M8 confirmation depend on it. Recommend pulling forward as **RR-072 — Activity-feed poller for gift_redeemed (minimum viable)** (Phase 2, size: M) so Phase 2 ships with redemption observability. ✅ **RESOLVED** — RR-072 added to Phase 2 (Balance Reconciliation epic).
- **`post_recognition_survey_submitted`** — direct M11 driver. ✅ **RESOLVED** — RR-101 added to Phase 1 (in-app + SMS reply parser + email score-link). M11 measurable from Phase 1 GA.
- **AI-draft events (RR-014):** invented `ai_draft_*` events flagged as outside taxonomy. ✅ **RESOLVED** — folded into `recognition_sent` properties (`ai_draft_used`, `ai_draft_outcome`, `ai_draft_show_count`). Taxonomy stays at 21 events.
- **RR-036 `recognition_viewed`:** invented event name. ✅ **RESOLVED** — renamed to `gift_link_opened` (taxonomy event), unit tests updated.

### Phase boundary check (vs. PRD §11)

- **Phase 0 (Hackathon):** 5 tickets (RR-001–005). Matches PRD §11 "1–2 days" scope.
- **Phase 1 (Social MVP):** ~22 tickets after RR-033 reassignment (excludes Teams). PRD §11 Phase 1 scope includes compose, feed, profile, manager dashboard, AI drafting, Slack, admin config — all covered. Frontline SMS/QR (RR-035–037) is aggressive vs. PRD (which lists SMS in Phase 2) but defensible because it's non-monetary; flag for scope review.
- **Phase 2 (Monetary):** ~20 tickets. Aligned with PRD's "8–10 weeks, 4–5 sprints" budget given M sizes.
- **Phase 3 (Integrations & Deep Analytics):** epic stubs only (RR-090–099) plus newly reassigned RR-033. Matches PRD §11 Phase 3.
- **Cross-cutting:** 7 tickets (RR-080–089, RR-100). Reasonable.

### Top 5 risks for the squad

1. **Polling cadence not validated against Guusto rate limits.** RR-055 assumes 60 rpm/token; Guusto has not confirmed. If real limit is lower, RR-066's 30s/60s/2m schedule breaks. Run a load test against demo before Phase 2 cutover; track via OQ-2.
2. **`gift_redeemed` blindness in Phase 2.** Without RR-072, M2 Notification-to-Action numerator is unmeasurable for ~2 quarters. Either pull forward or accept M2 reporting will lag Phase 2 launch.
3. **EN_US fallback may need legal copy review.** RR-056 silently downgrades to EN_CA. US tenants receive Canadian-English templates. Surface in admin UI per RR-056 design notes — but Legal should sign off on disclosure language before Phase 2 GA.
4. **RR-066 has no rollback path if polling fails for >24h.** Updated AC now holds reserve and DLQs, but there's no automated recovery — requires manual ops intervention. Add a runbook ticket alongside RR-087 observability work.
5. **AI-draft events (`ai_draft_*`) are outside the 21-event taxonomy.** RR-014 invents three events. Either fold outcome into a property on `recognition_sent` (recommended) or formally extend the taxonomy. Resolve before instrumentation begins or analytics inherits unaccounted events.

### Cut list (defer if Phase 1 scope tightens)

- **RR-014 (AI drafting assist, M):** opt-in feature; PRD lists as Phase 1 but it's not on the critical path for M3/M4 metrics. Defer to Phase 2 for ~2 weeks of squad capacity.
- **RR-033 (Teams card, M):** already moved to Phase 3 per PRD.
- **RR-037 (QR-code nomination, S):** depends on physical poster distribution, gated on at least one frontline pilot customer requesting it. Defer until pilot signal.
- **RR-053 (Budget rollover & expiry, M):** Phase 2 ticket; if Phase 2 scope tightens, ship with `FORFEIT` only and defer `ROLLOVER_CAPPED`/`RETURN_TO_POOL` to Phase 2.5.
- **RR-079 (Compliance notices and DPA hooks, XS):** keep the IRS notice (mandatory per PRD §8.6) but defer the EU DPA gate until a pilot customer actually has EU recipients.
