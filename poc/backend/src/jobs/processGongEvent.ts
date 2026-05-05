/**
 * jobs/processGongEvent.ts — Async pipeline: classify → resolve → persist.
 *
 * This function is called fire-and-forget from the webhook handler so that
 * Gong's 200 ACK is returned before any AI processing happens.
 *
 * Pipeline:
 * 1. Load gong_event row from DB.
 * 2. Extract transcript text from payload.
 * 3. Call Claude classifier (retry once on retryable error after 60s).
 * 4. If below_threshold / no_employee_identified → update status, stop.
 * 5. Call employee resolver.
 * 6. If not_found / ambiguous → update status, stop.
 * 7. Write rr_classifications row (status='resolved').
 * 8. Write rr_recognitions row (reward_status='pending').
 * 9. Update gong_event status='classified'.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../db/schema.js';
import { classifyTranscript } from '../services/classifier.js';
import { resolveEmployee, STUB_EMPLOYEES } from '../services/employeeResolver.js';
import { createApprovalToken, createIdentifyToken } from '../services/approvalService.js';
import { sendApprovalEmail, sendIdentifyEmail } from '../services/emailService.js';
import {
  ClassifierError,
  ClassificationToolResult,
  GongWebhookPayload,
} from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetches the full transcript from Gong's API for a given call ID.
 * Requires GONG_ACCESS_KEY and GONG_ACCESS_SECRET env vars.
 *
 * Gong transcript endpoint:
 *   GET https://us-36811.api.gong.io/v2/calls/transcript?callIds=<id>
 * Auth: Basic base64(accessKey:accessSecret)
 *
 * Returns the transcript as a flat string, or null if unavailable.
 */
async function fetchGongTranscript(callId: string): Promise<string | null> {
  const accessKey = process.env.GONG_ACCESS_KEY;
  const accessSecret = process.env.GONG_ACCESS_SECRET;
  const baseUrl = process.env.GONG_API_BASE_URL ?? 'https://us-36811.api.gong.io';

  if (!accessKey || !accessSecret) {
    console.warn('[fetchGongTranscript] GONG_ACCESS_KEY / GONG_ACCESS_SECRET not set — cannot fetch transcript');
    return null;
  }

  const credentials = Buffer.from(`${accessKey}:${accessSecret}`).toString('base64');

  try {
    // Gong transcript API uses POST with JSON body, not GET with query param
    const res = await fetch(
      `${baseUrl}/v2/calls/transcript`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filter: { callIds: [callId] } }),
        signal: AbortSignal.timeout(15_000),
      }
    );

    if (!res.ok) {
      console.warn(`[fetchGongTranscript] Gong API returned ${res.status} for call ${callId}`);
      return null;
    }

    // Gong transcript response: { callTranscripts: [{ callId, transcript: [{ speakerId, sentences: [{ start, end, text }] }] }] }
    const data = await res.json() as {
      callTranscripts?: Array<{
        callId: string;
        transcript?: Array<{ sentences?: Array<{ text: string }> }>;
      }>;
    };

    const callTranscript = data.callTranscripts?.[0];
    if (!callTranscript?.transcript) return null;

    // Flatten: join all sentences from all speakers into one block of text
    const text = callTranscript.transcript
      .flatMap(t => t.sentences ?? [])
      .map(s => s.text)
      .join(' ')
      .trim();

    return text.length > 0 ? text : null;
  } catch (err) {
    console.error(`[fetchGongTranscript] Error fetching transcript for ${callId}:`, err);
    return null;
  }
}

/** Extracts the text to classify from a Gong payload, fetching from API if needed. */
async function extractTranscriptText(payload: GongWebhookPayload): Promise<string> {
  // Prefer inline transcript (manual/test payloads)
  if (payload.transcript && payload.transcript.trim().length > 0) {
    return payload.transcript;
  }
  if (payload.snippets && payload.snippets.length > 0) {
    return payload.snippets.map((s) => s.text).join('\n');
  }

  // Real Gong rules webhook — no transcript inline, must fetch via API
  console.log(`[extractTranscript] No inline transcript for call ${payload.callId} — fetching from Gong API`);
  const fetched = await fetchGongTranscript(payload.callId);
  if (fetched) {
    console.log(`[extractTranscript] Fetched ${fetched.length} chars for call ${payload.callId}`);
    return fetched;
  }

  return '';
}

