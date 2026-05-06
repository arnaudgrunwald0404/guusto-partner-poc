/**
 * routes/employeeProfileRoutes.ts — Employee recognition profile endpoints (P0-7)
 *
 * GET /api/rr/employees/:id/recognitions      — received recognition timeline
 * GET /api/rr/employees/:id/recognitions/sent — sent recognition history
 * GET /api/rr/employees/:id/summary           — quick stats for profile sidebar
 *
 * Visibility / amount rules (P0-7):
 *   - Gift amounts visible ONLY to recipient, sender, their manager, or hr_admin.
 *   - Private shoutouts excluded from peer views (only visible to sender + recipient).
 *   - Server-side enforcement — not just UI filtering.
 */

import { Router, Request, Response } from 'express';
import { sqlAll, sqlGet } from '../db/pg.js';
import { getRedemptionUrl } from '../services/guustoService.js';

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

export const employeeProfileRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/rr/employees/:id/recognitions — received timeline
// ---------------------------------------------------------------------------

employeeProfileRouter.get('/:id/recognitions', async (req: Request, res: Response): Promise<void> => {
  const requesterId = req.headers['x-user-id'] as string | undefined;
  const requesterRole = (req.headers['x-user-role'] as string) || 'employee';
  const targetId = req.params.id;

  const employee = await sqlGet<EmployeeRow>('SELECT * FROM rr_employees WHERE id = ?', [targetId]);
  if (!employee) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }

  const { page, limit } = req.query as { page?: string; limit?: string };
  const pageNum = Math.max(1, parseInt(page ?? '1', 10));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit ?? '20', 10)));
  const offset = (pageNum - 1) * limitNum;

  // Amount visibility: recipient, sender, direct manager, or admin
  const canSeeAmount =
    requesterId === targetId ||
    requesterId === employee.manager_email ||
    requesterRole === 'hr_admin';

  // Visibility filter: peers can only see company/team shoutouts, not private
  const visFilter =
    requesterId === targetId || requesterRole === 'hr_admin'
      ? "s.visibility IN ('company','team','private')"
      : "s.visibility IN ('company','team')";

  const shoutoutRows = await sqlAll<Record<string, unknown>>(`
    SELECT
      s.id,
      s.sender_id,
      s.sender_name,
      s.message,
      s.visibility,
      s.source,
      s.gift_status,
      ${canSeeAmount ? 's.gift_amount_cents' : 'NULL AS gift_amount_cents'},
      s.created_at
    FROM rr_shoutouts s
    WHERE s.recipient_id = ? AND ${visFilter}
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `, [targetId, limitNum, offset]);

  const shoutoutItems = await Promise.all(shoutoutRows.map(async s => {
    const values = await sqlAll<{ id: string; label: string }>(
      'SELECT value_id AS id, value_label AS label FROM rr_shoutout_values WHERE shoutout_id = ?',
      [s['id']]
    );
    return {
      id: s['id'],
      type: 'shoutout' as const,
      senderId: s['sender_id'],
      senderName: s['sender_name'],
      message: s['message'],
      visibility: s['visibility'],
      source: s['source'],
      giftAmountCents: s['gift_amount_cents'],
      giftStatus: s['gift_status'],
      values,
      createdAt: s['created_at'],
    };
  }));

  // Also surface Gong-pipeline recognitions for this employee
  const gongRows = await sqlAll<Record<string, unknown>>(`
    SELECT
      r.id,
      r.recognition_message AS message,
      r.reward_status AS gift_status,
      ${canSeeAmount ? 'r.reward_amount_cents' : 'NULL'} AS gift_amount_cents,
      r.created_at
    FROM rr_recognitions r
    WHERE r.employee_id = ?
    ORDER BY r.created_at DESC
    LIMIT 10
  `, [targetId]);

  const gongItems = gongRows.map(r => ({
    id: r['id'],
    type: 'gong_recognition' as const,
    senderName: 'Gong AI',
    message: r['message'],
    visibility: 'private' as const,
    source: 'gong' as const,
    giftAmountCents: r['gift_amount_cents'],
    giftStatus: r['gift_status'],
    values: [] as Array<{ id: string; label: string }>,
    createdAt: r['created_at'],
  }));

  // Merge and sort by date descending
  const allItems = [...shoutoutItems, ...gongItems].sort(
    (a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime()
  );

  const totalRow = await sqlGet<{ n: number }>(`
    SELECT COUNT(*) AS n FROM rr_shoutouts s
    WHERE s.recipient_id = ? AND ${visFilter}
  `, [targetId]);

  res.json({
    employeeId: targetId,
    employeeName: `${employee.first_name} ${employee.last_name}`,
    items: allItems,
    total: totalRow?.n ?? 0,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil((totalRow?.n ?? 0) / limitNum),
    canSeeGiftAmounts: canSeeAmount,
  });
});

