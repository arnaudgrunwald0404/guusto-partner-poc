/**
 * __tests__/processGongEvent.test.ts
 *
 * Tests for the core R&R pipeline in jobs/processGongEvent.ts.
 * All external dependencies (DB, classifier, resolver, email) are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClassifierError } from '../types.js';

// ---------------------------------------------------------------------------
// In-memory DB store
// ---------------------------------------------------------------------------

interface EventRow {
  id: string;
  call_id: string;
  payload: string;
  status: string;
  call_url: string | null;
  call_title: string | null;
}

const events = new Map<string, EventRow>();
const classifications: Record<string, unknown>[] = [];
const recognitions: Record<string, unknown>[] = [];

function makeDb() {
  return {
    prepare: (sql: string) => ({
      get: (id: string) => {
        if (sql.includes('FROM gong_events')) return events.get(id);
        return undefined;
      },
      run: (...args: unknown[]) => {
        if (sql.includes('UPDATE gong_events')) {
          const [status, id] = args as [string, string];
          const row = events.get(id);
          if (row) row.status = status;
        }
        if (sql.includes('INSERT INTO rr_classifications')) {
          classifications.push({ args });
        }
        if (sql.includes('INSERT INTO rr_recognitions')) {
          recognitions.push({ args });
        }
        return { changes: 1 };
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../db/schema.js', () => ({ getDb: () => makeDb() }));

const classifyMock = vi.fn();
vi.mock('../services/classifier.js', () => ({ classifyTranscript: (...a: unknown[]) => classifyMock(...a) }));

const resolveEmployeeMock = vi.fn();
vi.mock('../services/employeeResolver.js', () => ({
  resolveEmployee: (...a: unknown[]) => resolveEmployeeMock(...a),
  STUB_EMPLOYEES: [
    { id: 'emp-001', firstName: 'Jane', lastName: 'Doe', email: 'jane@demo.com', managerId: 'mgr-001', managerEmail: 'manager@demo.com', managerFirstName: 'Bob' },
  ],
}));

const createApprovalTokenMock = vi.fn().mockReturnValue({ token: 'tok', tokenHash: 'hash' });
const createIdentifyTokenMock = vi.fn().mockReturnValue({ token: 'itok', tokenHash: 'ihash' });
vi.mock('../services/approvalService.js', () => ({
  createApprovalToken: (...a: unknown[]) => createApprovalTokenMock(...a),
  createIdentifyToken: (...a: unknown[]) => createIdentifyTokenMock(...a),
}));

const sendApprovalEmailMock = vi.fn().mockResolvedValue(undefined);
const sendIdentifyEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../services/emailService.js', () => ({
  sendApprovalEmail: (...a: unknown[]) => sendApprovalEmailMock(...a),
  sendIdentifyEmail: (...a: unknown[]) => sendIdentifyEmailMock(...a),
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { processGongEvent } from '../jobs/processGongEvent.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CLASSIFIED_RESULT = {
  result: 'classified',
  data: {
    is_exceptional_praise: true,
    confidence: 0.95,
    employee_name_mentioned: 'Jane',
    evidence_quote: 'Best engineer ever.',
    sentiment_magnitude: 'very_high',
    recognition_draft: 'Jane — outstanding work!',
    reasoning: 'Customer praised directly.',
  },
};

const RESOLVED_EMPLOYEE = {
  result: 'found',
  employee: {
    id: 'emp-001',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@demo.com',
    managerId: 'mgr-001',
    managerEmail: 'manager@demo.com',
    managerFirstName: 'Bob',
  },
};

function seedEvent(id: string, overrides: Partial<EventRow> = {}): EventRow {
  const row: EventRow = {
    id,
    call_id: 'call-001',
    payload: JSON.stringify({ callId: 'call-001', workspaceId: 'ws-001', transcript: 'Jane is the best.' }),
    status: 'pending',
    call_url: null,
    call_title: null,
    ...overrides,
  };
  events.set(id, row);
  return row;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  events.clear();
  classifications.length = 0;
  recognitions.length = 0;
  vi.clearAllMocks();
  createApprovalTokenMock.mockReturnValue({ token: 'tok', tokenHash: 'hash' });
  createIdentifyTokenMock.mockReturnValue({ token: 'itok', tokenHash: 'ihash' });
  sendApprovalEmailMock.mockResolvedValue(undefined);
  sendIdentifyEmailMock.mockResolvedValue(undefined);
  process.env.APP_BASE_URL = 'http://localhost:3001';
  process.env.MANAGER_EMAIL = 'manager@demo.com';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('processGongEvent', () => {
  it('event not found → returns early, no DB writes', async () => {
    await processGongEvent('nonexistent-id');
    expect(classifications).toHaveLength(0);
    expect(recognitions).toHaveLength(0);
  });

  it('missing transcript → status set to no_transcript', async () => {
    const row = seedEvent('evt-1', {
      payload: JSON.stringify({ callId: 'call-001', workspaceId: 'ws-001', transcript: '' }),
    });
    await processGongEvent('evt-1');
    expect(row.status).toBe('no_transcript');
    expect(classifyMock).not.toHaveBeenCalled();
  });

  it('below_threshold result → status updated, no recognition written', async () => {
    const row = seedEvent('evt-2');
    classifyMock.mockResolvedValue({ result: 'below_threshold', reasoning: 'Just a thank you.' });

    await processGongEvent('evt-2');

    expect(row.status).toBe('below_threshold');
    expect(classifications).toHaveLength(0);
    expect(recognitions).toHaveLength(0);
  });

  it('no_employee_identified → status updated, no recognition written', async () => {
    const row = seedEvent('evt-3');
    classifyMock.mockResolvedValue({ result: 'no_employee_identified', reasoning: 'No name.' });

    await processGongEvent('evt-3');

    expect(row.status).toBe('no_employee_identified');
    expect(recognitions).toHaveLength(0);
  });

  it('happy path: classified + employee found → writes classification + recognition, sends approval email', async () => {
    const row = seedEvent('evt-4');
    classifyMock.mockResolvedValue(CLASSIFIED_RESULT);
    resolveEmployeeMock.mockReturnValue(RESOLVED_EMPLOYEE);

    await processGongEvent('evt-4');

    expect(row.status).toBe('classified');
    expect(classifications).toHaveLength(1);
    expect(recognitions).toHaveLength(1);
    expect(sendApprovalEmailMock).toHaveBeenCalledOnce();
    expect(createApprovalTokenMock).toHaveBeenCalledOnce();
  });

  it('employee not_found → writes classification, sends identify email, status=needs_employee_review', async () => {
    const row = seedEvent('evt-5');
    classifyMock.mockResolvedValue(CLASSIFIED_RESULT);
    resolveEmployeeMock.mockReturnValue({ result: 'not_found' });

    await processGongEvent('evt-5');

    expect(row.status).toBe('needs_employee_review');
    expect(classifications).toHaveLength(1);
    expect(recognitions).toHaveLength(0);
    expect(sendIdentifyEmailMock).toHaveBeenCalledOnce();
  });

  it('employee ambiguous → writes classification, sends identify email, status=needs_employee_review', async () => {
    const row = seedEvent('evt-6');
    classifyMock.mockResolvedValue(CLASSIFIED_RESULT);
    resolveEmployeeMock.mockReturnValue({
      result: 'ambiguous',
      candidates: [RESOLVED_EMPLOYEE.employee],
    });

    await processGongEvent('evt-6');

    expect(row.status).toBe('needs_employee_review');
    expect(sendIdentifyEmailMock).toHaveBeenCalledOnce();
  });

  it('non-retryable classifier error → status=failed', async () => {
    const row = seedEvent('evt-7');
    classifyMock.mockRejectedValue(new Error('Unexpected error'));

    await processGongEvent('evt-7');

    expect(row.status).toBe('failed');
    expect(classifyMock).toHaveBeenCalledOnce();
  });

  it('retryable classifier error → retries after 60s and succeeds', async () => {
    vi.useFakeTimers();
    const row = seedEvent('evt-8');
    classifyMock
      .mockRejectedValueOnce(new ClassifierError('Server overload', true))
      .mockResolvedValueOnce({ result: 'below_threshold', reasoning: 'Low signal.' });

    const p = processGongEvent('evt-8');
    await vi.advanceTimersByTimeAsync(60_000);
    await p;

    expect(classifyMock).toHaveBeenCalledTimes(2);
    expect(row.status).toBe('below_threshold');
  });

  it('retryable error → retry also fails → status=failed', async () => {
    vi.useFakeTimers();
    const row = seedEvent('evt-9');
    classifyMock
      .mockRejectedValueOnce(new ClassifierError('Server overload', true))
      .mockRejectedValueOnce(new ClassifierError('Still broken', true));

    const p = processGongEvent('evt-9');
    await vi.advanceTimersByTimeAsync(60_000);
    await p;

    expect(classifyMock).toHaveBeenCalledTimes(2);
    expect(row.status).toBe('failed');
  });

  it('approval email failure is non-fatal — pipeline still completes', async () => {
    const row = seedEvent('evt-10');
    classifyMock.mockResolvedValue(CLASSIFIED_RESULT);
    resolveEmployeeMock.mockReturnValue(RESOLVED_EMPLOYEE);
    sendApprovalEmailMock.mockRejectedValue(new Error('Resend down'));

    await processGongEvent('evt-10');

    // Pipeline should still mark as classified despite email failure
    expect(row.status).toBe('classified');
    expect(recognitions).toHaveLength(1);
  });

  it('snippets used when transcript is empty', async () => {
    const row = seedEvent('evt-11', {
      payload: JSON.stringify({
        callId: 'call-001',
        workspaceId: 'ws-001',
        snippets: [{ text: 'Jane did amazing work.', speakerType: 'customer' }],
      }),
    });
    classifyMock.mockResolvedValue({ result: 'below_threshold', reasoning: 'Ok.' });

    await processGongEvent('evt-11');

    expect(classifyMock).toHaveBeenCalledWith('Jane did amazing work.');
    expect(row.status).toBe('below_threshold');
  });
});
