/**
 * services/budgetService.ts — Ledger-based recognition budget management.
 *
 * Design: budget is represented as an append-only ledger of credit/debit
 * events (never a mutable balance column). Real-time balance = SUM of all
 * rows for a given manager_id. This satisfies P0-6 requirements:
 *
 * - Audit trail: every allocation and spend is a permanent record.
 * - Race-condition safety: deductBudget wraps the check + insert in a single
 *   better-sqlite3 transaction, which is serialized within the process.
 *   SQLite in WAL mode guarantees that concurrent reads won't observe a
 *   partial write. For a multi-process deployment, switch to SERIALIZABLE
 *   isolation on Postgres with SELECT FOR UPDATE.
 * - Rollback on gift failure: rollbackBudget re-credits the ledger rather
 *   than mutating any row, preserving the full history.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../db/schema.js';
import type { BudgetLedgerRow } from '../types.js';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class InsufficientBudgetError extends Error {
  readonly available: number;
  readonly required: number;

  constructor(available: number, required: number) {
    super(
      `Insufficient budget: need $${(required / 100).toFixed(2)}, ` +
      `have $${(available / 100).toFixed(2)} available`
    );
    this.name = 'InsufficientBudgetError';
    this.available = available;
    this.required = required;
  }
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/** Current balance for a manager — sum of all ledger entries. */
export function getBalance(managerId: string): number {
  const db = getDb();
  const row = db.prepare(
    'SELECT COALESCE(SUM(amount_cents), 0) as balance FROM rr_budget_ledger WHERE manager_id = ?'
  ).get(managerId) as { balance: number };
  return row.balance;
}

/** Full ledger history for a manager, newest first. */
export function getLedger(managerId: string): BudgetLedgerRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, manager_id, amount_cents, entry_type, reference_id, created_by, note, created_at
    FROM rr_budget_ledger
    WHERE manager_id = ?
    ORDER BY created_at DESC
  `).all(managerId) as BudgetLedgerRow[];
}

/** All manager balances — used by the HR admin budget overview. */
export function getAllManagerBalances(): Array<{ manager_id: string; balance: number; total_allocated: number; total_spent: number }> {
  const db = getDb();
  return db.prepare(`
    SELECT
      manager_id,
      COALESCE(SUM(amount_cents), 0) as balance,
      COALESCE(SUM(CASE WHEN entry_type = 'allocation' THEN amount_cents ELSE 0 END), 0) as total_allocated,
      COALESCE(ABS(SUM(CASE WHEN entry_type = 'debit' THEN amount_cents ELSE 0 END)), 0) as total_spent
    FROM rr_budget_ledger
    GROUP BY manager_id
    ORDER BY balance DESC
  `).all() as Array<{ manager_id: string; balance: number; total_allocated: number; total_spent: number }>;
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Allocate budget to a manager. Admin-only action.
 * Creates a positive ledger entry (credit).
 */
export function allocateBudget(params: {
  managerId: string;
  amountCents: number;
  periodLabel: string;
  adminId: string;
}): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(`
      INSERT INTO rr_budget_ledger
        (id, manager_id, amount_cents, entry_type, created_by, note, created_at)
      VALUES (?, ?, ?, 'allocation', ?, ?, ?)
    `).run(
      randomUUID(),
      params.managerId,
      params.amountCents,
      params.adminId,
      `Allocation: ${params.periodLabel}`,
      now,
    );
  })();
}

/**
 * Atomically check available balance and debit it.
 *
 * The check-then-debit is wrapped in a single SQLite transaction, making it
 * safe against concurrent requests from the same process. Returns the new
 * balance. Throws InsufficientBudgetError if funds are insufficient.
 */
export function deductBudget(
  managerId: string,
  amountCents: number,
  referenceId: string,
): number {
  const db = getDb();
  let newBalance = 0;

  db.transaction(() => {
    const row = db.prepare(
      'SELECT COALESCE(SUM(amount_cents), 0) as balance FROM rr_budget_ledger WHERE manager_id = ?'
    ).get(managerId) as { balance: number };

    if (row.balance < amountCents) {
      throw new InsufficientBudgetError(row.balance, amountCents);
    }

    db.prepare(`
      INSERT INTO rr_budget_ledger
        (id, manager_id, amount_cents, entry_type, reference_id, created_at)
      VALUES (?, ?, ?, 'debit', ?, ?)
    `).run(
      randomUUID(),
      managerId,
      -amountCents,
      referenceId,
      new Date().toISOString(),
    );

    newBalance = row.balance - amountCents;
  })();

  return newBalance;
}

/**
 * Re-credit a manager's budget when a gift send fails.
 * Adds a 'rollback' entry so the refund is visible in the ledger history.
 */
export function rollbackBudget(
  managerId: string,
  amountCents: number,
  referenceId: string,
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO rr_budget_ledger
      (id, manager_id, amount_cents, entry_type, reference_id, note, created_at)
    VALUES (?, ?, ?, 'rollback', ?, 'Gift delivery failed — budget returned', ?)
  `).run(
    randomUUID(),
    managerId,
    amountCents,   // positive — re-credit
    referenceId,
    new Date().toISOString(),
  );
}

/**
 * Expire unused budget at period end (admin / scheduled job action).
 * Creates a negative 'expiry' entry for the remaining balance, zeroing it out.
 */
export function expireBudget(managerId: string, adminId: string, note: string): void {
  const db = getDb();

  db.transaction(() => {
    const row = db.prepare(
      'SELECT COALESCE(SUM(amount_cents), 0) as balance FROM rr_budget_ledger WHERE manager_id = ?'
    ).get(managerId) as { balance: number };

    if (row.balance <= 0) return; // nothing to expire

    db.prepare(`
      INSERT INTO rr_budget_ledger
        (id, manager_id, amount_cents, entry_type, created_by, note, created_at)
      VALUES (?, ?, ?, 'expiry', ?, ?, ?)
    `).run(
      randomUUID(),
      managerId,
      -row.balance,
      adminId,
      note,
      new Date().toISOString(),
    );
  })();
}