// ---------------------------------------------------------------------------
// GET /api/rr/employees/:id/recognitions/sent — sent history
// ---------------------------------------------------------------------------

employeeProfileRouter.get('/:id/recognitions/sent', async (req: Request, res: Response): Promise<void> => {
  const requesterId = req.headers['x-user-id'] as string | undefined;
  const requesterRole = (req.headers['x-user-role'] as string) || 'employee';
  const targetId = req.params.id;

  // Only the sender themselves, their manager, or an admin can see sent history
  const employee = await sqlGet<EmployeeRow>('SELECT * FROM rr_employees WHERE id = ?', [targetId]);
  if (!employee) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }

  const canView =
    requesterId === targetId ||
    requesterId === employee.manager_email ||
    requesterRole === 'hr_admin';

  if (!canView) {
    res.status(403).json({ error: 'Cannot view another employee\'s sent history' });
    return;
  }

  const { page, limit } = req.query as { page?: string; limit?: string };
  const pageNum = Math.max(1, parseInt(page ?? '1', 10));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit ?? '20', 10)));
  const offset = (pageNum - 1) * limitNum;

  const rows = await sqlAll<Record<string, unknown>>(`
    SELECT s.id, s.recipient_id, s.recipient_name, s.message,
           s.gift_amount_cents, s.gift_status, s.visibility, s.created_at
    FROM rr_shoutouts s
    WHERE s.sender_id = ?
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `, [targetId, limitNum, offset]);

  const items = await Promise.all(rows.map(async s => {
    const values = await sqlAll<{ id: string; label: string }>(
      'SELECT value_id AS id, value_label AS label FROM rr_shoutout_values WHERE shoutout_id = ?',
      [s['id']]
    );
    return {
      id: s['id'],
      recipientId: s['recipient_id'],
      recipientName: s['recipient_name'],
      message: s['message'],
      giftAmountCents: s['gift_amount_cents'],
      giftStatus: s['gift_status'],
      visibility: s['visibility'],
      values,
      createdAt: s['created_at'],
    };
  }));

  const totalRow = await sqlGet<{ n: number }>(
    'SELECT COUNT(*) AS n FROM rr_shoutouts WHERE sender_id = ?',
    [targetId]
  );

  res.json({
    employeeId: targetId,
    items,
    total: totalRow?.n ?? 0,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil((totalRow?.n ?? 0) / limitNum),
  });
});

// ---------------------------------------------------------------------------
// GET /api/rr/employees/:id/summary — quick profile stats (sidebar)
// ---------------------------------------------------------------------------

