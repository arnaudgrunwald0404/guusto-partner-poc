# Design Handoff — RR-H4 & RR-H6
**Project:** Rewards & Recognition — Gong AI POC (Phase 0 Hackathon)  
**Stack:** React / TypeScript  
**Feature flag:** `rr_hackathon` — gates every surface in this doc  
**Scope:** Hackathon quality. Pixel-perfect is not the goal; functional, on-brand, and buildable in one day is.

---

## Spec 1 — RR-H4: Manager Approval Email + Confirmation Page

### Overview
When the AI classifier detects exceptional customer praise about a CC employee, the employee's manager receives an email. The email contains the evidence quote, a drafted recognition message, and three CTAs: Approve, Edit, Dismiss. Each CTA is a signed URL — clicking it opens a static confirmation page in the browser. No CC login required.

There are two deliverables:
1. **The email template** (HTML, Outlook-safe)
2. **Four confirmation page states** (approve / dismiss / expired / already-decided)

---

## Deliverable 1A — Approval Email

### Email client constraints
- Inline styles only. No `<style>` block (Gmail clips it; Outlook ignores it).
- No `<button>` elements. CTAs must be `<a>` tags styled to look like buttons.
- Max width: **600px** centered. Renders fine in preview panes at 320px.
- No web fonts. Use: `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif`.
- Images: avoid (blocked by default in Outlook). Use text + background colors only.
- Use `role="presentation"` on layout tables if using table-based layout (Outlook requires tables for reliable column rendering).

### Layout — 3 sections

```
┌─────────────────────────────────────────────────┐
│  [CC Logo]                          600px wide   │
│  Header bar — brand color bg                     │
├─────────────────────────────────────────────────┤
│  SECTION 1 — What happened                       │
│  Headline + blockquote (customer quote)          │
├─────────────────────────────────────────────────┤
│  SECTION 2 — Proposed recognition                │
│  Drafted message + reward badge ($25 reward)     │
├─────────────────────────────────────────────────┤
│  SECTION 3 — CTAs                                │
│  [Approve & Send]  [Edit first]  [Dismiss]       │
├─────────────────────────────────────────────────┤
│  Footer — opt-out / legal                        │
└─────────────────────────────────────────────────┘
```

### Design tokens (map to CC's actual token names)

| Token | Suggested value | Usage |
|---|---|---|
| `color-primary` | CC brand primary (teal or blue) | Header bar bg, Approve CTA bg |
| `color-text-primary` | `#1a1a2e` or CC equivalent | Body text |
| `color-text-secondary` | `#6b7280` | Section labels, footer |
| `color-surface` | `#ffffff` | Email body bg |
| `color-border` | `#e5e7eb` | Section dividers |
| `color-quote-bg` | `#f3f4f6` | Blockquote background |
| `color-success` | `#059669` | Approve button |
| `color-neutral` | `#374151` | Edit button |
| `color-danger-muted` | `#6b7280` | Dismiss link (text link, not button) |
| `spacing-sm` | 12px | Inner padding tight |
| `spacing-md` | 24px | Section padding |
| `spacing-lg` | 40px | Section gaps |

### Section-by-section spec

#### Header bar
- Background: `color-primary`
- Height: 56px
- Content: CC logo (PNG, white version), left-aligned, 24px from left edge
- Alt text: `"ClearCompany"`
- No headline text in header — keeps it clean

#### Section 1 — What happened
- Top padding: 32px. Side padding: 32px.
- **Label** (all-caps, 11px, `color-text-secondary`, letter-spacing 0.08em):  
  `A CUSTOMER SAID SOMETHING EXCEPTIONAL`
- **Headline** (22px, weight 600, `color-text-primary`, margin-top: 8px):  
  `{{employee_first_name}} just got a rave review`
- **Blockquote** (margin-top: 16px):
  - Background: `color-quote-bg` (`#f3f4f6`)
  - Border-left: 3px solid `color-primary`
  - Padding: 16px 20px
  - Font: 16px, italic, `color-text-primary`
  - Content: `"{{evidence_quote}}"`
  - Below quote (10px margin-top): 12px, `color-text-secondary` — `From a recent Gong call`

#### Section 2 — Proposed recognition
- Top border: 1px solid `color-border`
- Padding: 32px
- **Label** (same style as Section 1 label):  
  `PROPOSED RECOGNITION`
