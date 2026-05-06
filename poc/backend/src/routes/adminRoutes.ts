/**
 * routes/adminRoutes.ts — HR admin endpoints (P0-9, P0-10 from PRD)
 *
 * All routes require x-user-role: hr_admin.
 *
 * GET  /api/rr/admin/values             — list company values
 * POST /api/rr/admin/values             — create a new value
 * PATCH /api/rr/admin/values/:id        — update label / emoji / active state
 *
 * GET  /api/rr/admin/budget             — all manager balances + org summary
 * POST /api/rr/admin/budget/allocate    — allocate budget to a manager
 *
 * GET  /api/rr/admin/reports/summary    — program health metrics
 * GET  /api/rr/admin/reports/export     — CSV export (all recognitions)
 *
 * GET  /api/rr/admin/config             — read tenant config
 * PUT  /api/rr/admin/config             — update tenant config keys
 */

import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { sqlAll, sqlGet, sqlRun } from '../db/pg.js';
import { STUB_EMPLOYEES } from '../services/employeeResolver.js';
import {
  allocateBudget,
  getAllManagerBalances,
  getBalance,
} from '../services/budgetService.js';
import { writeAuditLog } from '../services/shoutoutService.js';
import { getGuustoWorkspaceBalance } from '../services/guustoService.js';

export const adminRouter = Router();

// ---------------------------------------------------------------------------
// Auth guard — every route in this router requires hr_admin role
// ---------------------------------------------------------------------------

adminRouter.use((req: Request, res: Response, next: NextFunction): void => {
  const role = req.headers['x-user-role'] as string | undefined;
  if (role !== 'hr_admin') {
    res.status(403).json({ error: 'HR admin access required', requiredRole: 'hr_admin' });
    return;
  }
  next();
});

// ---------------------------------------------------------------------------
// Company Values
// ---------------------------------------------------------------------------

adminRouter.get('/values', async (_req: Request, res: Response): Promise<void> => {
  const values = await sqlAll(`
    SELECT id, label, emoji, sort_order, is_active, created_at
    FROM rr_company_values
    ORDER BY sort_order ASC, created_at ASC
  `);
  res.json({ values });
});

adminRouter.post('/values', async (req: Request, res: Response): Promise<void> => {
  const { label, emoji } = req.body as { label?: string; emoji?: string };

  if (!label || typeof label !== 'string' || label.trim().length === 0) {
    res.status(400).json({ error: 'label is required' });
    return;
  }

  const activeCountRow = await sqlGet<{ n: number }>(
    "SELECT COUNT(*) as n FROM rr_company_values WHERE is_active = 1"
  );
  const activeCount = activeCountRow?.n ?? 0;

  if (activeCount >= 8) {
    res.status(409).json({
      error: 'Maximum 8 active values allowed. Deactivate one before adding another.',
      activeCount,
    });
    return;
  }

  // Prevent duplicate labels (case-insensitive)
  const exists = await sqlGet(
    "SELECT id FROM rr_company_values WHERE LOWER(label) = LOWER(?) AND is_active = 1",
    [label.trim()]
  );
  if (exists) {
    res.status(409).json({ error: 'A value with this label already exists' });
    return;
  }

  const maxOrderRow = await sqlGet<{ m: number }>(
    'SELECT COALESCE(MAX(sort_order), 0) as m FROM rr_company_values'
  );
  const maxOrder = maxOrderRow?.m ?? 0;

  const id = randomUUID();
  const now = new Date().toISOString();
  await sqlRun(`
    INSERT INTO rr_company_values (id, tenant_id, label, emoji, sort_order, is_active, created_at)
    VALUES (?, 'default', ?, ?, ?, 1, ?)
  `, [id, label.trim(), emoji ?? '⭐', maxOrder + 1, now]);

  res.status(201).json({ id, label: label.trim(), emoji: emoji ?? '⭐', isActive: true });
});

