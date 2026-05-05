/**
 * services/shoutoutService.ts — Shoutout creation and Guusto gift attachment.
 *
 * The shoutout is the primary entity in the social recognition layer (Phase 1+).
 * A shoutout can optionally carry a monetary gift; when it does, budget is
 * deducted atomically before the shoutout row is written, and the Guusto
 * API call happens asynchronously after the HTTP response is returned.
 *
 * Gift failure handling:
 * - If Guusto creds are missing (dev/test): simulate delivery, mark as 'sent'.
 * - If Guusto API returns an error: mark gift_status='failed', re-credit budget
 *   via rollbackBudget(), write audit log entry.
 * - Polling for COMPLETED/FAILED uses the existing pollOrderStatus() from
 *   guustoService — it updates rr_orders; we then sync rr_shoutouts.gift_status.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../db/schema.js';
import { deductBudget, rollbackBudget } from './budgetService.js';
import { placeGuustoOrder, pollOrderStatus } from './guustoService.js';
import { sendRecognitionNotificationEmail } from './emailService.js';
import type { ShoutoutVisibility, ShoutoutSource, GiftStatus } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateShoutoutParams {
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  message: string;
  visibility: ShoutoutVisibility;
  source?: ShoutoutSource;
  valueIds: string[];
  valueLabels: string[];   // captured at write time — deactivation doesn't alter history
  giftAmountCents?: number;
}

export interface AttachGiftParams {
  shoutoutId: string;
  senderId: string;
  senderEmail: string;
  recipientEmail: string;
  recipientFirstName: string;
  recipientLastName?: string;
  amountCents: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Core: create shoutout
// ---------------------------------------------------------------------------

/**
 * Writes the shoutout and its value tags atomically.
 * If a gift is requested, deductBudget() is called first — it throws
 * InsufficientBudgetError if the manager doesn't have enough balance,
 * which lets the route handler return a 402 before anything is written.
 *
 * Returns the new shoutout ID.
 */