- **Message box** (margin-top: 12px):
  - Background: `#ffffff`
  - Border: 1px solid `color-border`
  - Border-radius: 8px
  - Padding: 16px
  - Font: 15px, `color-text-primary`, line-height 1.6
  - Content: `"{{recognition_draft}}"`
- **Reward badge** (margin-top: 16px, inline-block):
  - Background: `#ecfdf5` (light green)
  - Border: 1px solid `#6ee7b7`
  - Border-radius: 20px
  - Padding: 6px 14px
  - Font: 13px, weight 600, `#065f46`
  - Content: `🎁  $25 reward — sent to {{employee_first_name}}'s email`
  - Note: emoji renders in all modern email clients. If Outlook concern, replace with `[Gift]` text.

#### Section 3 — CTAs
- Top border: 1px solid `color-border`
- Padding: 32px
- **Subhead** (15px, `color-text-secondary`, margin-bottom: 20px):  
  `This takes 10 seconds. One click and {{employee_first_name}} gets recognized.`

**CTA layout — stacked vertically** (more reliable than side-by-side in Outlook):

**Approve & Send** (primary):
- `<a>` tag, display: block
- Background: `color-success` (`#059669`)
- Color: `#ffffff`
- Font: 16px, weight 600
- Padding: 14px 24px
- Border-radius: 6px
- Text-align: center
- Text: `Approve & Send — $25 reward`
- href: `{{approve_url}}`
- Margin-bottom: 12px

**Edit first** (secondary):
- Same `<a>` structure
- Background: `#ffffff`
- Border: 2px solid `color-border`
- Color: `color-text-primary`
- Font: 15px, weight 500
- Padding: 12px 24px
- Text: `Edit the message first`
- href: `{{edit_url}}`
- Margin-bottom: 12px

**Dismiss** (tertiary — text link only, no button chrome):
- `<a>` tag, display: block
- Color: `color-text-secondary`
- Font: 14px, no underline (underline on hover — not applicable in email)
- Text-align: center
- Text: `Dismiss — no recognition needed`
- href: `{{dismiss_url}}`

**Expiry note** below CTAs (margin-top: 16px):
- Font: 12px, `color-text-secondary`, text-align: center
- Content: `These links expire in 48 hours. After that, no reward will be sent.`

#### Footer
- Background: `#f9fafb`
- Padding: 24px 32px
- Border-top: 1px solid `color-border`
- Font: 12px, `color-text-secondary`, line-height 1.6
- Content:
  ```
  You're receiving this because you manage {{employee_first_name}} in ClearCompany.
  This recognition was suggested by ClearCompany's AI based on a Gong call transcript.
  You are in control — no reward fires without your approval.
  
  ClearCompany · [Company Address] · Unsubscribe from R&R manager alerts
  ```
- `Unsubscribe` is an `<a>` link. Required for CAN-SPAM.

### Complete copy strings

| Variable | Example value |
|---|---|
| `{{employee_first_name}}` | `John` |
| `{{evidence_quote}}` | `He's the best support engineer we've ever worked with.` |
| `{{recognition_draft}}` | `John — a customer told us today: "He's the best support engineer we've ever worked with." That kind of feedback is rare and it matters. Thank you.` |
| `{{approve_url}}` | `https://app.clearcompany.com/api/rr/approve?token=abc123` |
| `{{edit_url}}` | `https://app.clearcompany.com/rr/edit-recognition?token=abc123` |
| `{{dismiss_url}}` | `https://app.clearcompany.com/api/rr/dismiss?token=abc123` |

### Accessibility (email)
- All images have `alt` text
- CTA `<a>` tags have descriptive text (not "click here")
- Sufficient color contrast on all text/bg combinations (WCAG AA)
- Plain-text fallback required in the email send (multipart/alternative) — BE owns this

### Open questions for the engineer (RR-H4 email)
1. **CC logo asset** — what's the URL or file path for the white-on-brand-color logo variant? Or use the dark logo on the white header?
2. **Email infra** — which CC service sends transactional email? Does it support HTML templates with variable substitution, or does the BE need to interpolate before calling the mailer?
3. **Unsubscribe link** — does CC have a preference center for R&R manager alerts, or is this a mailto?
4. **From name/address** — `ClearCompany Recognition <recognition@clearcompany.com>`? Confirm with ops.

---

## Deliverable 1B — Confirmation Page (4 states)

