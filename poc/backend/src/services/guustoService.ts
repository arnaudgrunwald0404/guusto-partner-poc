/**
 * services/guustoService.ts — Guusto gift order placement and status polling.
 *
 * API base: api-demo.guusto.io (sandbox)
 * Auth: Authorization: Bearer <GUUSTO_BEARER_TOKEN>
 *       X-Workspace-id: <GUUSTO_WORKSPACE_ID>
 *
 * Flow:
 *   1. placeGuustoOrder()  → POST /api/v1/orders → persists rr_orders row
 *   2. pollOrderStatus()   → GET  /api/v1/orders/status/{requestId}
 *                           every 30s, up to 40 attempts (20 min total)
 *   3. On COMPLETED  → reward_status='reward_sent'
 *      On FAILED     → reward_status='reward_failed', send failure email
 *      On timeout    → reward_status='poll_timeout'
 *
 * [ASSUMED] recipientEmail is valid Guusto field (confirm from demo response).
 * [ASSUMED] EN_CA acceptable for US recipients — locale gap documented in findings.
 * [ASSUMED] externalReference echoed back in COMPLETED response for data-join.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../db/schema.js';
import { sendFailureEmail } from './emailService.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GUUSTO_BASE_URL = process.env.GUUSTO_API_BASE_URL ?? 'https://api-demo.guusto.io';
const POLL_INTERVAL_MS = 30_000;
const MAX_POLL_ATTEMPTS = 40; // 20 minutes total

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlaceOrderParams {
  recognitionId: string;
  employeeEmail: string;
  employeeFirstName: string;
  managerEmail: string;
  recognitionMessage: string;
  amountCents: number;
}

export interface GuustoOrderResult {
  requestId: string;
  redemptionUrl: string | null;
}

type OrderStatus =
  | 'ACCEPTED'
  | 'WAITING_PROCESSING'
  | 'PROCESSING_IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED';

const TERMINAL_STATUSES: OrderStatus[] = ['COMPLETED', 'FAILED'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAuthHeaders(): Record<string, string> {
  const bearer = process.env.GUUSTO_BEARER_TOKEN;
  const workspaceId = process.env.GUUSTO_WORKSPACE_ID;

  if (!bearer || !workspaceId) {
    throw new Error('GUUSTO_BEARER_TOKEN or GUUSTO_WORKSPACE_ID not set');
  }

  return {
    'Authorization': `Bearer ${bearer}`,
    'X-Workspace-id': workspaceId,
    'Content-Type': 'application/json',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Place order
// ---------------------------------------------------------------------------

/**
 * Places a Guusto gift order and persists an rr_orders row.
 * Returns requestId + redemptionUrl (longToken) once the order is confirmed.
 * Throws on auth/network/API errors.
 *
 * API body shape confirmed against live sandbox:
 *   { currency, orderItems: [{ recipient: { email, firstName }, amount, language, message, externalReference }] }
 */
export async function placeGuustoOrder(params: PlaceOrderParams): Promise<GuustoOrderResult> {
  const { recognitionId, employeeEmail, employeeFirstName, recognitionMessage, amountCents } = params;

  const headers = getAuthHeaders(); // throws if creds missing

  const ccGiftId = randomUUID();
  const currency = 'USD';
  const language = 'EN_CA';

  const body = {
    currency,
    orderItems: [
      {
        recipient: {
          email: employeeEmail,
          firstName: employeeFirstName,
        },
        amount: amountCents / 100,
        language,
        message: recognitionMessage,
        externalReference: ccGiftId,
      },
    ],
  };

  console.log(`[guusto] Placing order for recognition ${recognitionId} to ${employeeEmail}`);

  const res = await fetch(`${GUUSTO_BASE_URL}/api/v1/orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  const responseText = await res.text();
  console.log(`[guusto] POST /api/v1/orders → ${res.status}: ${responseText.slice(0, 300)}`);

  if (!res.ok) {
    throw new Error(`Guusto order failed: ${res.status} ${responseText}`);
  }

  const data = JSON.parse(responseText) as { requestId?: string; id?: string };
  const requestId = data.requestId ?? data.id;
  if (!requestId) {
    throw new Error(`Guusto response missing requestId: ${responseText}`);
  }

  // Persist order row (redemption_url filled in after polling completes)
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO rr_orders (
      id, recognition_id, guusto_request_id, cc_gift_id,
      status, employee_email, amount_cents, currency, created_at
    ) VALUES (?, ?, ?, ?, 'ACCEPTED', ?, ?, ?, ?)
  `).run(randomUUID(), recognitionId, requestId, ccGiftId, employeeEmail, amountCents, currency, now);

  db.prepare("UPDATE rr_recognitions SET reward_status='reward_sending' WHERE id=?")
    .run(recognitionId);

  console.log(`[guusto] Order placed. requestId=${requestId} cc_gift_id=${ccGiftId}`);
  return { requestId, redemptionUrl: null };
}

/**
 * Returns the stored redemption URL (longToken) for an order, or null if not yet available.
 * Used by the gift-link endpoint so recipients can redeem without checking their email.
 */
