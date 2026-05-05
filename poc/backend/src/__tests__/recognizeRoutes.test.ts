/**
 * __tests__/recognizeRoutes.test.ts
 *
 * Integration tests for POST /api/rr/recognize and GET /api/rr/recognize/status/:id
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import supertest from 'supertest';

// ---------------------------------------------------------------------------
// In-memory DB
// ---------------------------------------------------------------------------

const classifications: Record<string, unknown>[] = [];
const recognitions = new Map<string, { id: string; reward_status: string; employee_first_name: string }>();

function makeDb() {
  return {
    prepare: (sql: string) => ({
      run: (...args: unknown[]) => {
        if (sql.includes('INSERT INTO rr_classifications')) classifications.push({ args });
        if (sql.includes('INSERT INTO rr_recognitions')) {
          const id = args[0] as string;
          recognitions.set(id, { id, reward_status: 'pending', employee_first_name: 'Jane' });
        }
        if (sql.includes("UPDATE rr_recognitions SET reward_status")) {
          // fire-and-forget updates — just track them
        }
        return { changes: 1 };
      },
      get: (id: string) => {
        if (sql.includes('FROM rr_recognitions WHERE id')) {
          return recognitions.get(id) ?? undefined;
        }
        return undefined;
      },
    }),
  };
}

vi.mock('../db/schema.js', () => ({ getDb: () => makeDb() }));

// Provide a minimal test directory so employee lookup works without real DB
vi.mock('../services/employeeResolver.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/employeeResolver.js')>();
  const TEST_EMPLOYEE = {
    id: 'emp_test_001',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@clearcompany.com',
    managerId: 'mgr_001',
    managerEmail: 'manager@clearcompany.com',
    managerFirstName: 'Manager',
  };
  return {
    ...actual,
    STUB_EMPLOYEES: [TEST_EMPLOYEE],
    loadDirectory: () => [TEST_EMPLOYEE],
  };
});

// Suppress fire-and-forget Guusto calls
vi.mock('../services/guustoService.js', () => ({
  placeGuustoOrder: vi.fn().mockRejectedValue(new Error('GUUSTO_BEARER_TOKEN or GUUSTO_WORKSPACE_ID not set')),
  pollOrderStatus: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Import router after mocks
// ---------------------------------------------------------------------------

import { recognizeRouter } from '../routes/recognizeRoutes.js';

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/rr/recognize', recognizeRouter);
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

// ---------------------------------------------------------------------------
// Valid body
// ---------------------------------------------------------------------------

const LONG_MESSAGE = 'A'.repeat(160); // 160 chars — over the 150 minimum

const VALID_BODY = {
  employeeId: 'emp_test_001',
  reason: 'Customer Focus',
  message: LONG_MESSAGE,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/rr/recognize', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    classifications.length = 0;
    recognitions.clear();
    vi.clearAllMocks();
    app = buildApp();
  });

  it('valid body → 201 with recognitionId', async () => {
    const res = await supertest(app)
      .post('/api/rr/recognize')
      .send(VALID_BODY);

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.recognitionId).toBeTruthy();
    expect(res.body.employeeFirstName).toBeTruthy();
    expect(res.body.employeeEmail).toBeTruthy();
  });

  it('valid body → persists classification and recognition rows', async () => {
    await supertest(app).post('/api/rr/recognize').send(VALID_BODY);
    expect(classifications).toHaveLength(1);
    expect(recognitions.size).toBe(1);
  });

  it('missing employeeId → 400', async () => {
    const res = await supertest(app)
      .post('/api/rr/recognize')
      .send({ reason: 'Customer Focus', message: LONG_MESSAGE });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('employeeId');
  });

  it('invalid reason → 400 with valid list', async () => {
    const res = await supertest(app)
      .post('/api/rr/recognize')
      .send({ ...VALID_BODY, reason: 'Not a real reason' });
    expect(res.status).toBe(400);
    expect(res.body.valid).toBeInstanceOf(Array);
  });

  it('message too short (< 150 chars) → 400', async () => {
    const res = await supertest(app)
      .post('/api/rr/recognize')
      .send({ ...VALID_BODY, message: 'Too short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('150');
  });

  it('message too long (> 500 chars) → 400', async () => {
    const res = await supertest(app)
      .post('/api/rr/recognize')
      .send({ ...VALID_BODY, message: 'A'.repeat(501) });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('500');
  });

  it('unknown employeeId → 404', async () => {
    const res = await supertest(app)
      .post('/api/rr/recognize')
      .send({ ...VALID_BODY, employeeId: 'does-not-exist' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/rr/recognize/status/:id', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    recognitions.clear();
    app = buildApp();
  });

  it('known id → 200 with status and employeeFirstName', async () => {
    recognitions.set('rec-001', { id: 'rec-001', reward_status: 'reward_sent', employee_first_name: 'Jane' });

    const res = await supertest(app).get('/api/rr/recognize/status/rec-001');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('delivered');
    expect(res.body.employeeFirstName).toBe('Jane');
  });

  it('maps reward_status values to frontend status strings', async () => {
    const cases: [string, string][] = [
      ['pending', 'sending'],
      ['reward_sending', 'sending'],
      ['reward_sent', 'delivered'],
      ['reward_failed', 'failed'],
      ['poll_timeout', 'failed'],
    ];

    for (const [rewardStatus, expectedStatus] of cases) {
      recognitions.set('rec-x', { id: 'rec-x', reward_status: rewardStatus, employee_first_name: 'Jane' });
      const res = await supertest(app).get('/api/rr/recognize/status/rec-x');
      expect(res.body.status, `for reward_status=${rewardStatus}`).toBe(expectedStatus);
    }
  });

  it('unknown id → 404', async () => {
    const res = await supertest(app).get('/api/rr/recognize/status/nonexistent');
    expect(res.status).toBe(404);
  });
});
