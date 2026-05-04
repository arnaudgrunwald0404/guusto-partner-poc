/**
 * __tests__/guustoService.test.ts
 *
 * Tests for services/guustoService.ts.
 * Mocks global.fetch and the DB; no real HTTP calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory DB store
// ---------------------------------------------------------------------------

const tenantConfig = new Map<string, string>();
const orders: Record<string, unknown>[] = [];
let recognitionRewardStatus = '';

function makeDb() {
  return {
    prepare: (sql: string) => ({
      run: (...args: unknown[]) => {
        if (sql.includes('INSERT INTO rr_tenant_config')) {
          const [key, value] = args as [string, string];
          tenantConfig.set(key, value);
        }
        if (sql.includes('INSERT INTO rr_orders')) {
          orders.push({ args });
        }
        if (sql.includes("UPDATE rr_recognitions SET reward_status='reward_sending'")) {
          recognitionRewardStatus = 'reward_sending';
        }
        return { changes: 1 };
      },
      get: (key: string) => {
        if (sql.includes('SELECT value FROM rr_tenant_config')) {
          const val = tenantConfig.get(key);
          return val !== undefined ? { value: val } : undefined;
        }
        if (sql.includes('SELECT redemption_url FROM rr_orders')) {
          return orders.find(o => (o as Record<string, unknown>).redemptionUrl !== undefined) as unknown;
        }
        return undefined;
      },
      all: () => [],
    }),
  };
}

vi.mock('../db/schema.js', () => ({ getDb: () => makeDb() }));

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import {
  getGuustoWorkspaceBalance,
  placeGuustoOrder,
  getRedemptionUrl,
  WorkspaceUnderfundedError,
} from '../services/guustoService.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  tenantConfig.clear();
  orders.length = 0;
  recognitionRewardStatus = '';
  vi.clearAllMocks();

  process.env.GUUSTO_BEARER_TOKEN = 'test-bearer';
  process.env.GUUSTO_WORKSPACE_ID = 'ws-test-123';
  process.env.GUUSTO_API_BASE_URL = 'https://mock-guusto.test';
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchOk(body: unknown) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
  });
}

function mockFetchError(status: number, body = 'Error') {
  fetchMock.mockResolvedValue({
    ok: false,
    status,
    text: async () => body,
    json: async () => ({}),
  });
}

// ---------------------------------------------------------------------------
// getGuustoWorkspaceBalance
// ---------------------------------------------------------------------------

describe('getGuustoWorkspaceBalance', () => {
  it('returns balance in cents (API returns dollars)', async () => {
    mockFetchOk({ balance: 4974.0 });

    const balance = await getGuustoWorkspaceBalance('USD');

    expect(balance).toBe(497400);
  });

  it('caches result in rr_tenant_config', async () => {
    mockFetchOk({ balance: 100.0 });

    await getGuustoWorkspaceBalance('USD');

    expect(tenantConfig.get('guusto_workspace_balance_cents')).toBe('10000');
    expect(tenantConfig.has('guusto_workspace_balance_checked_at')).toBe(true);
  });

  it('throws when API returns non-ok status', async () => {
    mockFetchError(401, 'Unauthorized');

    await expect(getGuustoWorkspaceBalance('USD')).rejects.toThrow('Guusto balance check failed: 401');
  });

  it('throws when response is missing balance field', async () => {
    mockFetchOk({ somethingElse: 42 });

    await expect(getGuustoWorkspaceBalance('USD')).rejects.toThrow('Unexpected Guusto balance response');
  });

  it('sends Authorization and X-Workspace-id headers', async () => {
    mockFetchOk({ balance: 50.0 });

    await getGuustoWorkspaceBalance('USD');

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-bearer');
    expect(headers['X-Workspace-id']).toBe('ws-test-123');
  });
});

// ---------------------------------------------------------------------------
// placeGuustoOrder
// ---------------------------------------------------------------------------

describe('placeGuustoOrder', () => {
  const BASE_PARAMS = {
    recognitionId: 'rec-001',
    employeeEmail: 'jane@demo.com',
    employeeFirstName: 'Jane',
    employeeLastName: 'Doe',
    managerEmail: 'manager@demo.com',
    recognitionMessage: 'Outstanding work!',
    amountCents: 2500,
  };

  it('places order and returns requestId', async () => {
    // First call = balance check, second call = place order
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ balance: 500.0 }) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ requestId: 'req-abc-123' }) });

    const result = await placeGuustoOrder(BASE_PARAMS);

    expect(result.requestId).toBe('req-abc-123');
    expect(result.redemptionUrl).toBeNull();
  });

  it('persists rr_orders row after placing order', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ balance: 500.0 }) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ requestId: 'req-xyz' }) });

    await placeGuustoOrder(BASE_PARAMS);

    expect(orders).toHaveLength(1);
    expect(recognitionRewardStatus).toBe('reward_sending');
  });

  it('throws WorkspaceUnderfundedError when balance < order amount', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200, text: async () => JSON.stringify({ balance: 10.0 }),
    });

    await expect(placeGuustoOrder(BASE_PARAMS)).rejects.toThrow(WorkspaceUnderfundedError);
  });

  it('throws when Guusto API returns non-ok', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ balance: 500.0 }) })
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'Bad Request' });

    await expect(placeGuustoOrder(BASE_PARAMS)).rejects.toThrow('Guusto order failed: 400');
  });

  it('throws when creds are not set', async () => {
    delete process.env.GUUSTO_BEARER_TOKEN;

    await expect(placeGuustoOrder(BASE_PARAMS)).rejects.toThrow('not set');
  });

  it('accepts id field as fallback for requestId', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ balance: 500.0 }) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ id: 'fallback-id' }) });

    const result = await placeGuustoOrder(BASE_PARAMS);
    expect(result.requestId).toBe('fallback-id');
  });
});

// ---------------------------------------------------------------------------
// getRedemptionUrl
// ---------------------------------------------------------------------------

describe('getRedemptionUrl', () => {
  it('returns null when no order exists', () => {
    // DB mock returns undefined for the query
    const url = getRedemptionUrl('rec-999');
    expect(url).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// WorkspaceUnderfundedError
// ---------------------------------------------------------------------------

describe('WorkspaceUnderfundedError', () => {
  it('carries balance and amount fields', () => {
    const err = new WorkspaceUnderfundedError(1000, 2500, 'USD');
    expect(err.workspaceBalanceCents).toBe(1000);
    expect(err.orderAmountCents).toBe(2500);
    expect(err.currency).toBe('USD');
    expect(err.name).toBe('WorkspaceUnderfundedError');
    expect(err instanceof WorkspaceUnderfundedError).toBe(true);
  });
});