/** Update a gong_event row's status. */
function updateEventStatus(eventId: string, status: string): void {
  const db = getDb();
  db.prepare('UPDATE gong_events SET status = ? WHERE id = ?').run(
    status,
    eventId
  );
}

/** Sleep for a given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Processes a single Gong event through the R&R pipeline.
 * Designed to be called fire-and-forget (do NOT await in the webhook handler).
 */
export async function processGongEvent(eventId: string): Promise<void> {
  const db = getDb();

  // 1. Load the event
  const row = db
    .prepare('SELECT * FROM gong_events WHERE id = ?')
    .get(eventId) as
    | { id: string; call_id: string; payload: string; status: string; call_url: string | null; call_title: string | null }
    | undefined;

  if (!row) {
    console.error(`[processGongEvent] Event not found: ${eventId}`);
    return;
  }

  let payload: GongWebhookPayload;
  try {
    const raw = JSON.parse(row.payload) as Record<string, unknown>;
    // Re-normalise: the DB stores the raw Gong payload; callId lives at
    // callData.metaData.id in real webhook shape. Use row.call_id as the
    // authoritative ID (always stored correctly by the webhook handler).
    const inline = raw as unknown as GongWebhookPayload;
    payload = {
      ...inline,
      callId: inline.callId ?? row.call_id,     // row.call_id is always correct
      callUrl: inline.callUrl ?? row.call_url ?? undefined,
      callTitle: inline.callTitle ?? row.call_title ?? undefined,
    };
  } catch {
    console.error(`[processGongEvent] Could not parse payload for ${eventId}`);
    updateEventStatus(eventId, 'failed');
    return;
  }

  // 2. Extract transcript text (may require async Gong API fetch)
  const transcriptText = await extractTranscriptText(payload);
  if (!transcriptText) {
    console.warn(`[processGongEvent] No transcript content for ${eventId}`);
    updateEventStatus(eventId, 'no_transcript');
    return;
  }

  // 3. Classify (with one retry on retryable error)
  let classifyResult: Awaited<ReturnType<typeof classifyTranscript>>;

  try {
    classifyResult = await classifyTranscript(transcriptText);
  } catch (err) {
    if (err instanceof ClassifierError && err.retryable) {
      console.warn(
        `[processGongEvent] Classifier retryable error for ${eventId}, retrying in 60s: ${err.message}`
      );
      await sleep(60_000);
      try {
        classifyResult = await classifyTranscript(transcriptText);
      } catch (retryErr) {
        console.error(
          `[processGongEvent] Classifier failed after retry for ${eventId}:`,
          retryErr
        );
        updateEventStatus(eventId, 'failed');
        return;
      }
    } else {
      console.error(
        `[processGongEvent] Non-retryable classifier error for ${eventId}:`,
        err
      );
      updateEventStatus(eventId, 'failed');
      return;
    }
  }

  // 4. Handle below-threshold / no employee
  if (classifyResult.result === 'below_threshold') {
    console.log(
      `[processGongEvent] Below threshold for ${eventId}: ${classifyResult.reasoning}`
    );
    updateEventStatus(eventId, 'below_threshold');
    return;
  }

  if (classifyResult.result === 'no_employee_identified') {
    console.log(
      `[processGongEvent] No employee identified for ${eventId}: ${classifyResult.reasoning}`
    );
    updateEventStatus(eventId, 'no_employee_identified');
    return;
  }

  // We have a full classification
  const classData: ClassificationToolResult = classifyResult.data;

  // 5. Resolve employee
  const resolverResult = resolveEmployee(
    classData.employee_name_mentioned ?? ''
  );

  if (resolverResult.result === 'not_found' || resolverResult.result === 'ambiguous') {
    const candidates = resolverResult.result === 'ambiguous'
      ? resolverResult.candidates
      : STUB_EMPLOYEES; // show all employees when completely unrecognised

    if (resolverResult.result === 'ambiguous') {
      const names = candidates.map((c) => `${c.firstName} ${c.lastName}`).join(', ');
      console.warn(`[processGongEvent] Ambiguous name "${classData.employee_name_mentioned}" matched: ${names} (event ${eventId})`);
    } else {
      console.warn(`[processGongEvent] Employee not found for name "${classData.employee_name_mentioned}" (event ${eventId}) — sending identify email`);
    }

    // Persist classification so we have the evidence when manager responds
    const classificationId = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO rr_classifications (
        id, gong_event_id, is_exceptional, confidence,
        employee_name_mentioned, evidence_quote, sentiment_magnitude,
        recognition_draft, reasoning, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'needs_employee_review', ?)
    `).run(
      classificationId, eventId,
      classData.is_exceptional_praise ? 1 : 0,
      classData.confidence,
      classData.employee_name_mentioned,
      classData.evidence_quote,
      classData.sentiment_magnitude,
      classData.recognition_draft,
      classData.reasoning,
      now
    );

    // Create identify token and send manager email
    try {
      const { token } = createIdentifyToken(classificationId);
      const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3001';
      const managerEmail = process.env.MANAGER_EMAIL ?? 'manager@demo.com';

      await sendIdentifyEmail({
        managerEmail,
        detectedName: classData.employee_name_mentioned ?? 'someone',
        evidenceQuote: classData.evidence_quote ?? '',
        callTitle: payload.callTitle,
        callUrl: payload.callUrl,
        candidates,
        baseUrl,
        token,
      });

      console.log(`[processGongEvent] Identify email sent for classification ${classificationId}`);
    } catch (emailErr) {
      console.error(`[processGongEvent] Failed to send identify email for ${classificationId}:`, emailErr);
    }

    updateEventStatus(eventId, 'needs_employee_review');
    return;
  }

  // Exactly one match
  const { employee } = resolverResult;

  // 6. Persist classification row
  const classificationId = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO rr_classifications (
      id, gong_event_id, is_exceptional, confidence,
      employee_name_mentioned, evidence_quote, sentiment_magnitude,
      recognition_draft, reasoning, status,
      employee_id, manager_id, manager_email, manager_first_name,
      employee_email, employee_first_name, employee_last_name, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, 'resolved',
      ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    classificationId,
    eventId,
    classData.is_exceptional_praise ? 1 : 0,
    classData.confidence,
    classData.employee_name_mentioned,
    classData.evidence_quote,
    classData.sentiment_magnitude,
    classData.recognition_draft,
    classData.reasoning,
    employee.id,
    employee.managerId,
    employee.managerEmail,
    employee.managerFirstName,
    employee.email,
    employee.firstName,
    employee.lastName,
    now
  );

  // 7. Persist recognition row (optimistic — reward_status starts as 'pending')
  const recognitionId = randomUUID();

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
    classData.evidence_quote,
    classData.recognition_draft,
    now
  );

  // 8. Send manager approval email
  try {
    const { token } = createApprovalToken(recognitionId);
    const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3001';
    const managerEmail = process.env.MANAGER_EMAIL ?? employee.managerEmail;

    await sendApprovalEmail({
      employeeFirstName: employee.firstName,
      employeeLastName: employee.lastName,
      managerEmail,
      evidenceQuote: classData.evidence_quote ?? '',
      recognitionDraft: classData.recognition_draft ?? '',
      callTitle: payload.callTitle,
      callUrl: payload.callUrl,
      approveUrl: `${baseUrl}/api/rr/approve?token=${token}`,
      editUrl: `${baseUrl}/api/rr/approve?token=${token}&edit=1`,
      dismissUrl: `${baseUrl}/api/rr/dismiss?token=${token}`,
    });

    console.log(
      `[processGongEvent] Approval email sent for recognition ${recognitionId} to ${managerEmail}`
    );
  } catch (emailErr) {
    // Non-fatal: log but don't fail the pipeline — recognition row is already written
    console.error(
      `[processGongEvent] Failed to send approval email for recognition ${recognitionId}:`,
      emailErr
    );
  }

  // 9. Mark event as classified
  updateEventStatus(eventId, 'classified');

  console.log(
    `[processGongEvent] Pipeline complete for event ${eventId}. ` +
      `Employee: ${employee.firstName} ${employee.lastName} (${employee.id}). ` +
      `Classification: ${classificationId}. Recognition: ${recognitionId}.`
  );
}