export function createShoutout(params: CreateShoutoutParams): string {
  const db = getDb();
  const now = new Date().toISOString();
  const shoutoutId = randomUUID();

  // Budget deduction must happen before the shoutout is written so that a
  // failed deduction (InsufficientBudgetError) leaves no partial record.
  if (params.giftAmountCents && params.giftAmountCents > 0) {
    deductBudget(params.senderId, params.giftAmountCents, shoutoutId);
  }

  db.transaction(() => {
    db.prepare(`
      INSERT INTO rr_shoutouts (
        id, sender_id, sender_name, recipient_id, recipient_name, recipient_email,
        message, visibility, source, gift_amount_cents, gift_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      shoutoutId,
      params.senderId,
      params.senderName,
      params.recipientId,
      params.recipientName,
      params.recipientEmail,
      params.message,
      params.visibility,
      params.source ?? 'direct',
      params.giftAmountCents ?? null,
      params.giftAmountCents ? 'pending' : null,
      now,
    );

    for (let i = 0; i < params.valueIds.length; i++) {
      db.prepare(`
        INSERT OR IGNORE INTO rr_shoutout_values (shoutout_id, value_id, value_label)
        VALUES (?, ?, ?)
      `).run(shoutoutId, params.valueIds[i], params.valueLabels[i]);
    }
  })();

  // Audit log for monetary sends — written after the main transaction commits
  // (intentionally outside the transaction per P0-8).
  if (params.giftAmountCents && params.giftAmountCents > 0) {
    writeAuditLog({
      actorId: params.senderId,
      actorRole: 'manager',
      action: 'gift_initiated',
      entityType: 'shoutout',
      entityId: shoutoutId,
      details: {
        recipientId: params.recipientId,
        amountCents: params.giftAmountCents,
        visibility: params.visibility,
      },
    });
  }

  return shoutoutId;
}

// ---------------------------------------------------------------------------
// Async: send recognition notification email to recipient (RR-030)
// ---------------------------------------------------------------------------

/**
 * Fire-and-forget — called after the route responds with 201.
 * Non-fatal if Resend is not configured (dev env).
 */
export async function notifyShoutoutRecipient(params: {
  shoutoutId: string;
  recipientFirstName: string;
  recipientEmail: string;
  senderName: string;
  message: string;
  valueLabels: string[];
  hasGift: boolean;
  giftAmountCents?: number;
}): Promise<void> {
  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5173';
  const profileUrl = `${baseUrl}/employee/${params.recipientEmail.split('@')[0]}`;

  try {
    await sendRecognitionNotificationEmail({
      recipientFirstName: params.recipientFirstName,
      recipientEmail: params.recipientEmail,
      senderName: params.senderName,
      message: params.message,
      valueLabels: params.valueLabels,
      profileUrl,
      hasGift: params.hasGift,
      giftAmountCents: params.giftAmountCents,
    });
  } catch (err) {
    // Non-fatal — recognition is already saved; notification failure is logged only.
    console.error('[shoutoutService] Recognition notification failed for', params.shoutoutId, err);
  }
}

// ---------------------------------------------------------------------------
// Async: attach Guusto gift after HTTP response is returned
// ---------------------------------------------------------------------------

/**
 * Places the Guusto order and starts the status poller.
 * Called fire-and-forget after the route responds with 201.
 *
 * On success: updates rr_shoutouts.gift_status to 'sending', then 'sent'
 *             once the poll loop resolves COMPLETED.
 * On failure: rolls back budget and marks gift_status='failed'.
 */
export async function attachGuustoGift(params: AttachGiftParams): Promise<void> {
  const db = getDb();

  try {
    const { requestId } = await placeGuustoOrder({
      recognitionId: params.shoutoutId,   // shoutout_id reused as the order reference
      employeeEmail: params.recipientEmail,
      employeeFirstName: params.recipientFirstName,
      employeeLastName: params.recipientLastName ?? '',
      managerEmail: params.senderEmail,
      recognitionMessage: params.message,
      amountCents: params.amountCents,
    });

    db.prepare(
      "UPDATE rr_shoutouts SET guusto_request_id = ?, gift_status = 'sending' WHERE id = ?"
    ).run(requestId, params.shoutoutId);

    // Poll for completion — updates rr_orders; we then mirror into rr_shoutouts
    pollOrderStatus(
      requestId,
      params.shoutoutId,
      params.recipientFirstName,
      params.recipientLastName ?? '',
      params.senderEmail,
    ).then(() => {
      syncGiftStatusFromOrder(requestId, params.shoutoutId, params.senderId, params.amountCents);
    }).catch(err => {
      console.error('[shoutoutService] Poll error for', params.shoutoutId, err);
      failGift(params.shoutoutId, params.senderId, params.amountCents);
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes('not set')) {
      // No Guusto credentials in env — simulate delivery so the demo works
      console.warn(`[shoutoutService] No Guusto creds — simulating delivery for ${params.shoutoutId}`);
      db.prepare("UPDATE rr_shoutouts SET gift_status = 'sent' WHERE id = ?")
        .run(params.shoutoutId);

      writeAuditLog({
        actorId: params.senderId,
        actorRole: 'manager',
        action: 'gift_simulated',
        entityType: 'shoutout',
        entityId: params.shoutoutId,
        details: { reason: 'no_guusto_creds', amountCents: params.amountCents },
      });
    } else {
      console.error('[shoutoutService] Guusto placeOrder failed:', err);
      failGift(params.shoutoutId, params.senderId, params.amountCents);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function syncGiftStatusFromOrder(
  requestId: string,
  shoutoutId: string,
  senderId: string,
  amountCents: number,
): void {
  const db = getDb();
  const order = db.prepare(
    'SELECT status FROM rr_orders WHERE guusto_request_id = ?'
  ).get(requestId) as { status: string } | undefined;

  if (order?.status === 'COMPLETED') {
    db.prepare("UPDATE rr_shoutouts SET gift_status = 'sent' WHERE id = ?")
      .run(shoutoutId);
    writeAuditLog({
      actorId: senderId,
      actorRole: 'manager',
      action: 'gift_delivered',
      entityType: 'shoutout',
      entityId: shoutoutId,
      details: { guustoRequestId: requestId },
    });
  } else if (order?.status === 'FAILED' || order?.status === 'poll_timeout') {
    failGift(shoutoutId, senderId, amountCents);
  }
}

function failGift(shoutoutId: string, senderId: string, amountCents: number): void {
  const db = getDb();
  db.prepare("UPDATE rr_shoutouts SET gift_status = 'failed' WHERE id = ?")
    .run(shoutoutId);
  rollbackBudget(senderId, amountCents, shoutoutId);
  writeAuditLog({
    actorId: senderId,
    actorRole: 'manager',
    action: 'gift_failed_budget_returned',
    entityType: 'shoutout',
    entityId: shoutoutId,
    details: { amountCents },
  });
}

// ---------------------------------------------------------------------------
// Audit log writer (used by multiple modules)
// ---------------------------------------------------------------------------

export function writeAuditLog(params: {
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO rr_audit_log
      (id, actor_id, actor_role, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    params.actorId,
    params.actorRole,
    params.action,
    params.entityType,
    params.entityId,
    JSON.stringify(params.details),
    new Date().toISOString(),
  );
}

// ---------------------------------------------------------------------------
// Read: fetch enriched shoutout feed
// ---------------------------------------------------------------------------

export interface FeedFilters {
  visibility?: string;
  recipientId?: string;
  senderId?: string;
  valueId?: string;
  page?: number;
  limit?: number;
}

export interface EnrichedShoutout {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  message: string;
  visibility: ShoutoutVisibility;
  source: ShoutoutSource;
  giftAmountCents: number | null;
  giftStatus: GiftStatus | null;
  values: Array<{ id: string; label: string }>;
  reactions: Array<{ emoji: string; count: number }>;
  createdAt: string;
}

export function getShoutoutFeed(filters: FeedFilters): {
  items: EnrichedShoutout[];
  total: number;
} {
  const db = getDb();
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(50, Math.max(1, filters.limit ?? 20));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const queryParams: unknown[] = [];

  // Default to company-wide visibility for the public feed
  if (filters.recipientId) {
    conditions.push('s.recipient_id = ?');
    queryParams.push(filters.recipientId);
  }
  if (filters.senderId) {
    conditions.push('s.sender_id = ?');
    queryParams.push(filters.senderId);
  }
  if (filters.valueId) {
    conditions.push('EXISTS (SELECT 1 FROM rr_shoutout_values sv WHERE sv.shoutout_id = s.id AND sv.value_id = ?)');
    queryParams.push(filters.valueId);
  }

  // When not filtering by user, show company-wide posts only
  if (!filters.recipientId && !filters.senderId) {
    conditions.push("s.visibility = 'company'");
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Always exclude soft-deleted shoutouts from the feed (RR-025)
  const deletedFilter = 'deleted_at IS NULL';
  const whereWithDeleted = where
    ? `${where} AND ${deletedFilter}`
    : `WHERE ${deletedFilter}`;

  const rows = db.prepare(`
    SELECT s.* FROM rr_shoutouts s ${whereWithDeleted}
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...queryParams, limit, offset) as any[];

  const countRow = db.prepare(
    `SELECT COUNT(*) as n FROM rr_shoutouts s ${whereWithDeleted}`
  ).get(...queryParams) as { n: number };

  const items: EnrichedShoutout[] = rows.map(s => {
    const values = db.prepare(
      'SELECT value_id as id, value_label as label FROM rr_shoutout_values WHERE shoutout_id = ?'
    ).all(s.id) as Array<{ id: string; label: string }>;

    const reactions = db.prepare(`
      SELECT emoji, COUNT(*) as count
      FROM rr_shoutout_reactions WHERE shoutout_id = ?
      GROUP BY emoji ORDER BY count DESC
    `).all(s.id) as Array<{ emoji: string; count: number }>;

    return {
      id: s.id,
      senderId: s.sender_id,
      senderName: s.sender_name,
      recipientId: s.recipient_id,
      recipientName: s.recipient_name,
      message: s.message,
      visibility: s.visibility,
      source: s.source,
      giftAmountCents: s.gift_amount_cents,
      giftStatus: s.gift_status,
      values,
      reactions,
      createdAt: s.created_at,
    };
  });

  return { items, total: countRow.n };
}
