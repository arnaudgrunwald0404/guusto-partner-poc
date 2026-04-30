/**
 * routes/shoutoutRoutes.ts
 *
 * POST /api/rr/shoutouts        — send a recognition shoutout (+ optional gift)
 * GET  /api/rr/shoutouts        — paginated recognition feed
 * GET  /api/rr/shoutouts/:id    — single shoutout detail
 * POST /api/rr/shoutouts/:id/reactions — add / toggle emoji reaction
 *
 * Auth context (POC mock — real JWT in production):
 *   x-user-id   : authenticated employee ID
 *   x-user-role : 'employee' | 'manager' | 'hr_admin'
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../db/schema.js';
import { STUB_EMPLOYEES } from '../services/employeeResolver.js';
import {
  createShoutout,
  attachGuustoGift,
  notifyShoutoutRecipient,
  getShoutoutFeed,
  writeAuditLog,
} from '../services/shoutoutService.js';
import { InsufficientBudgetError } from '../services/budgetService.js';

export const shoutoutRouter = Router();

const ALLOWED_REACTIONS = ['👏', '⭐', '🙌', '🔥', '❤️', '🚀'];

// ---------------------------------------------------------------------------
// POST /api/rr/shoutouts — send a shoutout
// ---------------------------------------------------------------------------

shoutoutRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const senderId = req.headers['x-user-id'] as string | undefined;
  const senderRole = (req.headers['x-user-role'] as string) || 'employee';

  if (!senderId) {
    res.status(401).json({ error: 'Missing x-user-id header' });
    return;
  }

  const { recipientId, message, valueIds, visibility, giftAmountCents } = req.body as {
    recipientId?: string;
    message?: string;
    valueIds?: string[];
    visibility?: string;
    giftAmountCents?: number;
  };

  // --- Basic validation ---
  if (!recipientId || typeof recipientId !== 'string') {
    res.status(400).json({ error: 'recipientId is required' });
    return;
  }
  if (recipientId === senderId) {
    res.status(400).json({ error: 'Cannot recognize yourself' });
    return;
  }
  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  // --- Load tenant config ---
  const db = getDb();
  const configRows = db.prepare(
    'SELECT key, value FROM rr_tenant_config'
  ).all() as Array<{ key: string; value: string }>;
  const cfg = Object.fromEntries(configRows.map(r => [r.key, r.value]));

  const minChars = parseInt(cfg['message_min_chars'] ?? '50', 10);
  const maxChars = parseInt(cfg['message_max_chars'] ?? '500', 10);
  const maxValues = parseInt(cfg['max_values_per_recognition'] ?? '3', 10);
  const requireValues = cfg['require_values'] !== 'false';
  const defaultVis = cfg['default_visibility'] ?? 'company';

  if (message.trim().length < minChars) {
    res.status(400).json({ error: `Message must be at least ${minChars} characters` });
    return;
  }
  if (message.trim().length > maxChars) {
    res.status(400).json({ error: `Message must be ${maxChars} characters or fewer` });
    return;
  }
  if (requireValues && (!valueIds || valueIds.length === 0)) {
    res.status(400).json({ error: 'At least one company value must be selected' });
    return;
  }
  if (valueIds && valueIds.length > maxValues) {
    res.status(400).json({ error: `Maximum ${maxValues} values per recognition` });
    return;
  }

  const VALID_VIS = ['company', 'team', 'private'];
  const vis = (visibility && VALID_VIS.includes(visibility) ? visibility : defaultVis) as
    'company' | 'team' | 'private';

  // --- Resolve sender ---
  const sender = STUB_EMPLOYEES.find(e => e.id === senderId);
  if (!sender) {
    res.status(404).json({ error: 'Sender not found in employee directory' });
    return;
  }

  // --- Resolve recipient ---
  const recipient = STUB_EMPLOYEES.find(e => e.id === recipientId);
  if (!recipient) {
    res.status(404).json({ error: 'Recipient not found in employee directory' });
    return;
  }

  // --- Validate value IDs ---
  let resolvedValues: Array<{ id: string; label: string }> = [];
  if (valueIds && valueIds.length > 0) {
    const placeholders = valueIds.map(() => '?').join(',');
    const dbValues = db.prepare(`
      SELECT id, label FROM rr_company_values
      WHERE id IN (${placeholders}) AND is_active = 1
    `).all(...valueIds) as Array<{ id: string; label: string }>;

    if (dbValues.length !== valueIds.length) {
      res.status(400).json({ error: 'One or more value IDs are invalid or inactive' });
      return;
    }
    resolvedValues = dbValues;
  }

  // --- Gift validation (manager/admin only) ---
  let giftCents: number | undefined;
  if (giftAmountCents && giftAmountCents > 0) {
    if (cfg['monetary_rewards_enabled'] === 'false') {
      res.status(403).json({ error: 'Monetary rewards are disabled for this organization' });
      return;
    }
    if (senderRole !== 'manager' && senderRole !== 'hr_admin') {
      res.status(403).json({ error: 'Only managers and admins can attach monetary gifts' });
      return;
    }
    const minGift = parseInt(cfg['min_gift_cents'] ?? '500', 10);
    const maxGift = parseInt(cfg['max_gift_cents'] ?? '10000', 10);
    if (giftAmountCents < minGift || giftAmountCents > maxGift) {
      res.status(400).json({
        error: `Gift must be between $${(minGift / 100).toFixed(0)} and $${(maxGift / 100).toFixed(0)}`,
        minCents: minGift,
        maxCents: maxGift,
      });
      return;
    }
    giftCents = giftAmountCents;
  }

  // --- Create shoutout (budget deduction is atomic inside createShoutout) ---
  let shoutoutId: string;
  try {
    shoutoutId = createShoutout({
      senderId,
      senderName: `${sender.firstName} ${sender.lastName}`,
      recipientId,
      recipientName: `${recipient.firstName} ${recipient.lastName}`,
      recipientEmail: recipient.email,
      message: message.trim(),
      visibility: vis,
      valueIds: resolvedValues.map(v => v.id),
      valueLabels: resolvedValues.map(v => v.label),
      giftAmountCents: giftCents,
    });
  } catch (err) {
    if (err instanceof InsufficientBudgetError) {
      res.status(402).json({
        error: 'Insufficient recognition budget',
        availableCents: err.available,
        availableDollars: (err.available / 100).toFixed(2),
        requestedCents: err.required,
        requestedDollars: (err.required / 100).toFixed(2),
      });
      return;
    }
    throw err;
  }

  // --- Respond immediately ---
  res.status(201).json({
    shoutoutId,
    recipientName: `${recipient.firstName} ${recipient.lastName}`,
    senderName: `${sender.firstName} ${sender.lastName}`,
    message: message.trim(),
    values: resolvedValues,
    visibility: vis,
    giftAmountCents: giftCents ?? null,
    giftStatus: giftCents ? 'pending' : null,
    createdAt: new Date().toISOString(),
  });

  // --- Fire async side-effects (do not block the response) ---

  // RR-030: notification email to recipient
  void notifyShoutoutRecipient({
    shoutoutId,
    recipientFirstName: recipient.firstName,
    recipientEmail: recipient.email,
    senderName: `${sender.firstName} ${sender.lastName}`,
    message: message.trim(),
    valueLabels: resolvedValues.map(v => v.label),
    hasGift: !!giftCents,
    giftAmountCents: giftCents,
  });

  // RR-H5/RR-060: Guusto gift order
  if (giftCents) {
    void attachGuustoGift({
      shoutoutId,
      senderId,
      senderEmail: sender.email,
      recipientEmail: recipient.email,
      recipientFirstName: recipient.firstName,
      amountCents: giftCents,
      message: message.trim(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/rr/shoutouts/since?after=<ISO timestamp> — live banner poll (RR-016)
// Returns only company-wide items created after the given timestamp.
// Must be registered BEFORE /:id so Express doesn't treat "since" as an ID.
// ---------------------------------------------------------------------------

shoutoutRouter.get('/since', (req: Request, res: Response): void => {
  const { after, limit } = req.query as Record<string, string>;

  if (!after) {
    res.status(400).json({ error: 'after timestamp is required' });
    return;
  }

  const db = getDb();
  const cap = Math.min(50, parseInt(limit ?? '20', 10));

  const rows = db.prepare(`
    SELECT s.id, s.sender_name, s.recipient_name, s.created_at
    FROM rr_shoutouts s
    WHERE s.visibility = 'company'
      AND s.created_at > ?
      AND s.deleted_at IS NULL
    ORDER BY s.created_at ASC
    LIMIT ?
  `).all(after, cap) as Array<{
    id: string;
    sender_name: string;
    recipient_name: string;
    created_at: string;
  }>;

  res.json({
    items: rows.map(r => ({
      id: r.id,
      senderName: r.sender_name,
      recipientName: r.recipient_name,
      createdAt: r.created_at,
    })),
    count: rows.length,
  });
});

// ---------------------------------------------------------------------------
// GET /api/rr/shoutouts — recognition feed
// ---------------------------------------------------------------------------

shoutoutRouter.get('/', (req: Request, res: Response): void => {
  const { recipientId, senderId, valueId, page, limit } = req.query as Record<string, string>;

  const { items, total } = getShoutoutFeed({
    recipientId,
    senderId,
    valueId,
    page: page ? parseInt(page, 10) : 1,
    limit: limit ? parseInt(limit, 10) : 20,
  });

  const pageNum = parseInt(page ?? '1', 10);
  const limitNum = Math.min(50, parseInt(limit ?? '20', 10));

  res.json({
    items,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
  });
});

// ---------------------------------------------------------------------------
// GET /api/rr/shoutouts/:id — single shoutout detail
// ---------------------------------------------------------------------------

shoutoutRouter.get('/:id', (req: Request, res: Response): void => {
  const requesterId = req.headers['x-user-id'] as string | undefined;
  const requesterRole = (req.headers['x-user-role'] as string) || 'employee';
  const db = getDb();

  const s = db.prepare('SELECT * FROM rr_shoutouts WHERE id = ?').get(req.params.id) as any;
  if (!s) {
    res.status(404).json({ error: 'Shoutout not found' });
    return;
  }

  // Private shoutouts visible only to sender, recipient, or admin
  if (
    s.visibility === 'private' &&
    requesterId !== s.sender_id &&
    requesterId !== s.recipient_id &&
    requesterRole !== 'hr_admin'
  ) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const canSeeAmount =
    requesterId === s.recipient_id ||
    requesterId === s.sender_id ||
    requesterRole === 'hr_admin';

  const values = db.prepare(
    'SELECT value_id as id, value_label as label FROM rr_shoutout_values WHERE shoutout_id = ?'
  ).all(s.id) as Array<{ id: string; label: string }>;

  const reactions = db.prepare(`
    SELECT emoji, COUNT(*) as count
    FROM rr_shoutout_reactions WHERE shoutout_id = ?
    GROUP BY emoji ORDER BY count DESC
  `).all(s.id) as Array<{ emoji: string; count: number }>;

  res.json({
    id: s.id,
    senderId: s.sender_id,
    senderName: s.sender_name,
    recipientId: s.recipient_id,
    recipientName: s.recipient_name,
    message: s.message,
    visibility: s.visibility,
    source: s.source,
    giftAmountCents: canSeeAmount ? s.gift_amount_cents : undefined,
    giftStatus: s.gift_status,
    values,
    reactions,
    createdAt: s.created_at,
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/rr/shoutouts/:id — admin soft-delete (RR-025)
// ---------------------------------------------------------------------------

shoutoutRouter.delete('/:id', (req: Request, res: Response): void => {
  const adminId = req.headers['x-user-id'] as string | undefined;
  const role = (req.headers['x-user-role'] as string) || 'employee';

  if (role !== 'hr_admin') {
    res.status(403).json({ error: 'HR admin access required' });
    return;
  }

  const { reason } = req.body as { reason?: string };
  const db = getDb();

  const shoutout = db.prepare(
    'SELECT id, sender_id, recipient_id, deleted_at FROM rr_shoutouts WHERE id = ?'
  ).get(req.params.id) as { id: string; sender_id: string; recipient_id: string; deleted_at: string | null } | undefined;

  if (!shoutout) {
    res.status(404).json({ error: 'Shoutout not found' });
    return;
  }
  if (shoutout.deleted_at) {
    res.status(409).json({ error: 'Already deleted' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE rr_shoutouts
    SET deleted_at = ?, deleted_by_admin_id = ?, deleted_reason = ?
    WHERE id = ?
  `).run(now, adminId ?? 'unknown', reason ?? null, req.params.id);

  writeAuditLog({
    actorId: adminId ?? 'unknown',
    actorRole: 'hr_admin',
    action: 'shoutout_deleted',
    entityType: 'shoutout',
    entityId: String(req.params.id),
    details: { reason: reason ?? null, senderId: shoutout.sender_id, recipientId: shoutout.recipient_id },
  });

  res.json({ ok: true, deletedAt: now });
});

// ---------------------------------------------------------------------------
// POST /api/rr/shoutouts/:id/reactions — add / toggle emoji reaction
// ---------------------------------------------------------------------------

shoutoutRouter.post('/:id/reactions', (req: Request, res: Response): void => {
  const reactorId = req.headers['x-user-id'] as string | undefined;
  if (!reactorId) {
    res.status(401).json({ error: 'Missing x-user-id header' });
    return;
  }

  const { emoji } = req.body as { emoji?: string };
  if (!emoji || !ALLOWED_REACTIONS.includes(emoji)) {
    res.status(400).json({ error: 'Invalid emoji', allowed: ALLOWED_REACTIONS });
    return;
  }

  const db = getDb();
  const shoutout = db.prepare('SELECT id FROM rr_shoutouts WHERE id = ?').get(req.params.id);
  if (!shoutout) {
    res.status(404).json({ error: 'Shoutout not found' });
    return;
  }

  const reactor = STUB_EMPLOYEES.find(e => e.id === reactorId);
  const reactorName = reactor
    ? `${reactor.firstName} ${reactor.lastName}`
    : reactorId;

  const existing = db.prepare(
    'SELECT id FROM rr_shoutout_reactions WHERE shoutout_id = ? AND reactor_id = ? AND emoji = ?'
  ).get(req.params.id, reactorId, emoji);

  let action: 'added' | 'removed';
  if (existing) {
    db.prepare(
      'DELETE FROM rr_shoutout_reactions WHERE shoutout_id = ? AND reactor_id = ? AND emoji = ?'
    ).run(req.params.id, reactorId, emoji);
    action = 'removed';
  } else {
    db.prepare(`
      INSERT OR IGNORE INTO rr_shoutout_reactions
        (id, shoutout_id, reactor_id, reactor_name, emoji, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), req.params.id, reactorId, reactorName, emoji, new Date().toISOString());
    action = 'added';
  }

  const reactions = db.prepare(`
    SELECT emoji, COUNT(*) as count
    FROM rr_shoutout_reactions WHERE shoutout_id = ?
    GROUP BY emoji ORDER BY count DESC
  `).all(req.params.id) as Array<{ emoji: string; count: number }>;

  res.json({ reactions, action, emoji });
});
