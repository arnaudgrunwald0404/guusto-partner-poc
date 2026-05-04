/**
 * __tests__/budgetService.test.ts
 *
 * Tests for services/budgetService.ts.
 * Uses an in-memory ledger array to simulate the SQLite DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory ledger
// ---------------------------------------------------------------------------

interface LedgerRow {
  id: string;
  manager_id: string;
  amount_cents: number;
  entry_type: string;
  reference_id?: string;
  created_by?: string;
  note?: string;
  created_at: string;
}

const ledger: LedgerRow[] = [];

function sumFor(managerId: string): number {
  return ledger.filter(r => r.manager_id === managerId).reduce((s, r) => s + r.amount_cents, 0);
}

function makeDb() {
  return {
    prepare: (sql: string) => {
      // SUM query for a single manager
      if (sql.includes('SUM(amount_cents)') && !sql.includes('GROUP BY')) {
        return {
          get: (managerId: string) => ({ balance: sumFor(managerId) }),
        };
      }
      // SELECT rows for a single manager (getLedger)
      if (sql.includes('FROM rr_budget_ledger') && sql.includes('WHERE manager_id')) {
        return {
          all: (managerId: string) => ledger.filter(r => r.manager_id === managerId).reverse(),
        };
      }
      // GROUP BY query (getAllManagerBalances)
      if (sql.includes('GROUP BY manager_id')) {
        const byManager: Record<string, { balance: number; total_allocated: number; total_spent: number }> = {};
        for (const row of ledger) {
          if (!byManager[row.manager_id]) byManager[row.manager_id] = { balance: 0, total_allocated: 0, total_spent: 0 };
          byManager[row.manager_id].balance += row.amount_cents;
          if (row.entry_type === 'allocation') byManager[row.manager_id].total_allocated += row.amount_cents;
          if (row.entry_type === 'debit') byManager[row.manager_id].total_spent += Math.abs(row.amount_cents);
        }
        return {
          all: () => Object.entries(byManager).map(([manager_id, v]) => ({ manager_id, ...v })),
        };
      }
      // INSERT INTO rr_budget_ledger
      if (sql.includes('INSERT INTO rr_budget_ledger')) {
        return {
          run: (...args: unknown[]) => {
            const [id, manager_id, amount_cents, entry_type, ...rest] = args as [string, string, number, string, ...unknown[]];
            ledger.push({ id, manager_id, amount_cents, entry_type, created_at: new Date().toISOString() });
            return { changes: 1 };
          },
        };
      }
      return { run: () => ({ changes: 0 }), get: () => undefined, all: () => [] };
    },
    transaction: (fn: () => void) => () => fn(),
  };
}

vi.mock('../db/schema.js', () => ({ getDb: () => makeDb() }));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import {
  getBalance,
  getLedger,
  getAllManagerBalances,
  allocateBudget,
  deductBudget,
  rollbackBudget,
  expireBudget,
  InsufficientBudgetError,
} from '../services/budgetService.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  ledger.length = 0;
  vi.clearAllMocks();
});

describe('getBalance', () => {
  it('returns 0 for a manager with no ledger entries', () => {
    expect(getBalance('mgr-new')).toBe(0);
  });

  it('returns sum of all entries for a manager', () => {
    allocateBudget({ managerId: 'mgr-001', amountCents: 10000, periodLabel: 'Q1', adminId: 'admin' });
    expect(getBalance('mgr-001')).toBe(10000);
  });
});

describe('allocateBudget', () => {
  it('creates a positive allocation entry', () => {
    allocateBudget({ managerId: 'mgr-002', amountCents: 5000, periodLabel: 'Q2', adminId: 'admin' });
    expect(getBalance('mgr-002')).toBe(5000);
  });

  it('multiple allocations accumulate', () => {
    allocateBudget({ managerId: 'mgr-003', amountCents: 5000, periodLabel: 'Q1', adminId: 'admin' });
    allocateBudget({ managerId: 'mgr-003', amountCents: 3000, periodLabel: 'Q2', adminId: 'admin' });
    expect(getBalance('mgr-003')).toBe(8000);
  });
});

describe('deductBudget', () => {
  it('reduces balance and returns new balance', () => {
    allocateBudget({ managerId: 'mgr-004', amountCents: 10000, periodLabel: 'Q1', adminId: 'admin' });
    const newBalance = deductBudget('mgr-004', 2500, 'ref-001');
    expect(newBalance).toBe(7500);
    expect(getBalance('mgr-004')).toBe(7500);
  });

  it('throws InsufficientBudgetError when balance is too low', () => {
    allocateBudget({ managerId: 'mgr-005', amountCents: 1000, periodLabel: 'Q1', adminId: 'admin' });
    expect(() => deductBudget('mgr-005', 2500, 'ref-002')).toThrow(InsufficientBudgetError);
  });

  it('throws InsufficientBudgetError with correct available/required fields', () => {
    allocateBudget({ managerId: 'mgr-006', amountCents: 500, periodLabel: 'Q1', adminId: 'admin' });
    try {
      deductBudget('mgr-006', 2500, 'ref-003');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InsufficientBudgetError);
      expect((err as InsufficientBudgetError).available).toBe(500);
      expect((err as InsufficientBudgetError).required).toBe(2500);
    }
  });

  it('throws for manager with zero balance', () => {
    expect(() => deductBudget('mgr-zero', 100, 'ref-x')).toThrow(InsufficientBudgetError);
  });
});

describe('rollbackBudget', () => {
  it('re-credits the manager after a failed gift', () => {
    allocateBudget({ managerId: 'mgr-007', amountCents: 10000, periodLabel: 'Q1', adminId: 'admin' });
    deductBudget('mgr-007', 2500, 'ref-004');
    expect(getBalance('mgr-007')).toBe(7500);

    rollbackBudget('mgr-007', 2500, 'ref-004');
    expect(getBalance('mgr-007')).toBe(10000);
  });
});

describe('expireBudget', () => {
  it('zeroes out the remaining balance with an expiry entry', () => {
    allocateBudget({ managerId: 'mgr-008', amountCents: 10000, periodLabel: 'Q1', adminId: 'admin' });
    deductBudget('mgr-008', 2500, 'ref-005');

    expireBudget('mgr-008', 'admin', 'Q1 ended');

    expect(getBalance('mgr-008')).toBe(0);
  });

  it('no-ops when balance is already zero or negative', () => {
    // manager with no entries
    expireBudget('mgr-empty', 'admin', 'Q1 ended');
    expect(getBalance('mgr-empty')).toBe(0);
  });
});

describe('getLedger', () => {
  it('returns all entries for a manager newest first', () => {
    allocateBudget({ managerId: 'mgr-009', amountCents: 10000, periodLabel: 'Q1', adminId: 'admin' });
    deductBudget('mgr-009', 2500, 'ref-006');

    const rows = getLedger('mgr-009');
    expect(rows.length).toBe(2);
  });

  it('returns empty array for unknown manager', () => {
    expect(getLedger('nobody')).toHaveLength(0);
  });
});

describe('getAllManagerBalances', () => {
  it('returns balances for all managers', () => {
    allocateBudget({ managerId: 'mgr-a', amountCents: 10000, periodLabel: 'Q1', adminId: 'admin' });
    allocateBudget({ managerId: 'mgr-b', amountCents: 5000, periodLabel: 'Q1', adminId: 'admin' });
    deductBudget('mgr-a', 2500, 'ref-007');

    const balances = getAllManagerBalances();
    const mgrA = balances.find(b => b.manager_id === 'mgr-a');
    const mgrB = balances.find(b => b.manager_id === 'mgr-b');

    expect(mgrA?.balance).toBe(7500);
    expect(mgrB?.balance).toBe(5000);
  });
});

describe('InsufficientBudgetError', () => {
  it('has correct name and message', () => {
    const err = new InsufficientBudgetError(500, 2500);
    expect(err.name).toBe('InsufficientBudgetError');
    expect(err.message).toContain('$25.00');
    expect(err.message).toContain('$5.00');
    expect(err instanceof InsufficientBudgetError).toBe(true);
  });
});
