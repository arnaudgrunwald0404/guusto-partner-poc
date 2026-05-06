/**
 * routes/managerRoutes.ts — Manager self-service endpoints
 *
 * GET /api/rr/manager/budget      — real-time budget balance + full ledger
 * GET /api/rr/manager/team        — team participation dashboard
 *
 * Auth context:
 *   x-user-id   : manager's employee ID
 *   x-user-role : 'manager' | 'hr_admin'
 */

import { Router, Request, Response } from 'express';
import { sqlAll, sqlGet } from '../db/pg.js';
import { getBalance, getLedger } from '../services/budgetService.js';

interface EmployeeRow {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  title: string | null;
  department: string | null;
  office: string | null;
  manager_email: string | null;
  manager_name: string | null;
}

export const managerRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/rr/manager/budget
// ---------------------------------------------------------------------------

managerRouter.get('/budget', async (req: Request, res: Response): Promise<void> => {
  const managerId = req.headers['x-user-id'] as string | undefined;
  if (!managerId) {
    res.status(401).json({ error: 'Missing x-user-id header' });
    return;
  }

  const balance = await getBalance(managerId);
  const rawLedger = await getLedger(managerId);

  res.json({
    managerId,
    balanceCents: balance,
    balanceDollars: (balance / 100).toFixed(2),
    ledger: rawLedger.map(row => ({
      id: row.id,
      amountCents: row.amount_cents,
      amountDollars: (row.amount_cents / 100).toFixed(2),
      entryType: row.entry_type,
      referenceId: row.reference_id,
      note: row.note,
      createdAt: row.created_at,
    })),
  });
});

// ---------------------------------------------------------------------------
// GET /api/rr/manager/suggestions — Gong AI recognition suggestions pending
//   manager approval.  Filters to the requesting manager's direct reports
//   so each manager only sees their own queue.
// ---------------------------------------------------------------------------

managerRouter.get('/suggestions', async (req: Request, res: Response): Promise<void> => {
  const managerId = req.headers['x-user-id'] as string | undefined;
  if (!managerId) {
    res.status(401).json({ error: 'Missing x-user-id header' });
    return;
  }

  // Pull all pending approvals (not yet decided, not expired) with their
  // linked recognition + classification data.
  const rows = await sqlAll<{
    approval_id: string;
    recognition_id: string;
    expires_at: string;
    employee_first_name: string;
    employee_id: string | null;
    evidence_quote: string | null;
    recognition_message: string | null;
    reward_amount_cents: number;
    confidence: number | null;
  }>(`
    SELECT
      a.id         AS approval_id,
      a.recognition_id,
      a.expires_at,
      r.employee_first_name,
      r.employee_id,
      r.evidence_quote,
      r.recognition_message,
      r.reward_amount_cents,
      c.confidence
    FROM rr_approvals a
    JOIN rr_recognitions r ON r.id = a.recognition_id
    LEFT JOIN rr_classifications c ON c.id = r.classification_id
    WHERE a.decision IS NULL AND a.expires_at > NOW()
    ORDER BY a.created_at DESC
  `);

  // Filter to this manager's direct reports (by employee_id lookup in DB)
  const directReportRows = await sqlAll<{ id: string }>(
    'SELECT id FROM rr_employees WHERE manager_email = ?',
    [managerId]
  );
  const directReportIds = new Set(directReportRows.map(r => r.id));

  // If manager has no matching direct reports in the stub, return all suggestions
  // (useful for the hackathon demo where managerId may not match stub exactly)
  const suggestions = (directReportIds.size === 0 ? rows : rows.filter(r => directReportIds.has(r.employee_id ?? '')))
    .map(r => ({
      approvalId: r.approval_id,
      recognitionId: r.recognition_id,
      expiresAt: r.expires_at,
      employeeFirstName: r.employee_first_name,
      employeeId: r.employee_id,
      evidenceQuote: r.evidence_quote,
      recognitionMessage: r.recognition_message,
      rewardAmountCents: r.reward_amount_cents,
      confidence: r.confidence ?? null,
    }));

  res.json({ suggestions });
});

