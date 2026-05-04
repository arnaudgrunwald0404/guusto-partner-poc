/**
 * __tests__/shoutoutService.test.ts
 *
 * Tests for services/shoutoutService.ts.
 * Mocks DB, budgetService, guustoService, and emailService.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory DB state
// ---------------------------------------------------------------------------

const shoutouts = new Map<string, Record<string, unknown>>();
const shoutoutValues: Array<{ shoutout_id: string; value_id: string; value_label: string }> = [];
const auditLogs: Record<string, unknown>[] = [];
const orders = new Map<string, { status: string }>();

function makeDb() {
  return {
    prepare: (sql: string) => ({
      run: (...args: unknown[]) => {
        if (sql.includes('INSERT INTO rr_shoutouts')) {
          const [id, sender_id, sender_name, recipient_id, recipient_name, recipient_email, message, visibility, source, gift_amount_cents, gift_status, created_at] = args as string[];
          shoutouts.set(id, { id, sender_id, sender_name, recipient_id, recipient_name, recipient_email, message, visibility, source, gift_amount_cents, gift_status, created_at, deleted_at: null });
        }
        if (sql.includes('INSERT OR IGNORE INTO rr_shoutout_values')) {
          const [shoutout_id, value_id, value_label] = args as string[];
          shoutoutValues.push({ shoutout_id, value_id, value_label });
        }
        if (sql.includes('INSERT INTO rr_audit_log')) {
          auditLogs.push({ args });
        }
        if (sql.includes('UPDATE rr_shoutouts SET guusto_request_id')) {
          const [requestId, shoutoutId] = args as string[];
          const s = shoutouts.get(shoutoutId);
          if (s) { s.guusto_request_id = requestId; s.gift_status = 'sending'; }
        }
        if (sql.includes("gift_status = 'sent'")) {
          const [id] = args as string[];
          const s = shoutouts.get(id);
          if (s) s.gift_status = 'sent';
        }
        if (sql.includes("gift_status = 'failed'")) {
          const [id] = args as string[];
          const s = shoutouts.get(id);
          if (s) s.gift_status = 'failed';
        }
        return { changes: 1 };
      },
      get: (...args: unknown[]) => {
        if (sql.includes('FROM rr_orders WHERE guusto_request_id')) {
          return orders.get(args[0] as string);
        }
        if (sql.includes('SELECT COUNT(*)')) {
          return { n: [...shoutouts.values()].filter(s => !s.deleted_at).length };
        }
        return undefined;
      },
      all: (...args: unknown[]) => {
        if (sql.includes('FROM rr_shoutouts') && !sql.includes('SELECT COUNT(*)')) {
          return [...shoutouts.values()].filter(s => !s.deleted_at);
        }
        if (sql.includes('FROM rr_shoutout_values')) {
          // args[0] is the shoutout id
          return shoutoutValues.filter(v => v.shoutout_id === (args[0] as string));
        }
        if (sql.includes('FROM rr_shoutout_reactions')) return [];
        return [];
      },
    }),
    transaction: (fn: () => void) => () => fn(),
  };
}

vi.mock('../db/schema.js', () => ({ getDb: () => makeDb() }));

// ---------------------------------------------------------------------------
// Mocks for dependencies
// ---------------------------------------------------------------------------

const deductBudgetMock = vi.fn().mockReturnValue(7500);
const rollbackBudgetMock = vi.fn();
vi.mock('../services/budgetService.js', () => ({
  deductBudget: (...a: unknown[]) => deductBudgetMock(...a),
  rollbackBudget: (...a: unknown[]) => rollbackBudgetMock(...a),
}));

const placeGuustoOrderMock = vi.fn().mockResolvedValue({ requestId: 'guusto-req-001', redemptionUrl: null });
const pollOrderStatusMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../services/guustoService.js', () => ({
  placeGuustoOrder: (...a: unknown[]) => placeGuustoOrderMock(...a),
  pollOrderStatus: (...a: unknown[]) => pollOrderStatusMock(...a),
}));

const sendRecognitionNotificationEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../services/emailService.js', () => ({
  sendRecognitionNotificationEmail: (...a: unknown[]) => sendRecognitionNotificationEmailMock(...a),
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import {
  createShoutout,
  notifyShoutoutRecipient,
  attachGuustoGift,
  writeAuditLog,
  getShoutoutFeed,
} from '../services/shoutoutService.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  shoutouts.clear();
  shoutoutValues.length = 0;
  auditLogs.length = 0;
  orders.clear();
  vi.clearAllMocks();
  deductBudgetMock.mockReturnValue(7500);
  placeGuustoOrderMock.mockResolvedValue({ requestId: 'guusto-req-001', redemptionUrl: null });
  pollOrderStatusMock.mockResolvedValue(undefined);
  sendRecognitionNotificationEmailMock.mockResolvedValue(undefined);
});

const BASE_SHOUTOUT = {
  senderId: 'mgr-001',
  senderName: 'Bob Manager',
  recipientId: 'emp-001',
  recipientName: 'Jane Doe',
  recipientEmail: 'jane@demo.com',
  message: 'Great work this quarter!',
  visibility: 'company' as const,
  valueIds: ['val-1'],
  valueLabels: ['Innovation'],
};

describe('createShoutout', () => {
  it('returns a new shoutout ID', () => {
    const id = createShoutout(BASE_SHOUTOUT);
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('persists shoutout and value tags', () => {
    const id = createShoutout(BASE_SHOUTOUT);
    expect(shoutouts.has(id)).toBe(true);
    expect(shoutoutValues.some(v => v.shoutout_id === id && v.value_id === 'val-1')).toBe(true);
  });

  it('shoutout has no gift when giftAmountCents is not provided', () => {
    const id = createShoutout(BASE_SHOUTOUT);
    const s = shoutouts.get(id);
    expect(s?.gift_amount_cents).toBeNull();
    expect(s?.gift_status).toBeNull();
    expect(deductBudgetMock).not.toHaveBeenCalled();
  });

  it('deducts budget when giftAmountCents > 0', () => {
    const id = createShoutout({ ...BASE_SHOUTOUT, giftAmountCents: 2500 });
    expect(deductBudgetMock).toHaveBeenCalledWith('mgr-001', 2500, id);
  });

  it('sets gift_status to pending when gift is provided', () => {
    const id = createShoutout({ ...BASE_SHOUTOUT, giftAmountCents: 2500 });
    const s = shoutouts.get(id);
    expect(s?.gift_status).toBe('pending');
    expect(s?.gift_amount_cents).toBe(2500);
  });

  it('writes audit log entry for monetary shoutout', () => {
    createShoutout({ ...BASE_SHOUTOUT, giftAmountCents: 2500 });
    expect(auditLogs.length).toBeGreaterThan(0);
  });

  it('multiple value tags are persisted', () => {
    const id = createShoutout({ ...BASE_SHOUTOUT, valueIds: ['v1', 'v2'], valueLabels: ['A', 'B'] });
    const values = shoutoutValues.filter(v => v.shoutout_id === id);
    expect(values).toHaveLength(2);
  });
});

describe('writeAuditLog', () => {
  it('inserts an audit log row', () => {
    writeAuditLog({ actorId: 'usr-1', actorRole: 'manager', action: 'test', entityType: 'shoutout', entityId: 'sh-1', details: {} });
    expect(auditLogs).toHaveLength(1);
  });
});

describe('notifyShoutoutRecipient', () => {
  it('calls sendRecognitionNotificationEmail with correct params', async () => {
    await notifyShoutoutRecipient({
      shoutoutId: 'sh-001',
      recipientFirstName: 'Jane',
      recipientEmail: 'jane@demo.com',
      senderName: 'Bob',
      message: 'Great job!',
      valueLabels: ['Innovation'],
      hasGift: true,
      giftAmountCents: 2500,
    });

    expect(sendRecognitionNotificationEmailMock).toHaveBeenCalledOnce();
    const arg = sendRecognitionNotificationEmailMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.recipientEmail).toBe('jane@demo.com');
    expect(arg.hasGift).toBe(true);
  });

  it('swallows email errors silently', async () => {
    sendRecognitionNotificationEmailMock.mockRejectedValue(new Error('Resend down'));

    await expect(
      notifyShoutoutRecipient({ shoutoutId: 'sh-001', recipientFirstName: 'Jane', recipientEmail: 'jane@demo.com', senderName: 'Bob', message: 'Hi', valueLabels: [], hasGift: false })
    ).resolves.not.toThrow();
  });
});

describe('attachGuustoGift', () => {
  const BASE_GIFT = {
    shoutoutId: 'sh-001',
    senderId: 'mgr-001',
    senderEmail: 'mgr@demo.com',
    recipientEmail: 'jane@demo.com',
    recipientFirstName: 'Jane',
    amountCents: 2500,
    message: 'Well done!',
  };

  it('updates shoutout to gift_status=sending after placing order', async () => {
    shoutouts.set('sh-001', { id: 'sh-001', gift_status: 'pending', deleted_at: null });
    await attachGuustoGift(BASE_GIFT);

    const s = shoutouts.get('sh-001');
    expect(s?.gift_status).toBe('sending');
    expect(s?.guusto_request_id).toBe('guusto-req-001');
  });

  it('simulates delivery when Guusto creds are missing', async () => {
    shoutouts.set('sh-001', { id: 'sh-001', gift_status: 'pending', deleted_at: null });
    placeGuustoOrderMock.mockRejectedValue(new Error('GUUSTO_BEARER_TOKEN or GUUSTO_WORKSPACE_ID not set'));

    await attachGuustoGift(BASE_GIFT);

    const s = shoutouts.get('sh-001');
    expect(s?.gift_status).toBe('sent');
  });

  it('fails gift and rolls back budget on Guusto API error', async () => {
    shoutouts.set('sh-001', { id: 'sh-001', gift_status: 'pending', deleted_at: null });
    placeGuustoOrderMock.mockRejectedValue(new Error('Guusto API 500'));

    await attachGuustoGift(BASE_GIFT);

    const s = shoutouts.get('sh-001');
    expect(s?.gift_status).toBe('failed');
    expect(rollbackBudgetMock).toHaveBeenCalledWith('mgr-001', 2500, 'sh-001');
  });
});

describe('getShoutoutFeed', () => {
  beforeEach(() => {
    shoutouts.set('sh-a', { id: 'sh-a', sender_id: 'mgr-1', sender_name: 'Bob', recipient_id: 'emp-1', recipient_name: 'Jane', message: 'Good', visibility: 'company', source: 'direct', gift_amount_cents: null, gift_status: null, created_at: new Date().toISOString(), deleted_at: null });
    shoutouts.set('sh-b', { id: 'sh-b', sender_id: 'mgr-1', sender_name: 'Bob', recipient_id: 'emp-2', recipient_name: 'Tom', message: 'Great', visibility: 'company', source: 'direct', gift_amount_cents: null, gift_status: null, created_at: new Date().toISOString(), deleted_at: null });
  });

  it('returns shoutouts with items and total', () => {
    const result = getShoutoutFeed({});
    expect(result.items.length).toBeGreaterThan(0);
    expect(typeof result.total).toBe('number');
  });

  it('each item has expected shape', () => {
    const result = getShoutoutFeed({});
    const item = result.items[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('senderId');
    expect(item).toHaveProperty('values');
    expect(item).toHaveProperty('reactions');
  });
});
