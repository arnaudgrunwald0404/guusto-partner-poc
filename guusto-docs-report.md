# Guusto API Documentation Report

**URL:** https://docs.guusto.com/
**Date:** April 29, 2026
**Scope:** Full site audit — structure, content quality, coverage gaps, and engineering recommendations

---

## 1. Site Overview

The Guusto docs site is a focused, API-only reference for integrating with Guusto's employee recognition platform. It is OpenAPI-driven and covers three resource groups across 8 endpoints. The site is intentionally minimal — no SDK guides, no webhooks, no changelog.

**Navigation structure:**

| Section | Pages |
|---|---|
| Introduction | Welcome, Getting Started |
| Authentication | Environments |
| API Reference | Gifts API (overview), Account Budget, Order Gift, Reports |
| Support | Response Codes & Errors, Contact Us |

---

## 2. API Surface Covered

### Account Budget (3 endpoints)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/balances/workspaces/currencies/{currency}` | Workspace balance |
| `GET` | `/api/v1/balances/members/{employeeNumber}/currencies/{currency}` | Single employee balance |
| `GET` | `/api/v1/balances/members/currencies/{currency}` | All employee balances (paginated) |

### Order Gift (3 endpoints)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/orders` | Create gift order (1–20 items) |
| `GET` | `/api/v1/orders/status/{requestId}` | Poll order status |
| `GET` | `/api/v1/orders/{requestId}` | Full order details (paginated) |

### Reports (2 endpoints)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/reports/teams/activity` | Workspace activity feed (paginated) |
| `GET` | `/api/v1/reports/members/last-recognized` | Manager insights — last recognition dates |

**Environments documented:** Mock (`docs.guusto.com/_mock/...`), Demo (`api-demo.guusto.io`), Production (`api.guusto.com`)

---

## 3. Strengths

**Consistent curl examples** — Every endpoint includes a working `curl` snippet with real-looking values (`X-Workspace-id: 444`, bearer token placeholder). This is the single most valuable thing in the docs.

**Structured error taxonomy** — The HTTP Responses page distinguishes general errors (`invalid_field`, `invalid_format`, `security_error`) from order-specific ones (`insufficient_balance`, `settings_restriction`, `invalid_account`). This is genuinely useful for integration error handling.

**Three-environment setup** — Documenting mock, demo, and production URLs with explicit callouts to use demo before production is a good developer onboarding pattern.

**Pagination consistency** — All paginated endpoints use the same `page`/`size`/`totalElements`/`totalPages` response envelope, and this is shown in each schema. Consistency here reduces cognitive load.

**Concise scope** — The docs don't try to be everything. They cover what the API does and nothing else, which avoids the common failure mode of stale over-documentation.

---

## 4. Coverage Gaps

### Critical

**Authentication is almost entirely absent.** The Getting Started page says "get your API token" but there is no page explaining _how_. There is no documentation on:
- Where to generate API tokens (admin console? API call?)
- Token format (is it a JWT? Opaque string?)
- How to pass the token — `Authorization: Bearer <token>` appears in curl examples but is never formally stated
- Token expiry, rotation, or revocation

**`X-Workspace-id` is undocumented.** This required header appears on every endpoint. There is no explanation of what it is, where to find it, or whether it differs between environments. A developer blocked on "401 Unauthorized" with the right token but wrong workspace ID has nowhere to look.

**Rate limiting is completely missing.** The Getting Started page references "request throttling limitations" as something covered in the docs — but there is no such page. No developer can plan a bulk integration without knowing the rate limit.

---

### Significant

**Order status lifecycle is not explained.** The `requestStatus` field returns `ACCEPTED`, `WAITING_PROCESSING`, `PROCESSING_IN_PROGRESS`, `COMPLETED`, or `FAILED`. There is no state machine diagram or prose explaining valid transitions, terminal states, retry behavior, or what to do on `FAILED`. The `orderStep` field has a similar problem — it mentions `PENDING through completion` but lists no values.

**Currency and language support are understated.** Only `CAD` and `USD` are supported. Only `ES_MX`, `FR_CA`, and `EN_CA` are available for language. These limitations have business-level implications (a US company sending USD gifts to recipients in Europe will silently not work). There is no explanation of why the language list omits `EN_US`.