adminRouter.patch('/values/:id', async (req: Request, res: Response): Promise<void> => {
  const { label, emoji, is_active } = req.body as {
    label?: string;
    emoji?: string;
    is_active?: boolean;
  };

  const existing = await sqlGet(
    'SELECT id FROM rr_company_values WHERE id = ?',
    [req.params.id]
  );
  if (!existing) {
    res.status(404).json({ error: 'Value not found' });
    return;
  }

  // Guard: cannot have fewer than 1 active value
  if (is_active === false) {
    const activeCountRow = await sqlGet<{ n: number }>(
      "SELECT COUNT(*) as n FROM rr_company_values WHERE is_active = 1"
    );
    const activeCount = activeCountRow?.n ?? 0;
    if (activeCount <= 1) {
      res.status(409).json({ error: 'At least one active value must remain' });
      return;
    }
  }

  const setClauses: string[] = [];
  const vals: unknown[] = [];
  if (label !== undefined) { setClauses.push('label = ?'); vals.push(label.trim()); }
  if (emoji !== undefined) { setClauses.push('emoji = ?'); vals.push(emoji); }
  if (is_active !== undefined) { setClauses.push('is_active = ?'); vals.push(is_active ? 1 : 0); }

  if (setClauses.length === 0) {
    res.status(400).json({ error: 'No updatable fields provided' });
    return;
  }

  vals.push(req.params.id);
  await sqlRun(`UPDATE rr_company_values SET ${setClauses.join(', ')} WHERE id = ?`, vals);
  res.json({ updated: true, id: req.params.id });
});

// ---------------------------------------------------------------------------
// Budget Management
// ---------------------------------------------------------------------------

adminRouter.get('/budget', async (_req: Request, res: Response): Promise<void> => {
  const balances = await getAllManagerBalances();

  const managers = balances.map(b => {
    // Look up manager name — find a direct report and use their manager info
    const report = STUB_EMPLOYEES.find(e => e.managerId === b.manager_id);
    const managerName = report?.managerFirstName ?? b.manager_id;

    return {
      managerId: b.manager_id,
      managerName,
      balanceCents: b.balance,
      balanceDollars: (b.balance / 100).toFixed(2),
      totalAllocatedCents: b.total_allocated,
      totalAllocatedDollars: (b.total_allocated / 100).toFixed(2),
      totalSpentCents: b.total_spent,
      totalSpentDollars: (b.total_spent / 100).toFixed(2),
      utilizationPct: b.total_allocated > 0
        ? ((b.total_spent / b.total_allocated) * 100).toFixed(1)
        : '0.0',
    };
  });

  const orgTotals = {
    totalAllocatedCents: balances.reduce((s, b) => s + b.total_allocated, 0),
    totalSpentCents: balances.reduce((s, b) => s + b.total_spent, 0),
    totalBalanceCents: balances.reduce((s, b) => s + b.balance, 0),
  };

  // Guusto workspace balance — try live fetch first, fall back to cached value
  let workspaceBalanceCents: number | null = null;
  let workspaceCheckedAt: string | null = null;
  let workspaceLive = false;

  try {
    workspaceBalanceCents = await getGuustoWorkspaceBalance('USD');
    workspaceLive = true;
    workspaceCheckedAt = new Date().toISOString();
  } catch {
    // Use cached value from last scheduled check
    const cachedBalance = await sqlGet<{ value: string }>(
      "SELECT value FROM rr_tenant_config WHERE key = 'guusto_workspace_balance_cents'"
    );
    const cachedAt = await sqlGet<{ value: string }>(
      "SELECT value FROM rr_tenant_config WHERE key = 'guusto_workspace_balance_checked_at'"
    );
    workspaceBalanceCents = cachedBalance ? parseInt(cachedBalance.value, 10) : null;
    workspaceCheckedAt = cachedAt?.value ?? null;
  }

  const thresholdRow = await sqlGet<{ value: string }>(
    "SELECT value FROM rr_tenant_config WHERE key = 'guusto_low_balance_alert_cents'"
  );
  const alertThresholdCents = parseInt(thresholdRow?.value ?? '10000', 10);
  const isLow = workspaceBalanceCents !== null && workspaceBalanceCents < alertThresholdCents;

  res.json({
    managers,
    orgSummary: {
      ...orgTotals,
      totalAllocatedDollars: (orgTotals.totalAllocatedCents / 100).toFixed(2),
      totalSpentDollars: (orgTotals.totalSpentCents / 100).toFixed(2),
      utilizationPct: orgTotals.totalAllocatedCents > 0
        ? ((orgTotals.totalSpentCents / orgTotals.totalAllocatedCents) * 100).toFixed(1)
        : '0.0',
    },
    guustoWorkspace: {
      balanceCents: workspaceBalanceCents,
      balanceDollars: workspaceBalanceCents !== null
        ? (workspaceBalanceCents / 100).toFixed(2)
        : null,
      alertThresholdCents,
      alertThresholdDollars: (alertThresholdCents / 100).toFixed(2),
      isLow,
      checkedAt: workspaceCheckedAt,
      live: workspaceLive,
    },
  });
});

