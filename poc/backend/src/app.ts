/**
 * app.ts — Express application factory (no server start, no jobs).
 *
 * Imported by:
 *   - index.ts        (local dev — calls app.listen())
 *   - netlify/functions/api.ts  (serverless — wrapped with serverless-http)
 *
 * The separation ensures that app.listen() and the interval-based jobs are
 * ONLY started in the local dev context, never in the serverless context.
 */

import express, { Request, Response } from 'express';
import { gongWebhookRouter } from './routes/gongWebhook.js';
import { recognitionStatusRouter } from './routes/recognitionStatus.js';
import { approvalRouter } from './routes/approvalRoutes.js';
import { recognizeRouter } from './routes/recognizeRoutes.js';
import { shoutoutRouter } from './routes/shoutoutRoutes.js';
import { adminRouter } from './routes/adminRoutes.js';
import { managerRouter } from './routes/managerRoutes.js';
import { employeeProfileRouter } from './routes/employeeProfileRoutes.js';
import { recipientRouter } from './routes/recipientRoutes.js';
import { aiRouter } from './routes/aiRoutes.js';
import { automationRouter } from './routes/automationRoutes.js';
import { rrInsightsRouter } from './routes/rrInsightsRoutes.js';
import { pendingGiftsRouter } from './routes/pendingGiftsRoutes.js';
import { orgChartRouter } from './routes/orgChartRoutes.js';
import { sqlAll } from './db/pg.js';

export const app = express();

// ---------------------------------------------------------------------------
// CORS — allow the React frontend to call the API
// ---------------------------------------------------------------------------

app.use((req, res, next) => {
  const origin = req.headers.origin ?? '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-user-id,x-user-role');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// ---------------------------------------------------------------------------
// Body parsing — raw body captured for Gong HMAC validation
// ---------------------------------------------------------------------------

app.use(
  express.json({
    verify: (
      req: Request & { rawBody?: Buffer },
      _res: Response,
      buf: Buffer,
    ) => {
      req.rawBody = buf;
    },
  }),
);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/health', async (_req, res) => {
  try {
    const [shoutoutRow] = await sqlAll<{ n: number }>('SELECT COUNT(*) as n FROM rr_shoutouts');
    const [rewardsRow] = await sqlAll<{ n: number }>(
      "SELECT COUNT(*) as n FROM rr_recognitions WHERE reward_status='reward_sent'"
    );
    res.json({
      status: 'ok',
      service: 'rr-poc-backend',
      db: 'supabase',
      shoutouts: Number(shoutoutRow?.n ?? 0),
      rewardsSent: Number(rewardsRow?.n ?? 0),
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// Phase 0 routes
// ---------------------------------------------------------------------------

app.use('/api/rr/gong-webhook', gongWebhookRouter);
app.use('/api/rr/recognize', recognizeRouter);
app.use('/api/rr/demo/recognition-status', recognitionStatusRouter);
app.use('/api/rr', approvalRouter);

// POC utility: replay pending Gong events through the classifier pipeline
app.post('/api/rr/replay-pending', async (_req, res) => {
  const pending = await sqlAll<{ id: string; call_id: string }>(
    "SELECT id, call_id FROM gong_events WHERE status='pending'"
  );
  res.json({ queued: pending.length, ids: pending.map(r => r.call_id) });
  const { processGongEvent } = await import('./jobs/processGongEvent.js');
  for (const row of pending) {
    void processGongEvent(row.id);
  }
});

// ---------------------------------------------------------------------------
// Phase 1+ routes
// ---------------------------------------------------------------------------

app.use('/api/rr/shoutouts', shoutoutRouter);
app.use('/api/rr/recipients', recipientRouter);
app.use('/api/rr/ai', aiRouter);
app.use('/api/rr/manager', managerRouter);
app.use('/api/rr/employees', employeeProfileRouter);
app.use('/api/rr/admin', adminRouter);
app.use('/api/rr/admin/automations', automationRouter);
app.use('/api/rr', rrInsightsRouter);
app.use('/api/rr/recipient', pendingGiftsRouter);
app.use('/api/rr/org', orgChartRouter);

// Public read of active company values
app.get('/api/rr/values', async (_req, res) => {
  try {
    const values = await sqlAll(`
      SELECT id, label, emoji, sort_order, is_active
      FROM rr_company_values
      WHERE is_active = 1
      ORDER BY sort_order ASC, created_at ASC
    `);
    res.json({ values });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Temporary debug endpoint — remove after confirming DB connectivity
app.get('/api/rr/debug-values', async (_req, res) => {
  try {
    const raw = await sqlAll('SELECT id, label FROM rr_company_values LIMIT 3');
    const count = await sqlAll('SELECT COUNT(*) as n FROM rr_company_values');
    res.json({ raw, count, supabaseUrl: process.env['SUPABASE_URL']?.slice(0, 30) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
