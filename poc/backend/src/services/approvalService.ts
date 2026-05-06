/**
 * services/approvalService.ts — Manager approval token lifecycle.
 *
 * Tokens are HMAC-SHA256 based:
 *   - raw token  = 32 random bytes (hex) — sent in email URLs
 *   - token_hash = SHA256(token)         — stored in DB (never store raw token)
 *
 * TTL: 48 hours from creation.
 */

import { randomBytes, createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { sqlGet, sqlRun } from '../db/pg.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateApprovalTokenResult {
  token: string;
  tokenHash: string;
  expiresAt: string; // ISO 8601
}

export type ValidateTokenResult =
  | { valid: true; recognition_id: string }
  | { valid: false; reason: 'not_found' | 'expired' | 'already_decided'; already_decided?: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a new approval token row for the given recognition.
 * Returns the raw token (for the email URL) and its hash (stored in DB).
 */
export async function createApprovalToken(recognitionId: string): Promise<CreateApprovalTokenResult> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = sha256hex(token);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const id = randomUUID();

  await sqlRun(`
    INSERT INTO rr_approvals (id, recognition_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `, [id, recognitionId, tokenHash, expiresAt]);

  return { token, tokenHash, expiresAt };
}

/**
 * Validates an incoming token from an email CTA link.
 *
 * Returns:
 *   { valid: true, recognition_id }  — proceed to record decision
 *   { valid: false, reason: 'not_found' }        — no row, or bad token
 *   { valid: false, reason: 'expired' }           — past 48h TTL
 *   { valid: false, reason: 'already_decided', already_decided: 'approved'|'dismissed' }
 */
export async function validateToken(token: string): Promise<ValidateTokenResult> {
  const tokenHash = sha256hex(token);

  const row = await sqlGet<{ recognition_id: string; expires_at: string; decided_at: string | null; decision: string | null }>(
    'SELECT * FROM rr_approvals WHERE token_hash = ?',
    [tokenHash]
  );

  if (!row) {
    return { valid: false, reason: 'not_found' };
  }

  if (row.decided_at !== null && row.decision !== null) {
    return { valid: false, reason: 'already_decided', already_decided: row.decision };
  }

  if (new Date(row.expires_at) < new Date()) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, recognition_id: row.recognition_id };
}

// ---------------------------------------------------------------------------
// Identify tokens — created when employee_not_found; let manager name rewardee
// ---------------------------------------------------------------------------

export interface CreateIdentifyTokenResult {
  token: string;
  tokenHash: string;
  expiresAt: string;
}

export type ValidateIdentifyTokenResult =
  | { valid: true; classification_id: string }
  | { valid: false; reason: 'not_found' | 'expired' | 'already_used' };

/**
 * Creates an identify token tied to a classification.
 * Manager uses it to select which employee to recognise.
 */
export async function createIdentifyToken(classificationId: string): Promise<CreateIdentifyTokenResult> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = sha256hex(token);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const id = randomUUID();

  await sqlRun(`
    INSERT INTO rr_identify_tokens (id, classification_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `, [id, classificationId, tokenHash, expiresAt]);

  return { token, tokenHash, expiresAt };
}

/**
 * Validates and looks up an identify token. Returns classification_id on success.
 */
export async function validateIdentifyToken(token: string): Promise<{ valid: true; classification_id: string } | { valid: false; reason: 'not_found' | 'expired' | 'already_used' }> {
  const tokenHash = sha256hex(token);

  const row = await sqlGet<{ classification_id: string; expires_at: string; used_at: string | null }>(
    'SELECT * FROM rr_identify_tokens WHERE token_hash = ?',
    [tokenHash]
  );

  if (!row) return { valid: false, reason: 'not_found' };
  if (row.used_at) return { valid: false, reason: 'already_used' };
  if (new Date(row.expires_at) < new Date()) return { valid: false, reason: 'expired' };

  return { valid: true, classification_id: row.classification_id };
}

/**
 * Marks an identify token as used (one-shot).
 */
export async function consumeIdentifyToken(token: string): Promise<void> {
  const tokenHash = sha256hex(token);
  await sqlRun(
    'UPDATE rr_identify_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL',
    [new Date().toISOString(), tokenHash]
  );
}

/**
 * Records a manager's decision on an approval token.
 * Idempotent — silently no-ops if decision already recorded (first write wins).
 */
export async function recordDecision(
  tokenHash: string,
  decision: 'approved' | 'dismissed'
): Promise<void> {
  const now = new Date().toISOString();

  // Only update if not yet decided (first write wins)
  await sqlRun(`
    UPDATE rr_approvals
    SET decided_at = ?, decision = ?
    WHERE token_hash = ? AND decided_at IS NULL
  `, [now, decision, tokenHash]);
}
