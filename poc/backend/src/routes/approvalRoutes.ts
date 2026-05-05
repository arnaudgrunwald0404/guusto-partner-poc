/**
 * routes/approvalRoutes.ts — Manager approval one-click endpoints.
 *
 * GET /api/rr/approve?token=<t>          — approve the recognition
 * GET /api/rr/approve?token=<t>&edit=1   — falls back to approve (edit UI out of scope)
 * GET /api/rr/dismiss?token=<t>          — dismiss the recognition
 *
 * Each endpoint validates the token, records the decision, updates
 * rr_recognitions.reward_status, and renders a standalone HTML confirmation
 * page. No React, no CC chrome. Works without JavaScript.
 */

import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { getDb } from '../db/schema.js';
import { validateToken, recordDecision, validateIdentifyToken, consumeIdentifyToken, createApprovalToken } from '../services/approvalService.js';
import { sendApprovalEmail } from '../services/emailService.js';
import { placeGuustoOrder, pollOrderStatus } from '../services/guustoService.js';
import { STUB_EMPLOYEES } from '../services/employeeResolver.js';
import type { RecognitionRow, ClassificationRow } from '../types.js';

export const approvalRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Returns the employee full name for a recognition_id, or 'the employee'. */
function getEmployeeName(recognitionId: string): string {
  const db = getDb();
  const row = db
    .prepare('SELECT employee_first_name, employee_last_name FROM rr_recognitions WHERE id = ?')
    .get(recognitionId) as Pick<RecognitionRow, 'employee_first_name' | 'employee_last_name'> | undefined;
  const first = row?.employee_first_name ?? '';
  const last = row?.employee_last_name ?? '';
  return first ? (last ? `${first} ${last}` : first) : 'the employee';
}

/** Update reward_status on the recognition row. */
function updateRewardStatus(recognitionId: string, status: string): void {
  const db = getDb();
  db.prepare('UPDATE rr_recognitions SET reward_status = ? WHERE id = ?').run(
    status,
    recognitionId
  );
}

/**
 * Fire-and-forget Guusto order + poller after manager approves.
 * Logs a warning (does not throw) if Guusto creds are missing — POC graceful degradation.
 */
function triggerGuustoReward(recognitionId: string): void {
  const db = getDb();
  const row = db.prepare(`
    SELECT r.id, r.employee_id, r.employee_first_name, r.employee_last_name, r.evidence_quote,
           r.recognition_message, r.reward_amount_cents,
           c.employee_email, c.manager_email
    FROM rr_recognitions r
    LEFT JOIN rr_classifications c ON c.id = r.classification_id
    WHERE r.id = ?
  `).get(recognitionId) as {
    id: string; employee_id: string; employee_first_name: string; employee_last_name: string | null;
    evidence_quote: string | null; recognition_message: string | null;
    reward_amount_cents: number; employee_email: string | null; manager_email: string | null;
  } | undefined;

  if (!row) {
    console.error(`[triggerGuustoReward] Recognition not found: ${recognitionId}`);
    return;
  }

  const employeeEmail = row.employee_email ?? `${row.employee_id}@demo.com`;
  const managerEmail = process.env.MANAGER_EMAIL ?? row.manager_email ?? 'manager@demo.com';

  void (async () => {
    try {
      const { requestId } = await placeGuustoOrder({
        recognitionId,
        employeeEmail,
        employeeFirstName: row.employee_first_name ?? 'the employee',
        employeeLastName: row.employee_last_name ?? '',
        managerEmail,
        recognitionMessage: row.recognition_message ?? row.evidence_quote ?? '',
        amountCents: row.reward_amount_cents,
      });
      void pollOrderStatus(requestId, recognitionId, row.employee_first_name ?? 'the employee', row.employee_last_name ?? '', managerEmail);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not set')) {
        console.warn(`[triggerGuustoReward] Guusto creds not configured — skipping reward delivery for ${recognitionId}`);
      } else {
        console.error(`[triggerGuustoReward] Failed to place Guusto order for ${recognitionId}:`, err);
        updateRewardStatus(recognitionId, 'reward_failed');
      }
    }
  })();
}

// ---------------------------------------------------------------------------
// Page builders — standalone HTML, no JS required
// ---------------------------------------------------------------------------

const CARD_STYLE =
  'background:#ffffff;border-radius:12px;max-width:480px;width:100%;margin:40px auto;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.1);text-align:center;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Arial,sans-serif;';

const PAGE_STYLE =
  'margin:0;padding:16px;background-color:#f9fafb;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Arial,sans-serif;box-sizing:border-box;';

