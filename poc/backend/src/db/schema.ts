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
      created_at              TEXT NOT NULL
    );

    -- Gong-triggered recognitions (still used by the Gong pipeline)
    CREATE TABLE IF NOT EXISTS rr_recognitions (
      id                  TEXT PRIMARY KEY,
      classification_id   TEXT NOT NULL,
      employee_id         TEXT NOT NULL,
      employee_first_name TEXT,
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
      ('val_001', 'default', 'Customer Focus',  '🤝', 1, 1, '2026-01-01T00:00:00Z'),
      ('val_002', 'default', 'Innovation',       '💡', 2, 1, '2026-01-01T00:00:00Z'),
      ('val_003', 'default', 'Team Player',      '🏆', 3, 1, '2026-01-01T00:00:00Z'),
      ('val_004', 'default', 'Above & Beyond',   '🚀', 4, 1, '2026-01-01T00:00:00Z'),
      ('val_005', 'default', 'Integrity',        '🛡️', 5, 1, '2026-01-01T00:00:00Z');
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
      ('peer_gifting_enabled',         'false',   '2026-01-01T00:00:00Z');
  `);

  // Seed Q2 2026 budget allocations for demo managers
  db.exec(`
    INSERT OR IGNORE INTO rr_budget_ledger (id, manager_id, amount_cents, entry_type, created_by, note, created_at) VALUES
      ('led_seed_001', 'mgr_001', 50000, 'allocation', 'admin', 'Q2 2026 initial allocation', '2026-04-01T00:00:00Z'),
      ('led_seed_002', 'mgr_002', 50000, 'allocation', 'admin', 'Q2 2026 initial allocation', '2026-04-01T00:00:00Z');
  `);

  // Seed a few demo shoutouts so the feed isn't empty on first launch
  db.exec(`
    INSERT OR IGNORE INTO rr_shoutouts
      (id, sender_id, sender_name, recipient_id, recipient_name, recipient_email,
       message, visibility, source, created_at)
    VALUES
      ('sht_seed_001', 'mgr_001', 'Sarah (Manager)',
       'emp_001', 'John Kim', 'john.kim@demo.com',
       'John went above and beyond this sprint — he spotted a critical edge case during code review that would have caused a data loss bug in production. He stayed late to write the fix and a full regression test suite. The team ship was safer because of him.',
       'company', 'direct', '2026-04-25T10:00:00Z'),

      ('sht_seed_002', 'emp_003', 'Alex Chen',
       'emp_002', 'Maria Santos', 'maria.santos@demo.com',
       'Maria''s onboarding documentation for the new API integration was so thorough that our newest hire was productive on day one. She took the time to write real examples, not just skeleton docs. That kind of teammate makes the whole org faster.',
       'company', 'direct', '2026-04-27T14:30:00Z'),

      ('sht_seed_003', 'mgr_002', 'David (Manager)',
       'emp_003', 'Alex Chen', 'alex.chen@demo.com',
       'Alex presented our Q2 roadmap to the executive team last week and handled every tough question with data and composure. Several execs said it was the clearest engineering roadmap presentation they''d seen this year. Excellent work representing the team.',
       'company', 'direct', '2026-04-28T09:15:00Z');
  `);

  // Seed value tags for demo shoutouts
  db.exec(`
    INSERT OR IGNORE INTO rr_shoutout_values (shoutout_id, value_id, value_label) VALUES
      ('sht_seed_001', 'val_004', 'Above & Beyond'),
      ('sht_seed_001', 'val_003', 'Team Player'),
      ('sht_seed_002', 'val_003', 'Team Player'),
      ('sht_seed_002', 'val_001', 'Customer Focus'),
      ('sht_seed_003', 'val_002', 'Innovation'),
      ('sht_seed_003', 'val_004', 'Above & Beyond');
  `);

  // Seed a couple of reactions on the demo shoutouts
  db.exec(`
    INSERT OR IGNORE INTO rr_shoutout_reactions
      (id, shoutout_id, reactor_id, reactor_name, emoji, created_at)
    VALUES
      ('rxn_seed_001', 'sht_seed_001', 'emp_002', 'Maria Santos', '👏', '2026-04-25T10:05:00Z'),
      ('rxn_seed_002', 'sht_seed_001', 'emp_003', 'Alex Chen',    '⭐', '2026-04-25T10:08:00Z'),
      ('rxn_seed_003', 'sht_seed_002', 'mgr_001', 'Sarah',        '🙌', '2026-04-27T15:00:00Z'),
      ('rxn_seed_004', 'sht_seed_003', 'emp_001', 'John Kim',     '🔥', '2026-04-28T09:30:00Z');
  `);
}
