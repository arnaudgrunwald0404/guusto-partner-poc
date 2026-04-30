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
import { getDb } from '../db/schema.js';
import { STUB_EMPLOYEES } from '../services/employeeResolver.js';
import { getBalance, getLedger } from '../services/budgetService.js';

export const managerRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/rr/manager/budget
// ---------------------------------------------------------------------------

managerRouter.get('/budget', (req: Request, res: Response): void => {
  const managerId = req.headers['x-user-id'] as string | undefined;
  if (!managerId) {
    res.status(401).json({ error: 'Missing x-user-id header' });
    return;
  }

  const balance = getBalance(managerId);
  const rawLedger = getLedger(managerId);

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

managerRouter.get('/suggestions', (req: Request, res: Response): void => {
  const managerId = req.headers['x-user-id'] as string | undefined;
  if (!managerId) {
    res.status(401).json({ error: 'Missing x-user-id header' });
    return;
  }

  const db = getDb();

  // Pull all pending approvals (not yet decided, not expired) with their
  // linked recognition + classification data.
  const rows = db.prepare(`
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
    WHERE a.decision IS NULL AND a.expires_at > datetime('now')
    ORDER BY a.rowid DESC
  `).all() as Array<{
    approval_id: string;
    recognition_id: string;
    expires_at: string;
    employee_first_name: string;
    employee_id: string | null;
    evidence_quote: string | null;
    recognition_message: string | null;
    reward_amount_cents: number;
    confidence: number | null;
  }>;

  // Filter to this manager's direct reports (by employee_id lookup in stub directory)
  const directReportIds = new Set(
    STUB_EMPLOYEES.filter(e => e.managerId === managerId).map(e => e.id)
  );

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

managerRouter.get('/team', (req: Request, res: Response): void => {
  const managerId = req.headers['x-user-id'] as string | undefined;
  if (!managerId) {
    res.status(401).json({ error: 'Missing x-user-id header' });
    return;
  }

  const db = getDb();
  const daysParam = req.query['days'] as string | undefined;
  const daysNum = Math.min(365, Math.max(1, parseInt(daysParam ?? '30', 10)));
  const since = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000).toISOString();

  // Load gap alert threshold from config
  const gapDays = parseInt(
    (db.prepare(
      "SELECT value FROM rr_tenant_config WHERE key = 'recognition_gap_alert_days'"
    ).get() as { value: string } | undefined)?.value ?? '30',
    10,
  );

  // Direct reports from stub directory
  const directReports = STUB_EMPLOYEES.filter(e => e.managerId === managerId);

  const teamData = directReports.map(emp => {
    const received = (db.prepare(
      'SELECT COUNT(*) AS n FROM rr_shoutouts WHERE recipient_id = ? AND created_at >= ?'
    ).get(emp.id, since) as { n: number }).n;

    const sent = (db.prepare(
      'SELECT COUNT(*) AS n FROM rr_shoutouts WHERE sender_id = ? AND created_at >= ?'
    ).get(emp.id, since) as { n: number }).n;

    const lastRec = db.prepare(
      'SELECT created_at FROM rr_shoutouts WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(emp.id) as { created_at: string } | undefined;

    const daysSince = lastRec
      ? Math.floor((Date.now() - new Date(lastRec.created_at).getTime()) / 86_400_000)
      : null;

    // Top values this person has received
    const topValues = db.prepare(`
      SELECT sv.value_label AS label, COUNT(*) AS count
      FROM rr_shoutout_values sv
      JOIN rr_shoutouts s ON s.id = sv.shoutout_id
      WHERE s.recipient_id = ? AND s.created_at >= ?
      GROUP BY sv.value_label ORDER BY count DESC LIMIT 3
    `).all(emp.id, since) as Array<{ label: string; count: number }>;

    return {
      employeeId: emp.id,
      name: `${emp.firstName} ${emp.lastName}`,
      email: emp.email,
      recognitionsReceived: received,
      recognitionsSent: sent,
      lastRecognizedAt: lastRec?.created_at ?? null,
      daysSinceLastRecognized: daysSince,
      flagged: daysSince === null || daysSince > gapDays,
      topValues,
    };
  });

  // Manager's own outbound activity this period
  const mySentCount = (db.prepare(
    'SELECT COUNT(*) AS n FROM rr_shoutouts WHERE sender_id = ? AND created_at >= ?'
  ).get(managerId, since) as { n: number }).n;

  const myGiftStats = db.prepare(`
    SELECT
      COUNT(*) AS n,
      COALESCE(SUM(gift_amount_cents), 0) AS total
    FROM rr_shoutouts
    WHERE sender_id = ? AND gift_amount_cents IS NOT NULL AND created_at >= ?
  `).get(managerId, since) as { n: number; total: number };

  const balance = getBalance(managerId);
  const flaggedCount = teamData.filter(t => t.flagged).length;

  res.json({
    managerId,
    period: { days: daysNum, since },
    budget: {
      balanceCents: balance,
      balanceDollars: (balance / 100).toFixed(2),
      giftsIssuedCents: myGiftStats.total,
      giftsIssuedDollars: (myGiftStats.total / 100).toFixed(2),
    },
    activity: {
      recognitionsSent: mySentCount,
      giftsIssued: myGiftStats.n,
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
