/**
 * routes/recognitionStatus.ts — GET /api/rr/demo/recognition-status
 *
 * Used by the hackathon demo frontend to poll for recognition status.
 * The FE polls this endpoint every 10 seconds and updates a badge on the
 * employee profile page without a full page reload.
 *
 * Query parameter: employee_id (required)
 *
 * Response:
 * - { status: null } when no recognition row exists for this employee
 * - { status, employee_first_name, manager_first_name, evidence_quote,
 *     amount_cents, currency } when a row exists
 */

import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema.js';
import { RecognitionRow } from '../types.js';

export const recognitionStatusRouter = Router();

recognitionStatusRouter.get('/', (req: Request, res: Response): void => {
  const { employee_id } = req.query;

  if (!employee_id || typeof employee_id !== 'string') {
    res.status(400).json({ error: 'Missing employee_id query parameter' });
    return;
  }

  const db = getDb();

  // Fetch the most recent recognition row for this employee
  // (in a real app you'd scope to a time window or specific recognition ID)
  const row = db
    .prepare(
      `SELECT r.*, c.manager_first_name
       FROM rr_recognitions r
       LEFT JOIN rr_classifications c ON r.classification_id = c.id
       WHERE r.employee_id = ?
       ORDER BY r.created_at DESC
       LIMIT 1`
    )
    .get(employee_id) as (RecognitionRow & { manager_first_name: string | null }) | undefined;

  if (!row) {
    res.json({ status: null });
    return;
  }

  // Map internal reward_status → frontend display status
  const STATUS_MAP: Record<string, string | null> = {
    pending:        'pending',    // recognition exists, awaiting manager decision
    approved:       'pending',    // manager approved, Guusto not yet called
    reward_sending: 'pending',    // Guusto order in flight
    reward_sent:    'delivered',  // Guusto confirmed COMPLETED
    reward_failed:  'failed',     // Guusto returned FAILED
    poll_timeout:   'failed',     // gave up polling
    dismissed:      null,         // manager dismissed — don't show banner
    expired:        null,         // token expired — don't show banner
  };
  const displayStatus = STATUS_MAP[row.reward_status] ?? null;

  if (displayStatus === null) {
    res.json({ status: null });
    return;
  }

  res.json({
    status: displayStatus,
    employee_first_name: row.employee_first_name ?? null,
    manager_first_name: row.manager_first_name ?? null,
    evidence_quote: row.evidence_quote ?? null,
    recognition_message: row.recognition_message ?? null,
    amount_cents: row.reward_amount_cents,
    currency: 'USD',
  });
});