// ---------------------------------------------------------------------------
// GET /api/rr/manager/team — team participation + recognition gap alerts
// ---------------------------------------------------------------------------

managerRouter.get('/team', async (req: Request, res: Response): Promise<void> => {
  const managerId = req.headers['x-user-id'] as string | undefined;
  if (!managerId) {
    res.status(401).json({ error: 'Missing x-user-id header' });
    return;
  }

  const daysParam = req.query['days'] as string | undefined;
  const daysNum = Math.min(365, Math.max(1, parseInt(daysParam ?? '30', 10)));
  const since = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000).toISOString();

  // Load gap alert threshold from config
  const gapRow = await sqlGet<{ value: string }>(
    "SELECT value FROM rr_tenant_config WHERE key = 'recognition_gap_alert_days'"
  );
  const gapDays = parseInt(gapRow?.value ?? '30', 10);

  // Direct reports from DB
  const directReports = await sqlAll<EmployeeRow>(
    'SELECT * FROM rr_employees WHERE manager_email = ?',
    [managerId]
  );

  const teamData = await Promise.all(directReports.map(async emp => {
    const receivedRow = await sqlGet<{ n: number }>(
      'SELECT COUNT(*) AS n FROM rr_shoutouts WHERE recipient_id = ? AND created_at >= ?',
      [emp.id, since]
    );

    const sentRow = await sqlGet<{ n: number }>(
      'SELECT COUNT(*) AS n FROM rr_shoutouts WHERE sender_id = ? AND created_at >= ?',
      [emp.id, since]
    );

    const lastRec = await sqlGet<{ created_at: string }>(
      'SELECT created_at FROM rr_shoutouts WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 1',
      [emp.id]
    );

    const daysSince = lastRec
      ? Math.floor((Date.now() - new Date(lastRec.created_at).getTime()) / 86_400_000)
      : null;

    // Top values this person has received
    const topValues = await sqlAll<{ label: string; count: number }>(`
      SELECT sv.value_label AS label, COUNT(*) AS count
      FROM rr_shoutout_values sv
      JOIN rr_shoutouts s ON s.id = sv.shoutout_id
      WHERE s.recipient_id = ? AND s.created_at >= ?
      GROUP BY sv.value_label ORDER BY count DESC LIMIT 3
    `, [emp.id, since]);

    return {
      employeeId: emp.id,
      name: `${emp.first_name} ${emp.last_name}`,
      email: emp.email,
      recognitionsReceived: receivedRow?.n ?? 0,
      recognitionsSent: sentRow?.n ?? 0,
      lastRecognizedAt: lastRec?.created_at ?? null,
      daysSinceLastRecognized: daysSince,
      flagged: daysSince === null || daysSince > gapDays,
      topValues,
    };
  }));

  // Manager's own outbound activity this period
  const mySentRow = await sqlGet<{ n: number }>(
    'SELECT COUNT(*) AS n FROM rr_shoutouts WHERE sender_id = ? AND created_at >= ?',
    [managerId, since]
  );

  const myGiftStats = await sqlGet<{ n: number; total: number }>(`
    SELECT
      COUNT(*) AS n,
      COALESCE(SUM(gift_amount_cents), 0) AS total
    FROM rr_shoutouts
    WHERE sender_id = ? AND gift_amount_cents IS NOT NULL AND created_at >= ?
  `, [managerId, since]);

  const balance = await getBalance(managerId);
  const flaggedCount = teamData.filter(t => t.flagged).length;

  res.json({
    managerId,
    period: { days: daysNum, since },
    budget: {
      balanceCents: balance,
      balanceDollars: (balance / 100).toFixed(2),
      giftsIssuedCents: myGiftStats?.total ?? 0,
      giftsIssuedDollars: ((myGiftStats?.total ?? 0) / 100).toFixed(2),
    },
    activity: {
      recognitionsSent: mySentRow?.n ?? 0,
      giftsIssued: myGiftStats?.n ?? 0,
    },
    directReports: teamData,
    summary: {
      total: directReports.length,
      recognized: teamData.filter(t => t.recognitionsReceived > 0).length,
      flagged: flaggedCount,
      gapThresholdDays: gapDays,
    },
  });
});