adminRouter.post('/budget/allocate', async (req: Request, res: Response): Promise<void> => {
  const adminId = (req.headers['x-user-id'] as string) || 'admin';
  const { managerId, amountCents, periodLabel } = req.body as {
    managerId?: string;
    amountCents?: number;
    periodLabel?: string;
  };

  if (!managerId || typeof managerId !== 'string') {
    res.status(400).json({ error: 'managerId is required' });
    return;
  }
  if (!amountCents || typeof amountCents !== 'number' || amountCents <= 0) {
    res.status(400).json({ error: 'amountCents must be a positive integer' });
    return;
  }

  const label = periodLabel ?? `Manual allocation ${new Date().toISOString().slice(0, 10)}`;
  await allocateBudget({ managerId, amountCents, periodLabel: label, adminId });

  await writeAuditLog({
    actorId: adminId,
    actorRole: 'hr_admin',
    action: 'budget_allocated',
    entityType: 'budget_allocation',
    entityId: managerId,
    details: { amountCents, periodLabel: label },
  });

  const newBalance = await getBalance(managerId);
  res.status(201).json({
    managerId,
    periodLabel: label,
    allocatedCents: amountCents,
    newBalanceCents: newBalance,
    newBalanceDollars: (newBalance / 100).toFixed(2),
  });
});

// ---------------------------------------------------------------------------
// Analytics Reports (P0-9)
// ---------------------------------------------------------------------------

adminRouter.get('/reports/summary', async (req: Request, res: Response): Promise<void> => {
  const daysParam = req.query['days'] as string | undefined;
  const daysNum = Math.min(365, Math.max(1, parseInt(daysParam ?? '30', 10)));
  const since = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000).toISOString();

  // Shoutout-level metrics
  const shoutoutStats = await sqlGet<{
    total_sent: number; unique_senders: number; unique_recipients: number;
    with_gift: number; total_gifted_cents: number;
    gifts_delivered: number; gifts_redeemed: number;
  }>(`
    SELECT
      COUNT(*)                                                          AS total_sent,
      COUNT(DISTINCT sender_id)                                         AS unique_senders,
      COUNT(DISTINCT recipient_id)                                      AS unique_recipients,
      COUNT(CASE WHEN gift_amount_cents IS NOT NULL THEN 1 END)         AS with_gift,
      COALESCE(SUM(CASE WHEN gift_amount_cents IS NOT NULL
                        THEN gift_amount_cents ELSE 0 END), 0)          AS total_gifted_cents,
      COUNT(CASE WHEN gift_status IN ('sent','redeemed') THEN 1 END)    AS gifts_delivered,
      COUNT(CASE WHEN gift_status = 'redeemed' THEN 1 END)              AS gifts_redeemed
    FROM rr_shoutouts WHERE created_at >= ?
  `, [since]);

  // Values distribution (ranked)
  const valuesDistribution = await sqlAll<{ label: string; count: number }>(`
    SELECT sv.value_label AS label, COUNT(*) AS count
    FROM rr_shoutout_values sv
    JOIN rr_shoutouts s ON s.id = sv.shoutout_id
    WHERE s.created_at >= ?
    GROUP BY sv.value_label
    ORDER BY count DESC
  `, [since]);

  // Gong-pipeline recognitions (legacy)
  const gongStats = await sqlGet<{ total: number; rewards_sent: number }>(`
    SELECT
      COUNT(*) AS total,
      COUNT(CASE WHEN reward_status = 'reward_sent' THEN 1 END) AS rewards_sent
    FROM rr_recognitions WHERE created_at >= ?
  `, [since]);

  // Coverage: % of employees who received ≥1 recognition
  const totalEmployees = STUB_EMPLOYEES.length;
  const coveredIds = (await sqlAll<{ recipient_id: string }>(
    'SELECT DISTINCT recipient_id FROM rr_shoutouts WHERE created_at >= ?',
    [since]
  )).map(r => r.recipient_id);
  const coveragePct =
    totalEmployees > 0 ? ((coveredIds.length / totalEmployees) * 100).toFixed(1) : '0.0';

  // Manager activation rate (managers with budget who sent ≥1 gift)
  const managersWithBudget = await getAllManagerBalances();
  const activeGiftManagersRow = await sqlGet<{ n: number }>(`
    SELECT COUNT(DISTINCT sender_id) AS n
    FROM rr_shoutouts
    WHERE gift_amount_cents IS NOT NULL AND created_at >= ?
  `, [since]);
  const activeGiftManagers = activeGiftManagersRow?.n ?? 0;

  // Recognition gap: employees not recognized in the last N days
  const gapRow = await sqlGet<{ value: string }>(
    "SELECT value FROM rr_tenant_config WHERE key = 'recognition_gap_alert_days'"
  );
  const gapDays = parseInt(gapRow?.value ?? '30', 10);
  const gapSince = new Date(Date.now() - gapDays * 24 * 60 * 60 * 1000).toISOString();
  const recentlyRecognized = new Set(
    (await sqlAll<{ recipient_id: string }>(
      'SELECT DISTINCT recipient_id FROM rr_shoutouts WHERE created_at >= ?',
      [gapSince]
    )).map(r => r.recipient_id)
  );
  const unrecognizedEmployees = STUB_EMPLOYEES.filter(e => !recentlyRecognized.has(e.id));

  // Managers inactive for 60+ days (have budget but sent nothing)
  const managerActivity60 = new Set(
    (await sqlAll<{ sender_id: string }>(`
      SELECT DISTINCT sender_id
      FROM rr_shoutouts
      WHERE gift_amount_cents IS NOT NULL
        AND created_at >= NOW() - INTERVAL '60 days'
    `)).map(r => r.sender_id)
  );
  const inactiveManagers = managersWithBudget
    .filter(m => m.balance > 0 && !managerActivity60.has(m.manager_id))
    .map(m => ({ managerId: m.manager_id, balanceCents: m.balance }));

  res.json({
    period: { days: daysNum, since },
    shoutouts: {
      totalSent: shoutoutStats?.total_sent ?? 0,
      uniqueSenders: shoutoutStats?.unique_senders ?? 0,
      uniqueRecipients: shoutoutStats?.unique_recipients ?? 0,
      withGift: shoutoutStats?.with_gift ?? 0,
      totalGiftedCents: shoutoutStats?.total_gifted_cents ?? 0,
      totalGiftedDollars: ((shoutoutStats?.total_gifted_cents ?? 0) / 100).toFixed(2),
      giftsDelivered: shoutoutStats?.gifts_delivered ?? 0,
      giftsRedeemed: shoutoutStats?.gifts_redeemed ?? 0,
      redemptionRate: (shoutoutStats?.gifts_delivered ?? 0) > 0
        ? (((shoutoutStats?.gifts_redeemed ?? 0) / (shoutoutStats?.gifts_delivered ?? 1)) * 100).toFixed(1) + '%'
        : 'N/A',
    },
    gongRecognitions: {
      total: gongStats?.total ?? 0,
      rewardsSent: gongStats?.rewards_sent ?? 0,
    },
    coverage: {
      totalEmployees,
      recognizedEmployees: coveredIds.length,
      coveragePct: coveragePct + '%',
    },
    managerActivation: {
      managersWithBudget: managersWithBudget.length,
      managersWithGiftActivity: activeGiftManagers,
      activationRate: managersWithBudget.length > 0
        ? ((activeGiftManagers / managersWithBudget.length) * 100).toFixed(1) + '%'
        : 'N/A',
    },
    valuesDistribution,
    alerts: {
      unrecognizedEmployees: unrecognizedEmployees.map(e => ({
        employeeId: e.id,
        name: `${e.firstName} ${e.lastName}`,
        managerId: e.managerId,
      })),
      gapThresholdDays: gapDays,
      inactiveManagers,  // budget > 0 but no gifts sent in 60 days
    },
  });
});