### Overview
Static HTML page served by CC's backend at `/rr/confirm`. No CC navigation, no login wall. Renders the result of clicking a CTA link from the approval email. Minimal chrome — logo + centered card.

### Layout
```
┌────────────────────────────────────┐
│  CC logo (centered, top: 32px)     │
│                                    │
│  ┌──────────────────────────────┐  │
│  │                              │  │
│  │     [Icon]                   │  │
│  │     [Headline]               │  │
│  │     [Body copy]              │  │
│  │                              │  │
│  └──────────────────────────────┘  │
│                                    │
│  [footer — via ClearCompany]       │
└────────────────────────────────────┘
```
- Page background: `#f9fafb`
- Card: white, border-radius 12px, max-width 480px, centered, padding 40px, box-shadow `0 1px 3px rgba(0,0,0,0.1)`
- CC logo: centered, 120px wide, margin-bottom 32px
- Not responsive beyond "works on mobile" — single column, max-width 480px is fine on any screen

### State 1 — Approved ✓
- **Icon:** ✅ (or a green checkmark SVG, 48px)
- **Headline** (24px, weight 700, `color-text-primary`):  
  `Recognition sent to John`
- **Body** (16px, `color-text-secondary`, line-height 1.6, margin-top 12px):  
  `John will receive a $25 reward in their inbox shortly. The recognition has been added to their ClearCompany profile.`
- **Secondary line** (14px, `color-text-secondary`, margin-top 16px):  
  `You can close this tab.`
- No CTA button needed.

### State 2 — Dismissed
- **Icon:** 🙈 or a neutral grey circle with an X, 48px
- **Headline:**  
  `Got it — no recognition sent`
- **Body:**  
  `No reward was sent to John. Nothing has been recorded.`
- **Secondary line:**  
  `You can close this tab.`

### State 3 — Expired (token > 48h)
- HTTP status: 410 Gone (but still render the page — don't let it be a raw 410 error page)
- **Icon:** ⏰ or a clock SVG in grey, 48px
- **Headline:**  
  `This link has expired`
- **Body:**  
  `Recognition links expire after 48 hours to keep approvals timely. No reward was sent to John.`
- **Secondary line** (with link):  
  `If you'd still like to recognize John, you can do so from their <a href="/employees/{{employee_id}}">employee profile</a> in ClearCompany.`

### State 4 — Already decided (duplicate click)
- HTTP status: 409 Conflict (same note — render a page, not a raw error)
- **Icon:** ℹ️ or a blue info circle, 48px
- **Headline:**  
  `Already handled`
- **Body (approved path):**  
  `You already approved this recognition. John's reward is on its way.`
- **Body (dismissed path):**  
  `You already dismissed this recognition. No reward was sent.`
- **Secondary line:**  
  `You can close this tab.`

### Design tokens (confirmation page)

| Token | Usage |
|---|---|
| `color-success` `#059669` | Approved icon/headline accent |
| `color-neutral` `#6b7280` | Dismissed + expired text |
| `color-info` `#2563eb` | Already-decided info icon |
| `color-danger` `#dc2626` | (Not used — expired is neutral, not an error) |

### CC components used (confirmation page)
None — this is a standalone static HTML page, not inside the CC React app. No component library available. Write vanilla HTML/CSS or a minimal React page with inline styles. Keep it under 100 lines.

### Accessibility (confirmation page)
- Single `<h1>` per page (the headline)
- Icon is decorative — `aria-hidden="true"` or empty `alt=""`
- Link in expired state has descriptive text
- Page `<title>` matches state: `"Recognition sent — ClearCompany"` etc.
- Works without JavaScript (pure server-rendered HTML is fine)

### Open questions for the engineer (confirmation page)
1. **Employee name** — how does the confirmation page know the employee's first name? It must be stored with the approval token, not derived from the URL (don't expose employee names in query params). Confirm with BE that the token lookup returns `employee_first_name`.
2. **"Already decided — dismissed" detection** — the approve endpoint needs to know what the prior decision was to show the right body copy. Confirm BE passes `prior_decision` in the 409 response.
3. **Edit page (RR-H4b)** — is the Edit CTA being built this week? If not, the Edit link in the email should point to a state-3-style "coming soon" page. Confirm scope with PM.

---

## Spec 2 — RR-H6: Employee Profile Recognition Banner

### Overview
When an AI-detected recognition is in progress or completed for an employee, a banner appears beneath their profile header in ClearCompany. It has three states: pending (reward sending), delivered (reward received), failed (something went wrong). The FE polls a status endpoint every 10 seconds and updates the banner without a page reload.

