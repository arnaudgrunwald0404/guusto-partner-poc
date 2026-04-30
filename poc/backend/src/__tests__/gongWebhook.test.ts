/**
 * __tests__/gongWebhook.test.ts — Unit tests for POST /api/rr/gong-webhook
 *
 * Auth method: Gong "URL includes key" — validated via ?key= query param.
 * Tests cover: RR-H1 acceptance criteria
 * - Valid key → 200 + row persisted
 * - Invalid / missing key → 401
 * - Duplicate call_id within 5 min → 200 with duplicate=true, no second row
 * - Missing payload → 400
 * - Real Gong payload shape (callData.metaData.id) → normalised correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import supertest from 'supertest';

// ---------------------------------------------------------------------------
// In-memory store shared across mock instances
// ---------------------------------------------------------------------------

const mockRows = new Map<string, Record<string, unknown>>();

// ---------------------------------------------------------------------------
// Mocks — declared before any import that uses them
// ---------------------------------------------------------------------------

vi.mock('../db/schema.js', () => ({
  getDb: () => ({
    prepare: (sql: string) => {
      if (sql.includes('INSERT INTO gong_events')) {
        return {
          run: (id: string, call_id: string, received_at: string, payload: string) => {
            mockRows.set(id, { id, call_id, received_at, payload, status: 'pending' });
            return { changes: 1 };
          },
        };
      }
      if (sql.includes('WHERE call_id')) {
        return {
          get: (callId: string, _since: string) => {
            for (const row of mockRows.values()) {
              if ((row as Record<string, unknown>).call_id === callId) return row;
            }
            return undefined;
          },
        };
      }
      return { run: () => ({ changes: 0 }), get: () => undefined };
    },
  }),
}));

vi.mock('../jobs/processGongEvent.js', () => ({
  processGongEvent: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Import the router AFTER mocks are registered
// ---------------------------------------------------------------------------

import { gongWebhookRouter } from '../routes/gongWebhook.js';

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

const SECRET = 'test-secret-abc123';

function buildApp(): express.Express {
  process.env.GONG_WEBHOOK_SECRET = SECRET;

  const app = express();

  app.use(
    express.json({
      verify: (req: Request & { rawBody?: Buffer }, _res: Response, buf: Buffer) => {
        req.rawBody = buf;
      },
    })
  );

  app.use('/api/rr/gong-webhook', gongWebhookRouter);

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[test] Unhandled express error:', err.message);
    res.status(500).json({ error: err.message });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Test payloads — both shapes
// ---------------------------------------------------------------------------

const SIMPLE_PAYLOAD = JSON.stringify({
  callId: 'call_test_001',
  workspaceId: 'ws_001',
  transcript: 'John is the best support engineer we have ever worked with.',
});

// Real Gong rules webhook shape (confirmed from live test)
const GONG_REAL_PAYLOAD = JSON.stringify({
  callData: {
    metaData: {
      id: 'call_real_001',
      workspaceId: '8433183570539717120',
      title: 'Call with Acme Corp - Jane Smith',
    },
    context: [],
  },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/rr/gong-webhook', () => {
  let app: express.Express;

  beforeEach(() => {
    mockRows.clear();
    vi.clearAllMocks();
    app = buildApp();
  });

  it('valid key → 200 and row persisted', async () => {
    const res = await supertest(app)
      .post(`/api/rr/gong-webhook?key=${SECRET}`)
      .set('Content-Type', 'application/json')
      .send(SIMPLE_PAYLOAD);

    expect(res.status, `Body: ${JSON.stringify(res.body)}`).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.eventId).toBeTruthy();
    expect(mockRows.size).toBe(1);
    const row = [...mockRows.values()][0];
    expect(row.call_id).toBe('call_test_001');
    expect(row.status).toBe('pending');
  });

  it('invalid key → 401 and nothing persisted', async () => {
    const res = await supertest(app)
      .post('/api/rr/gong-webhook?key=wrong-key')
      .set('Content-Type', 'application/json')
      .send(SIMPLE_PAYLOAD);

    expect(res.status).toBe(401);
    expect(mockRows.size).toBe(0);
  });

  it('missing key param → 401', async () => {
    const res = await supertest(app)
      .post('/api/rr/gong-webhook')
      .set('Content-Type', 'application/json')
      .send(SIMPLE_PAYLOAD);

    expect(res.status).toBe(401);
    expect(mockRows.size).toBe(0);
  });

  it('duplicate call_id within 5 min → 200 with duplicate=true, no second row', async () => {
    const res1 = await supertest(app)
      .post(`/api/rr/gong-webhook?key=${SECRET}`)
      .set('Content-Type', 'application/json')
      .send(SIMPLE_PAYLOAD);

    expect(res1.status).toBe(200);
    expect(mockRows.size).toBe(1);

    const res2 = await supertest(app)
      .post(`/api/rr/gong-webhook?key=${SECRET}`)
      .set('Content-Type', 'application/json')
      .send(SIMPLE_PAYLOAD);

    expect(res2.status).toBe(200);
    expect(res2.body.duplicate).toBe(true);
    expect(mockRows.size).toBe(1);
  });

  it('missing payload body → 400', async () => {
    const res = await supertest(app)
      .post(`/api/rr/gong-webhook?key=${SECRET}`)
      .send('');

    expect(res.status).toBe(400);
  });

  it('real Gong shape (callData.metaData.id) → normalised and persisted', async () => {
    const res = await supertest(app)
      .post(`/api/rr/gong-webhook?key=${SECRET}`)
      .set('Content-Type', 'application/json')
      .send(GONG_REAL_PAYLOAD);

    expect(res.status, `Body: ${JSON.stringify(res.body)}`).toBe(200);
    expect(mockRows.size).toBe(1);
    const row = [...mockRows.values()][0];
    expect(row.call_id).toBe('call_real_001');
  });
});
