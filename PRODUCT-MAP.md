# Guusto Product Map
**Purpose:** Design reference for the ClearCompany R&R integration — what Guusto actually is, screen by screen, mapped against what CC owns vs. embeds vs. ignores.  
**Source:** 188 screenshots (April 2026) + Feb 2026 Product Showcase video frames + PRD v0.9  
**Key:** 🟢 CC builds natively · 🔵 CC embeds (Guusto iFrame/API) · ⚪ Guusto-only, not surfaced in CC · 🔴 Explicitly out of scope

---

## Global Shell

**Screenshot evidence:** All showcase frames — consistent chrome throughout

```
┌─────────────────────────────────────────────────────────┐
│  [Logo]  Dunder Mifflin ▾     [💰 TO REDEEM $72,846]  [💰 TO SEND $9,820]  [👤] │
└─────────────────────────────────────────────────────────┘
```

**What the header carries:**
- Org switcher (workspace selector — tenant name shown, dropdown for multi-workspace)
- Two persistent balance chips: **"To Redeem"** (total outstanding unredeemed gifts across org) and **"To Send"** (current sender's remaining budget)
- Account avatar / user menu

**CC implication 🟢:** The two balance chips are the most important persistent UI element. In ClearCompany's integration, the "To Send" balance must be CC-native (CC owns budget allocation). "To Redeem" is Guusto-side state — visible in the iFrame or via API only.

---

## Left Navigation — Full Inventory

**Screenshot evidence:** `showcase-2026-frame-024.png`, `product-demo-frame-010.png`

```
MAIN
├── Dashboard
├── Send Gifts
├── Reports
├── Manager Insights
├── Account Funds
└── Redeem Gifts          ← [NEW] badge shown

ADMIN
└── Workspaces ▾
    ├── Manage Workspaces
    ├── Manage Members
    ├── Manage Funds
    ├── Manage Gifting
    ├── Manage Shoutouts
    ├── Custom Reports
    └── Settings
```

**Observed from product-demo-frame-010.png (older but desktop UI):**
```
MAIN
├── Dashboard
├── Send Gifts             ← with pending badge
├── Reports
├── Account Funds
├── Redeem Gifts           ← with [NEW] badge
└── Shoutouts

ADMIN
└── Teams ▾

ACCOUNT
└── [user name]
```

**CC navigation mapping:**
- `Send Gifts` → 🟢 CC-native shoutout + gift attach compose
- `Manager Insights` → 🟢 CC-native analytics (we do NOT embed Guusto's version)
- `Redeem Gifts` → 🔵 CC embeds Guusto iFrame for catalog redemption
- `Account Funds` → 🔵 Guusto-side; CC surfaces balance via API read only
- `Shoutouts` → 🟢 CC builds natively as the social recognition feed
- `Workspaces > Manage Members` → 🟢 CC owns employee roster (HRIS-synced)
- `Workspaces > Manage Funds` → 🟢 CC owns budget allocation UI
- `Workspaces > Settings` → 🟢 CC owns program config (values, visibility, roles)

---

## Screen 1: Dashboard (Employee / "Hi Michael" view)

**Screenshot evidence:** `showcase-2026-frame-033.png`, `showcase-2026-frame-034.png`

```
┌──────────────────────────────────────────────────────────────┐
│  Hi Michael                              [Send a Shoutout ▶] │
│                                                               │
│  ┌──────────────────────┐  ┌───────────────────────────────┐ │
│  │ RECOGNITION FEED     │  │ RIGHT RAIL                    │ │
│  │                      │  │                               │ │
│  │ [Recognition card]   │  │ People to Recognize           │ │
│  │ "Employee            │  │  ○ [avatar] Name              │ │
│  │  Appreciation"       │  │  ○ [avatar] Name              │ │
│  │ [GIF/image]          │  │  ○ [avatar] Name              │ │
│  │ [Comment field]      │  │                               │ │
│  │                      │  │ Upcoming Celebrations         │ │
│  │ "sent a gift to      │  │  ┌─────────────────────────┐  │ │
│  │  Joan Smith"         │  │  │ Work Anniversaries      │  │ │
│  │                      │  │  │ Birthdays               │  │ │
│  │                      │  │  └─────────────────────────┘  │ │
│  │                      │  │                               │ │
│  │                      │  │ Your Team's Impact            │ │
│  │                      │  │  43 DAYS OF [charity?]        │ │
│  │                      │  │                               │ │
│  │                      │  │ Wellness Challenge            │ │
│  │                      │  │  [Challenge Here CTA]         │ │
│  └──────────────────────┘  └───────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**What's in this screen:**
- Left feed: shoutout cards with GIF/image, recognition reason/value tag, comment field
- Right rail: suggested people to recognize (Guusto surfaces this), upcoming celebrations (work anniversaries + birthdays), charity impact tracker, wellness challenge widget
- Top CTA: "Send a Shoutout" primary action button

**CC integration decisions:**
- 🟢 CC builds the shoutout feed natively — this is the core social recognition surface
- 🟢 CC builds "People to Recognize" nudges (sourced from CC org chart + recognition gap data)
- 🔴 "Wellness Challenge" widget — out of scope entirely
- 🔴 Charity/impact tracker — out of scope
- 🟢 "Upcoming Celebrations" → deferred to Phase 3 (requires HRIS hire/birthday dates)
- **Design note:** The two-column layout (feed + right rail) is the right structural pattern for CC's implementation. The right rail earns its place only when it contains actionable nudges, not passive widgets.

---

## Screen 2: Send Gifts — Order Step

**Screenshot evidence:** `product-demo-frame-010.png`, `product-demo-frame-011.png`

```
┌──────────────────────────────────────────────────────────────┐
│  Send Gifts                                                   │
│                                                               │
│  ① Order   ② Delivery & Review   ③ Confirmation              │
│                                                               │
│  Delivery Options:                                            │
│  ● Email/SMS notification ⓘ                                  │
│  ○ Print/Display gift website ⓘ                              │
│  ○ Print Merchant Gift Card ⓘ    ← [Modal: "must select      │
│                                     a partner merchant"]      │
│  [+ Add Another Gift]  [👥 Bulk Add Recipients]              │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ #  GIFT          PERSONALIZATION   RECIPIENT INFO    │    │
│  │                                                       │    │
│  │ 1  Guusto Card   Joan Smith        Claire Gilberte   │    │
│  │    Any Partner   Lead (take        claire@guusto.com │    │
│  │    Merchant $5   initiative) ▾     Recipient Cell # │    │
│  │    [min–max]     "Thank you for    [Delivery Date]  │    │
│  │                  oversee..."       [Language ▾]     │    │
│  │                                    [Notify Manager] │    │
│  │                                                       │    │
│  │ 2  Guusto Card   Joan Smith        [recipient search]│    │
│  │    Any Partner                     ↳ Pre-loaded list │    │
│  │    Merchant $10                      shown on focus │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  [☐ CC me on all gifts]  [marketing@guusto.c...]             │
└──────────────────────────────────────────────────────────────┘
```

**Key UI observations:**
- Three delivery methods: Email/SMS, Print/Display (QR code/URL), Print Merchant Gift Card
- Row-per-gift table: Gift type | Personalization (reason/value, message, image) | Recipient info (email or cell, delivery date, language, manager notification toggle)
- Recipient autocomplete pulls from a pre-loaded recipient list (synced from HRIS)
- "Bulk Add Recipients" for volume sends
- "CC me on all gifts" for the sender's own record

**CC integration decisions:**
- 🟢 CC builds a simplified gift attach panel inside the shoutout compose flow (NOT a standalone Send Gifts page in Phase 1)
- 🟢 CC owns recipient lookup (pulls from CC employee directory — not Guusto's pre-loaded list)
- 🟢 CC owns personalization/reason/value tagging (this is the shoutout message, not a separate field)
- 🔵 Delivery method selection (email/SMS/QR) is surfaced in CC UI but routes to Guusto's delivery infrastructure
- 🔴 Bulk gifting (standalone Send Gifts table view) — deferred to Phase 2 or 3
- **Design note:** Guusto's send flow is transactional (table of gifts, batch operations). CC's should be relational (one recognition at a time, person-centric). The batch table is a power-user admin feature, not the primary entry point.

---

## Screen 3: Gift Notification Email (Recipient-facing)

**Screenshot evidence:** `product-demo-frame-016.png`

```
┌──────────────────────────────────────────────┐
│  [Guusto Team] sent you a Guusto Card.       │
│  Add it to a new or existing account by      │
│  clicking the Claim button below.             │
│                                               │
│  ┌────────────────────────────────────────┐  │
│  │  $30 CAD          [gift box graphic]   │  │
│  │  Guusto Card                           │  │
│  │  at Any Partner Merchant               │  │
│  │                                        │  │
│  │  [Reason badge: 🛡 Listen (clients,   │  │
│  │   colleagues, competitors)]            │  │
│  │                                        │  │
│  │  "It's great to see you actively       │  │
│  │   seeking and implementing team        │  │
│  │   feedback from the Monday debrief..."  │  │
│  │                                        │  │
│  │       ≋ guusto                         │  │
│  │       From: Guusto Team                │  │
│  │                                        │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │      Claim Your Gift            │  │  │
│  │  └─────────────────────────────────┘  │  │
│  │  Must be claimed by Jan 13, 2024       │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

**Key UI observations:**
- Gift value prominently top-left of card
- Value/reason badge with icon shown on the card itself
- Full recognition message included in the email
- Guusto branding on the card — "From: Guusto Team" (not the sender's name in this demo, but customisable)
- Single primary CTA: "Claim Your Gift"
- Expiry date visible below CTA

**CC integration decisions:**
- 🔵 This email is sent by Guusto's infrastructure — CC does NOT control the email send
- 🟢 CC does control: sender name, org name, recognition message, reason/value badge content (these are passed to Guusto at gift issuance)
- **White-labeling ask:** "From: [Sender Name] at [Company]" not "From: Guusto Team" — this must be negotiated. Currently the email says Guusto Team; in white-label mode it should say the actual sender.
- **Design note:** The reason/value badge with icon on the card is a strong design element — it visually connects the monetary gift to the recognition moment. CC's value tags should map to Guusto's reason system or be passed as custom labels.

---

## Screen 4: Redeem Gifts — Claim Flow

**Screenshot evidence:** `showcase-2026-frame-012.png`

```
┌───────────────────────────────────────────────────────────┐
│  ← Back to Gifts                                          │
│                                                           │
│  ┌──────────────────────┐  ┌─────────────────────────┐   │
│  │ RECOGNITION CARD     │  │ Available to Redeem      │   │
│  │                      │  │                          │   │
│  │ [Trophy emoji]       │  │ Remaining Amount:        │   │
│  │ Reason: Employee     │  │ $150.00 USD              │   │
│  │ Appreciation         │  │                          │   │
│  │ To: Meredith Palmer  │  │ Enter Amount to Redeem:  │   │
│  │                      │  │ [USA (USD) ▾] [$ ___]   │   │
│  │ [GIF: Michael Scott  │  │                          │   │
│  │  and Dwight]         │  │ Select a Merchant →      │   │
│  │                      │  │                          │   │
│  │ "Your exceptional    │  │ Redeemed Amounts:        │   │
│  │  leadership skills   │  │ (empty — not yet         │   │
│  │  have made a         │  │  redeemed)               │   │
│  │  significant         │  │                          │   │
│  │  impact..."          │  └─────────────────────────┘   │
│  │                      │                                  │
│  │ From: Michael Scott  │                                  │
│  │                      │                                  │
│  │ $150 USD             │                                  │
│  └──────────────────────┘                                  │
└───────────────────────────────────────────────────────────┘
```

**Key UI observations:**
- Left panel: the full recognition card (reason, GIF/image, full message, sender name, dollar amount)
- Right panel: redemption controls — remaining amount, amount-to-redeem entry, currency selector, "Select a Merchant" CTA
- Partial redemption is supported (recipient can redeem less than the full amount and save the rest)
- "Redeemed Amounts" section tracks history of partial redemptions on this gift

**CC integration decisions:**
- 🔵 This entire screen is the Guusto iFrame embedded in CC's shell in Phase 1
- The left card (recognition content) is passed from CC to Guusto at gift issuance — this is CC-originated data rendered in Guusto's UI
- 🟢 In Phase 3 (API migration), CC builds this screen natively, preserving the two-panel layout
- **Design note:** The split-panel layout (recognition card left, redeem controls right) is the right UX. Don't collapse it to a single column — the recognition card on the left is essential context for why the reward exists.

---

## Screen 5: Catalog — Merchant Selection

**Screenshot evidence:** `showcase-2026-frame-013.png`, `showcase-2026-frame-014.png`

```
┌──────────────────────────────────────────────────────────┐
│  ← Go Back                                  $188.00 USD  │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │  [Nike logo]                                       │  │
│  │  Nike Men's Club Fleece Sleeve Swoosh              │  │
│  │  Full-Zip Hoodie                                   │  │
│  │  [Nordstrom] (retailer link)                       │  │
│  │                                                    │  │
│  │  Redeem $104.00 USD                                │  │
│  │                                                    │  │
│  │  [product image]    [thumbnail 1] [thumbnail 2]   │  │
│  │                                                    │  │
│  │  Size: XS  S  M  L  XL  2XL  3XL  4XL            │  │
│  │              ↑ selected                           │  │
│  │                                                    │  │
│  │  Description:                                      │  │
│  │  The brushed-back fleece hoodie is where           │  │
│  │  comfort meets street-ready bike style...          │  │
│  │                                                    │  │
│  │  ☐ I understand this merchant selection            │  │
│  │    can't be changed                                │  │
│  │                                              Close │  │
│  │                         [Redeem at Merchant →]    │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Key UI observations:**
- Product detail modal over the catalog browse view
- Size/variant selection before redemption
- Explicit irrevocability warning: "I understand this merchant selection can't be changed" — required checkbox before CTA
- "Close" (cancel) and "Redeem at Merchant" (confirm) as the two terminal actions
- Remaining balance shown in header ($188 — the full gift minus whatever was already used)

**CC integration decisions:**
- 🔵 Entirely Guusto-owned in Phase 1 (iFrame) and Phase 3 (API-powered native UI)
- CC does NOT attempt to replicate the catalog browse or product detail — this is Guusto's core value
- **Design note:** The irrevocability warning UX is important — don't strip it in a white-label. It protects both the employee and the employer from support escalations.

---

## Screen 6: Manager Insights — Tab System

**Screenshot evidence:** `showcase-2026-frame-020.png`, `showcase-2026-frame-021.png`, `showcase-2026-frame-023.png`, `showcase-2026-frame-024.png`, `showcase-2026-frame-025.png`, `showcase-2026-frame-036.png`, `showcase-2026-frame-037.png`

The Manager Insights section has **5 tabs**:

```
Manager Insights
[Your Activity] [Your Direct Reports ●] [Team History] [Manager Delivery] [Approvals ●]
```

---

### Tab 1: Your Activity
*(Not shown in available frames — exists per nav tab)*

---

### Tab 2: Your Direct Reports

**Screenshot evidence:** `showcase-2026-frame-024.png`, `showcase-2026-frame-025.png`, `showcase-2026-frame-027.png`

```
┌─────────────────────────────────────────────────────────────┐
│  Team activity                              [Gifts and       │
│  [Count of recognition ●] [Participation]   shoutouts ▾]   │
│                                                             │
│  [All Direct Reports ▾]  [Andy Bernard ×] [Angela Martin ×]│
│  (multi-select employee filter)                             │
│                                                             │
│  [Line chart — recognition count over time, per-employee    │
│   color-coded lines, date range: Jan 2025 – Feb 2026]       │
│                                                             │
│  Team Participation             [Make a Shoutout Draw ▶]   │
│  [This Month ▾]                                            │
│                                                             │
│  Amount Spent    Gifts Sent    Shoutouts Sent    Members    │
│  $170            2             0                 21         │
│  (who received)                                            │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │ TEAM MEMBER ↕  AMOUNT SPENT  GIFTS  SHOUTOUTS      │    │
│  │ [avatar] Andy Bernard        $0.00  0      0       │    │
│  │ [avatar] Angela Martin       $0.00  0      0       │    │
│  │ [avatar] Calvin Tenner       $0.00  0      0       │    │
│  │ [avatar] Creed Bratton       $0.00  0      0       │    │
│  │ [avatar] Daryl Philbin       $0.00  0      0       │    │
│  │ [avatar] Dwight Schrute      $0.00  0      0       │    │
│  │ [avatar] Erin Hannon         $0.00  0      0       │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**"Shoutout Draw" modal** (`showcase-2026-frame-026.png`):
```
┌─────────────────────────────────┐
│  Shoutouts Draw                 │
│  Draw a shoutout winner from    │
│  the pool of shoutouts. Use     │
│  the filter settings to change  │
│  the size of the pool.          │
│                                 │
│  [Draw a Winner ▶]              │
│  Learn how to engage more...    │
└─────────────────────────────────┘
```

---

### Tab 3: Team History
*(Navigation confirmed in frame-024 — tab visible)*

---

### Tab 4: Manager Delivery

**Screenshot evidence:** `showcase-2026-frame-020.png`, `showcase-2026-frame-021.png`

```
┌─────────────────────────────────────────────────────────────┐
│  Manager Delivery                                           │
│                                                             │
│  [Not Delivered ●] Andy Bernard                            │
│  Created Oct 2025-10-22 | Reason: Listen | Sender: Michael  │
│  Scott                             [Copy Link] [Print Gift] │
│  ☐ Mark as Delivered                                       │
│                                                             │
│  [Not Delivered ●] Meredith Palmer                         │
│  Created Oct 2025-10-22 | Reason: Teamwork | Sender:       │
│  Michael Scott                     [Copy Link] [Print Gift] │
│  ☐ Mark as Delivered                                       │
│                                                             │
│  [Not Delivered ●] Calvin Tenner                           │
│  Created Oct 2025 | Reason: New Anniversary | Sender:      │
│  Michael Scott                     [Copy Link] [Print Gift] │
│  ☐ Mark as Delivered                                       │
│                                                             │
│  [Not Delivered] Calvin Tenner                             │
│  Created Oct 2025 | Reason: Employee Appreciation |        │
│  Sender: Jim Halpert                [Copy Link] [Print Gift]│
│  ☐ Mark as Delivered                                       │
│                                                             │
│  [QR Code Modal — `showcase-2026-frame-022.png`]           │
│  ┌──────────────────────────┐                              │
│  │  Scan QR Code            │                              │
│  │  ○ Single-use link       │                              │
│  │  ○ Multi-use link        │                              │
│  │  [QR code image]         │                              │
│  └──────────────────────────┘                              │
└─────────────────────────────────────────────────────────────┘
```

**Key UI observations:**
- Manager Delivery is the frontline-specific delivery interface — for print, QR code, and in-person gift handoff
- "Mark as Delivered" is a manual confirmation for physical/print delivery
- QR code modal offers Single-use vs. Multi-use link options
- "Copy Link" and "Print Gift" CTAs for physical distribution
- Sender name shown (manager can see who sent what — this is an admin escalation view)

**CC integration decisions:**
- ⚪ Manager Delivery tab is Guusto-only in Phase 1 — not surfaced in CC
- In Phase 2 (frontline pilot), CC should surface a "delivery status" view that shows pending / delivered / redeemed per employee — simpler than Guusto's full Manager Delivery interface
- **Design note:** The "Mark as Delivered" manual confirmation flow is important for frontline/print scenarios. This is Guusto's frontline moat in action — don't try to replicate it in Phase 1.

---

### Tab 5: Approvals

**Screenshot evidence:** `showcase-2026-frame-036.png`, `showcase-2026-frame-037.png`

```
┌─────────────────────────────────────────────────────────────┐
│  Approvals                                                  │
│                                                             │
│  [Pending ●] Gift for Calvin Tenner                        │
│  Created 2025-10-14 | Reason: Employee Appreciation        │
│  Sender: Oscar Martinez                                     │
│  "Message: Your outstanding leadership in implementing the  │
│   new recycling project has not gone unnoticed. Your        │
│   dedication and hard work in driving this project         │
│   forward have made a tangible difference..."              │
│                          [Approve Gift ▶] [Decline]        │
│                                                             │
│  [Pending ●] Gift for Kelly Kapoor                         │
│  Created 2025-10-14 | Reason: Lived                        │
│  Sender: Oscar Martinez                                     │
│  "Message: You have done an excellent job in exceeding      │
│   your goals this quarter. Your curiosity and desire to    │
│   experiment and find new ways to solve problems is        │
│   exceptional..."                                          │
│                          [Approve Gift ▶] [Decline]        │
└─────────────────────────────────────────────────────────────┘
```

**Key UI observations:**
- Approval queue for pending gift sends
- Shows: recipient, date created, reason/value, sender, full message preview
- Simple binary action: Approve or Decline
- Multiple pending approvals in a list view

**CC integration decisions:**
- 🟢 CC builds an approval flow as a configurable option in P0-10 program settings (optional, off by default)
- This is the pattern CC should follow — it maps directly to the PRD's "manager approval before peer recognitions" open question (OQ-9)
- **Design note:** The message preview in the approval card is essential — approvers need context to make a meaningful decision. Don't reduce this to just recipient + amount.

---

## Screen 7: Custom Reports

**Screenshot evidence:** `showcase-2026-frame-032.png`

```
┌─────────────────────────────────────────────────────────────┐
│  Custom Reports               Workspace Balance: $46,399    │
│                                                             │
│  [Create Report ▶]                                         │
│                                                             │
│  ┌───────────────────────────────────────────────────┐     │
│  │ LOOKUP   CATEGORY    REASON    SENDER    AMOUNT   │     │
│  │                                                   │     │
│  │          Gift        Teamwork  Michael Scott  $__ │     │
│  │          Gift        COC       Michael Scott  $__ │     │
│  │          Shout       Vitue     Michael Scott  $__ │     │
│  │          Shout       OC        Michael Scott  $__ │     │
│  │          Gift        ___       Michael Scott  $__ │     │
│  └───────────────────────────────────────────────────┘     │
│                                                             │
│  [Share Report modal]:                                      │
│  ┌─────────────────────────────────────────────────┐       │
│  │  Share Report                                   │       │
│  │  Reports will be sent via email at 9:00AM PT    │       │
│  │                                                 │       │
│  │  Starting On:  [date picker]                    │       │
│  │  Repeating:    [frequency picker]               │       │
│  │  Delivery Method: ● Email  ○ SFTP               │       │
│  │  [Enter name or email to share this report]     │       │
│  │                                                 │       │
│  │  [Cancel]  [Stop Sharing]  [Share ▶]            │       │
│  └─────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

**Key UI observations:**
- "Custom Reports" is its own nav item under Workspaces admin
- Workspace Balance shown persistently ($46,399 in this demo)
- Report table: Lookup | Category (Gift vs. Shout) | Reason | Sender | Amount
- Scheduled report sharing via email or SFTP with configurable frequency
- SFTP option is for enterprise HRIS/payroll system export

**CC integration decisions:**
- 🟢 CC builds its own reporting natively — this is one of the clearest "ClearCompany adds unique value" surfaces
- 🟢 CC's reporting connects recognition to employee profile data, performance, and org chart — something Guusto's Custom Reports cannot do
- ⚪ Guusto's Custom Reports are not surfaced in CC; admins can access them directly in Guusto if needed
- **Design note:** The "Category" distinction (Gift vs. Shout) in Guusto's reports maps to CC's distinction between monetary and non-monetary recognitions. Preserve this in CC's reporting model — it matters for budget reporting and IRS compliance.

---

## Screen 8: Workspaces — Manage Members

**Screenshot evidence:** `showcase-2026-frame-048.png`

```
┌─────────────────────────────────────────────────────────────┐
│  Manage Members                  Workspace Balance: $46,399 │
│  [Add a Member] [IMPORT CSV]  [Manager Rights] [Manage      │
│   Workspace]                                                │
│                                                             │
│  Apply to All: [▾]  Filter: [▾]  Search: [___] [Go]        │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │ ☐  NAME       EMAIL                WORKSPACE       │    │
│  │              CREATED    STATUS   BALANCE  FUND    │    │
│  │              REDEEMED   LAST LOGIN  MANAGE GIFTING │    │
│  │                                                    │    │
│  │ ☐ Andy Bernard  abernar...@dunderm  Scranton Office │    │
│  │              [CC CC] [no] [no]  Manager [edit]    │    │
│  │                                                    │    │
│  │ ☐ Angela Martin accung...@dunderm  Scranton Office │    │
│  │              [CC CC] [no] [no]  [edit]             │    │
│  │ (etc.)                                             │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**Key UI observations:**
- Import CSV for bulk member add
- "Manager Rights" tab — separate configuration for manager-level permissions
- Per-member columns: Name, Email, Workspace, Status, Balance, Fund, Redeemed, Last Login, Manage Gifting toggle
- Inline edit for individual member management
- "CC CC" badge shown on two members — likely a custom tag

**CC integration decisions:**
- 🟢 CC owns member management entirely — the employee roster comes from CC's HRIS-synced people data
- CC does NOT redirect to Guusto's Manage Members for employee administration
- 🔵 CC passes member data to Guusto at the org-account level (Guusto needs email/phone for gift delivery)
- **Design note:** The per-member "Balance" and "Fund" columns in Guusto are the equivalent of CC's budget allocation per manager. CC must display this from its own budget ledger, not from Guusto's member table.

---

## Screen 9: Workspace Access (Settings)

**Screenshot evidence:** `showcase-2026-frame-039.png`, `showcase-2026-frame-044.png`

```
┌─────────────────────────────────────────────────────────────┐
│  Workspace Access                                           │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Workspace Access Update                              │  │
│  │ This action applies your access settings to all     │  │
│  │ active users. Any conditional logic will be          │  │
│  │ evaluated.                          [Update Access]  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  Manage Access:                                             │
│  ┌────────────────────┐  ┌───────────────────────────────┐ │
│  │ ○ No Workspace     │  │ ● Allow Workspace Access       │ │
│  │   Access           │  │   to employees                 │ │
│  │                    │  │   Employees can see and access │ │
│  │ Employees can      │  │   this workspace. Employees    │ │
│  │ receive and redeem │  │   with access can send         │ │
│  │ recognition but    │  │   recognition & their user     │ │
│  │ cannot see or      │  │   rights allow it. Must be     │ │
│  │ access the         │  │   active and have a valid      │ │
│  │ workspace when     │  │   email for access to be       │ │
│  │ logged in.         │  │   enabled.                     │ │
│  └────────────────────┘  └───────────────────────────────┘ │
│                                                             │
│  Set conditions to grant workspace access to specific       │
│  employee groups (optional):                                │
│  Rule Name: [___]                                           │
│  Position [is] [___]  + general manager   [+Add Condition] │
│  [Clear] [Save]                                             │
│                                                             │
│  Rules List                                                 │
└─────────────────────────────────────────────────────────────┘
```

**Key UI observations:**
- Two access tiers: "No Workspace Access" (can receive/redeem but not send or log in) vs. "Allow Workspace Access" (full send + access)
- Conditional access rules: filter by Position, role, or group
- "No Workspace Access" is specifically the frontline worker tier — they get gift emails but never see the Guusto platform
- Rule-based access is how Guusto handles the frontline/desk worker distinction without manual toggling per employee

**CC integration decisions:**
- 🟢 CC maps this directly to the "Frontline employee" persona — employees without CC access can still receive recognition via SMS/email
- 🟢 CC's visibility controls in P0-10 (program config) are the equivalent of Workspace Access rules
- **This screen reveals Guusto's frontline architecture:** frontline workers are "No Workspace Access" employees who receive gift links via SMS/personal email and never log into the platform. This is the model CC should replicate natively.

---

## Screen 10: Settings — Full Tab Bar

**Screenshot evidence:** `product-demo-frame-015.png`

```
Settings tabs (confirmed from product demo):
[General] [Branding] [Dashboard] [Advanced Reporting] [Gift Reasons]
[Automated Awards] [Internal Notes] [Pre-loaded Recipients]
[Restrictions] [Merchants] [Shoutouts]
```

**Notable tabs and their CC mapping:**

| Guusto Settings Tab | What it does | CC equivalent |
|---|---|---|
| **General** | Org name, currency, logo | 🟢 CC admin: org settings |
| **Branding** | Team image for gift cards | 🔵 Passed to Guusto at account setup |
| **Dashboard** | Widget configuration for employee view | 🟢 CC controls dashboard layout |
| **Advanced Reporting** | Report templates, SFTP settings | 🟢 CC builds native reports |
| **Gift Reasons** | Custom reason/value labels for gift cards | 🟢 CC's "company values" tags — passed to Guusto as reason labels |
| **Automated Awards** | Rule-based automatic gift triggers | 🔴 Out of scope (Phase 3 at earliest) |
| **Internal Notes** | Admin notes on gifts (not visible to recipient) | 🟢 CC includes in P0-8 audit trail |
| **Pre-loaded Recipients** | CSV-uploaded recipient list for bulk gifting | 🟢 CC's HRIS-synced employee directory replaces this |
| **Restrictions** | Merchant category exclusions | 🔵 Admin config in CC, passed to Guusto at org level |
| **Merchants** | Curate or restrict specific merchants | 🔵 Same as Restrictions |
| **Shoutouts** | Social recognition feed settings | 🟢 CC builds natively — this setting moves to CC's P0-10 program config |

---

## Screen 11: Integrations Page

**Screenshot evidence:** `showcase-2026-frame-016.png`, `showcase-2026-frame-017.png`

```
┌─────────────────────────────────────────────────────────────┐
│  Integrations                                               │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  [Ceridian logo] Ceridian Dayforce                   │  │
│  │  Connect to Ceridian account to sync your employee   │  │
│  │  data                                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  [HRIS logo] HRIS Integrations ✦                    │  │
│  │  Connect to your HRIS with Merge to sync your        │  │
│  │  employee data. Note: this integration can only be   │  │
│  │  set up for one Workspace per company.               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  [Teams logo] Microsoft Teams                        │  │
│  │  Increase engagement by tying recognition to your    │  │
│  │  company's communication platform. Contact your      │  │
│  │  Account Manager to configure.                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  [UKG logo] UKG Talk                                 │  │
│  │  Increase engagement by tying recognition to your    │  │
│  │  company's communication platform.                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  [Axonify logo] Axonify                              │  │
│  │  Increase engagement by tying recognition to your    │  │
│  │  company's communication platform.                   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**CC integration decisions:**
- Guusto uses **Merge** for generic HRIS sync — CC already has its own HRIS data. This Guusto integration page is irrelevant when CC is the integration layer.
- Microsoft Teams and UKG Talk are Guusto's comm platform integrations — CC is the entry point for recognition, so CC replaces this integration surface. CC's Slack integration takes the equivalent role.
- Axonify (frontline learning platform) integration is interesting — recognition tied to learning completion is a Phase 3 trigger automation possibility.
- ⚪ The entire Guusto Integrations page is invisible in CC's integration model. CC is the integration hub.

---

## Full Integration Boundary Map

```
ClearCompany Shell
┌────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  CC-NATIVE SURFACES (🟢)                                           │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐  │
│  │ Recognition    │  │ Budget Mgmt    │  │ Analytics /          │  │
│  │ Compose        │  │ (Admin)        │  │ Reporting            │  │
│  │ - Shoutout     │  │ - Allocations  │  │ - HR Dashboard       │  │
│  │ - Values tag   │  │ - Balances     │  │ - Mgr Insights       │  │
│  │ - Gift attach  │  │ - Rollovers    │  │ - Equity view        │  │
│  │ - AI assist    │  │ - Equity nudge │  │ - IRS export         │  │
│  └────────────────┘  └────────────────┘  └──────────────────────┘  │
│                                                                     │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐  │
│  │ Employee       │  │ Recognition    │  │ Admin Config         │  │
│  │ Profile        │  │ Feed / Social  │  │ - Values/programs    │  │
│  │ - Received tab │  │ Wall           │  │ - Visibility rules   │  │
│  │ - Sent tab     │  │ - Reactions    │  │ - Role permissions   │  │
│  │ - Review panel │  │ - Approvals Q  │  │ - Workspace access   │  │
│  └────────────────┘  └────────────────┘  └──────────────────────┘  │
│                                                                     │
│  GUUSTO EMBEDDED (🔵) — iFrame Phase 1, API Phase 3                │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                                                             │    │
│  │  Gift Redemption Surface                                   │    │
│  │  ┌──────────────────────┐  ┌──────────────────────────┐   │    │
│  │  │ Recognition card     │  │ Redeem controls          │   │    │
│  │  │ (CC data, rendered   │  │ Amount entry             │   │    │
│  │  │ in Guusto frame)     │  │ Merchant CTA             │   │    │
│  │  └──────────────────────┘  └──────────────────────────┘   │    │
│  │                                                             │    │
│  │  ┌────────────────────────────────────────────────────┐   │    │
│  │  │ Catalog Browse + Product Detail + Confirm          │   │    │
│  │  │ (Entirely Guusto — CC provides shell + SSO only)   │   │    │
│  │  └────────────────────────────────────────────────────┘   │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  DATA FLOWS                                                         │
│  CC → Guusto:  recipient email/phone, gift amount, CC gift ID,     │
│                recognition message, reason/value label,             │
│                delivery method, org branding                        │
│  Guusto → CC:  redemption webhook (gift ID, status, timestamp)     │
│                (merchant category — Phase 3 negotiation)           │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions Surfaced by Screenshots

### 1. The "To Send / To Redeem" dual balance chip
Every Guusto screen shows two persistent balance chips in the header. This is Guusto's most important persistent UI element. CC must replicate "To Send" as a native CC element (budget ledger). "To Redeem" is Guusto-side and may be surfaced in Phase 3 via API.

### 2. GIF / image in recognition cards
Guusto's recognition cards support GIF attachments (we see Michael Scott and Dwight, "Cheers to you" GIFs). This is a delight layer that drives the social/emotional response. CC should support image/GIF attachment in the shoutout compose flow — it's a low-effort high-impact feature.

### 3. Reason badges with icons on gift notification emails
The email notification shows the value/reason as a badge with an icon on the physical gift card. This means CC's value tags need to map to Guusto's "Gift Reasons" system with associated icons. Negotiate for custom reason labels at the org level (not a fixed Guusto taxonomy).

### 4. "No Workspace Access" tier = the frontline architecture
Guusto's frontline model is not a special UI — it's an access level. Frontline workers are employees with "No Workspace Access" who receive gifts via SMS/personal email and never log in. CC should adopt this exact model: recognition reaches them via notification link; the redemption is the only CC/Guusto touchpoint they ever have.

### 5. The Approvals queue has full message preview
The Approvals tab shows the complete recognition message before approve/decline. This is essential UX — don't reduce approvals to a name + amount. Approvers need context.

### 6. The Shoutout Draw is a gamification lite feature
The "Make a Shoutout Draw" button in Team Participation is a random winner picker from the shoutout pool. It's a lightweight gamification feature (raffle, not leaderboard) that doesn't create competition anxiety. Worth evaluating for Phase 2 as a manager engagement tool.

### 7. Workspace-level balance is always visible
The Custom Reports and Manage Members screens both show "Workspace Balance: $46,399" as a persistent chip. This is the total available gifting budget at the org level. CC should surface this to HR admins in the program dashboard, not buried in a settings page.

### 8. SFTP delivery for reports = enterprise payroll/HRIS signal
The Custom Reports "Share Report" modal offers Email or SFTP as delivery options. SFTP is for enterprise integrations with payroll or HRIS systems. This is the IRS-compliant export pathway. CC's reporting export should offer CSV download (Phase 1) and SFTP/scheduled delivery (Phase 3).
