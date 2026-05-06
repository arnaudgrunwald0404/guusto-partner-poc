/**
 * RecognizeDrawer — Slide-in panel for manual recognition.
 *
 * Three steps:
 *   1. Compose  — company value selector + visibility toggle + message textarea + live GiftCardPreview
 *   2. Confirm  — summary card + "Send Recognition & $25 Reward" CTA
 *   3. Success  — celebration state
 *
 * PRD-aligned (Phase 1 R&R):
 *   - Company values fetched from GET /api/rr/admin/values (admin-configured)
 *   - Message: 50–500 chars (from tenant config defaults)
 *   - Visibility: Company-wide | Team only | Private (PRD §6.1)
 *   - Posts to POST /api/rr/shoutouts (Phase 1 endpoint)
 *   - Form state preserved on 5xx — no silent data loss
 *   - Pre-send content self-moderation warning (RR-026)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GiftCardPreview } from './GiftCardPreview';
import type { EmployeeProfile, DirectReport, RecognitionRecord } from '../../data/employees';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 'compose' | 'confirm' | 'success';
type DeliveryStatus = 'delivered' | 'failed';
type Visibility = 'company' | 'team' | 'private';

interface CompanyValue {
  id: string;
  label: string;
  emoji: string;
}

interface RecognizeDrawerProps {
  /** Pre-selected recipient. When omitted, the user picks from the employees list. */
  employee?: EmployeeProfile | null;
  /** Full list of selectable employees (used when employee is not pre-selected). */
  employees?: DirectReport[];
  /** Manager's remaining budget in cents — shown in the optional reward section. */
  availableBudgetCents?: number;
  managerFirstName?: string;
  /** POC mock: the logged-in manager's employee ID, passed as x-user-id header */
  senderId?: string;
  onClose: () => void;
}

const VISIBILITY_OPTIONS: { id: Visibility; label: string; description: string }[] = [
  { id: 'company',  label: 'Company-wide', description: 'Visible to everyone' },
  { id: 'team',    label: 'Team only',    description: 'Visible to your team' },
  { id: 'private', label: 'Private',      description: 'Recipient & admins only' },
];

const AMOUNT_CENTS = 2500;
const MSG_MIN = 50;
const MSG_MAX = 500;

// ---------------------------------------------------------------------------
// Content moderation patterns (RR-026) — non-blocking self-check
// ---------------------------------------------------------------------------

const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/,            // SSN
  /\b\d{3}[.\s-]?\d{3}[.\s-]?\d{4}\b/, // phone number
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, // email address
];

const PROFANITY_LIST = ['fuck', 'shit', 'asshole', 'bitch', 'damn', 'crap', 'bastard'];

