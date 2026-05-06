/**
 * services/shoutoutService.ts — Shoutout creation and Guusto gift attachment.
 *
 * The shoutout is the primary entity in the social recognition layer (Phase 1+).
 * A shoutout can optionally carry a monetary gift; when it does, budget is
 * deducted before the shoutout row is written, and the Guusto
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
import { sqlAll, sqlGet, sqlRun } from '../db/pg.js';
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
 * Writes the shoutout and its value tags.
 * If a gift is requested, deductBudget() is called first — it throws
 * InsufficientBudgetError if the manager doesn't have enough balance,
 * which lets the route handler return a 402 before anything is written.
 *
 * Returns the new shoutout ID.
 */
export async function createShoutout(params: CreateShoutoutParams): Promise<string> {
  const now = new Date().toISOString();
  const shoutoutId = randomUUID();

  // Budget deduction must happen before the shoutout is written so that a
  // failed deduction (InsufficientBudgetError) leaves no partial record.
  if (params.giftAmountCents && params.giftAmountCents > 0) {
    await deductBudget(params.senderId, params.giftAmountCents, shoutoutId);
  }

  await sqlRun(`
    INSERT INTO rr_shoutouts (
      id, sender_id, sender_name, recipient_id, recipient_name, recipient_email,
      message, visibility, source, gift_amount_cents, gift_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
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
  ]);

  for (let i = 0; i < params.valueIds.length; i++) {
    await sqlRun(`
      INSERT INTO rr_shoutout_values (shoutout_id, value_id, value_label)
      VALUES (?, ?, ?)
      ON CONFLICT DO NOTHING
    `, [shoutoutId, params.valueIds[i], params.valueLabels[i]]);
  }

  // Audit log for monetary sends — written after the main inserts commit
  // (intentionally outside the transaction per P0-8).
  if (params.giftAmountCents && params.giftAmountCents > 0) {
    await writeAuditLog({
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

    await sqlRun(
      "UPDATE rr_shoutouts SET guusto_request_id = ?, gift_status = 'sending' WHERE id = ?",
      [requestId, params.shoutoutId]
    );

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
      await sqlRun(
        "UPDATE rr_shoutouts SET gift_status = 'sent' WHERE id = ?",
        [params.shoutoutId]
      );

      await writeAuditLog({
        actorId: params.senderId,
        actorRole: 'manager',
        action: 'gift_simulated',
        entityType: 'shoutout',
        entityId: params.shoutoutId,
        details: { reason: 'no_guusto_creds', amountCents: params.amountCents },
      });
    } else {
      console.error('[shoutoutService] Guusto placeOrder failed:', err);
      await failGift(params.shoutoutId, params.senderId, params.amountCents);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function syncGiftStatusFromOrder(
  requestId: string,
  shoutoutId: string,
  senderId: string,
  amountCents: number,
): Promise<void> {
  const order = await sqlGet<{ status: string }>(
    'SELECT status FROM rr_orders WHERE guusto_request_id = ?',
    [requestId]
  );

  if (order?.status === 'COMPLETED') {
    await sqlRun(
      "UPDATE rr_shoutouts SET gift_status = 'sent' WHERE id = ?",
      [shoutoutId]
    );
    await writeAuditLog({
      actorId: senderId,
      actorRole: 'manager',
      action: 'gift_delivered',
      entityType: 'shoutout',
      entityId: shoutoutId,
      details: { guustoRequestId: requestId },
    });
  } else if (order?.status === 'FAILED' || order?.status === 'poll_timeout') {
    await failGift(shoutoutId, senderId, amountCents);
  }
}

async function failGift(shoutoutId: string, senderId: string, amountCents: number): Promise<void> {
  await sqlRun(
    "UPDATE rr_shoutouts SET gift_status = 'failed' WHERE id = ?",
    [shoutoutId]
  );
  await rollbackBudget(senderId, amountCents, shoutoutId);
  await writeAuditLog({
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

export async function writeAuditLog(params: {
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
}): Promise<void> {
  await sqlRun(`
    INSERT INTO rr_audit_log
      (id, actor_id, actor_role, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    randomUUID(),
    params.actorId,
    params.actorRole,
    params.action,
    params.entityType,
    params.entityId,
    JSON.stringify(params.details),
    new Date().toISOString(),
  ]);
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

export async function getShoutoutFeed(filters: FeedFilters): Promise<{
  items: EnrichedShoutout[];
  total: number;
}> {
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

  const rows = await sqlAll<Record<string, unknown>>(`
    SELECT s.* FROM rr_shoutouts s ${whereWithDeleted}
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `, [...queryParams, limit, offset]);

  const countRow = await sqlGet<{ n: number }>(
    `SELECT COUNT(*) as n FROM rr_shoutouts s ${whereWithDeleted}`,
    queryParams
  );

  const items: EnrichedShoutout[] = await Promise.all(rows.map(async s => {
    const values = await sqlAll<{ id: string; label: string }>(
      'SELECT value_id as id, value_label as label FROM rr_shoutout_values WHERE shoutout_id = ?',
      [s['id']]
    );

    const reactions = await sqlAll<{ emoji: string; count: number }>(`
      SELECT emoji, COUNT(*) as count
      FROM rr_shoutout_reactions WHERE shoutout_id = ?
      GROUP BY emoji ORDER BY count DESC
    `, [s['id']]);

    return {
      id: s['id'] as string,
      senderId: s['sender_id'] as string,
      senderName: s['sender_name'] as string,
      recipientId: s['recipient_id'] as string,
      recipientName: s['recipient_name'] as string,
      message: s['message'] as string,
      visibility: s['visibility'] as ShoutoutVisibility,
      source: s['source'] as ShoutoutSource,
      giftAmountCents: s['gift_amount_cents'] as number | null,
      giftStatus: s['gift_status'] as GiftStatus | null,
      values,
      reactions,
      createdAt: s['created_at'] as string,
    };
  }));

  return { items, total: countRow?.n ?? 0 };
}
