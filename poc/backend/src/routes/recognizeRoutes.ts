/**
 * routes/recognizeRoutes.ts — POST /api/rr/recognize
 *
 * Manual recognition flow: manager submits from the employee profile page.
 * No AI classification — the manager writes the message directly.
 * No approval email — manager is already authorizing by submitting.
 *
 * Flow:
 *   1. Validate body (employeeId, reason, message)
 *   2. Look up employee in stub directory
 *   3. Write rr_classifications row (source='manual')
 *   4. Write rr_recognitions row (reward_status='pending')
 *   5. Fire Guusto order + poller (fire-and-forget)
 *   6. Return { recognitionId, employeeFirstName, employeeEmail }
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../db/schema.js';
import { loadDirectory } from '../services/employeeResolver.js';
import { placeGuustoOrder, pollOrderStatus } from '../services/guustoService.js';

export const recognizeRouter = Router();

const VALID_REASONS = [
  'Customer Focus',
  'Lead (take initiative)',
  'Team Player',
  'Innovation',
  'Above & Beyond',
  'Integrity',
  'Problem Solver',
];

recognizeRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const { employeeId, reason, message } = req.body as {
    employeeId?: string;
    reason?: string;
    message?: string;
  };

  // --- Validate ---
  if (!employeeId || typeof employeeId !== 'string') {
    res.status(400).json({ error: 'Missing employeeId' });
    return;
  }
  if (!reason || !VALID_REASONS.includes(reason)) {
    res.status(400).json({ error: 'Invalid or missing reason', valid: VALID_REASONS });
    return;
  }
  if (!message || typeof message !== 'string' || message.trim().length < 150) {
    res.status(400).json({ error: 'Message must be at least 150 characters' });
    return;
  }
  if (message.length > 500) {
    res.status(400).json({ error: 'Message must be 500 characters or fewer' });
    return;
  }

  // --- Look up employee ---
  const employee = loadDirectory().find(e => e.id === employeeId);
  if (!employee) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }

  const db = getDb();
  const now = new Date().toISOString();
  const classificationId = randomUUID();
  const recognitionId = randomUUID();

  // Manager info (POC: use env override or employee's manager)
  const managerEmail = process.env.MANAGER_EMAIL ?? employee.managerEmail;
  const managerFirstName = employee.managerFirstName;

  // --- Write classification row (source='manual') ---
  db.prepare(`
    INSERT INTO rr_classifications (
      id, gong_event_id, is_exceptional, confidence,
      employee_name_mentioned, evidence_quote, sentiment_magnitude,
      recognition_draft, reasoning, status,
      employee_id, manager_id, manager_email, manager_first_name,
      employee_email, employee_first_name, employee_last_name, created_at
    ) VALUES (
      ?, 'manual', 1, 1.0,
      ?, ?, 'very_high',
      ?, ?, 'resolved',
      ?, ?, ?, ?,
      ?, ?, ?, ?
    )
  `).run(
    classificationId,
    `${employee.firstName} ${employee.lastName}`,
    message.trim(),           // evidence_quote = the manager's own message
    message.trim(),           // recognition_draft = same
    `Manual recognition by manager. Reason: ${reason}`,
    employee.id,
    employee.managerId,
    managerEmail,
    managerFirstName,
    employee.email,
    employee.firstName,
    employee.lastName,
    now,
  );

  // --- Write recognition row ---
  db.prepare(`
    INSERT INTO rr_recognitions (
      id, classification_id, employee_id, employee_first_name, employee_last_name,
      manager_id, evidence_quote, recognition_message,
      reward_amount_cents, reward_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 2500, 'pending', ?)
  `).run(
    recognitionId,
    classificationId,
    employee.id,
    employee.firstName,
    employee.lastName,
    employee.managerId,
    message.trim(),
    message.trim(),
    now,
  );

  // --- Respond immediately ---
  res.status(201).json({
    recognitionId,
    employeeFirstName: employee.firstName,
    employeeEmail: employee.email,
  });

  // --- Fire Guusto order (fire-and-forget) ---
  void (async () => {
    try {
      const { requestId } = await placeGuustoOrder({
        recognitionId,
        employeeEmail: employee.email,
        employeeFirstName: employee.firstName,
        employeeLastName: employee.lastName,
        managerEmail,
        recognitionMessage: message.trim(),
        amountCents: 2500,
      });
      void pollOrderStatus(requestId, recognitionId, employee.firstName, employee.lastName, managerEmail);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not set')) {
        console.warn(`[recognize] Guusto creds not configured — skipping reward for ${recognitionId}`);
        // Still mark as reward_sent for demo purposes when no creds
        db.prepare("UPDATE rr_recognitions SET reward_status='reward_sent' WHERE id=?").run(recognitionId);
      } else {
        console.error(`[recognize] Guusto order failed for ${recognitionId}:`, err);
        db.prepare("UPDATE rr_recognitions SET reward_status='reward_failed' WHERE id=?").run(recognitionId);
      }
    }
  })();
});

// GET /api/rr/recognize/status/:recognitionId — poll from FE
recognizeRouter.get('/status/:id', (req: Request, res: Response): void => {
  const db = getDb();
  const row = db.prepare(
    'SELECT reward_status, employee_first_name FROM rr_recognitions WHERE id = ?'
  ).get(req.params.id) as { reward_status: string; employee_first_name: string } | undefined;

  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const STATUS_MAP: Record<string, string> = {
    pending: 'sending',
    approved: 'sending',
    reward_sending: 'sending',
    reward_sent: 'delivered',
    reward_failed: 'failed',
    poll_timeout: 'failed',
  };

  res.json({
    status: STATUS_MAP[row.reward_status] ?? 'sending',
    employeeFirstName: row.employee_first_name,
  });
});