const LOGO_STYLE =
  'display:inline-block;font-size:20px;font-weight:bold;color:#1a56db;margin-bottom:32px;text-decoration:none;';

const HEADLINE_STYLE = 'margin:16px 0 0 0;font-size:24px;font-weight:700;color:#1a1a2e;';

const BODY_STYLE = 'font-size:16px;color:#6b7280;line-height:1.6;margin:12px 0 0 0;';

const SECONDARY_STYLE = 'font-size:14px;color:#6b7280;margin:16px 0 0 0;';

function pageWrapper(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
</head>
<body style="${PAGE_STYLE}">
  <div style="${CARD_STYLE}">
    <div style="${LOGO_STYLE}">ClearCompany</div>
    ${content}
  </div>
  <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">via ClearCompany</p>
</body>
</html>`;
}

/** State 1 — Approved */
function approvedPage(employeeName: string): string {
  return pageWrapper(
    'Recognition sent — ClearCompany',
    `<div aria-hidden="true" style="font-size:48px;">&#9989;</div>
    <h1 style="${HEADLINE_STYLE}">Recognition sent to ${employeeName}</h1>
    <p style="${BODY_STYLE}">${employeeName} will receive a $25 reward in their inbox shortly. The recognition has been added to their ClearCompany profile.</p>
    <p style="${SECONDARY_STYLE}">You can close this tab.</p>`
  );
}

/** State 2 — Dismissed */
function dismissedPage(employeeName: string): string {
  return pageWrapper(
    'Recognition dismissed — ClearCompany',
    `<div aria-hidden="true" style="font-size:48px;">&#128584;</div>
    <h1 style="${HEADLINE_STYLE}">Got it &mdash; no recognition sent</h1>
    <p style="${BODY_STYLE}">No reward was sent to ${employeeName}. Nothing has been recorded.</p>
    <p style="${SECONDARY_STYLE}">You can close this tab.</p>`
  );
}

/** State 3 — Expired */
function expiredPage(employeeName: string): string {
  return pageWrapper(
    'Link expired — ClearCompany',
    `<div aria-hidden="true" style="font-size:48px;">&#9200;</div>
    <h1 style="${HEADLINE_STYLE}">This link has expired</h1>
    <p style="${BODY_STYLE}">Recognition links expire after 48 hours to keep approvals timely. No reward was sent to ${employeeName}.</p>
    <p style="${SECONDARY_STYLE}">If you&rsquo;d still like to recognize ${employeeName}, you can do so from their <a href="/employees/" style="color:#1a56db;">employee profile</a> in ClearCompany.</p>`
  );
}

/** State 4 — Already decided */
function alreadyDecidedPage(priorDecision: string, employeeName: string): string {
  const bodyText =
    priorDecision === 'approved'
      ? `You already approved this recognition. ${employeeName}&rsquo;s reward is on its way.`
      : `You already dismissed this recognition. No reward was sent.`;

  return pageWrapper(
    'Already handled — ClearCompany',
    `<div aria-hidden="true" style="font-size:48px;">&#8505;&#65039;</div>
    <h1 style="${HEADLINE_STYLE}">Already handled</h1>
    <p style="${BODY_STYLE}">${bodyText}</p>
    <p style="${SECONDARY_STYLE}">You can close this tab.</p>`
  );
}

// ---------------------------------------------------------------------------
// Route: GET /approve
// ---------------------------------------------------------------------------

approvalRouter.get('/approve', (req: Request, res: Response): void => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const isEdit = req.query.edit === '1';

  if (!token) {
    res.status(400).send('<p>Missing token.</p>');
    return;
  }

  // Edit is a no-op for hackathon — treat as plain approve
  if (isEdit) {
    console.log('[approvalRoutes] edit=1 flag received — falling back to approve flow');
  }

  const result = validateToken(token);

  if (!result.valid) {
    if (result.reason === 'already_decided') {
      const priorDecision = result.already_decided ?? 'approved';
      // Get employee name: look up via token hash
      const db = getDb();
      const tokenHash = sha256hex(token);
      const approvalRow = db
        .prepare('SELECT recognition_id FROM rr_approvals WHERE token_hash = ?')
        .get(tokenHash) as { recognition_id: string } | undefined;
      const empName = approvalRow ? getEmployeeName(approvalRow.recognition_id) : 'the employee';

      res.status(409).send(alreadyDecidedPage(priorDecision, empName));
      return;
    }

    // expired or not_found — render expired page (best we can do without employee name)
    res.status(410).send(expiredPage('the employee'));
    return;
  }

  // Valid token — record decision and fire Guusto reward
  const tokenHash = sha256hex(token);
  recordDecision(tokenHash, 'approved');
  updateRewardStatus(result.recognition_id, 'approved');
  triggerGuustoReward(result.recognition_id); // fire-and-forget

  const employeeName = getEmployeeName(result.recognition_id);
  res.status(200).send(approvedPage(employeeName));
});

// ---------------------------------------------------------------------------
// Route: GET /dismiss
// ---------------------------------------------------------------------------

approvalRouter.get('/dismiss', (req: Request, res: Response): void => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';

  if (!token) {
    res.status(400).send('<p>Missing token.</p>');
    return;
  }

  const result = validateToken(token);

  if (!result.valid) {
    if (result.reason === 'already_decided') {
      const priorDecision = result.already_decided ?? 'dismissed';
      const db = getDb();
      const tokenHash = sha256hex(token);
      const approvalRow = db
        .prepare('SELECT recognition_id FROM rr_approvals WHERE token_hash = ?')
        .get(tokenHash) as { recognition_id: string } | undefined;
      const empName = approvalRow ? getEmployeeName(approvalRow.recognition_id) : 'the employee';

      res.status(409).send(alreadyDecidedPage(priorDecision, empName));
      return;
    }

    res.status(410).send(expiredPage('the employee'));
    return;
  }

  const tokenHash = sha256hex(token);
  recordDecision(tokenHash, 'dismissed');
  updateRewardStatus(result.recognition_id, 'dismissed');

  const employeeName = getEmployeeName(result.recognition_id);
  res.status(200).send(dismissedPage(employeeName));
});

// ---------------------------------------------------------------------------
// Route: GET /identify — manager selects the rewardee for an unknown name
// ---------------------------------------------------------------------------

approvalRouter.get('/identify', async (req: Request, res: Response): Promise<void> => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const empId  = typeof req.query.emp_id === 'string' ? req.query.emp_id : '';

  if (!token || !empId) {
    res.status(400).send(pageWrapper('Bad request — ClearCompany', '<h1 style="font-size:20px;color:#1a1a2e;">Missing token or employee selection.</h1>'));
    return;
  }

  // Validate identify token
  const idResult = validateIdentifyToken(token);
  if (!idResult.valid) {
    const msg = idResult.reason === 'already_used'
      ? 'You already identified the employee for this recognition. Check your inbox for the approval email.'
      : 'This link has expired. No reward was sent.';
    res.status(idResult.reason === 'already_used' ? 409 : 410).send(
      pageWrapper('Link expired — ClearCompany', `<div style="font-size:48px;">&#9200;</div><h1 style="${HEADLINE_STYLE}">${msg}</h1><p style="${SECONDARY_STYLE}">You can close this tab.</p>`)
    );
    return;
  }

  // Look up the employee
  const employee = STUB_EMPLOYEES.find(e => e.id === empId);
  if (!employee) {
    res.status(400).send(pageWrapper('Unknown employee — ClearCompany', '<h1 style="font-size:20px;color:#1a1a2e;">Employee not found.</h1>'));
    return;
  }

  // Load the classification
  const db = getDb();
  const classification = db
    .prepare('SELECT * FROM rr_classifications WHERE id = ?')
    .get(idResult.classification_id) as ClassificationRow | undefined;

  if (!classification) {
    res.status(500).send(pageWrapper('Error — ClearCompany', '<h1 style="font-size:20px;color:#1a1a2e;">Classification not found.</h1>'));
    return;
  }

  // Consume the identify token (one-shot)
  consumeIdentifyToken(token);

  // Create recognition row
  const recognitionId = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO rr_recognitions (
      id, classification_id, employee_id, employee_first_name, employee_last_name,
      manager_id, evidence_quote, recognition_message,
      reward_amount_cents, reward_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 2500, 'pending', ?)
  `).run(
    recognitionId,
    classification.id,
    employee.id,
    employee.firstName,
    employee.lastName,
    employee.managerId,
    classification.evidence_quote,
    classification.recognition_draft,
    now
  );

  // Update classification with resolved employee info
  db.prepare(`
    UPDATE rr_classifications
    SET employee_id=?, employee_first_name=?, employee_last_name=?, manager_id=?, manager_email=?,
        manager_first_name=?, employee_email=?, status='resolved'
    WHERE id=?
  `).run(employee.id, employee.firstName, employee.lastName, employee.managerId, employee.managerEmail,
         employee.managerFirstName, employee.email, classification.id);

  // Update the gong_event status
  db.prepare("UPDATE gong_events SET status='classified' WHERE id=(SELECT gong_event_id FROM rr_classifications WHERE id=?)")
    .run(classification.id);

  // Send the standard approval email
  try {
    const { token: approvalToken } = createApprovalToken(recognitionId);
    const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3001';
    const managerEmail = process.env.MANAGER_EMAIL ?? employee.managerEmail;

    await sendApprovalEmail({
      employeeFirstName: employee.firstName,
      employeeLastName: employee.lastName,
      managerEmail,
      evidenceQuote: classification.evidence_quote ?? '',
      recognitionDraft: classification.recognition_draft ?? '',
      approveUrl: `${baseUrl}/api/rr/approve?token=${approvalToken}`,
      editUrl: `${baseUrl}/api/rr/approve?token=${approvalToken}&edit=1`,
      dismissUrl: `${baseUrl}/api/rr/dismiss?token=${approvalToken}`,
    });

    console.log(`[identify] Approval email sent for ${employee.firstName} ${employee.lastName} → ${managerEmail}`);
  } catch (err) {
    console.error('[identify] Failed to send approval email:', err);
  }

  // Confirm to manager
  res.status(200).send(pageWrapper(
    'Employee identified — ClearCompany',
    `<div aria-hidden="true" style="font-size:48px;">&#128077;</div>
     <h1 style="${HEADLINE_STYLE}">Got it &mdash; that&rsquo;s ${employee.firstName} ${employee.lastName}</h1>
     <p style="${BODY_STYLE}">We&rsquo;ve sent you an approval email so you can review the recognition message and send the $25 reward with one click.</p>
     <p style="${SECONDARY_STYLE}">Check your inbox, then you can close this tab.</p>`
  ));
});

// ---------------------------------------------------------------------------
// Route: GET /approve-by-id — tokenless dashboard/UI approve
//
// Used by the React manager dashboard (no HMAC token, manager is already
// authenticated via the CC session). Supports ?withReward=false to skip
// the Guusto gift card and just record the recognition.
//
// GET /api/rr/approve-by-id?recognition_id=<id>&withReward=true|false
// ---------------------------------------------------------------------------

approvalRouter.get('/approve-by-id', (req: Request, res: Response): void => {
  const { recognition_id, withReward } = req.query as { recognition_id?: string; withReward?: string };
  if (!recognition_id) { res.status(400).json({ error: 'Missing recognition_id' }); return; }

  const db = getDb();
  const approval = db.prepare(`
    SELECT id FROM rr_approvals
    WHERE recognition_id = ? AND decision IS NULL
    LIMIT 1
  `).get(recognition_id) as { id: string } | undefined;

  if (!approval) {
    res.status(409).json({ error: 'Already decided or not found' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE rr_approvals SET decision='approved', decided_at=? WHERE id=?").run(now, approval.id);
  db.prepare("UPDATE rr_recognitions SET reward_status='approved' WHERE id=?").run(recognition_id);

  const sendReward = withReward !== 'false';
  if (sendReward) {
    triggerGuustoReward(recognition_id);
  }

  res.json({
    ok: true,
    recognitionId: recognition_id,
    rewardTriggered: sendReward,
    employeeName: getEmployeeName(recognition_id),
  });
});

// ---------------------------------------------------------------------------
// Route: GET /dismiss-by-id — tokenless dashboard/UI dismiss
//
// GET /api/rr/dismiss-by-id?recognition_id=<id>
// ---------------------------------------------------------------------------

approvalRouter.get('/dismiss-by-id', (req: Request, res: Response): void => {
  const { recognition_id } = req.query as { recognition_id?: string };
  if (!recognition_id) { res.status(400).json({ error: 'Missing recognition_id' }); return; }

  const db = getDb();
  const approval = db.prepare(`
    SELECT id FROM rr_approvals
    WHERE recognition_id = ? AND decision IS NULL
    LIMIT 1
  `).get(recognition_id) as { id: string } | undefined;

  if (!approval) {
    res.status(409).json({ error: 'Already decided or not found' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE rr_approvals SET decision='dismissed', decided_at=? WHERE id=?").run(now, approval.id);
  db.prepare("UPDATE rr_recognitions SET reward_status='dismissed' WHERE id=?").run(recognition_id);

  res.json({
    ok: true,
    recognitionId: recognition_id,
    employeeName: getEmployeeName(recognition_id),
  });
});