export function getRedemptionUrl(recognitionId: string): string | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT redemption_url FROM rr_orders WHERE recognition_id = ? AND redemption_url IS NOT NULL ORDER BY created_at DESC LIMIT 1'
  ).get(recognitionId) as { redemption_url: string } | undefined;
  return row?.redemption_url ?? null;
}

// ---------------------------------------------------------------------------
// Poll order status
// ---------------------------------------------------------------------------

/**
 * Polls Guusto for order completion. Fire-and-forget from approval handler.
 * Updates rr_orders + rr_recognitions with final status.
 */
export async function pollOrderStatus(
  requestId: string,
  recognitionId: string,
  employeeFirstName: string,
  managerEmail: string
): Promise<void> {
  const db = getDb();
  let attempts = 0;

  while (attempts < MAX_POLL_ATTEMPTS) {
    await sleep(POLL_INTERVAL_MS);
    attempts++;

    let status: OrderStatus | null = null;
    try {
      const headers = getAuthHeaders();
      const res = await fetch(
        `${GUUSTO_BASE_URL}/api/v1/orders/status/${encodeURIComponent(requestId)}`,
        { headers, signal: AbortSignal.timeout(10_000) }
      );

      const text = await res.text();
      console.log(`[guusto] Poll ${attempts}/${MAX_POLL_ATTEMPTS} → ${res.status}: ${text.slice(0, 200)}`);

      if (res.ok) {
        const data = JSON.parse(text) as { requestStatus?: string; status?: string };
        status = (data.requestStatus ?? data.status ?? null) as OrderStatus | null;
      }
    } catch (err) {
      console.warn(`[guusto] Poll attempt ${attempts} failed:`, err);
      continue;
    }

    if (!status) continue;

    // Update rr_orders with latest status
    db.prepare('UPDATE rr_orders SET status=?, last_polled_at=? WHERE guusto_request_id=?')
      .run(status, new Date().toISOString(), requestId);

    if (!TERMINAL_STATUSES.includes(status)) continue; // keep polling

    // Terminal state reached
    if (status === 'COMPLETED') {
      db.prepare("UPDATE rr_recognitions SET reward_status='reward_sent' WHERE id=?")
        .run(recognitionId);
      console.log(`[guusto] ✓ Order ${requestId} COMPLETED — reward sent to employee`);

      // Fetch full order detail to capture the redemption URL (longToken)
      void captureRedemptionUrl(requestId);
    } else {
      db.prepare("UPDATE rr_recognitions SET reward_status='reward_failed' WHERE id=?")
        .run(recognitionId);
      console.error(`[guusto] ✗ Order ${requestId} FAILED`);

      // Notify manager
      try {
        await sendFailureEmail({ managerEmail, employeeFirstName });
      } catch (emailErr) {
        console.error('[guusto] Failed to send failure email:', emailErr);
      }
    }
    return;
  }

  // Timeout
  db.prepare("UPDATE rr_orders SET status='poll_timeout' WHERE guusto_request_id=?")
    .run(requestId);
  db.prepare("UPDATE rr_recognitions SET reward_status='poll_timeout' WHERE id=?")
    .run(recognitionId);
  console.error(`[guusto] Poll timeout after ${MAX_POLL_ATTEMPTS} attempts for ${requestId}`);
}

// ---------------------------------------------------------------------------
// Fetch completed order detail — capture redemption URL (longToken)
// ---------------------------------------------------------------------------

/**
 * After an order reaches COMPLETED, fetches the full order detail to extract
 * the JWT-signed redemption URL (longToken) from certificates[0].longToken.
 * This URL IS the SSO token — recipients click it to authenticate and redeem
 * their gift without a separate Guusto account/login.
 *
 * NOTE: Guusto's CSP frame-ancestors does not include *.clearcompany.com, so
 * iFrame embedding requires Guusto to add CC to their allowlist (commercial ask).
 * Until then, the redemption URL opens in a new tab.
 */
async function captureRedemptionUrl(requestId: string): Promise<void> {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(
      `${GUUSTO_BASE_URL}/api/v1/orders/${encodeURIComponent(requestId)}`,
      { headers, signal: AbortSignal.timeout(10_000) }
    );
    const text = await res.text();
    const db = getDb();

    const order = db.prepare('SELECT id, cc_gift_id FROM rr_orders WHERE guusto_request_id=?')
      .get(requestId) as { id: string; cc_gift_id: string } | undefined;
    if (!order) return;

    type OrderDetail = {
      certificates?: Array<{ longToken?: string; shortToken?: string }>;
    };
    const detail = JSON.parse(text) as OrderDetail;
    const certificate = detail.certificates?.[0];
    const longToken = certificate?.longToken ?? null;
    const echoedBack = text.includes(order.cc_gift_id);

    db.prepare(
      'UPDATE rr_orders SET redemption_url=?, external_ref_verified=? WHERE guusto_request_id=?'
    ).run(longToken, echoedBack ? 1 : 0, requestId);

    if (longToken) {
      console.log(`[guusto] ✓ Redemption URL captured for order ${requestId}`);
      console.log(`[guusto]   ${longToken.slice(0, 80)}...`);
    } else {
      console.warn(`[guusto] ⚠ No longToken in order detail. Full response: ${text.slice(0, 300)}`);
    }
  } catch (err) {
    console.warn('[guusto] captureRedemptionUrl failed:', err);
  }
}