Gated by `rr_hackathon` feature flag. Only renders if an active `rr_h_recognition` row exists for this employee.

### Where it lives
Beneath the existing employee profile header (name, title, department, avatar row). Above any existing tabs (Performance, Goals, etc.). Full width of the content column.

### Component breakdown

**Wrapper:** CC `Banner` component — use existing variants:
- `pending` → `Banner` variant `info` (blue)
- `delivered` → `Banner` variant `success` (green)
- `failed` → `Banner` variant `warning` (amber/orange)

If CC's `Banner` component doesn't support an inline `Tag` or custom left-side icon, render a plain `<div>` with matching color tokens. Don't fight the component — hackathon pragmatism.

### Layout per state

```
┌─────────────────────────────────────────────────────────────────┐
│  [Icon]  [Headline text]                        [Tag: AI-detected] │
│          [Body text / quote]                                     │
└─────────────────────────────────────────────────────────────────┘
```
- Full width of content column (no max-width cap)
- Padding: 16px horizontal, 14px vertical
- Border-radius: 8px (or match CC Banner default)
- `Tag` component right-aligned (use `position: absolute right: 16px` or flexbox justify-between)

### State 1 — Pending

| Element | Value |
|---|---|
| Banner variant | `info` |
| Icon | Spinner (animated, 16px) — use CC's `Spinner` or a CSS animation |
| Headline | `Recognition in progress — reward sending to John` |
| Body | `A $25 reward is on its way to John's inbox. This usually takes under 2 minutes.` |
| Tag | `AI-detected` — `Tag` component, variant `neutral` or `secondary` |

**Color:**
- Background: `#eff6ff` (blue-50)
- Border: `1px solid #bfdbfe` (blue-200)
- Text: `#1e40af` (blue-800)

### State 2 — Delivered

| Element | Value |
|---|---|
| Banner variant | `success` |
| Icon | ✓ checkmark (filled green circle, 16px) |
| Headline | `John was recognized for exceptional customer feedback` |
| Body | `"{{evidence_quote}}"` — verbatim customer quote, italic, truncated to 120 chars with ellipsis if longer |
| Sub-body | `$25 reward sent · Recognized by {{manager_first_name}}` — 13px, muted |
| Tag | `AI-detected` — `Tag` variant `success` |

**Color:**
- Background: `#f0fdf4` (green-50)
- Border: `1px solid #bbf7d0` (green-200)
- Text: `#15803d` (green-700)

### State 3 — Failed

| Element | Value |
|---|---|
| Banner variant | `warning` |
| Icon | ⚠️ triangle (amber, 16px) |
| Headline | `Recognition reward failed to deliver` |
| Body | `Something went wrong sending John's $25 reward. No funds were charged. Please contact support or try recognizing John manually.` |
| Tag | `AI-detected` — `Tag` variant `warning` |

**Color:**
- Background: `#fffbeb` (amber-50)
- Border: `1px solid #fde68a` (amber-200)
- Text: `#92400e` (amber-800)

### Polling behaviour

```typescript
// Pseudocode — adapt to CC's data-fetching patterns (SWR / React Query / useEffect)

const POLL_INTERVAL_MS = 10_000; // 10 seconds
const TERMINAL_STATES = ['delivered', 'failed'];

useEffect(() => {
  if (TERMINAL_STATES.includes(recognitionStatus)) return; // stop polling once terminal

  const interval = setInterval(async () => {
    const res = await fetch(`/api/rr/demo/recognition-status?employee_id=${employeeId}`);
    const { status } = await res.json();
    setRecognitionStatus(status);
    if (TERMINAL_STATES.includes(status)) clearInterval(interval);
  }, POLL_INTERVAL_MS);

  return () => clearInterval(interval); // cleanup on unmount
}, [recognitionStatus, employeeId]);
```

