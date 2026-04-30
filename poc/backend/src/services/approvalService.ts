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
import { getDb } from '../db/schema.js';

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
export function createApprovalToken(recognitionId: string): CreateApprovalTokenResult {
  const db = getDb();

  const token = randomBytes(32).toString('hex');
  const tokenHash = sha256hex(token);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const id = randomUUID();

  db.prepare(`
    INSERT INTO rr_approvals (id, recognition_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(id, recognitionId, tokenHash, expiresAt);

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
export function validateToken(token: string): ValidateTokenResult {
  const db = getDb();
  const tokenHash = sha256hex(token);

  const row = db
    .prepare('SELECT * FROM rr_approvals WHERE token_hash = ?')
    .get(tokenHash) as
    | { recognition_id: string; expires_at: string; decided_at: string | null; decision: string | null }
    | undefined;

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
export function createIdentifyToken(classificationId: string): CreateIdentifyTokenResult {
  const db = getDb();
  const token = randomBytes(32).toString('hex');
  const tokenHash = sha256hex(token);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const id = randomUUID();

  db.prepare(`
    INSERT INTO rr_identify_tokens (id, classification_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(id, classificationId, tokenHash, expiresAt);

  return { token, tokenHash, expiresAt };
}

/**
 * Validates and looks up an identify token. Returns classification_id on success.
 */
export function validateIdentifyToken(token: string): { valid: true; classification_id: string } | { valid: false; reason: 'not_found' | 'expired' | 'already_used' } {
  const db = getDb();
  const tokenHash = sha256hex(token);

  const row = db
    .prepare('SELECT * FROM rr_identify_tokens WHERE token_hash = ?')
    .get(tokenHash) as
    | { classification_id: string; expires_at: string; used_at: string | null }
    | undefined;

  if (!row) return { valid: false, reason: 'not_found' };
  if (row.used_at) return { valid: false, reason: 'already_used' };
  if (new Date(row.expires_at) < new Date()) return { valid: false, reason: 'expired' };

  return { valid: true, classification_id: row.classification_id };
}

/**
 * Marks an identify token as used (one-shot).
 */
export function consumeIdentifyToken(token: string): void {
  const db = getDb();
  const tokenHash = sha256hex(token);
  db.prepare('UPDATE rr_identify_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL')
    .run(new Date().toISOString(), tokenHash);
}

/**
 * Records a manager's decision on an approval token.
 * Idempotent — silently no-ops if decision already recorded (first write wins).
 */
export function recordDecision(
  tokenHash: string,
  decision: 'approved' | 'dismissed'
): void {
  const db = getDb();
  const now = new Date().toISOString();

  // Only update if not yet decided (first write wins)
  db.prepare(`
    UPDATE rr_approvals
    SET decided_at = ?, decision = ?
    WHERE token_hash = ? AND decided_at IS NULL
  `).run(now, decision, tokenHash);
}