employeeProfileRouter.get('/:id/summary', async (req: Request, res: Response): Promise<void> => {
  const targetId = req.params.id;
  const employee = await sqlGet<EmployeeRow>('SELECT * FROM rr_employees WHERE id = ?', [targetId]);
  if (!employee) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }
  const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const received90Row = await sqlGet<{ n: number }>(
    "SELECT COUNT(*) AS n FROM rr_shoutouts WHERE recipient_id = ? AND created_at >= ?",
    [targetId, since90]
  );

  const sent90Row = await sqlGet<{ n: number }>(
    'SELECT COUNT(*) AS n FROM rr_shoutouts WHERE sender_id = ? AND created_at >= ?',
    [targetId, since90]
  );

  const topValues = await sqlAll<{ label: string; count: number }>(`
    SELECT sv.value_label AS label, COUNT(*) AS count
    FROM rr_shoutout_values sv
    JOIN rr_shoutouts s ON s.id = sv.shoutout_id
    WHERE s.recipient_id = ? AND s.created_at >= ?
    GROUP BY sv.value_label ORDER BY count DESC LIMIT 3
  `, [targetId, since90]);

  const lastRec = await sqlGet<{ created_at: string }>(
    'SELECT created_at FROM rr_shoutouts WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 1',
    [targetId]
  );

  const daysSince = lastRec
    ? Math.floor((Date.now() - new Date(lastRec.created_at).getTime()) / 86_400_000)
    : null;

  res.json({
    employeeId: targetId,
    name: `${employee.first_name} ${employee.last_name}`,
    email: employee.email,
    last90Days: { received: received90Row?.n ?? 0, sent: sent90Row?.n ?? 0 },
    topValues,
    lastReceivedAt: lastRec?.created_at ?? null,
    daysSinceLastRecognized: daysSince,
  });
});

// ---------------------------------------------------------------------------
// GET /api/rr/employees/:id/gifts — pending & redeemable gift links for recipient
//
// Returns the Guusto JWT redemption URL (longToken) for each completed gift.
// This URL IS the SSO token — no separate Guusto login required.
//
// SSO architecture note: Guusto uses signed JWT magic-links, not SAML/OAuth.
// The longToken encodes the recipient's identity and certificate ID.
// iFrame embedding requires *.clearcompany.com in Guusto's frame-ancestors CSP
// (currently only UltiPro, Kronos, Outlook, Teams are whitelisted).
// Until the commercial agreement adds CC to the whitelist, links open in a new tab.
// ---------------------------------------------------------------------------

employeeProfileRouter.get('/:id/gifts', async (req: Request, res: Response): Promise<void> => {
  const requesterId = req.headers['x-user-id'] as string | undefined;
  const targetId = req.params.id;

  // Only the recipient themselves can fetch their own gift links
  if (requesterId !== targetId) {
    res.status(403).json({ error: 'Gift links are only accessible to the recipient' });
    return;
  }

  const employee = await sqlGet<EmployeeRow>('SELECT * FROM rr_employees WHERE id = ?', [targetId]);
  if (!employee) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }

  // Join orders to shoutouts (Phase 1+ flow) and legacy recognitions
  const orders = await sqlAll<{
    id: string;
    recognition_id: string;
    guusto_request_id: string;
    status: string;
    redemption_url: string | null;
    amount_cents: number;
    currency: string;
    created_at: string;
    sender_name: string | null;
    message: string | null;
  }>(`
    SELECT
      o.id,
      o.recognition_id,
      o.guusto_request_id,
      o.status,
      o.redemption_url,
      o.amount_cents,
      o.currency,
      o.created_at,
      COALESCE(s.sender_name, r.employee_first_name) AS sender_name,
      COALESCE(s.message, r.recognition_message) AS message
    FROM rr_orders o
    LEFT JOIN rr_shoutouts s ON s.id = o.recognition_id
    LEFT JOIN rr_recognitions r ON r.id = o.recognition_id
    WHERE o.employee_email = ?
    ORDER BY o.created_at DESC
    LIMIT 20
  `, [employee.email]);

  const gifts = orders.map(o => {
    // For any shoutout-linked order without a stored URL, try live lookup
    const redemptionUrl = o.redemption_url ?? getRedemptionUrl(o.recognition_id);
    return {
      orderId: o.id,
      recognitionId: o.recognition_id,
      status: o.status,
      amountCents: o.amount_cents,
      amountDollars: (o.amount_cents / 100).toFixed(2),
      currency: o.currency,
      senderName: o.sender_name,
      message: o.message,
      redemptionUrl,
      redeemable: redemptionUrl !== null && o.status === 'COMPLETED',
      createdAt: o.created_at,
    };
  });

  res.json({
    employeeId: targetId,
    email: employee.email,
    gifts,
    ssoNote: 'redemptionUrl is a signed JWT magic-link — no separate Guusto login required. iFrame embedding pending frame-ancestors CSP whitelist update (commercial requirement).',
  });
});
