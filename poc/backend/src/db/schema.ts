/**
 * db/schema.ts — SQLite schema initialization.
 *
 * Creates all tables on startup (IF NOT EXISTS, so safe to run repeatedly).
 * Uses better-sqlite3 for zero-config local storage — perfect for a hackathon
 * POC where we don't want to spin up Postgres.
 *
 * In production this would be replaced by proper DB migrations (e.g. Flyway,
 * Knex migrations, or Prisma migrate).
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Store the SQLite file one level above src/ so it persists between restarts
const DB_PATH = path.resolve(__dirname, '../../poc_rr.sqlite');

let _db: Database.Database | null = null;

/** Returns the singleton database connection. Initializes schema on first call. */
export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    -- -------------------------------------------------------------------------
    -- PHASE 0: Gong webhook pipeline (existing)
    -- -------------------------------------------------------------------------

    CREATE TABLE IF NOT EXISTS gong_events (
      id          TEXT PRIMARY KEY,
      call_id     TEXT NOT NULL,
      received_at TEXT NOT NULL,
      payload     TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending',
      call_url    TEXT,
      call_title  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_gong_events_call_id
      ON gong_events(call_id, received_at);

    CREATE TABLE IF NOT EXISTS rr_classifications (
      id                      TEXT PRIMARY KEY,
      gong_event_id           TEXT NOT NULL,
      is_exceptional          BOOLEAN,
      confidence              REAL,
      employee_name_mentioned TEXT,
      evidence_quote          TEXT,
      sentiment_magnitude     TEXT,
      recognition_draft       TEXT,
      reasoning               TEXT,
      status                  TEXT NOT NULL DEFAULT 'pending',
      employee_id             TEXT,
      manager_id              TEXT,
      manager_email           TEXT,
      manager_first_name      TEXT,
      employee_email          TEXT,
      employee_first_name     TEXT,
      employee_last_name      TEXT,
      created_at              TEXT NOT NULL
    );

    -- Gong-triggered recognitions (still used by the Gong pipeline)
    CREATE TABLE IF NOT EXISTS rr_recognitions (
      id                  TEXT PRIMARY KEY,
      classification_id   TEXT NOT NULL,
      employee_id         TEXT NOT NULL,
      employee_first_name TEXT,
      employee_last_name  TEXT,
      manager_id          TEXT,
      evidence_quote      TEXT,
      recognition_message TEXT,
      reward_amount_cents INTEGER NOT NULL DEFAULT 2500,
      reward_status       TEXT NOT NULL DEFAULT 'pending',
      created_at          TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rr_approvals (
      id             TEXT PRIMARY KEY,
      recognition_id TEXT NOT NULL,
      token_hash     TEXT NOT NULL UNIQUE,
      expires_at     TEXT NOT NULL,
      decided_at     TEXT,
      decision       TEXT  -- 'approved' | 'dismissed' | 'expired'
    );

    CREATE TABLE IF NOT EXISTS rr_identify_tokens (
      id                TEXT PRIMARY KEY,
      classification_id TEXT NOT NULL,
      token_hash        TEXT NOT NULL UNIQUE,
      expires_at        TEXT NOT NULL,
      used_at           TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_rr_identify_tokens_hash
      ON rr_identify_tokens(token_hash);

    -- Guusto gift orders (recognition_id may also hold a shoutout_id for new flow)
    CREATE TABLE IF NOT EXISTS rr_orders (
      id                    TEXT PRIMARY KEY,
      recognition_id        TEXT NOT NULL,
      guusto_request_id     TEXT NOT NULL UNIQUE,
      cc_gift_id            TEXT NOT NULL,
      status                TEXT NOT NULL DEFAULT 'ACCEPTED',
      employee_email        TEXT NOT NULL,
      amount_cents          INTEGER NOT NULL,
      currency              TEXT NOT NULL DEFAULT 'USD',
      redemption_url        TEXT,
      external_ref_verified INTEGER,
      last_polled_at        TEXT,
      created_at            TEXT NOT NULL
    );

    -- -------------------------------------------------------------------------
    -- PHASE 1+: Full R&R module (new tables)
    -- -------------------------------------------------------------------------

    -- Admin-configured company values (per-tenant, max 8 active)
    CREATE TABLE IF NOT EXISTS rr_company_values (
      id         TEXT PRIMARY KEY,
      tenant_id  TEXT NOT NULL DEFAULT 'default',
      label      TEXT NOT NULL,
      emoji      TEXT NOT NULL DEFAULT '⭐',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- Social recognition posts (the feed)
    -- Gift fields are null when no monetary reward is attached.
    CREATE TABLE IF NOT EXISTS rr_shoutouts (
      id                TEXT PRIMARY KEY,
      sender_id         TEXT NOT NULL,
      sender_name       TEXT NOT NULL,
      recipient_id      TEXT NOT NULL,
      recipient_name    TEXT NOT NULL,
      recipient_email   TEXT NOT NULL,
      message           TEXT NOT NULL,
      visibility        TEXT NOT NULL DEFAULT 'company',  -- 'company'|'team'|'private'
      source            TEXT NOT NULL DEFAULT 'direct',   -- 'direct'|'gong'|'slack'
      gift_amount_cents INTEGER,
      gift_status       TEXT,                              -- 'pending'|'sending'|'sent'|'failed'|'redeemed'
      guusto_request_id TEXT,
      cc_gift_id        TEXT,
      created_at        TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rr_shoutouts_recipient
      ON rr_shoutouts(recipient_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_rr_shoutouts_sender
      ON rr_shoutouts(sender_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_rr_shoutouts_feed
      ON rr_shoutouts(visibility, created_at);

    -- Value tags per shoutout — label denormalized at write time so deactivating
    -- a value never retroactively alters historical records (per PRD P0-2).
    CREATE TABLE IF NOT EXISTS rr_shoutout_values (
      shoutout_id TEXT NOT NULL,
      value_id    TEXT NOT NULL,
      value_label TEXT NOT NULL,
      PRIMARY KEY (shoutout_id, value_id)
    );

    -- Emoji reactions on shoutouts
    CREATE TABLE IF NOT EXISTS rr_shoutout_reactions (
      id           TEXT PRIMARY KEY,
      shoutout_id  TEXT NOT NULL,
      reactor_id   TEXT NOT NULL,
      reactor_name TEXT NOT NULL,
      emoji        TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      UNIQUE(shoutout_id, reactor_id, emoji)
    );

    CREATE INDEX IF NOT EXISTS idx_rr_reactions_shoutout
      ON rr_shoutout_reactions(shoutout_id);

    -- Budget ledger — append-only, never updated.
    -- Positive amount_cents = credit (allocation), negative = debit (spend).
    -- Uses a ledger model instead of a mutable balance column to enable audit
    -- trail and prevent race conditions (balance = SUM of all rows for manager).
    CREATE TABLE IF NOT EXISTS rr_budget_ledger (
      id           TEXT PRIMARY KEY,
      manager_id   TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      entry_type   TEXT NOT NULL,  -- 'allocation'|'debit'|'rollback'|'expiry'
      reference_id TEXT,           -- shoutout_id or recognition_id that caused debit
      created_by   TEXT,           -- admin user who made the allocation
      note         TEXT,
      created_at   TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_budget_ledger_manager
      ON rr_budget_ledger(manager_id, created_at);

    -- Immutable monetary-action audit log (separate from main writes per P0-8).
    -- Written after the main transaction commits — never in the same transaction.
    CREATE TABLE IF NOT EXISTS rr_audit_log (
      id          TEXT PRIMARY KEY,
      actor_id    TEXT NOT NULL,
      actor_role  TEXT NOT NULL,
      action      TEXT NOT NULL,
      entity_type TEXT NOT NULL,   -- 'shoutout'|'recognition'|'budget_allocation'
      entity_id   TEXT NOT NULL,
      details     TEXT NOT NULL,   -- JSON blob
      created_at  TEXT NOT NULL
    );

    -- Tenant-level R&R configuration (key-value store, one row per setting)
    CREATE TABLE IF NOT EXISTS rr_tenant_config (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_by TEXT,
      updated_at TEXT NOT NULL
    );

    -- -------------------------------------------------------------------------
    -- Employee directory (seeded from HRM export, replaces STUB_EMPLOYEES)
    -- -------------------------------------------------------------------------

    CREATE TABLE IF NOT EXISTS rr_employees (
      id            TEXT PRIMARY KEY,  -- email address (stable identifier)
      first_name    TEXT NOT NULL,
      last_name     TEXT NOT NULL,
      full_name     TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      title         TEXT,
      department    TEXT,
      office        TEXT,
      manager_email TEXT,              -- FK → rr_employees.email (nullable for top-level)
      manager_name  TEXT,
      seeded_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_rr_employees_manager
      ON rr_employees(manager_email);

    CREATE INDEX IF NOT EXISTS idx_rr_employees_dept
      ON rr_employees(department);

    -- Automation rules — AI-configured R&R workflows
    -- trigger_config and conditions are JSON blobs.
    CREATE TABLE IF NOT EXISTS rr_automation_rules (
      id                       TEXT PRIMARY KEY,
      name                     TEXT NOT NULL,
      description              TEXT,
      trigger_type             TEXT NOT NULL,  -- 'gong'|'crm_deal'|'hris_event'|'slack_command'
      trigger_config           TEXT NOT NULL DEFAULT '{}',
      conditions               TEXT NOT NULL DEFAULT '[]',
      require_manager_approval INTEGER NOT NULL DEFAULT 1,
      recognition_enabled      INTEGER NOT NULL DEFAULT 1,
      recognition_visibility   TEXT NOT NULL DEFAULT 'company',
      reward_enabled           INTEGER NOT NULL DEFAULT 0,
      reward_amount_cents      INTEGER,
      frequency_limit          TEXT,
      status                   TEXT NOT NULL DEFAULT 'active',  -- 'active'|'paused'|'draft'
      created_by               TEXT NOT NULL DEFAULT 'admin',
      created_at               TEXT NOT NULL,
      updated_at               TEXT NOT NULL
    );
  `);

  // Additive column migrations — errors ignored when column already exists
  const columnMigrations = [
    'ALTER TABLE gong_events ADD COLUMN call_url TEXT',
    'ALTER TABLE gong_events ADD COLUMN call_title TEXT',
    // RR-025: soft-delete for admin moderation
    'ALTER TABLE rr_shoutouts ADD COLUMN deleted_at TEXT',
    'ALTER TABLE rr_shoutouts ADD COLUMN deleted_by_admin_id TEXT',
    'ALTER TABLE rr_shoutouts ADD COLUMN deleted_reason TEXT',
    // SSO: capture Guusto JWT redemption URL from completed order certificates
    'ALTER TABLE rr_orders ADD COLUMN redemption_url TEXT',
  ];
  for (const sql of columnMigrations) {
    try { db.exec(sql); } catch { /* already exists */ }
  }

  seedDefaults(db);
  console.log(`[db] Schema initialized at ${DB_PATH}`);
}

// ---------------------------------------------------------------------------
// Seed default data — INSERT OR IGNORE so re-runs are safe
// ---------------------------------------------------------------------------

function seedDefaults(db: Database.Database): void {
  // Default company values (PRD recommends max 8, seeding 5 to leave room)
  db.exec(`
    INSERT OR IGNORE INTO rr_company_values (id, tenant_id, label, emoji, sort_order, is_active, created_at) VALUES
      ('val_001', 'default', 'Customer at the Core',    '🤝', 1, 1, '2026-01-01T00:00:00Z'),
      ('val_002', 'default', 'Listen to Many, Execute as One', '💬', 2, 1, '2026-01-01T00:00:00Z'),
      ('val_003', 'default', 'Embrace Change',          '🌱', 3, 1, '2026-01-01T00:00:00Z'),
      ('val_004', 'default', 'Accountable to Outcomes', '🎯', 4, 1, '2026-01-01T00:00:00Z'),
      ('val_005', 'default', 'Raise the Bar',           '📈', 5, 1, '2026-01-01T00:00:00Z');
  `);

  // Default tenant configuration
  db.exec(`
    INSERT OR IGNORE INTO rr_tenant_config (key, value, updated_at) VALUES
      ('min_gift_cents',               '500',     '2026-01-01T00:00:00Z'),
      ('max_gift_cents',               '10000',   '2026-01-01T00:00:00Z'),
      ('message_min_chars',            '50',      '2026-01-01T00:00:00Z'),
      ('message_max_chars',            '500',     '2026-01-01T00:00:00Z'),
      ('recognition_gap_alert_days',   '30',      '2026-01-01T00:00:00Z'),
      ('require_values',               'true',    '2026-01-01T00:00:00Z'),
      ('default_visibility',           'company', '2026-01-01T00:00:00Z'),
      ('monetary_rewards_enabled',     'true',    '2026-01-01T00:00:00Z'),
      ('max_values_per_recognition',   '3',       '2026-01-01T00:00:00Z'),
      ('peer_gifting_enabled',         'false',   '2026-01-01T00:00:00Z'),
      ('guusto_low_balance_alert_cents', '10000', '2026-01-01T00:00:00Z'); -- $100 alert threshold
  `);

  // Seed demo automation rules
  db.exec(`
    INSERT OR IGNORE INTO rr_automation_rules
      (id, name, description, trigger_type, trigger_config, conditions,
       require_manager_approval, recognition_enabled, recognition_visibility,
       reward_enabled, reward_amount_cents, frequency_limit, status, created_by, created_at, updated_at)
    VALUES
      ('auto_001',
       'Gong — Customer Praise Detection',
       'Scans Gong call transcripts for exceptional customer praise of a specific employee. When detected with high confidence, creates a recognition for manager review.',
       'gong',
       '{"integrationStatus":"connected","confidenceThreshold":0.75}',
       '["Customer explicitly praises employee by name","Sentiment: very high or high","Speaker type: customer"]',
       1, 1, 'company', 1, 2500, 'Once per employee per 7 days', 'active', 'admin',
       '2026-04-01T00:00:00Z', '2026-04-01T00:00:00Z'),

      ('auto_002',
       'CRM — Deal Closed (3 Days in a Row)',
       'Fires when a salesperson closes deals on 3 consecutive calendar days. Celebrates sustained high performance with a public shoutout and gift card.',
       'crm_deal',
       '{"integrationStatus":"needs_setup","crmType":"salesforce","event":"deal_closed","streak":3}',
       '["3 consecutive days with at least 1 closed deal","Stage = Closed Won","Rep is an active employee in ClearCompany"]',
       0, 1, 'company', 1, 5000, 'Once per rep per quarter', 'paused', 'admin',
       '2026-04-15T00:00:00Z', '2026-04-15T00:00:00Z');
  `);

  // Seed Q2 2026 budget allocations — real manager emails from rr_employees
  db.exec(`
    INSERT OR IGNORE INTO rr_budget_ledger (id, manager_id, amount_cents, entry_type, created_by, note, created_at) VALUES
      ('led_seed_001', 'adefazio@clearcompany.com',  50000, 'allocation', 'admin', 'Q2 2026 initial allocation', '2026-04-01T00:00:00Z'),
      ('led_seed_002', 'sheaden@clearcompany.com',   50000, 'allocation', 'admin', 'Q2 2026 initial allocation', '2026-04-01T00:00:00Z'),
      ('led_seed_003', 'kbezier@clearcompany.com',   50000, 'allocation', 'admin', 'Q2 2026 initial allocation', '2026-04-01T00:00:00Z'),
      ('led_seed_004', 'agrunwald@clearcompany.com', 50000, 'allocation', 'admin', 'Q2 2026 initial allocation', '2026-04-01T00:00:00Z');
  `);

  // Seed demo shoutouts — real employees from rr_employees (email as ID)
  // CS team: Anna DeFazio's group; Eng team: Sean Headen's group; ADR: Kristen Bezier's group
  db.exec(`
    INSERT OR IGNORE INTO rr_shoutouts
      (id, sender_id, sender_name, recipient_id, recipient_name, recipient_email,
       message, visibility, source, created_at)
    VALUES
      ('sht_seed_001', 'adefazio@clearcompany.com', 'Anna DeFazio',
       'tbadeen@clearcompany.com', 'Tom Badeen', 'tbadeen@clearcompany.com',
       'Tom handled the Acme Corp escalation with incredible poise — stayed on a 3-hour call until the customer was fully resolved, then followed up with a detailed summary and next-steps doc the same evening. That kind of ownership is exactly what sets us apart.',
       'company', 'direct', '2026-04-25T10:00:00Z'),

      ('sht_seed_002', 'dgormley@clearcompany.com', 'Dylan Gormley',
       'tpariso@clearcompany.com', 'Taylor Pariso', 'tpariso@clearcompany.com',
       'Taylor''s new enterprise onboarding playbook is a masterpiece. The level of detail — real workflow diagrams, role-specific checklists, FAQ from the first 20 customers — meant our newest client was fully live in 18 days. She didn''t just document a process, she engineered a better one.',
       'company', 'direct', '2026-04-27T14:30:00Z'),

      ('sht_seed_003', 'sheaden@clearcompany.com', 'Sean Headen',
       'tpariso@clearcompany.com', 'Taylor Pariso', 'tpariso@clearcompany.com',
       'Taylor presented the customer health scoring framework to the leadership team and fielded every tough question with data and composure. The CFO said it was the clearest ROI case she''d seen from the CS team. Taylor represents us all brilliantly when it counts.',
       'company', 'direct', '2026-04-28T09:15:00Z'),

      ('sht_seed_004', 'tbadeen@clearcompany.com', 'Tom Badeen',
       'tpariso@clearcompany.com', 'Taylor Pariso', 'tpariso@clearcompany.com',
       'Taylor stepped in to unblock a major implementation at 4pm on a Friday when the customer''s SSO configuration completely broke. She stayed on a call for two hours, debugged the IdP config live, updated the integration guide, and had the customer up and running before EOD. That''s the definition of a teammate.',
       'company', 'direct', '2026-04-29T08:00:00Z'),

      ('sht_seed_005', 'adefazio@clearcompany.com', 'Anna DeFazio',
       'dgormley@clearcompany.com', 'Dylan Gormley', 'dgormley@clearcompany.com',
       'Dylan''s new customer health model is flagging at-risk accounts two full weeks earlier than our previous approach. He built it from scratch using churn data going back three years, ran it by analytics to validate the signal, and rolled it out to the whole team in a single sprint. This is exactly the kind of initiative that moves the needle on retention.',
       'company', 'gong', '2026-04-29T16:45:00Z'),

      ('sht_seed_006', 'tpariso@clearcompany.com', 'Taylor Pariso',
       'adefazio@clearcompany.com', 'Anna DeFazio', 'adefazio@clearcompany.com',
       'Anna has been an incredible leader this quarter. She gave me the space to own the onboarding redesign end-to-end, gave clear feedback at exactly the right moments, and went to bat for our timeline with the exec team when it slipped. I feel genuinely trusted and supported here.',
       'team', 'direct', '2026-04-30T09:00:00Z'),

      ('sht_seed_007', 'dgormley@clearcompany.com', 'Dylan Gormley',
       'kdavid@clearcompany.com', 'Kenny David', 'kdavid@clearcompany.com',
       'Kenny tracked down a recurring sync issue that had been frustrating one of our largest accounts for six weeks. He dug through logs across three systems, reproduced it in staging, filed a detailed bug report with Engineering, and personally updated the customer every step of the way. Resolved in 48 hours. Textbook client support.',
       'company', 'direct', '2026-04-30T11:30:00Z'),

      ('sht_seed_008', 'sheaden@clearcompany.com', 'Sean Headen',
       'aricketson@clearcompany.com', 'Amanda Ricketson', 'aricketson@clearcompany.com',
       'Amanda refactored our core API pipeline this week and cut p99 latency by 38% in a single PR. She had been prototyping the approach quietly for two weeks, validated it in staging, and shipped it with zero downtime. That''s engineering excellence — quiet, thorough, and impactful.',
       'company', 'direct', '2026-04-28T16:00:00Z'),

      ('sht_seed_009', 'aricketson@clearcompany.com', 'Amanda Ricketson',
       'irivard@clearcompany.com', 'Ian Rivard', 'irivard@clearcompany.com',
       'Ian ran the best technical discovery sprint I''ve seen in years. He talked to 14 stakeholders in 5 days, synthesized everything into a crisp one-pager with clear themes and tradeoffs, and had an architecture proposal ready for the team to review by Friday. Turned ambiguity into a clear path forward.',
       'company', 'direct', '2026-04-29T11:00:00Z'),

      ('sht_seed_010', 'kbezier@clearcompany.com', 'Kristen Bezier',
       'cmckeon@clearcompany.com', 'Casey McKeon', 'cmckeon@clearcompany.com',
       'Casey closed a $240K ARR deal this week that had been stalled for three months. She re-mapped the stakeholders, got a new exec champion, and ran a flawless business value review. Largest new logo of the quarter. The whole ADR team should learn from how she re-opened this one.',
       'company', 'direct', '2026-04-30T14:00:00Z');
  `);

  // Seed value tags for demo shoutouts
  db.exec(`
    INSERT OR IGNORE INTO rr_shoutout_values (shoutout_id, value_id, value_label) VALUES
      ('sht_seed_001', 'val_001', 'Customer at the Core'),
      ('sht_seed_001', 'val_004', 'Accountable to Outcomes'),
      ('sht_seed_002', 'val_005', 'Raise the Bar'),
      ('sht_seed_002', 'val_001', 'Customer at the Core'),
      ('sht_seed_003', 'val_002', 'Listen to Many, Execute as One'),
      ('sht_seed_003', 'val_004', 'Accountable to Outcomes'),
      ('sht_seed_004', 'val_004', 'Accountable to Outcomes'),
      ('sht_seed_004', 'val_003', 'Embrace Change'),
      ('sht_seed_005', 'val_005', 'Raise the Bar'),
      ('sht_seed_005', 'val_003', 'Embrace Change'),
      ('sht_seed_006', 'val_002', 'Listen to Many, Execute as One'),
      ('sht_seed_007', 'val_001', 'Customer at the Core'),
      ('sht_seed_007', 'val_004', 'Accountable to Outcomes'),
      ('sht_seed_008', 'val_005', 'Raise the Bar'),
      ('sht_seed_008', 'val_004', 'Accountable to Outcomes'),
      ('sht_seed_009', 'val_002', 'Listen to Many, Execute as One'),
      ('sht_seed_009', 'val_005', 'Raise the Bar'),
      ('sht_seed_010', 'val_004', 'Accountable to Outcomes'),
      ('sht_seed_010', 'val_001', 'Customer at the Core');
  `);

  // Seed reactions on demo shoutouts — reactor IDs are real employee emails
  db.exec(`
    INSERT OR IGNORE INTO rr_shoutout_reactions
      (id, shoutout_id, reactor_id, reactor_name, emoji, created_at)
    VALUES
      ('rxn_seed_001', 'sht_seed_001', 'tpariso@clearcompany.com',    'Taylor Pariso',    '👏', '2026-04-25T10:05:00Z'),
      ('rxn_seed_002', 'sht_seed_001', 'dgormley@clearcompany.com',   'Dylan Gormley',    '⭐', '2026-04-25T10:08:00Z'),
      ('rxn_seed_003', 'sht_seed_001', 'sheaden@clearcompany.com',    'Sean Headen',      '🙌', '2026-04-25T10:10:00Z'),
      ('rxn_seed_004', 'sht_seed_002', 'adefazio@clearcompany.com',   'Anna DeFazio',     '🙌', '2026-04-27T15:00:00Z'),
      ('rxn_seed_005', 'sht_seed_002', 'kdavid@clearcompany.com',     'Kenny David',      '👏', '2026-04-27T15:02:00Z'),
      ('rxn_seed_006', 'sht_seed_003', 'tbadeen@clearcompany.com',    'Tom Badeen',       '🔥', '2026-04-28T09:30:00Z'),
      ('rxn_seed_007', 'sht_seed_003', 'tpariso@clearcompany.com',    'Taylor Pariso',    '👏', '2026-04-28T09:35:00Z'),
      ('rxn_seed_008', 'sht_seed_004', 'adefazio@clearcompany.com',   'Anna DeFazio',     '❤️', '2026-04-29T08:05:00Z'),
      ('rxn_seed_009', 'sht_seed_004', 'dgormley@clearcompany.com',   'Dylan Gormley',    '🔥', '2026-04-29T08:07:00Z'),
      ('rxn_seed_010', 'sht_seed_004', 'sheaden@clearcompany.com',    'Sean Headen',      '👏', '2026-04-29T08:10:00Z'),
      ('rxn_seed_011', 'sht_seed_005', 'tbadeen@clearcompany.com',    'Tom Badeen',       '🚀', '2026-04-29T17:00:00Z'),
      ('rxn_seed_012', 'sht_seed_005', 'tpariso@clearcompany.com',    'Taylor Pariso',    '⭐', '2026-04-29T17:05:00Z'),
      ('rxn_seed_013', 'sht_seed_006', 'dgormley@clearcompany.com',   'Dylan Gormley',    '❤️', '2026-04-30T09:05:00Z'),
      ('rxn_seed_014', 'sht_seed_007', 'tpariso@clearcompany.com',    'Taylor Pariso',    '👏', '2026-04-30T11:35:00Z'),
      ('rxn_seed_015', 'sht_seed_007', 'adefazio@clearcompany.com',   'Anna DeFazio',     '⭐', '2026-04-30T11:40:00Z'),
      ('rxn_seed_016', 'sht_seed_007', 'sheaden@clearcompany.com',    'Sean Headen',      '🔥', '2026-04-30T11:42:00Z'),
      ('rxn_seed_017', 'sht_seed_008', 'irivard@clearcompany.com',    'Ian Rivard',       '🚀', '2026-04-28T16:15:00Z'),
      ('rxn_seed_018', 'sht_seed_008', 'zritter@clearcompany.com',    'Zach Ritter',      '🔥', '2026-04-28T16:20:00Z'),
      ('rxn_seed_019', 'sht_seed_009', 'sheaden@clearcompany.com',    'Sean Headen',      '⭐', '2026-04-29T11:10:00Z'),
      ('rxn_seed_020', 'sht_seed_009', 'abresee@clearcompany.com',    'Allie Bresee',     '👏', '2026-04-29T11:15:00Z'),
      ('rxn_seed_021', 'sht_seed_010', 'rbay@clearcompany.com',       'Robert Bay',       '🎉', '2026-04-30T14:05:00Z'),
      ('rxn_seed_022', 'sht_seed_010', 'jcolon@clearcompany.com',     'Julius Colon',     '🚀', '2026-04-30T14:10:00Z');
  `);
}