function detectContentWarning(text: string): string | null {
  const lower = text.toLowerCase();
  for (const word of PROFANITY_LIST) {
    if (lower.includes(word)) {
      return 'Your message may contain language that violates our content policy. Please review before sending.';
    }
  }
  for (const pattern of PII_PATTERNS) {
    if (pattern.test(text)) {
      return 'Your message may contain personal information (phone number, email, or SSN). Consider removing it before sharing.';
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shared style constants
// ---------------------------------------------------------------------------

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#475569',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  fontSize: 14,
  color: '#1e293b',
  background: '#fff',
  boxSizing: 'border-box',
  outline: 'none',
};

// ---------------------------------------------------------------------------
// Confetti — pure CSS/JS, no deps
// ---------------------------------------------------------------------------

function Confetti() {
  const COLORS = ['#14b8a6', '#3b82f6', '#a855f7', '#ec4899', '#f59e0b', '#22c55e'];
  const pieces = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    color: COLORS[i % COLORS.length],
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 0.8}s`,
    size: 6 + Math.random() * 6,
    rotation: Math.random() * 360,
  }));

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(160px) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {pieces.map(p => (
        <div key={p.id} style={{
          position: 'absolute',
          top: 0,
          left: p.left,
          width: p.size,
          height: p.size,
          background: p.color,
          borderRadius: 2,
          transform: `rotate(${p.rotation}deg)`,
          animation: `confettiFall 1.4s ease-in ${p.delay} forwards`,
        }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Compose
// ---------------------------------------------------------------------------

interface ComposeStepProps {
  employee: EmployeeProfile | null;
  employees: DirectReport[];
  onSelectEmployee: (e: DirectReport | null) => void;
  managerFirstName: string;
  availableBudgetCents: number;
  includeReward: boolean;
  setIncludeReward: (v: boolean) => void;
  pastRewards: RecognitionRecord[];
  companyValues: CompanyValue[];
  valuesLoading: boolean;
  valueId: string;
  setValueId: (v: string) => void;
  message: string;
  setMessage: (v: string) => void;
  visibility: Visibility;
  setVisibility: (v: Visibility) => void;
  contentWarning: string | null;
  onNext: () => void;
  onAiDraft: () => void;
  aiDrafting: boolean;
  aiDraftError: string | null;
}

function ComposeStep({
  employee,
  employees,
  onSelectEmployee,
  managerFirstName,
  availableBudgetCents,
  includeReward,
  setIncludeReward,
  pastRewards,
  companyValues,
  valuesLoading,
  valueId,
  setValueId,
  message,
  setMessage,
  visibility,
  setVisibility,
  contentWarning,
  onNext,
  onAiDraft,
  aiDrafting,
  aiDraftError,
}: ComposeStepProps) {
  const trimmed = message.trim();
  const canProceed = employee !== null && valueId !== '' && trimmed.length >= MSG_MIN;
  const remaining = MSG_MAX - message.length;
  const charsToMin = Math.max(0, MSG_MIN - trimmed.length);

  const selectedValue = companyValues.find(v => v.id === valueId);

  function formatCentsShort(cents: number) {
    return `$${(cents / 100).toFixed(0)}`;
  }

  return (
    <div style={{ display: 'flex', flex: 1, gap: 0, minHeight: 0, overflow: 'hidden' }}>
      {/* Left: form */}
      <div style={{
        flex: 1,
        padding: '24px 24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        overflowY: 'auto',
        borderRight: '1px solid #f1f5f9',
      }}>
        {/* Recipient */}
        <div>
          <label style={labelStyle}>To</label>
          {employee ? (
            /* Locked — pre-selected from employee profile */
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: employee.avatarColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, color: '#1e293b', flexShrink: 0,
              }}>
                {employee.firstName[0]}{employee.lastName[0]}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
                  {employee.firstName} {employee.lastName}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{employee.email}</div>
              </div>
            </div>
          ) : (
            /* Free-form — pick from dropdown */
            <select
              value=""
              onChange={e => {
                const found = employees.find(emp => emp.id === e.target.value) ?? null;
                onSelectEmployee(found);
              }}
              style={{
                ...inputStyle,
                color: '#94a3b8',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14L2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 12px center',
                paddingRight: 36,
              }}
            >
              <option value="">Select a team member…</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName} — {emp.title}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Past rewards to this individual */}
        {pastRewards.length > 0 && (
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
              Past rewards to {employee?.firstName}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pastRewards.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                  <span style={{ color: '#475569' }}>
                    {r.value} · {new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  {r.rewardSent && (
                    <span style={{
                      fontWeight: 600, color: '#059669',
                      background: '#f0fdf4', border: '1px solid #bbf7d0',
                      borderRadius: 12, padding: '2px 8px', fontSize: 11,
                    }}>
                      🎁 {formatCentsShort(r.rewardAmount)} sent
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Optional reward toggle */}
        <div>
          <label style={labelStyle}>Reward</label>
          <div
            onClick={() => setIncludeReward(!includeReward)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px',
              border: `1px solid ${includeReward ? '#93c5fd' : '#e2e8f0'}`,
              borderRadius: 8,
              background: includeReward ? '#eff6ff' : '#fff',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'all 0.15s',
            }}
          >
            {/* Toggle pill */}
            <div style={{
              width: 36, height: 20, borderRadius: 10,
              background: includeReward ? '#1a56db' : '#cbd5e1',
              position: 'relative', flexShrink: 0,
              transition: 'background 0.2s',
            }}>
              <div style={{
                position: 'absolute',
                top: 2, left: includeReward ? 18 : 2,
                width: 16, height: 16, borderRadius: '50%',
                background: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                transition: 'left 0.2s',
              }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
                Include a Guusto gift card reward
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                {includeReward
                  ? `$25 USD · Available budget: ${formatCentsShort(availableBudgetCents)} remaining`
                  : 'Optional — recognition is valuable on its own'}
              </div>
            </div>
          </div>

          {includeReward && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 16px',
                background: 'linear-gradient(135deg, #0f2044, #1a3a6e)',
                borderRadius: 8, color: '#fff',
              }}>
                <span style={{ fontSize: 22, fontWeight: 800 }}>$25</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>USD · Guusto Gift Card</span>
              </div>
              <div style={{
                fontSize: 12, color: '#059669', fontWeight: 600,
                background: '#f0fdf4', border: '1px solid #bbf7d0',
                borderRadius: 8, padding: '6px 10px',
              }}>
                {formatCentsShort(availableBudgetCents)} available
              </div>
            </div>
          )}
        </div>

        {/* Company value */}
        <div>
          <label style={labelStyle}>
            Company value <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select
            value={valueId}
            onChange={e => setValueId(e.target.value)}
            disabled={valuesLoading}
            style={{
              ...inputStyle,
              color: valueId ? '#1e293b' : '#94a3b8',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14L2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              paddingRight: 36,
              opacity: valuesLoading ? 0.6 : 1,
            }}
          >
            <option value="">{valuesLoading ? 'Loading values…' : 'Select a company value…'}</option>
            {companyValues.map(v => (
              <option key={v.id} value={v.id}>{v.emoji} {v.label}</option>
            ))}
          </select>
        </div>

        {/* AI draft assist button (RR-014) */}
        <div>
          <button
            type="button"
            onClick={onAiDraft}
            disabled={!valueId || aiDrafting}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 14px',
              border: '1px solid #a5b4fc',
              borderRadius: 8,
              background: aiDrafting ? '#f0f4ff' : 'linear-gradient(135deg, #eff6ff, #f5f3ff)',
              color: (!valueId || aiDrafting) ? '#94a3b8' : '#4f46e5',
              fontSize: 13, fontWeight: 600,
              cursor: (!valueId || aiDrafting) ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              width: '100%',
              justifyContent: 'center',
            }}
          >
            {aiDrafting ? (
              <>
                <span style={{
                  width: 14, height: 14, border: '2px solid #a5b4fc',
                  borderTopColor: '#4f46e5', borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite',
                  display: 'inline-block',
                }} />
                {trimmed.length > 0 ? 'Improving with AI…' : 'Drafting with AI…'}
              </>
            ) : (
              <>{trimmed.length > 0 ? '✨ Improve with AI' : '✨ Draft with AI'}</>
            )}
          </button>
          {!valueId && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 5, textAlign: 'center' }}>
              Select a company value first to enable AI drafting
            </div>
          )}
          {aiDraftError && (
            <div style={{
              fontSize: 12, color: '#dc2626', marginTop: 6, padding: '6px 10px',
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6,
            }}>
              ✗ {aiDraftError}
            </div>
          )}
        </div>

        {/* Message */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>
              Message <span style={{ color: '#ef4444' }}>*</span>
            </label>
            {/* Visibility toggle */}
            <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', borderRadius: 6, padding: 2 }}>
              {VISIBILITY_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  title={opt.description}
                  onClick={() => setVisibility(opt.id)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 4,
                    border: 'none',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: visibility === opt.id ? '#fff' : 'transparent',
                    color: visibility === opt.id ? '#1e293b' : '#94a3b8',
                    boxShadow: visibility === opt.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.1s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            maxLength={MSG_MAX}
            placeholder={`Tell ${employee?.firstName ?? 'them'} why they're being recognized… (minimum ${MSG_MIN} characters)`}
            style={{
              ...inputStyle,
              flex: 1,
              minHeight: 140,
              resize: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.6,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: charsToMin > 0 ? '#f59e0b' : '#22c55e' }}>
              {charsToMin > 0 ? `${charsToMin} more characters needed` : '✓ Minimum reached'}
            </span>
            <span style={{ fontSize: 11, color: remaining < 50 ? '#ef4444' : '#94a3b8' }}>
              {remaining} left
            </span>
          </div>
        </div>

        {/* RR-026: pre-send content warning banner */}
        {contentWarning && (
          <div style={{
            padding: '10px 14px',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 8,
            fontSize: 13,
            color: '#92400e',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}>
            <span style={{ flexShrink: 0 }}>⚠️</span>
            <span>{contentWarning}</span>
          </div>
        )}

        {/* Next CTA */}
        <button
          onClick={onNext}
          disabled={!canProceed}
          style={{
            padding: '12px 0',
            background: canProceed ? '#1a56db' : '#e2e8f0',
            color: canProceed ? '#fff' : '#94a3b8',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: canProceed ? 'pointer' : 'not-allowed',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          Preview & confirm →
        </button>
        {!canProceed && (
          <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: -12 }}>
            {!employee
              ? 'Select a recipient to continue'
              : !valueId
              ? 'Select a company value to continue'
              : `${charsToMin} more characters needed (min ${MSG_MIN})`}
          </div>
        )}
      </div>

      {/* Right: live preview */}
      <div style={{
        width: 300,
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        background: '#f8fafc',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Live preview
        </div>
        {employee && (
          <>
            <GiftCardPreview
              employeeFirstName={employee.firstName}
              managerFirstName={managerFirstName}
              reason={selectedValue ? `${selectedValue.emoji} ${selectedValue.label}` : ''}
              message={message}
              amountCents={AMOUNT_CENTS}
            />
            <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', lineHeight: 1.5 }}>
              This is what {employee.firstName} will receive by email — redeemable at 60,000+ merchants.
            </div>
          </>
        )}
        {!employee && (
          <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 1.6 }}>
            Select a recipient to see the live preview
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Confirm
// ---------------------------------------------------------------------------

interface ConfirmStepProps {
  employee: EmployeeProfile;
  managerFirstName: string;
  valueLabel: string;
  message: string;
  visibility: Visibility;
  includeReward: boolean;
  isSubmitting: boolean;
  submitError: string | null;
  onBack: () => void;
  onSubmit: () => void;
}

const VISIBILITY_LABELS: Record<Visibility, string> = {
  company: '🌐 Company-wide',
  team:    '👥 Team only',
  private: '🔒 Private',
};

function ConfirmStep({
  employee,
  managerFirstName,
  valueLabel,
  message,
  visibility,
  includeReward,
  isSubmitting,
  submitError,
  onBack,
  onSubmit,
}: ConfirmStepProps) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: '#1e293b' }}>
          Confirm recognition
        </h3>
        <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>
          Review the details below, then send. {employee.firstName} will receive an email with their gift card.
        </p>
      </div>

      {/* Summary card */}
      <div style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            Recipient
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: employee.avatarColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 700, color: '#1e293b',
            }}>
              {employee.firstName[0]}{employee.lastName[0]}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
                {employee.firstName} {employee.lastName}
              </div>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>{employee.email}</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              Company value
            </div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: '#eff6ff', color: '#1d4ed8', borderRadius: 20,
              padding: '4px 12px', fontSize: 13, fontWeight: 600,
            }}>
              {valueLabel}
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              Visibility
            </div>
            <span style={{
              fontSize: 12, fontWeight: 600, color: '#374151',
              background: '#f8fafc', padding: '3px 10px', borderRadius: 12,
              border: '1px solid #e2e8f0',
            }}>
              {VISIBILITY_LABELS[visibility]}
            </span>
          </div>
        </div>

        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Message
          </div>
          <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
            {message}
          </p>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
              Reward
            </div>
            {includeReward ? (
              <>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#1e293b' }}>$25 USD</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>Guusto Gift Card · 60,000+ merchants</div>
              </>
            ) : (
              <div style={{ fontSize: 14, color: '#64748b' }}>Recognition only (no gift card)</div>
            )}
          </div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            From: <strong>{managerFirstName}</strong>
          </div>
        </div>
      </div>

      {/* Note */}
      <div style={{
        padding: '12px 16px',
        background: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: 8,
        fontSize: 13,
        color: '#166534',
        lineHeight: 1.5,
      }}>
        💡 No approval needed — as the manager, you're authorizing this recognition directly. The reward will be sent immediately.
      </div>

      {/* Inline submit error (RR-013: preserve form state on 5xx) */}
      {submitError && (
        <div style={{
          padding: '10px 14px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 8,
          fontSize: 13,
          color: '#b91c1c',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
        }}>
          <span style={{ flexShrink: 0 }}>❌</span>
          <span>{submitError}</span>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
        <button
          onClick={onBack}
          disabled={isSubmitting}
          style={{
            flex: 1,
            padding: '12px 0',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            background: '#fff',
            color: '#374151',
            fontSize: 14,
            fontWeight: 500,
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
          }}
        >
          ← Back
        </button>
        <button
          onClick={onSubmit}
          disabled={isSubmitting}
          style={{
            flex: 2,
            padding: '12px 0',
            border: 'none',
            borderRadius: 8,
            background: isSubmitting ? '#93c5fd' : '#1a56db',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'background 0.15s',
          }}
        >
          {isSubmitting ? (
            <>
              <span style={{
                width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)',
                borderTopColor: '#fff', borderRadius: '50%',
                animation: 'spin 0.7s linear infinite',
                display: 'inline-block',
              }} />
              Sending…
            </>
          ) : (
            submitError ? 'Retry →' : includeReward ? 'Send Recognition & $25 Reward 🎁' : 'Send Recognition 🎉'
          )}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Success
// ---------------------------------------------------------------------------

interface SuccessStepProps {
  employee: EmployeeProfile;
  deliveryStatus: DeliveryStatus;
  shoutoutId: string | null;
  onClose: () => void;
}

function SuccessStep({ employee, deliveryStatus, shoutoutId, onClose }: SuccessStepProps) {
  const isFailed = deliveryStatus === 'failed';
  const [copied, setCopied] = React.useState(false);

  const publicUrl = shoutoutId
    ? `${window.location.origin}/r/${shoutoutId}`
    : null;

  const qrUrl = publicUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(publicUrl)}&bgcolor=ffffff&color=1e293b&margin=2`
    : null;

  function handleCopy() {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      overflowY: 'auto',
      padding: '40px 32px',
      textAlign: 'center',
      position: 'relative',
    }}>
      {!isFailed && <Confetti />}

      <div style={{ fontSize: 64, marginBottom: 16, lineHeight: 1 }}>
        {isFailed ? '⚠️' : '🎉'}
      </div>

      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', margin: '0 0 10px' }}>
        {isFailed ? 'Reward delivery failed' : `${employee.firstName} has been recognized!`}
      </h2>

      <p style={{ fontSize: 15, color: '#64748b', margin: '0 0 20px', lineHeight: 1.6, maxWidth: 320 }}>
        {isFailed
          ? `The recognition was recorded, but we couldn't send the Guusto reward. Please contact support.`
          : employee.isFrontline
            ? `Recognition recorded! Share this link with ${employee.firstName} — no app or login needed.`
            : `Recognition recorded and posted to the company feed. ${employee.firstName} will be notified.`}
      </p>

      <div style={{
        padding: '10px 20px',
        background: isFailed ? '#fef2f2' : '#f0fdf4',
        border: `1px solid ${isFailed ? '#fecaca' : '#bbf7d0'}`,
        borderRadius: 8, fontSize: 13,
        color: isFailed ? '#b91c1c' : '#166534',
        marginBottom: 24, maxWidth: 340,
      }}>
        {isFailed
          ? '❌ Guusto reward could not be delivered. The recognition is still recorded.'
          : '✅ Recognition posted to the company feed'}
      </div>

      {/* Frontline share section — QR code + link */}
      {!isFailed && shoutoutId && (
        <div style={{
          width: '100%', maxWidth: 360,
          background: '#f8fafc', border: '1px solid #e2e8f0',
          borderRadius: 12, padding: '20px 24px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 14 }}>
            {employee.isFrontline ? '📱 Share with frontline employee' : '🔗 Recognition link'}
          </div>

          {/* QR code */}
          {qrUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 14 }}>
              <div style={{
                padding: 8, background: '#fff',
                borderRadius: 10, border: '1px solid #e2e8f0',
                marginBottom: 8, display: 'inline-block',
              }}>
                <img
                  src={qrUrl}
                  alt="QR code for recognition"
                  width={160} height={160}
                  style={{ display: 'block', borderRadius: 6 }}
                />
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Scan to view recognition</div>
            </div>
          )}

          {/* Copy link row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              flex: 1, padding: '8px 12px',
              background: '#fff', border: '1px solid #e2e8f0',
              borderRadius: 8, fontSize: 12, color: '#64748b',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {publicUrl}
            </div>
            <button
              onClick={handleCopy}
              style={{
                padding: '8px 14px', borderRadius: 8, border: 'none',
                background: copied ? '#059669' : '#1a56db',
                color: '#fff', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', transition: 'background 0.2s', whiteSpace: 'nowrap',
              }}
            >
              {copied ? '✓' : '🔗 Copy'}
            </button>
          </div>

          {employee.isFrontline && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, lineHeight: 1.5 }}>
              Send this link to {employee.firstName} by text, print it, or show the QR code.
              No login required.
            </div>
          )}
        </div>
      )}

      <button
        onClick={onClose}
        style={{
          padding: '12px 32px',
          background: '#1a56db', color: '#fff',
          border: 'none', borderRadius: 8,
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}
      >
        Done
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main drawer
// ---------------------------------------------------------------------------

export function RecognizeDrawer({
  employee: employeeProp = null,
  employees = [],
  availableBudgetCents = 0,
  managerFirstName = 'Manager',
  senderId = 'mgr_001',
  onClose,
}: RecognizeDrawerProps) {
  const [step, setStep] = useState<Step>('compose');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfile | null>(employeeProp);
  const [valueId, setValueId] = useState('');
  const [message, setMessage] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('company');
  const [includeReward, setIncludeReward] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>('delivered');
  const [shoutoutId, setShoutoutId] = useState<string | null>(null);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [aiDraftError, setAiDraftError] = useState<string | null>(null);

  // Company values from API
  const [companyValues, setCompanyValues] = useState<CompanyValue[]>([]);
  const [valuesLoading, setValuesLoading] = useState(true);

  // Fetch company values on mount
  useEffect(() => {
    fetch('/api/rr/values')
      .then(r => r.json())
      .then((data: { values?: Array<CompanyValue & { is_active?: number }> }) => {
        if (data.values && data.values.length > 0) {
          setCompanyValues(data.values.filter(v => v.is_active !== 0));
        }
      })
      .catch(() => {
        // Fallback to hardcoded defaults if API is unreachable
        setCompanyValues([
          { id: 'val_001', label: 'Customer Focus',  emoji: '🤝' },
          { id: 'val_002', label: 'Innovation',       emoji: '💡' },
          { id: 'val_003', label: 'Team Player',      emoji: '🏆' },
          { id: 'val_004', label: 'Above & Beyond',   emoji: '🚀' },
          { id: 'val_005', label: 'Integrity',        emoji: '🛡️' },
        ]);
      })
      .finally(() => setValuesLoading(false));
  }, []);

  // Overlay click-outside handler
  const drawerRef = useRef<HTMLDivElement>(null);

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  // Keyboard: Escape closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Content warning derived from current message text
  const contentWarning = detectContentWarning(message);

  const selectedValue = companyValues.find(v => v.id === valueId);
  const valueLabel = selectedValue ? `${selectedValue.emoji} ${selectedValue.label}` : '';

  // AI draft handler (RR-014)
  const handleAiDraft = async () => {
    if (!valueId || aiDrafting) return;
    setAiDrafting(true);
    setAiDraftError(null);
    try {
      const res = await fetch('/api/rr/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientName: selectedEmployee ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}` : 'them',
          valueLabel: selectedValue ? selectedValue.label : '',
          existingDraft: message.trim() || undefined,
        }),
      });
      const d = await res.json() as { draft?: string; error?: string };
      if (res.ok && d.draft) {
        setMessage(d.draft);
      } else {
        setAiDraftError(d.error ?? 'AI draft failed — please write manually.');
      }
    } catch {
      setAiDraftError('Could not reach the AI service. Please write manually.');
    } finally {
      setAiDrafting(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/rr/shoutouts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': senderId,
          'x-user-role': 'manager',
        },
        body: JSON.stringify({
          recipientId: selectedEmployee!.id,
          message: message.trim(),
          valueIds: [valueId],
          visibility,
          giftAmountCents: includeReward ? AMOUNT_CENTS : 0,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error: string };
        // 4xx: validation error — stay on confirm, show inline message
        setSubmitError(err.error ?? `Request failed (${res.status}). Please try again.`);
        return;
      }

      // Capture shoutoutId for QR code / share link
      const data = await res.json() as { shoutoutId: string };
      setShoutoutId(data.shoutoutId ?? null);
      setDeliveryStatus('delivered');
      setStep('success');
    } catch {
      // Network error or 5xx — preserve all form state
      setSubmitError('Network error. Your recognition was not sent — please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const STEP_LABELS: Record<Step, string> = {
    compose: 'Compose',
    confirm: 'Confirm',
    success: 'Sent',
  };

  const STEP_ORDER: Step[] = ['compose', 'confirm', 'success'];

  return (
    /* Overlay */
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(2px)',
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      {/* Drawer panel */}
      <div
        ref={drawerRef}
        style={{
          width: '100%',
          maxWidth: step === 'compose' ? 740 : 500,
          height: '100%',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.18)',
          animation: 'slideIn 0.25s ease-out',
          transition: 'max-width 0.25s ease',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e293b' }}>
              Send Recognition
            </h1>
            {step !== 'success' && selectedEmployee && (
              <p style={{ margin: '2px 0 0', fontSize: 13, color: '#94a3b8' }}>
                {selectedEmployee.title} · {selectedEmployee.department}
              </p>
            )}
          </div>

          {/* Step indicators */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {step !== 'success' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {STEP_ORDER.filter(s => s !== 'success').map((s, i, arr) => (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: s === step ? '#1a56db' : STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(s) ? '#22c55e' : '#e2e8f0',
                        color: s === step || STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(s) ? '#fff' : '#94a3b8',
                        fontSize: 11, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(s) ? '✓' : i + 1}
                      </div>
                      <span style={{
                        fontSize: 12, fontWeight: s === step ? 600 : 400,
                        color: s === step ? '#1e293b' : '#94a3b8',
                      }}>
                        {STEP_LABELS[s]}
                      </span>
                    </div>
                    {i < arr.length - 1 && (
                      <div style={{ width: 20, height: 1, background: '#e2e8f0' }} />
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: '50%',
                border: '1px solid #e2e8f0',
                background: '#fff',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, color: '#94a3b8', flexShrink: 0,
                transition: 'background 0.1s',
              }}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        {/* Step content */}
        {step === 'compose' && (
          <ComposeStep
            employee={selectedEmployee}
            employees={employees}
            onSelectEmployee={emp => setSelectedEmployee(emp)}
            managerFirstName={managerFirstName}
            availableBudgetCents={availableBudgetCents}
            includeReward={includeReward}
            setIncludeReward={setIncludeReward}
            pastRewards={(employees.find(e => e.id === selectedEmployee?.id) as DirectReport | undefined)?.recognitionHistory ?? []}
            companyValues={companyValues}
            valuesLoading={valuesLoading}
            valueId={valueId}
            setValueId={setValueId}
            message={message}
            setMessage={setMessage}
            visibility={visibility}
            setVisibility={setVisibility}
            contentWarning={contentWarning}
            onNext={() => setStep('confirm')}
            onAiDraft={handleAiDraft}
            aiDrafting={aiDrafting}
            aiDraftError={aiDraftError}
          />
        )}
        {step === 'confirm' && selectedEmployee && (
          <ConfirmStep
            employee={selectedEmployee}
            managerFirstName={managerFirstName}
            valueLabel={valueLabel}
            message={message}
            visibility={visibility}
            includeReward={includeReward}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onBack={() => { setStep('compose'); setSubmitError(null); }}
            onSubmit={handleSubmit}
          />
        )}
        {step === 'success' && selectedEmployee && (
          <SuccessStep
            employee={selectedEmployee}
            deliveryStatus={deliveryStatus}
            shoutoutId={shoutoutId}
            onClose={onClose}
          />
        )}
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
