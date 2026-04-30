/**
 * routes/gongWebhook.ts — POST /api/rr/gong-webhook
 *
 * Receives Gong call-completed webhook events (Rules-based trigger).
 *
 * Auth: Gong "URL includes key" mode — validates ?key=<secret> query param.
 * (Gong's alternative "Signed JWT header" is not used for this POC.)
 *
 * Payload: Gong's rules webhook format. We accept both:
 *   - Top-level callId (our assumed format)
 *   - metaData.callId (Gong's documented rules webhook format)
 * Full payload is logged on first receipt so we can confirm the real shape.
 *
 * Idempotency: same call_id within 5 minutes → 200, no duplicate row.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../db/schema.js';
import { processGongEvent } from '../jobs/processGongEvent.js';
import { GongWebhookPayload } from '../types.js';

export const gongWebhookRouter = Router();

// ---------------------------------------------------------------------------
// Payload normaliser
// Gong rules webhooks may nest callId under metaData — handle both shapes.
// ---------------------------------------------------------------------------

function normalisePayload(raw: Record<string, unknown>): GongWebhookPayload {
  // Shape 1: { callId, transcript, snippets } — test/manual shape
  if (typeof raw.callId === 'string') {
    return { ...raw, _raw: raw } as unknown as GongWebhookPayload;
  }

  // Shape 2 (CONFIRMED — real Gong rules webhook):
  // { callData: { metaData: { id, workspaceId, ... }, context: [...] } }
  // NOTE: Gong does NOT include the transcript in the rules webhook payload.
  // Transcript must be fetched separately via GET /v2/calls/transcript?id=<callId>
  // using a Gong API token (GONG_ACCESS_KEY + GONG_ACCESS_SECRET env vars).
  const callData = raw.callData as Record<string, unknown> | undefined;
  const meta = callData?.metaData as Record<string, unknown> | undefined;
  if (meta && typeof meta.id === 'string') {
    return {
      callId: meta.id,
      workspaceId: typeof meta.workspaceId === 'string' ? meta.workspaceId : '',
      callTitle: typeof meta.title === 'string' ? meta.title : undefined,
      callUrl: typeof meta.url === 'string' ? meta.url : undefined,
      transcript: undefined, // not in webhook — must be fetched via Gong API
      snippets: [],
      _raw: raw,
    } as GongWebhookPayload;
  }

  // Shape 3: { metaData: { callId, workspaceId } } — older assumed format
  const meta2 = raw.metaData as Record<string, unknown> | undefined;
  if (meta2 && typeof meta2.callId === 'string') {
    return {
      callId: meta2.callId,
      workspaceId: typeof meta2.workspaceId === 'string' ? meta2.workspaceId : '',
      transcript: typeof raw.transcript === 'string' ? raw.transcript : undefined,
      snippets: [],
      _raw: raw,
    } as GongWebhookPayload;
  }

  // Unknown shape — return as-is; pipeline will handle missing callId
  return { ...raw, _raw: raw } as unknown as GongWebhookPayload;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

gongWebhookRouter.post(
  '/',
  async (req: Request, res: Response): Promise<void> => {
    const secret = process.env.GONG_WEBHOOK_SECRET;

    if (!secret) {
      console.error('[gongWebhook] GONG_WEBHOOK_SECRET is not set');
      res.status(500).json({ error: 'Server misconfiguration' });
      return;
    }

    // 1. Validate ?key= query param (Gong "URL includes key" auth mode)
    const keyParam = req.query.key as string | undefined;
    if (!keyParam || keyParam !== secret) {
      console.warn('[gongWebhook] Invalid or missing key param');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody || rawBody.length === 0) {
      res.status(400).json({ error: 'Missing request body' });
      return;
    }

    // 2. Parse payload
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(rawBody.toString()) as Record<string, unknown>;
    } catch {
      res.status(400).json({ error: 'Invalid JSON payload' });
      return;
    }

    // Log full payload on every receipt so we learn Gong's real shape quickly
    console.log('[gongWebhook] Received payload:', JSON.stringify(raw, null, 2));

    const payload = normalisePayload(raw);

    if (!payload.callId) {
      console.warn('[gongWebhook] Could not extract callId from payload — unknown shape');
      res.status(400).json({ error: 'Missing callId in payload' });
      return;
    }

    const db = getDb();

    // 3. Idempotency check: same call_id in the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const existing = db
      .prepare(
        `SELECT id FROM gong_events
         WHERE call_id = ? AND received_at > ?
         LIMIT 1`
      )
      .get(payload.callId, fiveMinutesAgo);

    if (existing) {
      // Return 200 — idempotent
      res.status(200).json({ status: 'ok', duplicate: true });
      return;
    }

    // 4. Persist raw event
    const eventId = randomUUID();
    const receivedAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO gong_events (id, call_id, received_at, payload, status, call_url, call_title)
      VALUES (?, ?, ?, ?, 'pending', ?, ?)
    `).run(eventId, payload.callId, receivedAt, rawBody.toString(), payload.callUrl ?? null, payload.callTitle ?? null);

    // 5. Return 200 immediately (before any async work)
    res.status(200).json({ status: 'ok', eventId });

    // 6. Fire-and-forget pipeline — explicitly NOT awaited
    // Errors are caught inside processGongEvent; they never reach this handler
    void processGongEvent(eventId);
  }
);