**Pagination usage is never explained.** Three endpoints support pagination and return `page`/`size`/`totalPages`, but there is no explanation of how to iterate — what zero-indexed vs one-indexed page numbers mean, or what `size` limits apply (the Reports endpoint caps at 50, but Account Budget does not document a cap).

**`employeeNumber` semantics are unclear.** It appears as both a path parameter and a response field, is described only as "employee identifier," and it is never stated whether this is an internal Guusto ID or a customer-supplied identifier (e.g., HR system ID). This matters for the `Last Recognized` report endpoint where `request.employeeNumber` is _required_.

---

### Minor

**No changelog or versioning policy.** The URL prefix `/version/` implies versioning but it's unexplained. There is no changelog, no deprecation policy, and no statement about backward compatibility guarantees.

**No webhook / async notification docs.** Orders are asynchronous (`requestStatus: PROCESSING_IN_PROGRESS`) but polling is the only documented pattern. There is no mention of whether webhooks exist for order completion events.

**No SDK or library examples.** All examples are `curl` only. No Python, Node.js, or other SDK snippets exist, which raises the time-to-first-request for developers not working in shell environments.

**Contact Us page adds no value.** The feedback/support page exists but provides no SLA, ticket system link, or even an email address visible in the docs.

---

## 5. Content Quality Assessment

| Dimension | Score | Notes |
|---|---|---|
| **Accuracy** | ✅ Good | Schemas and examples appear internally consistent |
| **Completeness** | ⚠️ Partial | 3 critical omissions (auth, rate limits, order lifecycle) |
| **Clarity** | ✅ Good | Writing is concise; no jargon overload |
| **Navigability** | ⚠️ Partial | Flat structure works now; won't scale |
| **Examples** | ✅ Good | Curl examples are present and realistic |
| **Error guidance** | ✅ Good | Error taxonomy is the strongest section |
| **Onboarding flow** | ❌ Weak | Getting started references pages that don't exist |

---

## 6. Engineering Recommendations

### Immediate (blocks integration)

1. **Write an Authentication page.** Cover: token generation UI location, header format (`Authorization: Bearer`), token lifetime, and how to rotate. This single page will eliminate the majority of support escalations.

2. **Document `X-Workspace-id`.** Add a callout box to the authentication page or environment page: what it is, where to find it per environment, and whether it changes between demo and production.

3. **Add a Rate Limits page.** The Getting Started page already promises this page exists. Publish it. At minimum: requests per minute per token, burst behavior, and the `429` response body format.

### Short-term (improves integration quality)

4. **Add an order lifecycle diagram.** A simple state machine for `requestStatus` transitions (and what `orderStep` values map to) would prevent polling bugs and unhandled `FAILED` states.

5. **Clarify `employeeNumber`.** Add a note on whether it's Guusto-internal or customer-supplied, and whether it must match a value in the Guusto workspace user directory.

6. **Document pagination behavior.** Add a shared "Pagination" section explaining zero- vs one-indexing, max `size` per endpoint, and a code pattern for full iteration.

7. **Add a Supported Currencies & Languages page.** Explain why `EN_US` is absent, whether more currencies are planned, and what happens when a recipient's locale doesn't match an available language.

### Long-term (developer experience)

8. **Add at least one non-curl example per endpoint.** A Node.js `fetch` or Python `requests` snippet cuts time-to-first-call for the majority of integrators.

9. **Introduce a changelog.** Even a minimal "Last updated" date per page builds trust and signals that docs are maintained.

10. **Document webhook support (or confirm it doesn't exist).** If async order completion events are available, document them. If not, add a note saying polling is the only supported pattern — this prevents developers from asking support.

11. **Add a "Common Integration Patterns" guide.** A short guide covering the full flow — check budget → send gift → poll for completion → report on results — would tie the individual endpoint pages together and reduce integration mistakes.

---

## 7. Summary

The Guusto API documentation is clean, accurate, and well-organized for its current size. The curl examples and error taxonomy are genuine strengths. The critical weakness is the onboarding gap: authentication, workspace identification, and rate limiting are either missing or incomplete, which means developers will get stuck before they make their first successful API call. Fixing those three items would dramatically reduce support load and time-to-integration. The remaining recommendations are incremental quality improvements that would make the docs best-in-class for a focused B2B API reference.
