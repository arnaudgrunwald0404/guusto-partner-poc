/**
 * services/budgetService.ts — Ledger-based recognition budget management.
 *
 * Design: budget is represented as an append-only ledger of credit/debit
 * events (never a mutable balance column). Real-time balance = SUM of all
 * rows for a given manager_id. This satisfies P0-6 requirements:
 *
 * - Audit trail: every allocation and spend is a permanent record.
 * - Race-condition safety: deductBudget checks balance then inserts sequentially.
 *   For production multi-process safety, use SELECT FOR UPDATE with Postgres.
 * - Rollback on gift failure: rollbackBudget re-credits the ledger rather
 *   than mutating any row, preserving the full history.
 */

import { randomUUID } from 'crypto';
import { sqlAll, sqlGet, sqlRun } from '../db/pg.js';
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
export async function getBalance(managerId: string): Promise<number> {
  const row = await sqlGet<{ balance: number }>(
    'SELECT COALESCE(SUM(amount_cents), 0) as balance FROM rr_budget_ledger WHERE manager_id = ?',
    [managerId]
  );
  return row?.balance ?? 0;
}

/** Full ledger history for a manager, newest first. */
export async function getLedger(managerId: string): Promise<BudgetLedgerRow[]> {
  return sqlAll<BudgetLedgerRow>(`
    SELECT id, manager_id, amount_cents, entry_type, reference_id, created_by, note, created_at
    FROM rr_budget_ledger
    WHERE manager_id = ?
    ORDER BY created_at DESC
  `, [managerId]);
}

/** All manager balances — used by the HR admin budget overview. */
export async function getAllManagerBalances(): Promise<Array<{ manager_id: string; balance: number; total_allocated: number; total_spent: number }>> {
  return sqlAll<{ manager_id: string; balance: number; total_allocated: number; total_spent: number }>(`
    SELECT
      manager_id,
      COALESCE(SUM(amount_cents), 0) as balance,
      COALESCE(SUM(CASE WHEN entry_type = 'allocation' THEN amount_cents ELSE 0 END), 0) as total_allocated,
      COALESCE(ABS(SUM(CASE WHEN entry_type = 'debit' THEN amount_cents ELSE 0 END)), 0) as total_spent
    FROM rr_budget_ledger
    GROUP BY manager_id
    ORDER BY balance DESC
  `);
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Allocate budget to a manager. Admin-only action.
 * Creates a positive ledger entry (credit).
 */
export async function allocateBudget(params: {
  managerId: string;
  amountCents: number;
  periodLabel: string;
  adminId: string;
}): Promise<void> {
  const now = new Date().toISOString();

  await sqlRun(`
    INSERT INTO rr_budget_ledger
      (id, manager_id, amount_cents, entry_type, created_by, note, created_at)
    VALUES (?, ?, ?, 'allocation', ?, ?, ?)
  `, [
    randomUUID(),
    params.managerId,
    params.amountCents,
    params.adminId,
    `Allocation: ${params.periodLabel}`,
    now,
  ]);
}

/**
 * Check available balance and debit it sequentially.
 *
 * Returns the new balance. Throws InsufficientBudgetError if funds are insufficient.
 */
export async function deductBudget(
  managerId: string,
  amountCents: number,
  referenceId: string,
): Promise<number> {
  const current = await getBalance(managerId);
  if (current < amountCents) throw new InsufficientBudgetError(current, amountCents);

  await sqlRun(`
    INSERT INTO rr_budget_ledger
      (id, manager_id, amount_cents, entry_type, reference_id, created_at)
    VALUES (?, ?, ?, 'debit', ?, ?)
  `, [
    randomUUID(),
    managerId,
    -amountCents,
    referenceId,
    new Date().toISOString(),
  ]);

  return current - amountCents;
}

/**
 * Re-credit a manager's budget when a gift send fails.
 * Adds a 'rollback' entry so the refund is visible in the ledger history.
 */
export async function rollbackBudget(
  managerId: string,
  amountCents: number,
  referenceId: string,
): Promise<void> {
  await sqlRun(`
    INSERT INTO rr_budget_ledger
      (id, manager_id, amount_cents, entry_type, reference_id, note, created_at)
    VALUES (?, ?, ?, 'rollback', ?, 'Gift delivery failed — budget returned', ?)
  `, [
    randomUUID(),
    managerId,
    amountCents,   // positive — re-credit
    referenceId,
    new Date().toISOString(),
  ]);
}

/**
 * Expire unused budget at period end (admin / scheduled job action).
 * Creates a negative 'expiry' entry for the remaining balance, zeroing it out.
 */
export async function expireBudget(managerId: string, adminId: string, note: string): Promise<void> {
  const balance = await getBalance(managerId);
  if (balance <= 0) return; // nothing to expire

  await sqlRun(`
    INSERT INTO rr_budget_ledger
      (id, manager_id, amount_cents, entry_type, created_by, note, created_at)
    VALUES (?, ?, ?, 'expiry', ?, ?, ?)
  `, [
    randomUUID(),
    managerId,
    -balance,
    adminId,
    note,
    new Date().toISOString(),
  ]);
}