adminRouter.get('/reports/export', async (req: Request, res: Response): Promise<void> => {
  const { since, until } = req.query as { since?: string; until?: string };

  const fromDate = since ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const toDate = until ?? new Date().toISOString();

  const rows = await sqlAll<Record<string, unknown>>(`
    SELECT
      s.id,
      s.sender_name,
      s.sender_id,
      s.recipient_name,
      s.recipient_email,
      s.message,
      s.visibility,
      s.source,
      s.gift_amount_cents,
      s.gift_status,
      s.created_at,
      STRING_AGG(sv.value_label, '; ') AS values
    FROM rr_shoutouts s
    LEFT JOIN rr_shoutout_values sv ON sv.shoutout_id = s.id
    WHERE s.created_at BETWEEN ? AND ?
    GROUP BY s.id, s.sender_name, s.sender_id, s.recipient_name, s.recipient_email,
             s.message, s.visibility, s.source, s.gift_amount_cents, s.gift_status, s.created_at
    ORDER BY s.created_at DESC
  `, [fromDate, toDate]);

  const escape = (v: string | null | undefined): string =>
    `"${(v ?? '').replace(/"/g, '""')}"`;

  const header = 'id,sender_name,sender_id,recipient_name,recipient_email,values,message,gift_amount_usd,gift_status,visibility,source,date';
  const lines = rows.map(r =>
    [
      r['id'],
      escape(r['sender_name'] as string | null),
      r['sender_id'],
      escape(r['recipient_name'] as string | null),
      r['recipient_email'],
      escape(r['values'] as string | null),
      escape(r['message'] as string | null),
      r['gift_amount_cents'] != null ? ((r['gift_amount_cents'] as number) / 100).toFixed(2) : '',
      r['gift_status'] ?? '',
      r['visibility'],
      r['source'],
      r['created_at'],
    ].join(',')
  );

  const filename = `rr-export-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send([header, ...lines].join('\n'));
});

// ---------------------------------------------------------------------------
// Tenant Configuration
// ---------------------------------------------------------------------------

const EDITABLE_KEYS = new Set([
  'min_gift_cents',
  'max_gift_cents',
  'message_min_chars',
  'message_max_chars',
  'recognition_gap_alert_days',
  'require_values',
  'default_visibility',
  'monetary_rewards_enabled',
  'max_values_per_recognition',
  'peer_gifting_enabled',
]);

adminRouter.get('/config', async (_req: Request, res: Response): Promise<void> => {
  const rows = await sqlAll<{ key: string; value: string; updated_by: string | null; updated_at: string }>(
    'SELECT key, value, updated_by, updated_at FROM rr_tenant_config ORDER BY key'
  );

  res.json({
    config: Object.fromEntries(rows.map(r => [r.key, r.value])),
    meta: rows.map(r => ({ key: r.key, updatedBy: r.updated_by, updatedAt: r.updated_at })),
    editableKeys: [...EDITABLE_KEYS],
  });
});

adminRouter.put('/config', async (req: Request, res: Response): Promise<void> => {
  const adminId = (req.headers['x-user-id'] as string) || 'admin';
  const updates = req.body as Record<string, unknown>;

  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    res.status(400).json({ error: 'Request body must be a JSON key-value object' });
    return;
  }

  const now = new Date().toISOString();

  const updated: string[] = [];
  const skipped: string[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (!EDITABLE_KEYS.has(key)) {
      skipped.push(key);
      continue;
    }
    await sqlRun(`
      INSERT INTO rr_tenant_config (key, value, updated_by, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value      = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `, [key, String(value), adminId, now]);
    updated.push(key);
  }

  res.json({ updated, skipped, count: updated.length });
});

// ---------------------------------------------------------------------------
// Values Distribution Analytics — RR-021
// GET /api/rr/admin/analytics/values?from=<ISO>&to=<ISO>&scope=tenant|team
// ---------------------------------------------------------------------------

adminRouter.get('/analytics/values', async (req: Request, res: Response): Promise<void> => {
  const { from, to } = req.query as Record<string, string>;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (from) { conditions.push('s.created_at >= ?'); params.push(from); }
  if (to)   { conditions.push('s.created_at <= ?'); params.push(to); }
  conditions.push('s.deleted_at IS NULL');

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await sqlAll<{ label: string; count: number }>(`
    SELECT sv.value_label AS label, COUNT(*) AS count
    FROM rr_shoutout_values sv
    JOIN rr_shoutouts s ON s.id = sv.shoutout_id
    ${where}
    GROUP BY sv.value_label
    ORDER BY count DESC
  `, params);

  const total = rows.reduce((sum, r) => sum + r.count, 0);

  res.json({
    values: rows.map(r => ({
      label: r.label,
      count: r.count,
      pct: total > 0 ? Math.round((r.count / total) * 100) : 0,
    })),
    total,
    from: from ?? null,
    to: to ?? null,
  });
});

// ---------------------------------------------------------------------------
// Audit Log (read-only — writes happen via writeAuditLog())
// ---------------------------------------------------------------------------

adminRouter.get('/audit', async (req: Request, res: Response): Promise<void> => {
  const { entityId, action, page, limit } = req.query as Record<string, string>;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (entityId) { conditions.push('entity_id = ?'); params.push(entityId); }
  if (action) { conditions.push('action = ?'); params.push(action); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageNum = Math.max(1, parseInt(page ?? '1', 10));
  const limitNum = Math.min(100, parseInt(limit ?? '50', 10));
  const offset = (pageNum - 1) * limitNum;

  const rows = await sqlAll<Record<string, unknown>>(
    `SELECT * FROM rr_audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limitNum, offset]
  );

  const totalRow = await sqlGet<{ n: number }>(
    `SELECT COUNT(*) as n FROM rr_audit_log ${where}`,
    params
  );

  res.json({
    items: rows.map(r => ({ ...r, details: JSON.parse(r['details'] as string) })),
    total: totalRow?.n ?? 0,
    page: pageNum,
    limit: limitNum,
  });
});
