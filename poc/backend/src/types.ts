/**
 * types.ts — Shared TypeScript types for the R&R POC backend.
 */

// ---------------------------------------------------------------------------
// Gong webhook payload
// ---------------------------------------------------------------------------

export interface GongSnippet {
  text: string;
  speakerType: 'customer' | 'agent' | string;
}

export interface GongWebhookPayload {
  callId: string;
  workspaceId: string;
  callTitle?: string;
  callUrl?: string;
  transcript?: string;
  snippets?: GongSnippet[];
  _raw?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Database row shapes (Gong pipeline — existing)
// ---------------------------------------------------------------------------

export interface GongEventRow {
  id: string;
  call_id: string;
  received_at: string;
  payload: string;
  status: string;
}

export interface ClassificationRow {
  id: string;
  gong_event_id: string;
  is_exceptional: number | null;
  confidence: number | null;
  employee_name_mentioned: string | null;
  evidence_quote: string | null;
  sentiment_magnitude: string | null;
  recognition_draft: string | null;
  reasoning: string | null;
  status: string;
  employee_id: string | null;
  manager_id: string | null;
  manager_email: string | null;
  manager_first_name: string | null;
  employee_email: string | null;
  employee_first_name: string | null;
  created_at: string;
}

export interface RecognitionRow {
  id: string;
  classification_id: string;
  employee_id: string;
  employee_first_name: string | null;
  manager_id: string | null;
  evidence_quote: string | null;
  recognition_message: string | null;
  reward_amount_cents: number;
  reward_status: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Classifier types
// ---------------------------------------------------------------------------

export interface ClassificationToolResult {
  is_exceptional_praise: boolean;
  confidence: number;
  employee_name_mentioned: string | null;
  evidence_quote: string | null;
  sentiment_magnitude: 'very_high' | 'high' | 'moderate' | 'low';
  recognition_draft: string | null;
  reasoning: string;
}

export type ClassificationResult =
  | { result: 'classified'; data: ClassificationToolResult }
  | { result: 'below_threshold'; reasoning: string }
  | { result: 'no_employee_identified'; reasoning: string };

export class ClassifierError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'ClassifierError';
    this.retryable = retryable;
  }
}

// ---------------------------------------------------------------------------
// Employee resolver types
// ---------------------------------------------------------------------------

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  managerId: string;
  managerEmail: string;
  managerFirstName: string;
}

export type ResolverResult =
  | { result: 'resolved'; employee: Employee }
  | { result: 'not_found' }
  | { result: 'ambiguous'; candidates: Employee[] };

// ---------------------------------------------------------------------------
// R&R module types (Phase 1+)
// ---------------------------------------------------------------------------

export type ShoutoutVisibility = 'company' | 'team' | 'private';
export type ShoutoutSource = 'direct' | 'gong' | 'slack';
export type GiftStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'redeemed';
export type BudgetEntryType = 'allocation' | 'debit' | 'rollback' | 'expiry';
export type UserRole = 'employee' | 'manager' | 'hr_admin';

export interface CompanyValue {
  id: string;
  tenantId: string;
  label: string;
  emoji: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface ShoutoutRow {
  id: string;
  sender_id: string;
  sender_name: string;
  recipient_id: string;
  recipient_name: string;
  recipient_email: string;
  message: string;
  visibility: ShoutoutVisibility;
  source: ShoutoutSource;
  gift_amount_cents: number | null;
  gift_status: GiftStatus | null;
  guusto_request_id: string | null;
  cc_gift_id: string | null;
  created_at: string;
}

export interface ShoutoutValueRow {
  shoutout_id: string;
  value_id: string;
  value_label: string;
}

export interface ReactionRow {
  id: string;
  shoutout_id: string;
  reactor_id: string;
  reactor_name: string;
  emoji: string;
  created_at: string;
}

export interface BudgetLedgerRow {
  id: string;
  manager_id: string;
  amount_cents: number;
  entry_type: BudgetEntryType;
  reference_id: string | null;
  created_by: string | null;
  note: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  actor_id: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string; // JSON
  created_at: string;
}

export interface TenantConfigRow {
  key: string;
  value: string;
  updated_by: string | null;
  updated_at: string;
}

// Enriched shoutout returned by API responses
export interface ShoutoutResponse {
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
  values: Array<{ id: string; label: string; emoji?: string }>;
  reactions: Array<{ emoji: string; count: number }>;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
