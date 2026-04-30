# PRD: Rewards & Recognition (R&R) Module
**Status:** Draft — In Progress  
**Author:** Product (Arnaud Grunwald)  
**Last Updated:** 2026-04-28  
**Version:** 0.9 — Full Draft

---

## Table of Contents
1. [Overview](#1-overview)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Non-Goals](#3-goals--non-goals)
4. [User Personas](#4-user-personas)
5. [User Stories](#5-user-stories)
6. [Feature Scope](#6-feature-scope)
7. [Requirements](#7-requirements)
8. [Guusto Partnership Model](#8-guusto-partnership-model)
9. [Success Metrics](#9-success-metrics)
10. [Open Questions](#10-open-questions)
11. [Timeline & Phasing](#11-timeline--phasing)
12. [Dependencies](#12-dependencies)

---

## 1. Overview

ClearCompany is adding a **Rewards & Recognition (R&R)** module to its talent management platform. This module enables organizations to formalize and scale employee recognition — both peer-to-peer and manager-to-employee — with optional monetary rewards powered by a gifting integration with **Guusto**.

The module sits within ClearCompany's existing performance and engagement surface, complementing performance reviews, goal-tracking, and onboarding workflows. In v1, reward fulfillment (gift delivery, redemption, catalog) is entirely handled by Guusto via embedded integration; ClearCompany owns the recognition experience and the data layer.

> **Key strategic framing:** This is a **platform stickiness and consolidation play**, not a feature gap that is currently costing ClearCompany deals. Customers express demand for R&R in surveys; ClearCompany has not demonstrably lost a deal without it. The investment thesis is churn reduction through consolidation and daily engagement — not immediate revenue recovery.

---

## 2. Problem Statement

> **Note on evidence quality:** The demand signal for R&R is expressed but not yet demonstrated in deal outcomes. Customer surveys show interest; ClearCompany has not verifiably lost a deal for lack of R&R capability. This shapes how we frame the problem and prioritize investment. This is a **platform stickiness and consolidation play**, not a feature gap that is currently costing us deals.

---

### 2.1 The Customer-Facing Problem

Recognition at most organizations is fragmented and invisible. Managers send a Slack message or say something in a 1:1; the moment disappears. There is no record, no visibility to HR, no connection to performance data, and no consistency across teams or departments.

For **frontline-heavy organizations** — the segment where Guusto has built a proven moat — the problem is acutely worse: frontline workers often lack company email, corporate devices, or access to desktop software entirely, making them structurally excluded from the recognition tools that do exist.

**The operational consequences for HR:**
- Recognition frequency varies wildly by manager; some employees go months without acknowledgment
- Monetary reward budgets sit underutilized because managers lack tooling to distribute them intentionally
- HR cannot identify which teams are under-recognized, which managers are strong culture builders, or whether recognition correlates with retention and performance outcomes
- Recognition data lives outside the HR system of record, making it invisible to the employee lifecycle picture

---

### 2.2 The ClearCompany Business Problem

ClearCompany's current strategic priority is **churn reduction through consolidation** — becoming more indispensable by reducing the number of tools customers need to manage the employee lifecycle.

Embedding R&R within ClearCompany:
1. **Reduces fragmentation** — one fewer tool for HR to manage
2. **Creates daily/weekly engagement with ClearCompany** — recognition is a higher-frequency touchpoint than performance reviews or onboarding
3. **Creates a recognition data layer** — recognition moments captured inside ClearCompany feed performance reviews, goal tracking, and employee profiles
4. **Differentiates against point solutions** — standalone R&R vendors cannot offer recognition connected to performance data, hiring history, or onboarding milestones

---

### 2.3 Why Now

**1. HCM platforms are shifting to embed, not build.** The market is moving from "build R&R in-house" to "embed a specialist via white-label or API." Guusto already has proven iFrame integrations with Microsoft Teams and Outlook.

**2. The Guusto partnership shortcuts the hardest problems.** The moats in R&R are not the social layer — they are the payment infrastructure, brand partnership approvals for the gift card catalog (Amazon, Lululemon require vetting), and domain expertise in frontline program design. Guusto has spent years building these.

**3. The demand signal is real even if not yet deal-breaking.** Customers are telling ClearCompany they want this. The window to be a differentiator — rather than catch-up — is now.

---

### 2.4 Who Is Affected

| Persona | Problem |
|---|---|
| **Frontline employee** (no corporate email/device) | Entirely excluded from existing recognition tools; recognition is verbal and ephemeral |
| **Desk employee** | Recognition is Slack-only; no record, no visibility, no values connection |
| **Manager** | Has recognition intent but no tooling; budget sits idle; recognition is inconsistent across team |
| **HR admin** | No org-wide data; cannot identify recognition gaps or demonstrate program ROI |
| **ClearCompany (business)** | Customer churn risk from fragmented HR stack; missing a high-frequency daily engagement touchpoint |

---

### 2.5 Cost of Not Solving It

**For customers:** Continued recognition fragmentation → elevated turnover risk, particularly in frontline segments. Frontline employee turnover in retail/healthcare runs 40–100%+ annually.

**For ClearCompany:** Every month without R&R is a month where customers consider adding a standalone R&R vendor — and each new vendor is a thread that could unravel the ClearCompany relationship.

**The honest nuance:** R&R is currently a "cherry on top." The investment thesis is that embedding it now, before it becomes table stakes, is the right time to build the capability and lock in the data layer. **This is a platform depth play, not a revenue emergency.**

---

## 3. Goals & Non-Goals

### 3.1 Goals

#### Goal 1 — Reduce churn risk by increasing platform depth
Customers who use more ClearCompany modules are harder to churn. R&R adds a daily/weekly touchpoint that performance reviews and onboarding do not.

**How we'll know it worked:** R&R-enabled accounts churn at a statistically lower rate than matched control accounts at 12 months. Target: ≥15% reduction in 12-month churn rate among R&R-enabled accounts vs. baseline.

---

#### Goal 2 — Become the recognition system of record for the employee lifecycle
ClearCompany already holds performance review, goal, and onboarding data. By capturing recognition moments in the same system, ClearCompany becomes the most complete picture of an employee's contributions — something no standalone R&R vendor can offer.

**How we'll know it worked:** Recognition records appear on employee profiles alongside performance reviews within 1 sprint. HR admins report recognition data influences review conversations (target: ≥50% in surveys).

---

#### Goal 3 — Drive consistent, org-wide recognition where none exists today
Most organizations have recognition intent but lack a structured channel. Giving them one changes behavior — but only if the tool is low-friction enough that busy managers actually use it.

**How we'll know it worked:** ≥50% of managers with budget send at least 1 recognition within 30 days; ≥60% of eligible employees receive at least 1 recognition within 90 days.

---

#### Goal 4 — Give HR visibility they don't have today
HR's biggest pain is that recognition is invisible. Surfacing this data is itself a product value.

**How we'll know it worked:** Admins can access org-wide recognition dashboards within 2 sprints of Phase 1 launch. ≥70% of HR admins surveyed at 60 days report meaningful new insight from the reporting view.

---

#### Goal 5 — Validate the Guusto partnership model before commercial commitment
The partnership is pre-commercial. The fastest way to de-risk the commercial negotiation is to prove the integration works and that ClearCompany adds unique value on top of Guusto.

**How we'll know it worked:** Working prototype demonstrated within 1 hackathon/sprint. At least 2 pilot customers activated before commercial framework is signed. Prototype surfaces at least 1 ClearCompany-specific insight that Guusto cannot offer standalone.

---

### 3.2 Non-Goals

| # | Non-Goal | Rationale |
|---|---|---|
| **NG-1** | Building our own gift card catalog, payment infrastructure, or reward fulfillment | Guusto's catalog, payment compliance, and brand partnership approvals are multi-year moats. We integrate, we don't replicate. |
| **NG-2** | A points-based earn-and-spend economy | Points systems add significant complexity and change the psychology of recognition. Guusto's direct dollar-value model is simpler and more motivating. Revisit in v2 with customer validation. |
| **NG-3** | Replacing human recognition with AI automation | Recognition fundamentally requires human-to-human interaction (Guusto's CEO confirmed this explicitly). AI may assist (draft a message, suggest who to recognize) but does not send on behalf of a human. |
| **NG-4** | Milestone / work anniversary recognition | Separate roadmap initiative requiring HRIS date data, automation logic, and distinct admin configuration. Deferred to v2 once the base integration is stable. |
| **NG-5** | Gamification (leaderboards, streaks, badges) | Creates recognition inflation, anxiety, and gaming incentives. Requires separate behavioral design review before any implementation. |
| **NG-6** | Tax / payroll compliance reporting (1099, W-2 imputation) | Legal open question blocking this indefinitely. v1 will include disclosure that recipients are responsible for tax implications above thresholds. Full compliance reporting is v2+. |
| **NG-7** | External or public-facing recognition | Brand, privacy, and content moderation risks. Internal-only for v1. |
| **NG-8** | Solving all frontline-specific UX challenges in-house | Guusto has deep expertise in reaching frontline workers (SMS, QR code, shared-device flows). We embed their delivery mechanisms, we don't re-engineer them. |

---

### 3.3 Goals vs. Non-Goals at a Glance

```
IN SCOPE (v1)                         OUT OF SCOPE (v1)
──────────────────────────────────    ──────────────────────────────────
Social recognition (peer, mgr)        Points / earn-and-spend economy
Values tagging                        Gamification (leaderboards)
Monetary rewards via Guusto           Building own gift catalog/payments
Budget management (admin)             AI-sent / automated recognition
Recognition on employee profile       Milestone / anniversary programs
HR analytics & reporting              Tax / payroll compliance reporting
Guusto iFrame / API integration       External / public recognition
Slack / Teams notifications           Frontline device infrastructure (DIY)
```

---

## 4. User Personas

---

### Persona 1: The Frontline Worker — Maria Delgado

**Role:** Certified Nursing Assistant (CNA) at a regional hospital network (~800 employees, 3 facilities)

**Profile:** Maria has worked on the cardiac step-down unit for six years. She shares one break-room tablet with eleven coworkers, has no company email address, and her "work device" is the nurses' station phone. She's been recognized twice in six years — once a handwritten card taped to her locker, once a mention at a staff meeting she wasn't present for because she was on shift.

**Core Motivation:** Feel seen — not by a system, but by her charge nurse and peers. A gift card to Target that she can actually use on her commute home is a bonus that matters to her budget.

**Biggest Friction Today:** Recognition exists only as vapor — spoken words that evaporate. There is no record of her contributions. Every "employee portal" the hospital has rolled out required a company email she doesn't have, and she's been locked out of three different HR systems.

**Interaction Frequency:** Passive recipient primarily. Interacts when she receives an SMS or personal email notification. Might recognize a peer 2–3 times per year if the process is genuinely frictionless.

**What "Success" Looks Like:** She receives a text. Clicks a link. Sees who recognized her and what they said. Redeems a $25 gift card without creating an account or talking to IT. The whole process takes under three minutes.

**Representative Quotes:**
- *"Every time they roll out a new system I can't get into it because I don't have a hospital email. I just stop trying."*
- *"I don't need a big ceremony. I just want to know someone noticed when I did something right."*

**Biggest Fear:** That it will require a company email or app download, and she'll end up with an unredeemed reward she can never access — again.

---

### Persona 2: The Desk Employee / Peer — Trevor Okafor

**Role:** Account Coordinator at a B2B SaaS company (~300 employees, distributed across three time zones)

**Profile:** Trevor has been at the company 18 months. He's a natural connector — first to notice when a teammate goes above and beyond. He works in Slack and Google Workspace daily. He abandoned the company's previous recognition tool after logging in twice and finding it clunky and disconnected from everything else he actually uses.

**Core Motivation:** Acknowledge colleagues publicly in a way that feels human and timely — ideally within minutes of something happening, not days later when the moment has passed.

**Biggest Friction Today:** Context switching is the killer. By the time he logs into a separate tool, the impulse is gone. The previous tool also had a blank-slate message box with no prompts, and staring at it felt like writing a LinkedIn post.

**Interaction Frequency:** High intent, inconsistent behavior. Wants to recognize peers 2–4x/month but currently does it 0–1x due to friction.

**What "Success" Looks Like:** A 90-second recognition act from inside ClearCompany or Slack. Visible confirmation that the person received and opened it. Recognition visible in performance review context.

**Representative Quotes:**
- *"I want to recognize people. I just can't be expected to log into a fifth different system to do it."*
- *"The best part about recognizing someone is seeing their reaction. If I can't see that they got it, it doesn't feel like it landed."*

**Biggest Fear:** That it becomes mandatory ("you must send 2 recognitions per month") and starts to feel performative — cheapening the act he actually cares about.

---

### Persona 3: The People Manager — Sandra Park

**Role:** Engineering Manager, 8 direct reports, mid-market fintech (~500 employees, hybrid-remote)

**Profile:** Sandra is a first-time manager who moved into the role 14 months ago. Her company gave her a $100/month recognition budget in the form of a corporate card with unclear usage rules. She's spent approximately $0 of it because she doesn't know what she's allowed to buy, isn't sure how to track it for tax purposes, and is afraid of doing it wrong.

**Core Motivation:** Retain her team. She's watched two strong engineers leave in the past year partly because they felt undervalued, and she knows recognition is a lever she's not pulling.

**Biggest Friction Today:** The recognition budget she has is more stressful than helpful because there are no guardrails. She doesn't know her remaining balance, doesn't know what's taxable, and doesn't know whether to document rewards for performance reviews.

**Interaction Frequency:** Expects to use the system weekly — checking team recognition activity, sending 2–4 rewards per month, reviewing participation data before 1:1s and performance review cycles.

**What "Success" Looks Like:** Real-time budget visibility. Send a reward in under two minutes from inside ClearCompany. Pull up a timeline of each direct report's recognitions before performance reviews. A nudge when someone hasn't been recognized in 30+ days.

**Representative Quotes:**
- *"I have a recognition budget and I basically don't use it because I'm not sure how any of it works and I don't want to do it wrong."*
- *"I want to show my reports, concretely, that I notice what they're doing."*

**Biggest Fear:** That she'll send a reward, the employee won't receive or redeem it, and she'll have to open a support ticket to fix it — making the program more trouble than it's worth and eroding trust with her team.

---

### Persona 4: The HR Admin / HRBP — Dominique Reyes

**Role:** HR Business Partner / Program Owner at a multi-location retail chain (~1,200 employees across 40 stores, corporate HQ team of ~60)

**Profile:** Dominique championed buying a recognition tool two years ago, fought for the budget, and then watched adoption flatline at 18% because managers never trained on it and frontline workers couldn't access it. She's determined not to repeat that. She's a power user of ClearCompany — she lives in the analytics tabs — and she has a standing quarterly deck for the CPO that includes turnover rates, engagement scores, and program utilization.

**Core Motivation:** Demonstrate that the R&R program is working with real numbers. She can fight for budget with data. She cannot fight for budget if the only evidence is "people say they like it."

**Biggest Friction Today:** Her current recognition tool exports a CSV dump that doesn't connect to anything. She manually cross-references it with turnover data in a separate spreadsheet once a quarter. Four hours she doesn't have. She can't identify dark spots in coverage without doing the merge herself.

**Interaction Frequency:** Daily during setup and launches; weekly for monitoring dashboards; monthly for reporting; quarterly for executive prep.

**What "Success" Looks Like:** A live dashboard inside ClearCompany showing recognition send rate by department, manager, and job classification; budget utilization with drill-down; flagged anomalies. When the CPO asks "is recognition actually correlated with retention," she has a defensible answer — not a spreadsheet.

**Representative Quotes:**
- *"I can't get more budget for a program I can't measure."*
- *"The last tool was supposed to be easy for frontline workers and it wasn't. I need to know before I launch this whether a CNA with no company email can actually redeem a gift card."*

**Biggest Fear:** Same arc as the last tool — a spike at launch, then six months of declining usage, and a program she has to sunset while explaining to the CPO what went wrong.

---

### Persona 5: The Executive — Jonathan Whitfield

**Role:** VP of People at a professional services firm (~900 employees, high voluntary turnover)

**Profile:** Jonathan has been VP of People for two years and inherited a 28% voluntary turnover rate. He's made three bets to move that number: compensation benchmarking, manager effectiveness, and recognition. He's not a hands-on user of HR software — his team operates the tools — but he cares deeply about whether programs are working and whether he can tell a credible story about them to the board.

**Core Motivation:** Move the turnover needle and be able to attribute that movement to specific programs. Recognition is his lowest-cost, fastest-to-deploy intervention. He needs it to be defensible analytically, not just anecdotally.

**Interaction Frequency:** Doesn't interact with the R&R module directly. Reviews executive-level summary dashboards monthly; receives a prepared report from Dominique quarterly; gets escalations when something goes wrong publicly.

**What "Success" Looks Like:** In 12 months: employees in the top quartile of recognition received had X% lower voluntary turnover than those in the bottom quartile. A credible, clean story backed by data his CFO won't be able to dismiss.

**Representative Quotes:**
- *"I believe recognition matters. What I need is the data to prove it to someone who doesn't believe it yet."*
- *"If this system is just another place for HR to log activity, it won't get renewed. It needs to show up in retention."*

**Biggest Fear:** That recognition data will live in ClearCompany in a silo that can't be connected to turnover or performance data — and he'll be back to making the same argument from anecdotes in two years.

---

## 5. User Stories

---

### Frontline Employee (Maria)

**P1 — Receive recognition without a corporate email or device**
As a frontline employee without a corporate email address, I want to receive a recognition notification via personal email or SMS so that I am not excluded from the recognition program because of my access tier.

**P2 — Redeem a gift card without creating an account**
As a frontline employee, I want to redeem a gift reward by clicking a link and selecting a merchant without being required to create a platform account or download an app, so that I can access my reward within minutes of receiving it.

**P3 — View my recognition history on a lightweight profile**
As a frontline employee, I want to view a simple history of recognitions I have received — including who sent them and what they said — so that I have a record of my contributions I can reference during performance conversations.

**P4 — Nominate a peer without needing platform access**
As a frontline employee who wants to recognize a colleague, I want to submit a peer nomination through a simple web form (accessible via link on a break-room poster or manager-shared SMS) so that I can participate even when I don't have daily platform access.

**P5 — Re-notification for an unclaimed reward**
As a frontline employee, I want to receive a follow-up notification if I haven't redeemed a gift card within 7 days, so that I don't lose a reward because I missed the first notification.

**Edge case — Redemption fails mid-flow**
As a frontline employee whose gift card redemption link has expired or returned an error, I want to receive a clear error message with a support contact or self-service re-issue option so that I am not left with a broken reward and no recourse.

---

### Desk Employee / Peer (Trevor)

**P1 — Send a peer recognition from within ClearCompany**
As a desk employee, I want to recognize a peer directly within ClearCompany — finding them by name and sending a message with an optional value tag — so that I can complete the act in under two minutes without switching tools.

**P2 — AI-drafted recognition message I can edit before sending**
As a desk employee who struggles to start writing, I want the platform to suggest a draft message based on the person's name and a value category I select, so that I can recognize someone authentically without staring at a blank text box. (AI suggests; human reviews and confirms before send — always.)

**P3 — Confirmation that my recognition was delivered and viewed**
As a desk employee who has sent a recognition, I want to see a delivery status indicator (sent / delivered / viewed) in my recognition history so that I know the message landed.

**P4 — Timeline of recognitions on my employee profile**
As a desk employee, I want my employee profile to include a recognition timeline so that recognitions I've given and received are part of my visible work history and can be referenced during reviews.

**Edge case — First-time use with no recognitions sent or received**
As a desk employee who has never used the R&R module, I want to see an empty state that shows me how to send my first recognition — including an example and estimated time to complete — so that I understand what the feature does before I commit.

---

### People Manager (Sandra)

**P1 — View my real-time recognition budget balance and transaction history**
As a people manager, I want to see my current recognition budget balance and a log of every reward I have sent (recipient, amount, date) so that I can manage my budget responsibly without asking Finance or HR.

**P2 — Send a monetary reward to a direct report from inside ClearCompany**
As a people manager with a recognition budget, I want to send a gift reward to a direct report by selecting an amount, writing a message, and confirming — without leaving ClearCompany — so that the act of rewarding is low-friction enough that I actually do it.

**P3 — Nudge when a direct report hasn't been recognized in 30+ days**
As a people manager, I want to receive a weekly digest or in-app alert when any of my direct reports has not received a recognition in more than 30 days, so that I can proactively close recognition gaps.

**P4 — Review my team's recognition activity before a performance review cycle**
As a people manager preparing for performance reviews, I want to view a per-employee summary of recognitions received and sent during a selected date range so that I have documented evidence of contributions and collaboration patterns.

**Edge case — Attempting to send a reward that exceeds remaining budget**
As a people manager who has nearly exhausted my recognition budget, I want to be prevented from sending a reward that would exceed my balance — and shown my current balance and a request-more-budget option — so that I don't learn about the limit only after attempting to send.

---

### HR Admin / HRBP (Dominique)

**P1 — Configure recognition program rules from the ClearCompany admin panel**
As an HR admin, I want to configure all recognition program parameters — budget per manager, eligible employee populations, value tags, reward denominations, and recognition types — from a single admin panel, so that I don't need to manage settings across two platforms.

**P2 — View a real-time dashboard showing recognition activity by department, manager, and job type**
As an HR admin, I want a recognition analytics dashboard segmented by department, manager, location, and job classification so that I can identify coverage gaps before they become attrition risks.

**P3 — Track gift delivery status and flag undelivered rewards**
As an HR admin, I want to see the delivery and redemption status of every reward issued — pending, delivered, redeemed, failed, expired — so that I can intervene when a reward hasn't reached its recipient.

**P4 — Export a recognition report formatted for executive presentation**
As an HR admin preparing a quarterly executive report, I want to export a pre-formatted summary report for a selected time period so that I spend time analyzing results, not assembling them.

**Edge case — Bulk import of employees who lack corporate email addresses**
As an HR admin onboarding 200 new frontline employees, I want to bulk-upload employee records with personal email addresses or mobile numbers as the notification channel so that recognition can reach them from day one.

**Edge case — Manager with zero activity in 60+ days**
As an HR admin, I want the dashboard to proactively flag managers who have budget allocated but have sent zero recognitions in more than 60 days, so that I can reach out before the inactivity becomes a program health problem.

---

### Executive (Jonathan)

**P1 — Executive summary of recognition program health**
As a VP of People, I want an executive summary view — a single screen showing participation rate, budget utilization, org-wide coverage, and a trend line — so that I can assess program health in under two minutes.

**P2 — Recognition data correlated with retention and performance in ClearCompany**
As a VP of People, I want to view recognition frequency alongside retention indicators and performance data in ClearCompany's people analytics layer, so that I can assess whether recognition correlates with the outcomes I care about without building a spreadsheet model.

**P3 — Monthly program health summary via email digest**
As a VP of People who does not log into the recognition module daily, I want to receive a monthly email digest summarizing program health so that I stay informed without relying on my team to proactively brief me.

**P4 — Identify which business units have the lowest recognition coverage**
As a VP of People concerned about recognition equity, I want to see a ranked view of recognition coverage by business unit, location, and job classification so that I can focus manager coaching where recognition is most absent.

**Edge case — Program has been live for 30 days with low overall adoption**
As a VP of People reviewing early program data, I want to see early adoption benchmarks alongside actual adoption so that I can distinguish a normal ramp curve from a genuine adoption failure.

---

## 6. Feature Scope

---

### 6.1 Recognition (Social Layer)

**Overview**
The Social Recognition layer is the heartbeat of the R&R module — the lightweight, high-frequency behavior that drives daily engagement. Employees send "shoutouts" to peers or reports, tagging one or more company values, optionally attaching a reward. The feed surfaces these moments publicly (or within configured visibility boundaries). This is ClearCompany-owned territory: the UX, the data model, and the connection to performance surfaces all live natively in CC.

**Key User Flows**

*Sending a shoutout:*
1. User clicks "Recognize" from the global nav, an employee profile, or a contextual nudge (e.g., goal completion, peer review prompt).
2. Recipient search pulls from the ClearCompany employee directory — name, avatar, department, manager chain pre-populated.
3. Sender writes a freeform message (150–500 char limit with live counter). AI drafting assist is available as an optional inline suggestion — sender always edits and confirms before posting.
4. Sender selects 1–3 company values from the admin-configured list. Values are **required**, not optional.
5. Sender chooses visibility: Company-wide | Team only | Private.
6. Optional: sender attaches a monetary gift (triggers Rewards & Gifting flow — see 6.2).
7. On post: recognition published to feed, recipient receives in-app + email notification, Slack/Teams card pushed if configured.

*Viewing and engaging with the feed:*
1. Feed is accessible from the R&R module home. Default: all company-wide shoutouts, reverse chronological.
2. Filter controls: by value, by department, by time range, by whether a reward was attached.
3. Reactions: emoji-style (thumbs up, applause, star) — ClearCompany-native. Comments deferred to v2.
4. Clicking a shoutout opens a detail view showing sender, recipient, message, values, reactions, and gift status (without dollar amount visible to non-admins).

**What ClearCompany Builds vs. What Guusto Provides**

| Surface | Owner |
|---|---|
| Shoutout compose UI | ClearCompany |
| Feed rendering | ClearCompany |
| Values tagging + admin configuration | ClearCompany |
| Employee directory lookup | ClearCompany |
| AI drafting assist | ClearCompany |
| Reactions | ClearCompany |
| Notification routing (in-app, email, Slack/Teams) | ClearCompany |
| Recognition data model + storage | ClearCompany |
| Gift attach trigger → hands off to Guusto | Boundary |
| Gift delivery, redemption, catalog | Guusto |

**Key Design Decisions**
- *Values required vs. optional:* **Required.** This is the primary analytics signal. Optional values produce low-quality data. Max 8 values in the list to reduce friction.
- *Feed visibility default:* **Company-wide by default** with sender opt-down to team or private.
- *AI assist UX:* Ghost suggestion the sender must explicitly accept or overwrite. Never auto-post. Clearly labeled as AI-suggested.
- *Dollar amount visibility:* Amounts visible only to sender, recipient, and admins. Feed shows "a gift was included" without dollar figure.

**Connections to Other ClearCompany Surfaces**
- **Employee Profile:** All received recognitions appear on a dedicated tab, visible to manager and HR.
- **Performance Reviews:** In v1, recognition surfaced as a read-only reference panel inside the review form. In v2, recognition signals can be auto-imported as supporting evidence.
- **Goal Tracking:** Goal completion events trigger optional recognition nudges ("Arnaud just completed Q2 Sales Goal — want to recognize them?").
- **Onboarding:** New hire milestones generate a contextual prompt for the manager to send a first recognition.

**v1 Scope vs. Deferred**

| In v1 | Deferred |
|---|---|
| Shoutout send + feed | Comments on shoutouts |
| Values tagging (required) | Custom reaction types |
| Basic visibility controls | Recognition streaks / gamification |
| Reactions (standard set) | Manager-prompted bulk recognition |
| AI drafting assist (opt-in) | Performance review write-back |
| Profile integration (read-only) | SMS / push mobile notifications |
| Email + in-app notifications | |

---

### 6.2 Rewards & Gifting (Monetary Layer)

**Overview**
Monetary rewards allow managers to attach real dollar-value gifts to recognitions or send standalone gifts. The fulfillment pipeline is entirely Guusto-powered: ClearCompany captures the send intent and budget deduction, then hands off to Guusto for delivery, redemption, and catalog. ClearCompany stays out of the money movement business while preserving ownership of the recognition context and data.

**Key User Flows**

*Attaching a gift to a shoutout (inline):*
1. During shoutout composition, sender clicks "Add a gift."
2. Budget availability check: CC displays sender's remaining budget in real time. If $0, the option is grayed out with a tooltip.
3. Sender enters a dollar amount within their available budget.
4. Sender selects delivery method: Email | SMS | QR code (for frontline/shared-device). Default pulls from recipient's profile.
5. Gift is staged (not yet deducted) until the shoutout is posted. On post, budget is reserved and Guusto API call is triggered.
6. Confirmation screen shows: recipient name, amount, delivery method, expected timing. Recipient chooses catalog item at redemption — not at this stage.

*Recipient redemption flow:*
1. Recipient receives email/SMS with a Guusto gift link.
2. Recipient clicks link → lands in Guusto redemption UI (iFrame embedded in CC shell).
3. Recipient browses catalog (60,000+ merchants), selects gift card, confirms. Guusto handles fulfillment.
4. CC receives a redemption webhook from Guusto. Recognition record updated with redemption status.

*Failure handling:*
- Email bounce: CC flags delivery failure, surfaces to sender with options to resend via SMS or QR.
- Gift expiry: CC surfaces expiry warnings at 30 and 7 days.
- Budget exhaustion mid-flow: budget reservation rolled back; sender notified.

**What ClearCompany Builds vs. What Guusto Provides**

| Surface | Owner |
|---|---|
| Gift attach UI in shoutout flow | ClearCompany |
| Standalone gift send UI | ClearCompany |
| Budget availability check + reservation | ClearCompany |
| Delivery method selection UI | ClearCompany |
| Guusto API call to issue gift link | ClearCompany |
| Gift link delivery (email/SMS/QR) | Guusto |
| Redemption catalog UI | Guusto |
| Gift fulfillment | Guusto |
| Redemption webhook → CC data update | Guusto (sends) / ClearCompany (receives) |
| Failure notification to sender | ClearCompany |

**Key Design Decisions**
- *Minimum gift amount:* $5 minimum (configurable) to prevent token gifts that feel dismissive.
- *Recipient catalog choice:* Guusto's model is recipient-choice at redemption. Do not constrain this in v1.
- *Standalone gifts require a message:* Even standalone gifts must include a message to keep all monetary gifts tied to a recognition context — preventing the module from becoming a pure cash distribution tool.

---

### 6.3 Budget Management

**Overview**
Budget Management gives HR admins granular control over recognition spend, distributes budgets to managers, and enforces real-time spend limits without requiring manual approval workflows. Built entirely within ClearCompany — Guusto has no visibility into how CC allocates internal budgets.

**Key User Flows**

*Admin configures program budget:*
1. Admin navigates to R&R Settings > Budget.
2. Admin sets org-level annual or quarterly budget. Selects allocation model: per-manager allotment | per-employee pool | hybrid.
3. Sets reset cadence (monthly/quarterly/annually) and rollover policy (roll over up to a cap | forfeit | return to org pool).
4. Budget records created for each manager. Real-time balances initialized.

*Manager views and uses budget:*
1. Manager sees current budget balance prominently: "You have $X remaining this quarter."
2. Budget deducted in real time when a gift is sent (reserved at compose, committed on post).
3. Manager receives proactive equity nudge: "You have $150 remaining with 6 weeks left. You've recognized 3 of 8 direct reports." Advisory only, never blocking.

**What ClearCompany Builds vs. What Guusto Provides**

| Surface | Owner |
|---|---|
| Budget allocation logic + data model | ClearCompany |
| Manager balance UI | ClearCompany |
| Real-time spend deduction | ClearCompany |
| Equity nudge engine | ClearCompany |
| Admin budget configuration UI | ClearCompany |
| Org-level Guusto account funding | Customer (via Guusto admin portal) |
| Actual money movement / gift fulfillment | Guusto |

**Key Design Decisions**
- *Real-time vs. async deduction:* Real-time reservation with async commit. Reserve at compose, commit on post, rollback on failure. Requires a budget ledger (not a mutable balance column) for audit trail.
- *Rollover policy default:* No rollover by default — unused budget returns to org pool. Creates urgency without carry-forward liability.

---

### 6.4 Rewards Catalog

**Overview**
The Rewards Catalog is entirely Guusto-owned. ClearCompany does not maintain a catalog, curate merchant lists, or handle fulfillment. Core principle: **recipient choice at redemption** — the recipient receives a dollar-value gift link and chooses their own reward from Guusto's catalog.

**What ClearCompany Builds vs. What Guusto Provides**

| Surface | Owner |
|---|---|
| Redemption link generation | Guusto |
| Catalog UI (browsing, search, selection) | Guusto |
| Merchant relationships + fulfillment | Guusto |
| iFrame embed shell / wrapper | ClearCompany |
| Redemption webhook receipt + status update | ClearCompany |
| Gift status display in sender history | ClearCompany |

**Key Design Decisions**
- *iFrame vs. API:* See Section 8 for full recommendation. In v1, iFrame for catalog only.
- *Catalog customization:* Admin-configurable category restrictions (e.g., exclude alcohol retailers) passed to Guusto at the org level.
- *Merchant category data:* CC should negotiate to receive merchant category (not specific merchant) in the redemption webhook for analytics purposes.

---

### 6.5 Reporting & Analytics

**Overview**
Reporting is where the "recognition as data layer" thesis becomes tangible ROI for HR leaders. ClearCompany builds the analytics layer natively, connecting recognition behavior to performance outcomes, onboarding success, and equity signals in ways that only a platform with the full employee lifecycle can offer.

**Key User Flows**

*HR Admin — Program Health Dashboard:*
1. Admin views: Total recognitions sent (period), % employees who sent/received at least one, Total rewards value sent, Redemption rate, Values distribution (bar chart by value tag).
2. Drill-down: by department, by manager, by time range.
3. Equity view: heatmap showing recognition sent/received by department, level, or manager team. Flags outlier managers.
4. Export: CSV of all recognition events for HRIS reporting or payroll (IRS tracking).

*Manager — My Team Dashboard:*
1. Count of recognitions sent to each direct report, budget spent vs. allocated, direct reports who have NOT received recognition this period (flagged as action items).
2. "Recognition history" for each direct report: timeline cross-referenced with tenure and performance cycle timing.

**What ClearCompany Builds vs. What Guusto Provides**

| Surface | Owner |
|---|---|
| Recognition event data store | ClearCompany |
| Values distribution analytics | ClearCompany |
| Equity signals + heatmap | ClearCompany |
| Manager team dashboard | ClearCompany |
| HR admin program health dashboard | ClearCompany |
| Budget utilization reporting | ClearCompany |
| Redemption rate (derived from Guusto webhook) | ClearCompany (built on Guusto data) |
| Raw Guusto Manager Insights | Guusto (accessible directly) |

**Key Design Decisions**
- *Build vs. embed for reporting:* Build natively in CC for all analytics that connect recognition to employee data. This is non-negotiable for the data layer thesis.
- *Correlation displays:* Clearly labeled as "patterns" not "causes." No causal language in v1.
- *IRS de minimis tracking:* The reporting export must include total reward value received per employee per tax year. Required for compliance.

---

### 6.6 Integrations

**Guusto Integration: iFrame vs. API — Definitive Recommendation**

**Recommendation: iFrame for v1, API migration path designed in from day one.**

The iFrame scope is intentionally narrow: the Guusto catalog redemption surface only. All recognition compose, gift attach, budget management, and reporting are ClearCompany-native.

| | iFrame (v1) | API (v2 target) |
|---|---|---|
| **Implementation time** | 2–4 weeks | 3–6 months |
| **UX control** | Limited inside iFrame | Full ownership |
| **Catalog maintenance** | Guusto handles automatically | CC must track API changes |
| **Data capture** | Via webhook only | Full at every touchpoint |
| **Brand seam** | Visible in catalog | None |
| **Proof of concept** | Fast | Slow |

The CC data model stores all recognition and gift transaction data against a CC-issued gift ID from day one. When the API migration occurs in v2, only the redemption UI changes — the data layer doesn't move.

**Slack / Microsoft Teams**
- Outbound: shoutout cards pushed to configured channel or user DM when a recognition is posted.
- Inbound (P1): slash command or Teams action for a lightweight recognize modal.
- Deferred: bi-directional reaction sync, full gift-attach from Slack, Teams bot for budget queries.

**ClearCompany HRIS**
- Recipient search reflects real-time org chart. Terminated employees ineligible immediately.
- Budget allocation must listen to org chart change events (manager reassignment → budget follows role, not person).
- Recognition records linked to canonical employee ID, not name or email.

**Email Fallback**
- CC sends recognition notification email natively. Guusto sends gift delivery email independently.
- These two emails arrive separately — not combined in v1. CC notification arrives first; Guusto gift link is second.

---

## 7. Requirements

---

### P0 — Must-Have

---

**P0-1: Social Recognition Send Flow**

Employee can send a recognition to one or more colleagues within ClearCompany, capturing recipient(s), message, and at least one company value tag.

*Acceptance Criteria:*
- Given a logged-in employee on the send page, when they search for a recipient by name or email, then results are drawn from the active employee roster with ≤500ms latency at p95.
- Given a composed recognition, when the sender submits, then the record is persisted with: sender ID, recipient ID(s), message text, value tag(s), timestamp, and optional monetary reward reference.
- Given a network failure during submission, when the request times out or returns a 5xx, then the form state is preserved and the user is shown a retry prompt — no partial records are written.

*Technical considerations:* Multi-recipient sends fan out to individual recognition records per sender-recipient pair. Terminated employees must be excluded from recipient search in real time.

---

**P0-2: Company Values Tagging**

Each recognition must be tagged with one or more admin-configured company values. Values are displayed on the recognition card and used for analytics.

*Acceptance Criteria:*
- Given an admin has configured at least one value, when an employee composes a recognition, then the configured values are presented as selectable options.
- Given a recognition form submission with no value selected, when validated, then the form blocks submission and surfaces an inline error.
- Given an admin deactivates a value, when existing recognitions reference it, then historical records retain the original value label (stored as denormalized display name at write time — not a live reference).

*Technical considerations:* Values are per-tenant; deactivation must not retroactively alter historical records.

---

**P0-3: In-App and Email Notifications**

Recognition recipients receive both an in-app notification and an email notification when a recognition is sent.

*Acceptance Criteria:*
- Given a recognition is persisted, when the system processes the post-save event, then an in-app notification appears in the recipient's notification center within 60 seconds.
- Given the same event, when the email dispatch job runs, then a well-formed HTML email is delivered within 5 minutes under normal load.
- Given an employee with no verified email, when a recognition is sent to them, then the system logs the notification as undeliverable and falls back to in-app only — no unhandled error thrown.
- Given a recipient clicks the email deep link, when they are not authenticated, then they are redirected to login and returned to the recognition record after successful login.

*Technical considerations:* Use ClearCompany's existing transactional email provider. Emit notifications via the internal event bus — do not dispatch synchronously in the recognition write path.

---

**P0-4: Guusto Monetary Reward Attachment**

A manager or admin-permitted sender can optionally attach a monetary gift card reward to a recognition. This invokes the Guusto Send Gift API.

*Acceptance Criteria:*
- Given a sender has available budget > $0, when they toggle "Add a reward," then a dollar amount input (within remaining balance) is presented.
- Given a valid amount and recipient, when the sender submits, then ClearCompany calls the Guusto Send Gift API and marks the recognition as "reward attached" only upon a 2xx response.
- Given the Guusto API returns non-2xx or times out, when the system handles the error, then the recognition send is rolled back or the reward is flagged as "pending retry" and budget is not debited.
- Given a successful Guusto API call, when the gift is created, then the Guusto gift ID is stored on the recognition record for future redemption tracking.

*Technical considerations:* Budget deduction and Guusto API call must be two-phase: reserve optimistically on submission, confirm on Guusto 2xx, release on failure. Decouple via background job with idempotency key to prevent duplicate gift sends on retry.

---

**P0-5: Gift Delivery and Redemption Tracking**

Once a monetary reward is sent, ClearCompany tracks and surfaces the redemption status — pending, delivered, viewed, or redeemed.

*Acceptance Criteria:*
- Given a recognition with an attached gift, when the sender views the recognition detail, then current redemption status is displayed.
- Given Guusto fires a redemption webhook, when ClearCompany's endpoint receives it with a valid signature, then the redemption status is updated within 30 seconds.
- Given a webhook delivery failure or stale status (>24 hours), when detected, then a fallback polling job queries the Guusto gift status API and reconciles the local record.

*Technical considerations:* Webhook receiver secured by HMAC signature verification. Store webhook events in an append-only log before processing. Polling fallback cadence: every 6 hours for non-terminal statuses older than 24 hours.

---

**P0-6: Budget Management — Admin Allocation, Manager Spend, Real-Time Balance**

Admins can allocate recognition budgets to managers. Managers can view and spend from their allocation. All balance reads must reflect real-time committed state to prevent overdraft.

*Acceptance Criteria:*
- Given an admin sets a budget for a manager, when saved, then the manager's available balance is updated immediately.
- Given a manager composes a recognition with a reward, when their balance is queried, then the returned value reflects all previously committed gifts including in-flight reserved amounts.
- Given two concurrent recognition submissions by the same manager, when both are submitted simultaneously, then only one succeeds if the combined total exceeds available balance — no overdraft permitted under any race condition.
- Given a manager's budget is exhausted, when they attempt to attach a reward, then the input is blocked and remaining balance ($0.00) is clearly displayed.

*Technical considerations:* Must use database-level row locking (SELECT FOR UPDATE) to prevent race conditions. Use a ledger-style budget table (debit/credit events) rather than a mutable balance column.

---

**P0-7: Recognition on Employee Profile**

An employee's ClearCompany profile page displays a chronological record of recognitions they have received, including sender, message, value tags, and reward status.

*Acceptance Criteria:*
- Given a logged-in user navigates to their own profile, when the recognition tab is selected, then all recognitions received are displayed in reverse-chronological order.
- Given a monetary reward is attached to a recognition, when displayed on the profile, then the reward amount is shown only to the recipient and admins — not to peers.
- Given admin visibility setting is "manager-scoped," when a non-manager peer views the recipient's profile, then the recognition is not displayed.

*Technical considerations:* Visibility filtering must be enforced server-side. Monetary reward amounts must be excluded from peer-visible API responses at the serialization layer, not just the UI layer. Paginated at 20 records per page.

---

**P0-8: Audit Trail for Monetary Rewards**

Every monetary reward action — creation, Guusto API call, redemption status update, budget deduction, any admin override — is recorded in an immutable audit log.

*Acceptance Criteria:*
- Given any monetary reward is sent, when the Guusto API call is made, then an audit entry is written capturing: actor (sender ID), action, Guusto gift ID, amount, timestamp, and API response code.
- Given the Guusto redemption webhook fires, when the status update is applied, then an audit entry records: webhook event ID, gift ID, old status, new status, timestamp.
- Given an admin modifies a budget allocation, when committed, then an audit entry records: admin ID, target manager ID, old balance, new balance, timestamp.
- Given an audit entry is written, when any process attempts to modify it, then the operation is rejected — audit records are append-only.

*Technical considerations:* Separate append-only table. Audit log writes must NOT be in the same DB transaction as the main recognition write. Minimum retention: 7 years (pending legal confirmation per IRS records guidance).

---

**P0-9: Basic Admin Reporting**

Admins can access a reporting view showing recognition activity across the tenant: total recognitions, breakdown by value tag, monetary reward spend by manager, and gift redemption rates.

*Acceptance Criteria:*
- Given an admin applies a date range filter, when data refreshes, then it completes within 3 seconds for up to 1 year of history.
- Given the summary panel is loaded, then it displays: total recognitions sent, unique senders, unique recipients, total $ gifted, total $ redeemed, redemption rate %.
- Given a data export is requested, when the admin clicks "Export," then a CSV is generated containing one row per recognition with all non-PII fields plus redemption status.
- Given datasets > 10k records, when export is requested, then generation is async with a download link — no blocking of the request thread.

*Technical considerations:* Reporting queries should run against a read replica or materialized reporting table. Surface a data freshness timestamp on the dashboard.

---

**P0-10: Admin Configuration — Programs, Values, and Role Permissions**

Tenant admins can configure the recognition module: define company values, create named recognition programs, set visibility defaults, assign which roles can send monetary rewards, and enable/disable module features per tenant.

*Acceptance Criteria:*
- Given an admin creates a new company value, when saved, then it becomes immediately available in the send flow for all users in the tenant.
- Given an admin creates a named recognition program, when configuring it, then they must specify: program name, eligible sender roles, whether monetary rewards are allowed, default value tag(s) (optional), and visibility scope.
- Given a new tenant has the R&R module provisioned, when no configuration exists, then a sane default state is applied: 5 placeholder values, peer-to-peer program enabled, monetary rewards disabled.

*Technical considerations:* All configuration must be tenant-scoped — no cross-tenant data leakage. Admin config changes must take effect within 30 seconds for all active sessions.

---

### P1 — Should-Have

| # | Requirement | Acceptance Criteria (summary) |
|---|---|---|
| P1-1 | **Slack / Teams notifications (receive)** | Recognition triggers a Slack DM or Teams card within 5 minutes. Graceful fallback to email if integration not configured. |
| P1-2 | **Send recognition from Slack** | `/recognize @colleague message #value` slash command posts to CC feed with Slack source attribution. |
| P1-3 | **Recognition feed / social wall** | 20 most recent visible recognitions shown on load; real-time "X new recognitions" banner without full page reload. |
| P1-4 | **Manager participation gap view** | Dashboard shows each direct report's last recognized date and flags "not recognized in 30 days." Threshold configurable by admin. |
| P1-5 | **Comments and reactions on recognitions** | Emoji reactions and short text comments on feed cards. Comments trigger notification to recognition sender and recipient. |
| P1-6 | **Values analytics** | Bar chart of recognition count per value tag, ranked descending, for configurable date range. Admin and manager views. |
| P1-7 | **Budget rollover and expiry configuration** | Admin can configure: monthly/quarterly/annual periods; expire unused | roll over (to cap) | return to org pool. Period-end processing is idempotent. |

---

### P2 — Future Considerations

| # | Requirement | Rationale for Deferral |
|---|---|---|
| P2-1 | Points economy (earn-and-spend) | Significant complexity; changes psychology of recognition; requires separate product strategy validation |
| P2-2 | Milestone / anniversary recognition | Separate automation initiative requiring HRIS date fields and scheduling infrastructure |
| P2-3 | Gamification (leaderboards, badges, streaks) | Cultural risk; requires behavioral design review before building |
| P2-4 | Payroll tax reporting (1099, W-2 imputation) | Blocked on legal review; requires payroll system integration partnerships |
| P2-5 | Recognition ↔ performance correlation analytics | Requires 2+ quarters of data and data warehouse infrastructure; high value when data is sufficient |
| P2-6 | Custom rewards (branded swag, experiences) | Separate fulfillment vendor or catalog management system; out of scope for Guusto integration |
| P2-7 | HRIS write-back | Non-trivial per-vendor API lift; deferred to Phase 3+ aligned with broader HRIS partnership strategy |

---

## 8. Guusto Partnership Model

---

### 8.1 Integration Architecture Recommendation

**Recommendation: iFrame for v1 (catalog redemption only), full API migration designed in from day one.**

The iFrame scope is narrow: only the Guusto catalog redemption surface. All recognition compose, gift attach, budget management, and reporting are ClearCompany-native. This boundary is not a compromise — it is the correct allocation of responsibility.

**iFrame implementation requirements:**
- SSO: user authenticated in CC is silently authenticated in the Guusto iFrame via SAML or OAuth token exchange. No separate Guusto login prompt ever appears.
- Context passing: org ID, recipient email/phone, gift amount, and delivery method passed from CC to Guusto at iFrame initialization.
- Redemption webhook: Guusto fires webhook to CC on redemption events. Minimum payload: event type, CC-issued gift ID, timestamp, status. Merchant details negotiated as a contractual right for v2.
- Guusto-side brand config: org name, logo, and optional suppression of Guusto branding in the redemption flow.

**v2 API migration:** The CC data model stores all recognition and gift transaction data against a CC-issued gift ID from day one. When the API migration occurs in v2, the data layer doesn't change — only the redemption UI is replaced.

---

### 8.2 White-Label vs. Co-Brand vs. Native Build

| Surface | v1 | v2 Target |
|---|---|---|
| Recognition send (compose + shoutout) | **CC native** — no Guusto branding | CC native |
| Gift catalog (redemption) | **Co-branded** — Guusto branding visible in iFrame | **White-labeled** — CC brand throughout, Guusto attribution in footer only |
| Redemption notification email/SMS | **Co-branded** — "recognized by [Company] • powered by Guusto" | White-labeled |
| Reporting / analytics | **CC native** — Guusto's Manager Insights not embedded | CC native |
| Gift delivery notifications | **Guusto sends** with template customization (org name, logo, custom message) | Guusto sends, further white-labeled |

---

### 8.3 Commercial Model Options

| Option | Description | ClearCompany Leverage |
|---|---|---|
| **Option 1: Per-seat pass-through** | CC resells Guusto per-seat pricing with markup | Low — positions CC as a reseller; limited differentiation |
| **Option 2: Rev share on gift value** | CC earns 5–10% of gift face value transacted through integration | Medium — scales with utilization; thin Guusto margins constrain this |
| **Option 3: Flat annual platform fee** | Guusto pays CC annual distribution rights fee; CC customers get standard/discounted Guusto pricing | Medium-low early, medium-high at scale |
| **Option 4: Hybrid (platform fee + rev share)** | Annual platform fee while integration proves out; rev share kicks in above a volume threshold | **Highest** — protects floor economics; scales upside |

**Recommendation:** Enter negotiations anchoring on Option 4 as the target; Option 3 as the acceptable Year 1 fallback. Avoid Option 1 — reseller positioning forfeits leverage. Structure as: (a) Year 1: platform fee only; (b) Year 2+: hybrid with rev share above baseline volume.

---

### 8.4 Data Ownership

| Data | Ownership Position | Non-Negotiable? |
|---|---|---|
| Recognition records (shoutout content, sender, recipient, values, timestamps) | **ClearCompany exclusively** — created in CC by CC users, never transits Guusto | Yes |
| Recipient contact data (email, phone) | **ClearCompany owns; Guusto receives for fulfillment only** — Guusto may not use for marketing or re-engagement | Yes |
| Redemption data (event, timestamp, status) | **ClearCompany must contractually receive all events via webhook** — right to merchant category in v2 must be established now | Yes |
| Aggregated analytics | **ClearCompany owns all analytics derived from CC-origin data** | Yes |
| Guusto account balance / org config | **Shared** — administered by customer in Guusto portal; Guusto must provide API signal for account health so CC can surface error states | Preferred |

---

### 8.5 Avoiding Reseller Positioning — Maintaining Leverage

1. **Own the recognition data layer unconditionally.** If ClearCompany ends the Guusto partnership tomorrow, every recognition record is intact and accessible.
2. **Build analytics natively.** HR buyers evaluate R&R tools based on reporting quality. CC-native analytics that connect recognition to performance and goal data are impossible to replicate in a standalone R&R tool.
3. **Make the product better by being inside ClearCompany.** Goal completion nudges, review period summaries, onboarding milestone triggers — none of this is possible without the CC data layer. Build these integrations in Phase 1, not Phase 3.
4. **Maintain optionality on fulfillment.** The commercial agreement must not give Guusto exclusivity on reward fulfillment. ClearCompany retains the right to integrate an alternative provider (Tremendous, etc.) in the future. Guusto's willingness to accept non-exclusivity is a key signal of partnership health.
5. **Control the customer billing relationship.** All billing flows through ClearCompany. Guusto should not have a direct upsell path to CC's customers for features outside the integration scope.

---

### 8.6 Compliance Considerations

**IRS Gift Card Tax Treatment**
- Gift cards are explicitly excluded from IRS de minimis treatment (IRC §132(e)) and are taxable compensation regardless of dollar amount.
- ClearCompany must surface total annual gift card value received per employee in an admin-exportable format suitable for W-2 reporting.
- Display a compliance notice in admin budget setup: "Reminder: Gift card rewards are taxable compensation. Consult your payroll provider for W-2 reporting requirements."
- ClearCompany does not take a tax position in the product — surface the data, recommend consultation, provide the export.

**Brand and Catalog Restrictions**
- Merchant logos cannot be used in ClearCompany marketing materials without independent merchant licensing.
- Admin category restriction (e.g., excluding alcohol merchants) is supported at the Guusto org level and should be configurable in CC admin settings.

**Data Residency and Privacy**
- Guusto is Canadian-headquartered. For US customers: not a typical blocker, but must be disclosed.
- GDPR: For EU employees, a Data Processing Agreement (DPA) with Guusto is required before enabling gift send. Must be negotiated as part of the partnership agreement.
- CCPA: Guusto's use of recipient data for gift delivery should be covered under the "service provider" exemption — must be contractually specified.

---

### 8.7 What the Hackathon Prototype Must Prove

The hackathon prototype is a risk de-risking artifact for the commercial negotiation — not a product market-fit test.

**Technical questions it must answer:**
1. Can a Guusto gift link be issued programmatically via Guusto's API with a CC-controlled amount, recipient email, and a CC-issued gift ID that comes back in the redemption webhook? *(Proves the data ownership model is technically viable.)*
2. Can Guusto's redemption flow be embedded in a CC iFrame with SSO such that the recipient does not experience a separate login? *(Proves the seam is manageable in v1.)*
3. Can a recognition record created in CC be stored in CC's data model with the Guusto gift ID as a foreign key, and updated on redemption webhook receipt? *(Proves the data layer thesis is not blocked by Guusto's architecture.)*

**Commercial negotiation support:**
4. A working end-to-end demo (CC user sends recognition + gift → recipient redeems in embedded iFrame → CC reflects redeemed status) is the artifact shown to Guusto in commercial negotiations.
5. All Guusto API gaps and missing webhook fields are documented — these become explicit contractual asks.

**Hackathon success criteria for proceeding to Phase 1:**
- [ ] End-to-end gift flow works (send → deliver → redeem → status update in CC)
- [ ] CC-issued gift ID preserved through the Guusto flow and returned in webhook
- [ ] iFrame embed does not require a second Guusto login (SSO path identified)
- [ ] Guusto API limitations are documented (these become contractual requirements)
- [ ] Engineering estimate for Phase 1 Social Recognition MVP is updated based on findings

---

## 9. Success Metrics

---

### Measurement Philosophy

These metrics answer three questions at increasing time horizons: Is the product being used? Is it being used in a way that could produce business outcomes? Is it actually producing those outcomes?

A metric only earns its place here if a failure signal would trigger a real decision: change the product, change the go-to-market, change the partnership terms, or cut the investment.

---

### Leading Indicators (30–60 days post-launch)

---

**Metric 1: Manager Activation Rate**

*Definition:* Percentage of managers with an allocated recognition budget who have sent at least one recognition or reward within 30 days.

| | Value |
|---|---|
| Success threshold | 40% of eligible managers active within 30 days |
| Stretch | 60% active within 30 days |
| Measurement | Event: `recognition_sent` OR `reward_issued` with `sender_role = manager` / all managers with budget > $0 |
| Failure signal | <25% by day 30 → UX friction review or manager communication intervention required |

*Maps to:* Goal 3 (consistent coverage), Goal 5 (partnership validation)

---

**Metric 2: Employee Notification-to-Action Rate (Frontline)**

*Definition:* Of recognition notifications delivered via personal email or SMS, the percentage where the recipient either views the detail page or initiates gift redemption within 7 days.

| | Value |
|---|---|
| Success threshold | 55% notification-to-action within 7 days |
| Stretch | 70% |
| Measurement | Guusto delivery confirmation → CC `recognition_viewed` or `redemption_started` event. Track SMS and email separately. |
| Failure signal | <35% → redemption experience is breaking for frontline workers. Likely cause: notification going to spam, broken link, or account-gated redemption. |

*Maps to:* Goal 3 (consistent coverage), Goal 5 (partnership validation)

---

**Metric 3: Time-to-First-Recognition (Individual Sender)**

*Definition:* Median elapsed time between a user's first login to the R&R module and their first recognition sent.

| | Value |
|---|---|
| Success threshold | Median ≤ 5 minutes for managers; ≤ 3 minutes for ICs on first session |
| Stretch | ≤ 2 minutes for both |
| Measurement | CC event sequence: `module_first_visit` → `recognition_sent` |
| Failure signal | Median >10 minutes, or <30% of first-session visitors send at all → onboarding/empty state failing to convert intent |

*Maps to:* Goal 3 (consistent coverage)

---

**Metric 4: Recognition Send Rate (Weekly Active)**

*Definition:* Recognitions sent per week per 100 employees with module access. Rolling 4-week average.

| | Value |
|---|---|
| Success threshold | ≥3 recognitions per 100 employees per week at day 60 |
| Stretch | ≥6 per 100 per week |
| Measurement | CC event: `recognition_sent` (all types). Weekly aggregation. |
| Failure signal | <1.5 per 100 per week at day 60, OR spike-and-decline pattern by week 5–8 |

*Maps to:* Goal 2 (recognition as data layer), Goal 3 (consistent coverage)

---

**Metric 5: Admin Dashboard Engagement Rate**

*Definition:* Percentage of HR admins with module access who view the analytics dashboard at least once per week within the first 60 days.

| | Value |
|---|---|
| Success threshold | 60% of admins view dashboard weekly |
| Stretch | 80% |
| Measurement | CC event: `dashboard_viewed` with `user_role = hr_admin` |
| Failure signal | <30% weekly engagement by day 60 → analytics aren't compelling enough to displace manual spreadsheets |

*Maps to:* Goal 4 (HR visibility), Goal 5 (partnership validation)

---

### Lagging Indicators (90+ days)

---

**Metric 6: Recognition Coverage Rate**

*Definition:* Percentage of all active employees who have received at least one recognition in the trailing 90 days.

| | Value |
|---|---|
| Success threshold | 50% of employees covered at 90 days |
| Stretch | 70% at 90 days |
| Measurement | Distinct `recipient_employee_id` in `recognition_received` events in 90-day window / total active employees |
| Failure signal | <30% overall, OR >20 percentage point gap between frontline and desk coverage |

*Maps to:* Goal 1 (churn reduction), Goal 3 (consistent coverage), Goal 4 (HR visibility)

---

**Metric 7: Recognition-to-Profile View Rate**

*Definition:* Percentage of recognized employees who view their recognition profile/history page within 30 days of receiving a recognition.

| | Value |
|---|---|
| Success threshold | 40% of recognition recipients view their profile within 30 days |
| Stretch | 60% |
| Measurement | CC event sequence: `recognition_received` → `profile_recognition_tab_viewed` (same employee ID). 30-day window. |
| Failure signal | <20% → recognition isn't generating the engagement loop; breaks the "recognition as data layer" thesis |

*Maps to:* Goal 2 (recognition as system of record)

---

**Metric 8: Manager Reward Budget Utilization Rate**

*Definition:* Percentage of allocated manager recognition budget issued as rewards by 90 days.

| | Value |
|---|---|
| Success threshold | 50% of total allocated budget utilized at 90 days |
| Stretch | 70% |
| Measurement | Guusto API: `reward_issued.amount_funded` summed / total budget allocated in CC |
| Failure signal | <25% overall, OR >40% of managers at 0% utilization at 90 days |

*Maps to:* Goal 3 (consistent coverage), Goal 4 (HR visibility), Goal 5 (partnership validation)

---

**Metric 9: Platform DAU Lift**

*Definition:* Change in daily active users of ClearCompany among R&R module cohort vs. matched control group (or pre-launch baseline), measured at 90 days.

| | Value |
|---|---|
| Success threshold | +8% DAU lift in the R&R cohort vs. baseline |
| Stretch | +15% DAU lift |
| Measurement | CC session events, segmented by employees who have interacted with R&R module at least once vs. those who haven't |
| Failure signal | <+3% lift, OR lift confined entirely to HR admin users with zero lift for managers or employees |

*Maps to:* Goal 1 (churn reduction), Goal 5 (partnership validation)

---

**Metric 10: Churn Rate Differential (Cohort Comparison)**

*Definition:* Voluntary departure rate among employees who received ≥2 recognitions in the trailing 6 months vs. employees who received zero, at 180 days post-launch. Controlled for tenure, department, and manager.

| | Value |
|---|---|
| Success threshold | ≥5 percentage point lower churn in the "recognized" cohort |
| Stretch | ≥10 percentage point lower churn |
| Measurement | CC HRIS: `employee_departure` (voluntary) correlated with `recognition_received` count in preceding 6 months. Requires statistical significance test. |
| Failure signal | No statistically significant difference in churn rates at 6 months → triggers mandatory strategic review |

*Maps to:* Goal 1 (churn reduction) — this is the north star metric

> **Note:** Do not expect clean evidence of churn impact within 90 days. This metric requires 180 days. Resist pressure to declare success or failure before then.

---

**Metric 11: Post-Recognition Satisfaction (Recipient)**

*Definition:* Single-question satisfaction rating from recognition recipients 48 hours after receiving a recognition. "How did receiving this recognition make you feel about your work here?" (1–5 scale). Converted to net score (% positive – % negative).

| | Value |
|---|---|
| Success threshold | Net score ≥ +40 |
| Stretch | Net score ≥ +60 |
| Measurement | In-app or SMS micro-survey triggered 48 hours post `recognition_received`. Target ≥20% response rate. |
| Failure signal | Net score <+20, or response rate <10% from frontline SMS recipients specifically → redemption experience likely damaged the emotional impact |

*Maps to:* Goal 1 (churn reduction), Goal 5 (partnership validation)

---

### Metric-to-Goal Mapping

| Metric | Goal 1: Churn Reduction | Goal 2: Recognition as Data Layer | Goal 3: Consistent Coverage | Goal 4: HR Visibility | Goal 5: Partnership Validation |
|---|---|---|---|---|---|
| Manager Activation Rate | Indirect | — | Primary | — | Primary |
| Notification-to-Action Rate (Frontline) | Indirect | — | Primary | — | Primary |
| Time-to-First Recognition | Indirect | — | Indirect | — | Indirect |
| Recognition Send Rate | Indirect | Primary | Primary | Indirect | Primary |
| Admin Dashboard Engagement | — | — | Indirect | Primary | Primary |
| Recognition Coverage Rate | Primary | Indirect | Primary | Primary | — |
| Recognition-to-Profile View Rate | Indirect | Primary | — | — | — |
| Manager Reward Utilization | Indirect | — | Primary | Primary | Primary |
| Platform DAU Lift | Primary | Indirect | — | — | Primary |
| Churn Rate Differential | **Primary** | — | — | Primary | — |
| Post-Recognition Satisfaction | Primary | — | — | Indirect | Primary |

---

## 10. Open Questions

| # | Question | Best Current Hypothesis | Owner | Phase Blocker? | Resolution Path |
|---|---|---|---|---|---|
| OQ-1 | What is the commercial structure of the Guusto partnership? | Rev share + platform fee hybrid (Option 4) | VP Partnerships + Guusto BD | Blocks Phase 1 GA — no real customer transactions without signed agreement | Schedule commercial term sheet meeting; set hard deadline 4 weeks before Phase 1 GA |
| OQ-2 | iFrame embedding vs. API integration — which for the prototype? | iFrame for hackathon; commit to API migration path before Phase 1 build begins | Engineering Lead + Product | Blocks Phase 1 architecture | Run a 2-day spike in the hackathon; make architectural decision in retrospective |
| OQ-3 | Tax treatment of monetary rewards — what disclosure is required for v1? | All gift cards are taxable compensation regardless of amount (IRS explicitly excludes gift cards from de minimis). v1 approach: surface compliance notice + per-employee export. | ClearCompany General Counsel + external employment tax specialist | Blocks Phase 1 GA for monetary rewards | Legal memo within 30 days: (1) CC liability as platform, (2) required UI disclosures, (3) per-employee annual total in reporting |
| OQ-4 | Recognition visibility: company-wide vs. team/manager scoped by default? | Company-wide for message and value tags; always scope monetary amounts to recipient + admin only regardless | Product + design partner customers | Non-blocking if visibility is configurable per tenant (P0-10) | Include in next 3 customer discovery interviews; use data to set platform default |
| OQ-5 | Does ClearCompany own the Guusto API relationship per customer, or does each customer connect their own Guusto account? | Platform-level CC-held API relationship (Guusto partner account model) — cleaner product experience and better leverage | Guusto technical partnerships contact | Blocks Phase 1 API integration architecture | Explicit agenda item in next technical call with Guusto |
| OQ-6 | What HRIS data fields are needed and are they already synced? | Employee name, email, ID, manager relationship, department, location, employment status needed. Name/email/ID almost certainly available; manager relationship and location less certain. | Platform Engineering + CS | Blocks Phase 1 (manager relationship specifically) | Platform Engineering data dictionary within 1 sprint; CS breakdown of customers by HRIS sync method |
| OQ-7 | Should recognition appear in performance reviews with formal weight? | v1: read-only reference panel only. No algorithmic weight without 2+ quarters of calibration data. | VP Product + People Science | Non-blocking for Phase 1 | Product and People Science to define integration model before Phase 2 scoping |
| OQ-8 | Geographic scope — Guusto catalog coverage varies by country? | Catalog is primarily North American. For Phase 1 US-only launch: not a blocker. International is a Phase 2 constraint. | Guusto product contact + CC Sales | Non-blocking for Phase 1 US launch | Sales to provide geographic customer breakdown; Guusto to provide catalog coverage matrix by country |
| OQ-9 | Manager approval before peer recognitions go live, or instant publish? | Instant-publish by default; optional approval mode for monetary rewards as configurable setting | Product + design partner customers | Non-blocking if approval is configurable per program in P0-10 | Include in design partner interviews; default = instant-publish |
| OQ-10 | Hackathon scope: full Guusto integration prototype vs. something narrower? | Demo the core end-to-end loop: CC user sends recognition + gift → recipient receives → redeems in iFrame → CC reflects redeemed status | Engineering Lead + hackathon team | Immediate — must resolve before hackathon kickoff | Engineering Lead to write a 2-page hackathon brief 48 hours before the event |

---

### Additional Engineering-Specific Open Questions

| # | Question | Owner | Phase Blocker? |
|---|---|---|---|
| OQ-11 | How should budget race conditions be handled at the database level? (Row-level lock vs. optimistic lock vs. serializable isolation?) | Backend Engineering Lead | Blocks P0-6 implementation |
| OQ-12 | What is the failure handling and retry strategy for Guusto API calls? Does Guusto support idempotency keys? | Backend Engineering Lead + Guusto API docs | Blocks P0-4 |
| OQ-13 | Who owns the Guusto webhook endpoint and how is its reliability guaranteed? What is Guusto's webhook retry SLA? | DevOps/Infra + Guusto technical contact | Blocks P0-5 production |
| OQ-14 | How are Guusto API credentials stored and rotated per tenant? (Secrets manager, per-tenant vault?) | Security Engineering + Platform Engineering | Blocks any production deployment |
| OQ-15 | Does the iFrame embedding approach satisfy ClearCompany's security and data residency requirements? (CSP headers, postMessage, PII sharing, DPA) | Security Engineering + Legal | Blocks production use of iFrame path |

---

## 11. Timeline & Phasing

---

### Phase 0: Hackathon Prototype

**Goal:** Prove technical feasibility of the Guusto integration architecture and generate a working demo for the commercial negotiation. Does NOT prove product-market fit, production reliability, or the value of the social recognition layer.

**Scope — what gets built:**
- Minimal CC UI: single "Send Recognition + Gift" form (hardcoded user/recipient)
- Guusto API call: issue a gift link, passing recipient email, amount, and CC-generated gift ID
- Guusto redemption URL embedded in an iFrame within the prototype UI
- Webhook receiver: simple endpoint that receives Guusto's redemption webhook and logs CC gift ID + status
- Status display: show gift status (pending/redeemed) after webhook receipt

**Explicitly NOT built:** Authentication/SSO, budget management, shoutout feed, production error handling, mobile responsiveness, HRIS integration.

**Success criteria for proceeding to Phase 1:**
- [ ] Gift link issued via Guusto API with CC-controlled gift ID
- [ ] Recipient can browse catalog and redeem in iFrame without a visible Guusto login wall
- [ ] Redemption webhook received by CC endpoint with CC gift ID in payload
- [ ] CC gift status updates from "pending" to "redeemed" after redemption
- [ ] All Guusto API gaps/limitations documented
- [ ] Engineering provides updated Phase 1 estimate

**Duration:** 1–2 days

---

### Phase 1: Social Recognition MVP

**Goal:** Ship a production-quality social recognition layer that drives high-frequency, values-tagged recognition within ClearCompany, integrated with employee profiles and manager visibility. No monetary gifting. Establish the data foundation Phase 2 will build on.

**Scope — what ships:**
- Shoutout compose flow (recipient search, message, required values tag, visibility controls)
- Recognition feed (company-wide + team-filtered, reactions, real-time banner)
- In-app + email notifications
- Recipient profile tab (recognition received history)
- Manager dashboard (direct report recognition history, basic analytics)
- AI drafting assist (opt-in, clearly labeled)
- Slack outbound notification (shoutout card push to configured channel)
- HR admin configuration (values management, visibility defaults, Slack config)

**Explicitly NOT in Phase 1:** Monetary gifting, Guusto integration, budget management, Teams integration, comments on shoutouts, performance review integration (full read-only panel deferred to Phase 2), full reporting dashboard, mobile app.

**Prerequisites:**
- Phase 0 success criteria met
- Employee directory API confirmed stable for recipient search
- Pilot customer values list confirmed
- CC notification infrastructure confirmed supports new notification types
- Design system components available (avatar, search input, feed card, notification patterns)
- Content moderation policy reviewed by Legal

**Exit criteria:**
- [ ] End-to-end shoutout send and receive works in production for a pilot customer
- [ ] Values tagging is required and enforced
- [ ] Recognition appears on recipient's CC profile within 60 seconds of send
- [ ] Manager can see direct report recognition history
- [ ] HR admin can configure values list without engineering involvement
- [ ] Slack notification delivers correctly for 95%+ of shoutout sends
- [ ] Recognition records include CC employee ID (not just name/email)
- [ ] Pilot customer NPS for Phase 1 feature ≥ 7.0
- [ ] Analytics baseline established: participation rate measurable

**Estimated duration:** 3–4 sprints (6–8 weeks at 2-week sprints)

**Top 3 risks:**
1. **Values adoption:** If employees find values tagging friction-heavy, the feed dies. Mitigation: max 8 values in list, chip selector UI, pilot with a customer whose values are already well-understood.
2. **Feed moderation:** A public shoutout feed is user-generated content. Mitigation: define content policy, build report-and-hide mechanism, ensure HR admins can delete any post.
3. **Low initial engagement:** Empty feed feels dead. Mitigation: manager prompted to send first recognition on Day 1 of rollout; seed the feed with HR-sent "welcome" shoutouts; 30-day engagement baseline target.

---

### Phase 2: Monetary Rewards via Guusto

**Goal:** Extend the social recognition layer with real-money gift sending powered by Guusto. Managers can attach gifts to shoutouts or send standalone gifts. Budget management, equity nudges, and IRS-compliant reporting are live. **Requires a signed commercial agreement with Guusto.**

**Scope — what ships:**
- Gift attach flow in shoutout compose (managers only)
- Standalone gift send (managers only)
- Budget management (admin setup, per-manager allocation, real-time balance, equity nudges)
- Email + SMS delivery methods; QR code / shared-device delivery if frontline pilots in scope
- Guusto iFrame embed for catalog redemption (authenticated, SSO)
- Redemption webhook receipt + status update in CC
- Gift status display in sender history
- HR admin program health dashboard (participation, utilization, values distribution, redemption rate)
- IRS-compliant export of gift value per employee per tax year
- Performance review read-only panel (recognition summary for review period)

**Explicitly NOT in Phase 2:** Full Guusto API integration (still iFrame for catalog), peer-to-peer gifting, custom catalog, Guusto account balance sync, Teams integration, advanced equity analytics.

**Prerequisites:**
- Phase 1 exit criteria met (mandatory — do not skip this gate)
- **Commercial agreement with Guusto signed** (covers API access, webhook schema, data ownership, white-label rights, commercial model)
- **Legal sign-off on IRS gift card tax treatment** — compliance notice language approved
- Guusto SSO path confirmed (SAML or OAuth spec agreed with Guusto technical team)
- Budget data model finalized (cannot be changed post-Phase 2 without a migration)
- Pilot customer selected with funded Guusto account
- Guusto account funding process documented for customer onboarding

**Exit criteria:**
- [ ] End-to-end gift flow works in production: CC send → Guusto delivery → recipient redemption → CC status update
- [ ] Budget deduction is real-time and accurate (no double-spend in 2-week soak test)
- [ ] SSO into iFrame works — zero separate Guusto login prompts in user testing
- [ ] IRS export produces accurate per-employee total for pilot customer's test dataset
- [ ] HR admin dashboard shows participation and utilization metrics
- [ ] Gift delivery failure rate <2% (email/SMS delivery success)
- [ ] Equity nudge fires correctly for at least 1 confirmed imbalance scenario in QA
- [ ] Pilot customer legal team has reviewed and signed off on gift tax compliance posture

**Estimated duration:** 4–5 sprints (8–10 weeks)

**Top 3 risks:**
1. **Commercial agreement delay:** If Guusto contract negotiations extend beyond 4 weeks, Phase 2 is blocked. Begin commercial negotiation immediately after Phase 0 (use prototype as negotiation artifact). Set a hard gate: if no signed agreement by end of Phase 1, Phase 2 scope is re-evaluated.
2. **SSO complexity:** Silent authentication into Guusto iFrame is technically non-trivial. Build and test SSO in the first sprint of Phase 2, not the last.
3. **Tax compliance blocking enterprise customers:** Some enterprise HR buyers will want a formal tax opinion before enabling monetary rewards. The IRS export and compliance notice must be in Phase 2; social recognition (Phase 1) can proceed without them.

---

### Phase 3: Integrations & Deep Analytics

**Goal:** Fully operationalize the "recognition as data layer" thesis. Deep integrations connect recognition to performance reviews, goal completion signals, and manager effectiveness scoring. Guusto integration migrates from iFrame to API. Advanced equity and predictive analytics are surfaced.

**Scope — what ships:**
- Guusto API migration (CC-native catalog redemption UI — no visible iFrame, merchant category in redemption webhook)
- Performance review write-back (recognition data auto-populates as supporting evidence, with reviewer approval)
- Goal-to-recognition triggers (automated nudges to managers when direct reports complete a goal)
- Microsoft Teams integration (outbound shoutout cards + bi-directional reaction sync + lightweight recognize action)
- Advanced analytics (correlation displays labeled as patterns; manager effectiveness panel; intersectional equity view by department + level + manager)
- Peer-to-peer gifting (admin-configurable max, e.g., $10; separate peer gifting budget pool)
- Mobile optimization (iOS and Android responsive web; evaluate native app wrapper based on usage data)
- Second fulfillment provider technical groundwork (integration-ready, not yet customer-facing)

**Explicitly NOT in Phase 3:** Native mobile app (data-dependent), physical gift/swag fulfillment, automated AI-initiated recognition, custom merit-based reward workflows.

**Prerequisites:**
- Phase 2 exit criteria met and ≥3 months of production data
- Guusto API contract: catalog API access, versioning guarantees, SLA for API uptime, merchant category in redemption webhook
- Performance review module team alignment on data write-back schema (cross-product coordination)
- Goals module event API confirmed (goal completion events can trigger external listeners)
- ≥2 quarters of recognition data available for correlation analytics
- Legal review of predictive/correlative analytics claims in HR context (AI bias, adverse impact risk)

**Exit criteria:**
- [ ] Guusto API migration complete: no iFrame visible to end users in redemption flow
- [ ] Recognition data populates performance review panel accurately
- [ ] Goal completion → recognition nudge fires within 5 minutes of goal completion event
- [ ] Teams integration delivers shoutout cards for 95%+ of company-wide posts
- [ ] Correlation analytics display with appropriate "pattern not prediction" labeling, reviewed by legal
- [ ] Manager effectiveness panel available for all managers with ≥4 direct reports
- [ ] Peer gifting budget pool is separate from manager budget (no cross-contamination)
- [ ] Second fulfillment provider API spec complete (not yet customer-facing)

**Estimated duration:** 5–6 sprints (10–12 weeks)

**Top 3 risks:**
1. **Guusto API stability post-migration:** Breaking API change breaks redemption for all customers. Maintain iFrame as fallback until API proves stable over 3+ months. Contractual SLA and versioning guarantees are required before migration.
2. **Cross-product coordination:** Deep integrations with performance reviews and goals require alignment with other CC product teams. Establish cross-product working group in Phase 2 and finalize schemas before Phase 3 begins.
3. **Analytics claims and legal exposure:** Correlation displays carry legal risk in HR contexts. All analytics copy must be reviewed by legal before Phase 3 ships. "Correlation is not causation" language mandated in UI.

---

### Dependency Timeline

| Dependency | Required For | Owner | Must Resolve By |
|---|---|---|---|
| Guusto API access (sandbox) | Phase 0 | Joe / Guusto BD | Before hackathon |
| Guusto webhook schema documented | Phase 0 | Guusto technical team | Before hackathon |
| CC employee directory API stable | Phase 1 | CC Engineering | Phase 1 Sprint 1 |
| Pilot customer values list confirmed | Phase 1 | Customer Success | Phase 1 Sprint 1 |
| Content moderation policy approved | Phase 1 | Legal / HR | Phase 1 Sprint 2 |
| Slack app credentials / workspace | Phase 1 | CC Engineering | Phase 1 Sprint 3 |
| **Guusto commercial agreement signed** | Phase 2 | Arnaud + Joe / Guusto | Before Phase 2 kick-off |
| **Legal sign-off: IRS gift card tax treatment** | Phase 2 | CC Legal | Before Phase 2 Sprint 1 |
| Guusto SSO spec agreed (SAML/OAuth) | Phase 2 | CC Eng + Guusto | Phase 2 Sprint 1 |
| Budget data model finalized | Phase 2 | CC Engineering | Phase 2 Sprint 1 |
| Pilot customer Guusto account funded | Phase 2 | Customer Success | Phase 2 Sprint 3 |
| Performance review schema for write-back | Phase 3 | CC Product (cross-team) | Phase 2 exit |
| Goals module event API confirmed | Phase 3 | CC Engineering (Goals team) | Phase 2 exit |
| ≥2 quarters production recognition data | Phase 3 (analytics) | Data / CC Engineering | Phase 3 Sprint 3 |
| Guusto API contract: versioning + SLA | Phase 3 (API migration) | Arnaud + Joe / Guusto | Before Phase 3 Sprint 1 |
| Legal review: predictive analytics claims | Phase 3 (analytics) | CC Legal | Phase 3 Sprint 4 |

---

## 12. Dependencies

| # | Dependency | Type | Owner | Blocks Phase | Lead Time | Risk | Mitigation if Slipped |
|---|---|---|---|---|---|---|---|
| D-01 | Guusto API access (sandbox + production credentials) | API / Commercial | CC VP Partnerships + Guusto BD | Phase 0 (sandbox); Phase 2 (production) | 1–5 days (sandbox); 2–4 weeks (production) | **High** | Use Guusto's public API docs + demo account for hackathon; escalate via CEO relationship to unblock production |
| D-02 | Guusto Commercial Agreement / NDA Extension | Legal / Commercial | CC Legal + Guusto Legal | Phase 1 GA (for monetary; social recognition can ship without it) | 3–6 weeks | **High** | Proceed with prototype under existing NDA; no real customer transactions until signed; set hard deadline 4 weeks before Phase 1 GA |
| D-03 | CC Employee Profile Data Model (schema documentation) | Data / Internal | Platform Engineering | Phase 1 | 3–5 days | Low | Platform Engineering to produce data dictionary; R&R team can read existing code/DB schema if documentation is delayed |
| D-04 | Org Chart / Manager Relationship Data (confirmed availability + API) | Data / Internal | Platform Engineering + HR Data | Phase 1 | 1–2 weeks | Medium | If org chart data is incomplete, degrade gracefully: show recognition without manager-scoped features; flag affected tenants for manual import |
| D-05 | Legal Review: Tax Treatment of Monetary Rewards | Legal | CC General Counsel + External Tax Counsel | Phase 1 GA (monetary features) | 3–5 weeks | **High** | Phase 1 MVP can launch with monetary rewards disabled by default; enable only after legal memo is issued |
| D-06 | Slack App Review and Certification | API / Commercial | CC Engineering + Slack App Review | Phase 1 (P1-1) | 2–4 weeks | Medium | Begin submission immediately after P1-1 is feature-complete; soft-launch to internal users before certification; use Teams webhook as fallback |
| D-07 | Microsoft Teams App Submission and Certification | API / Commercial | CC Engineering + Microsoft Partner Network | Phase 1 (P1-1) | 4–8 weeks | Medium | Implement Teams incoming webhook (no certification needed) as the P1 deliverable; defer Bot Framework Teams app to Phase 2 |
| D-08 | CC Design System Components (recognition card, feed, notification badge) | Design | Product Design Team | Phase 1 | 2–3 weeks for initial set | Medium | Engineering can ship with prototype-quality components for hackathon; final components must be delivered before Phase 1 beta |
| D-09 | HRIS Data Sync (hire date, location, employment status fields) | Data / Internal | Platform Engineering + CS | Phase 1 (status/location); Phase 2 (hire date for milestones) | 1–2 weeks to confirm coverage | Medium | Audit current HRIS sync coverage per connector; where fields are missing, exclude from milestone features rather than failing |
| D-10 | Guusto Webhook Infrastructure (delivery SLA, retry policy, signing secrets) | API / External | Guusto Engineering + CC Backend | Phase 1 (Phase 2 for production) | 1 week to obtain docs; 1 sprint to implement | Medium | Implement polling fallback (P0-5) as mandatory parallel track; polling ensures redemption data is never permanently stale |
| D-11 | Payment / Financial Compliance Review (is CC a payment facilitator or money transmitter?) | Legal / Compliance | CC Legal + Finance + External Fintech Counsel | Phase 1 GA (monetary) | 4–6 weeks | **High** | Structure commercial agreement so Guusto is the merchant of record; confirm with legal before Phase 1 GA for monetary features |
| D-12 | Secrets Management Infrastructure (for Guusto API key storage in production) | Security / Internal | CC Security Engineering + DevOps | Phase 1 | 1–2 weeks (if secrets manager exists — likely); 4–6 weeks if greenfield | Low | CC likely uses AWS Secrets Manager or equivalent for existing integrations; extend existing patterns |
| D-13 | Internal Job Queue / Background Worker Infrastructure | Internal / Infra | Platform Engineering / DevOps | Phase 1 | Likely exists (verify); 1–2 weeks to extend | Low | If job queue exists, R&R jobs are a new queue/worker pool. If none exists, this becomes a Phase 0 infrastructure task with Medium risk. |
| D-14 | Read Replica / Reporting Database | Internal / Data | Platform Engineering / DBA | Phase 1 (reporting) | 1–2 weeks to provision if not in place | Low | If no read replica, reporting queries can run on primary with timeouts in the short term — must be resolved before GA |

**Critical path summary:** Three dependencies are rated High risk and on the critical path for Phase 1 GA (monetary features): D-02 (Guusto commercial agreement), D-05 (legal review for tax treatment), and D-11 (payment compliance review). All three have lead times of 3–6 weeks or more and must be initiated immediately. The hackathon prototype is not blocked by any of these three. **No real customer transactions should be processed until all three are resolved.**

---

_Section completion tracker:_

| Section | Status |
|---|---|
| 1. Overview | ✅ Complete |
| 2. Problem Statement | ✅ Complete |
| 3. Goals & Non-Goals | ✅ Complete |
| 4. User Personas | ✅ Complete |
| 5. User Stories | ✅ Complete |
| 6. Feature Scope | ✅ Complete |
| 7. Requirements | ✅ Complete |
| 8. Guusto Partnership Model | ✅ Complete |
| 9. Success Metrics | ✅ Complete |
| 10. Open Questions | ✅ Complete |
| 11. Timeline & Phasing | ✅ Complete |
| 12. Dependencies | ✅ Complete |