- **Do not poll** if status is already `delivered` or `failed` — stop on first terminal state.
- **Do not poll** if `rr_hackathon` flag is off or if no recognition row exists for this employee (API returns `{ status: null }`).
- **Error handling:** if the poll endpoint returns non-200, log and continue polling (don't crash the banner). After 5 consecutive errors, stop polling and show nothing (silent fail — the banner just disappears).

### API contract (FE ↔ BE)

```
GET /api/rr/demo/recognition-status?employee_id=:id

Response 200:
{
  "status": "pending" | "delivered" | "failed" | null,
  "employee_first_name": "John",
  "manager_first_name": "Sarah",
  "evidence_quote": "He's the best support engineer we've ever worked with.",
  "amount_cents": 2500,
  "currency": "USD"
}

Response 404: employee not found (render nothing)
Response 403: caller lacks permission (render nothing, log)
```

`null` status = no active recognition → render nothing (don't mount the banner at all).

### Feature flag gate

```tsx
// Wrap the entire banner in the flag check
{featureFlags.rr_hackathon && recognition?.status && (
  <RecognitionBanner recognition={recognition} />
)}
```

Banner must not mount at all when flag is off — not even hidden. This prevents any layout shift risk in production.

### Design tokens (banner)

| State | Background | Border | Text |
|---|---|---|---|
| pending | `#eff6ff` | `#bfdbfe` | `#1e40af` |
| delivered | `#f0fdf4` | `#bbf7d0` | `#15803d` |
| failed | `#fffbeb` | `#fde68a` | `#92400e` |

If CC has semantic tokens like `color-info-bg`, `color-success-bg`, `color-warning-bg` — use those instead. The hex values above are fallbacks.

### CC components used

| Component | Usage |
|---|---|
| `Banner` | Outer container — use `info` / `success` / `warning` variants |
| `Tag` | `AI-detected` label, right-aligned |
| `Spinner` | Pending state icon (animated) |
| Avatar | Not needed in this banner — keep it lean |

No new components required.

### Responsive behaviour

| Breakpoint | Behaviour |
|---|---|
| Desktop (>1024px) | Default layout — headline + body left, Tag right |
| Tablet (768–1024px) | Tag wraps below headline (flex-wrap) |
| Mobile (<768px) | Tag hidden (or stacks below body). Banner is still full-width. |

### Accessibility

- Banner has `role="status"` and `aria-live="polite"` so screen readers announce state changes when polling updates it.
- Spinner in pending state has `aria-label="Recognition sending"`.
- Quote text in delivered state: wrap in `<blockquote>` with `cite` omitted (source is not a URL).
- All color combinations meet WCAG AA contrast (confirmed for the hex values above).
- `Tag` "AI-detected" has a `title` tooltip: `"This recognition was suggested by ClearCompany AI based on a Gong call. Approved by {{manager_first_name}}."` — surfaces on hover/focus.

### Animation / motion

| Element | Trigger | Animation | Duration |
|---|---|---|---|
| Banner mount | Status changes from null → pending | Fade in | 200ms ease-out |
| Status transition (pending → delivered) | Poll returns terminal | Cross-fade | 300ms ease-in-out |
| Spinner | Always | Rotate 360° | 800ms linear infinite |

Keep motion minimal — this is a status surface, not a celebration moment. (Celebration is the recipient's inbox.)

### Open questions for the engineer (RR-H6)

1. **CC Banner component API** — does it accept `rightContent` or a `children` slot for the `Tag`? Or do we need a custom wrapper `<div>` to get the right-aligned tag?
2. **Feature flag access** — how does the FE read `rr_hackathon`? Is there a `useFeatureFlags()` hook, a context, or does it come from the page props?
3. **Employee profile page** — where exactly does the banner insert? Is the profile page a React component CC engineers can modify, or is it a legacy template? If legacy, the BE may need to server-render the banner.
4. **Poll endpoint auth** — does `/api/rr/demo/recognition-status` require the CC session cookie, or is it public? Assume session cookie (manager is logged in). Confirm with BE.
5. **Quote truncation** — 120 chars recommended. Confirm the truncation rule with PM (should we show a "Read more" expand, or hard-truncate with ellipsis for hackathon?).

---

## Quick-reference: what the FE engineer ships this week

| Deliverable | Ticket | Est. time | Blocked by |
|---|---|---|---|
| HTML approval email template | RR-H4 | 3–4h | Email infra API, logo asset |
| 4 confirmation page states | RR-H4 | 2–3h | BE token lookup response shape |
| Recognition banner (3 states) | RR-H6 | 2–3h | Feature flag hook, Banner component API |
| Polling hook | RR-H6 | 1h | BE status endpoint contract |
| **Total** | | **~1 day** | |

**Suggested build order:** Banner (RR-H6) first — it's self-contained and unblocks the visible demo moment. Then confirmation page. Then email template last (most fiddly, Outlook testing takes time).
