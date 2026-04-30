/**
 * index.ts — Express application entry point.
 *
 * Route map:
 *
 *   Gong pipeline (Phase 0):
 *     POST /api/rr/gong-webhook
 *     GET  /api/rr/demo/recognition-status
 *     GET  /api/rr/approve | /api/rr/dismiss (token links from email)
 *     POST /api/rr/recognize  (manual recognition from profile page)
 *     GET  /dashboard         (server-rendered live status page)
 *
 *   R&R module (Phase 1+):
 *     POST /api/rr/shoutouts               send a shoutout
 *     GET  /api/rr/shoutouts               recognition feed
 *     GET  /api/rr/shoutouts/:id           single shoutout
 *     POST /api/rr/shoutouts/:id/reactions add/toggle reaction
 *
 *     GET  /api/rr/manager/budget          manager's balance + ledger
 *     GET  /api/rr/manager/team            team participation dashboard
 *
 *     GET  /api/rr/employees/:id/recognitions       received timeline
 *     GET  /api/rr/employees/:id/recognitions/sent  sent history
 *     GET  /api/rr/employees/:id/summary            sidebar stats
 *
 *     GET  /api/rr/admin/values                HR admin: list values
 *     POST /api/rr/admin/values                create value
 *     PATCH /api/rr/admin/values/:id           update value
 *     GET  /api/rr/admin/budget                budget by manager
 *     POST /api/rr/admin/budget/allocate       allocate to manager
 *     GET  /api/rr/admin/reports/summary       program health metrics
 *     GET  /api/rr/admin/reports/export        CSV export
 *     GET  /api/rr/admin/config                tenant config
 *     PUT  /api/rr/admin/config                update config
 *     GET  /api/rr/admin/audit                 audit log (read-only)
 */

import dotenv from 'dotenv';
dotenv.config({ override: true });

import express, { Request, Response } from 'express';
import { getDb } from './db/schema.js';
import { gongWebhookRouter } from './routes/gongWebhook.js';
import { recognitionStatusRouter } from './routes/recognitionStatus.js';
import { approvalRouter } from './routes/approvalRoutes.js';
import { dashboardRouter } from './routes/dashboard.js';
import { processGongEvent } from './jobs/processGongEvent.js';
import { recognizeRouter } from './routes/recognizeRoutes.js';
import { shoutoutRouter } from './routes/shoutoutRoutes.js';
import { adminRouter } from './routes/adminRoutes.js';
import { managerRouter } from './routes/managerRoutes.js';
import { employeeProfileRouter } from './routes/employeeProfileRoutes.js';
import { recipientRouter } from './routes/recipientRoutes.js';

const app = express();
const PORT = parseInt(process.env['PORT'] ?? '3001', 10);

// ---------------------------------------------------------------------------
// CORS — allow the React frontend (Vite default: 5173) to call the API
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

app.get('/health', (_req, res) => {
  const db = getDb();
  const shoutoutCount = (db.prepare('SELECT COUNT(*) as n FROM rr_shoutouts').get() as { n: number }).n;
  const rewardsSent = (db.prepare(
    "SELECT COUNT(*) as n FROM rr_recognitions WHERE reward_status='reward_sent'"
  ).get() as { n: number }).n;

  res.json({
    status: 'ok',
    service: 'rr-poc-backend',
    shoutouts: shoutoutCount,
    rewardsSent,
  });
});

// ---------------------------------------------------------------------------
// Phase 0 routes (Gong pipeline)
// ---------------------------------------------------------------------------

app.use('/api/rr/gong-webhook', gongWebhookRouter);
app.use('/api/rr/recognize', recognizeRouter);
app.use('/api/rr/demo/recognition-status', recognitionStatusRouter);
app.use('/api/rr', approvalRouter);
app.use('/dashboard', dashboardRouter);

// POC utility: replay pending Gong events through the classifier pipeline
app.post('/api/rr/replay-pending', async (_req, res) => {
  const db = getDb();
  const pending = db.prepare(
    "SELECT id, call_id FROM gong_events WHERE status='pending'"
  ).all() as Array<{ id: string; call_id: string }>;
  res.json({ queued: pending.length, ids: pending.map(r => r.call_id) });
  for (const row of pending) {
    void processGongEvent(row.id);
  }
});

// ---------------------------------------------------------------------------
// Phase 1+ routes (R&R module)
// ---------------------------------------------------------------------------

app.use('/api/rr/shoutouts', shoutoutRouter);
app.use('/api/rr/recipients', recipientRouter);
app.use('/api/rr/manager', managerRouter);
app.use('/api/rr/employees', employeeProfileRouter);
app.use('/api/rr/admin', adminRouter);

// Public read of active company values — any authenticated user may fetch these
// (admin/values requires hr_admin; this serves the compose drawer for managers)
app.get('/api/rr/values', (_req, res) => {
  const db = getDb();
  const values = db.prepare(`
    SELECT id, label, emoji, sort_order, is_active
    FROM rr_company_values
    WHERE is_active = 1
    ORDER BY sort_order ASC, created_at ASC
  `).all();
  res.json({ values });
});

// ---------------------------------------------------------------------------
// Token expiry job — runs hourly, marks stale approval tokens as 'expired'
// ---------------------------------------------------------------------------

function runExpiryJob(): void {
  const db = getDb();
  const result = db.prepare(`
    UPDATE rr_approvals
    SET decision = 'expired', decided_at = ?
    WHERE decision IS NULL AND expires_at < ?
  `).run(new Date().toISOString(), new Date().toISOString());

  if (result.changes > 0) {
    console.log(`[expiryJob] Marked ${result.changes} approval token(s) as expired`);
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

getDb(); // Initialize schema and seed defaults

app.listen(PORT, () => {
  console.log(`\n[server] R&R POC backend running on http://localhost:${PORT}`);
  console.log(`\nPhase 0 (Gong pipeline):`);
  console.log(`  POST  http://localhost:${PORT}/api/rr/gong-webhook`);
  console.log(`  GET   http://localhost:${PORT}/dashboard`);
  console.log(`\nPhase 1+ (R&R module):`);
  console.log(`  POST  http://localhost:${PORT}/api/rr/shoutouts           — send shoutout`);
  console.log(`  GET   http://localhost:${PORT}/api/rr/shoutouts           — feed`);
  console.log(`  GET   http://localhost:${PORT}/api/rr/manager/budget      — my budget`);
  console.log(`  GET   http://localhost:${PORT}/api/rr/manager/team        — team dashboard`);
  console.log(`  GET   http://localhost:${PORT}/api/rr/employees/:id/summary`);
  console.log(`  GET   http://localhost:${PORT}/api/rr/admin/reports/summary — program health`);
  console.log(`  GET   http://localhost:${PORT}/api/rr/admin/budget         — budget overview`);
  console.log(`  GET   http://localhost:${PORT}/api/rr/admin/config         — tenant config\n`);

  runExpiryJob();
  setInterval(runExpiryJob, 60 * 60 * 1_000);
});

export { app };
