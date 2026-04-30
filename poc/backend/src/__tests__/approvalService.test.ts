/**
 * __tests__/approvalService.test.ts — Unit tests for approvalService.ts
 *
 * Tests cover: RR-H4 acceptance criteria
 * - createApprovalToken returns token + hash + 48h expiry
 * - validateToken returns valid for fresh token
 * - validateToken returns expired for old token (time mocked)
 * - validateToken returns already_decided after decision recorded
 * - recordDecision sets decided_at and decision
 * - Double-call to recordDecision does not overwrite first decision
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// In-memory store for rr_approvals rows
// ---------------------------------------------------------------------------

interface ApprovalRow {
  id: string;
  recognition_id: string;
  token_hash: string;
  expires_at: string;
  decided_at: string | null;
  decision: string | null;
}

const approvalStore = new Map<string, ApprovalRow>();

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

vi.mock('../db/schema.js', () => ({
  getDb: () => ({
    prepare: (sql: string) => {
      // INSERT INTO rr_approvals
      if (sql.includes('INSERT INTO rr_approvals')) {
        return {
          run: (id: string, recognition_id: string, token_hash: string, expires_at: string) => {
            approvalStore.set(token_hash, {
              id,
              recognition_id,
              token_hash,
              expires_at,
              decided_at: null,
              decision: null,
            });
            return { changes: 1 };
          },
        };
      }
      // SELECT * FROM rr_approvals WHERE token_hash = ?
      if (sql.includes('SELECT * FROM rr_approvals WHERE token_hash')) {
        return {
          get: (token_hash: string) => approvalStore.get(token_hash) ?? undefined,
        };
      }
      // UPDATE rr_approvals SET decided_at (first-write-wins)
      if (sql.includes('UPDATE rr_approvals') && sql.includes('decided_at IS NULL')) {
        return {
          run: (decided_at: string, decision: string, token_hash: string) => {
            const row = approvalStore.get(token_hash);
            if (row && row.decided_at === null) {
              approvalStore.set(token_hash, { ...row, decided_at, decision });
              return { changes: 1 };
            }
            return { changes: 0 };
          },
        };
      }
      // Fallback — should not be hit in these tests
      return { run: () => ({ changes: 0 }), get: () => undefined };
    },
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// ---------------------------------------------------------------------------
// Import under test (after mocks are declared)
// ---------------------------------------------------------------------------

import {
  createApprovalToken,
  validateToken,
  recordDecision,
} from '../services/approvalService.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  approvalStore.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createApprovalToken', () => {
  it('returns a token, its SHA256 hash, and a 48h expiry', () => {
    const now = new Date('2026-04-29T12:00:00.000Z');
    vi.setSystemTime(now);

    const result = createApprovalToken('rec-001');

    // Token should be 64 hex chars (32 bytes)
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);

    // Hash should equal SHA256 of the raw token
    expect(result.tokenHash).toBe(sha256hex(result.token));

    // Expiry should be now + 48h
    const expectedExpiry = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
    expect(result.expiresAt).toBe(expectedExpiry);
  });

  it('stores the row in the DB with tokenHash as key', () => {
    const result = createApprovalToken('rec-002');
    const stored = approvalStore.get(result.tokenHash);
    expect(stored).toBeDefined();
    expect(stored?.recognition_id).toBe('rec-002');
    expect(stored?.token_hash).toBe(result.tokenHash);
    expect(stored?.decided_at).toBeNull();
    expect(stored?.decision).toBeNull();
  });
});

describe('validateToken', () => {
  it('returns valid: true for a fresh token', () => {
    vi.setSystemTime(new Date('2026-04-29T12:00:00.000Z'));
    const { token } = createApprovalToken('rec-003');

    const result = validateToken(token);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.recognition_id).toBe('rec-003');
    }
  });

  it('returns valid: false with reason "not_found" for an unknown token', () => {
    const result = validateToken('0'.repeat(64));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('not_found');
    }
  });

  it('returns valid: false with reason "expired" for a token past its TTL', () => {
    // Create token at T=0
    vi.setSystemTime(new Date('2026-04-29T12:00:00.000Z'));
    const { token } = createApprovalToken('rec-004');

    // Advance clock past 48h
    vi.setSystemTime(new Date('2026-05-01T13:00:00.000Z'));

    const result = validateToken(token);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('expired');
    }
  });

  it('returns valid: false with reason "already_decided" after decision recorded', () => {
    vi.setSystemTime(new Date('2026-04-29T12:00:00.000Z'));
    const { token, tokenHash } = createApprovalToken('rec-005');

    recordDecision(tokenHash, 'approved');

    const result = validateToken(token);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('already_decided');
      expect(result.already_decided).toBe('approved');
    }
  });
});

describe('recordDecision', () => {
  it('sets decided_at and decision on the row', () => {
    const now = new Date('2026-04-29T14:00:00.000Z');
    vi.setSystemTime(now);

    const { tokenHash } = createApprovalToken('rec-006');
    recordDecision(tokenHash, 'dismissed');

    const row = approvalStore.get(tokenHash);
    expect(row?.decision).toBe('dismissed');
    expect(row?.decided_at).toBe(now.toISOString());
  });

  it('does NOT overwrite the first decision on a second call (first write wins)', () => {
    vi.setSystemTime(new Date('2026-04-29T14:00:00.000Z'));

    const { tokenHash } = createApprovalToken('rec-007');
    recordDecision(tokenHash, 'approved');
    recordDecision(tokenHash, 'dismissed'); // second call — should be ignored

    const row = approvalStore.get(tokenHash);
    expect(row?.decision).toBe('approved'); // first write wins
  });
});
