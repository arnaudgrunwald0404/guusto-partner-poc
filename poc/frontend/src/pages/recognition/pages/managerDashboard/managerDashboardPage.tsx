/**
 * ManagerDashboardPage — /r/recognition/manager
 *
 * The manager's recognition command centre, built with the real @clearcompany/clearco-ui
 * design system. Surfaces three areas:
 *   1. Team overview — direct reports with recognition status + quick Recognize CTA
 *   2. Recognition history — per-employee timeline
 *   3. Budget — spend vs. allocated, transaction log
 *
 * PRD references:
 *   §6.5  Manager My Team Dashboard
 *   §6.3  Budget management
 *   P1–P4 Manager user stories
 *
 * Data: mock stub (no real API in POC). In production, data would come from
 * /api/recognition/manager/dashboard.
 */

import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useRecognitionPersona } from '../../recognitionPersonaContext';
import {
    Badge,
    Button,
    Card,
    Avatar,
    AlertBanner,
    Progress,
    NavigationTabs,
    type NavigationTabItem,
    Drawer,
    TextArea,
    Loader,
} from '@clearcompany/clearco-ui';
import type { RecognitionAreaOutletContext } from '../../recognitionArea';

// ---------------------------------------------------------------------------
// Mock data — replace with API calls in production
// ---------------------------------------------------------------------------

interface RecognitionRecord {
    id: string;
    value: string;
    message: string;
    date: string;
    rewardSent: boolean;
    rewardAmount: number; // cents
}

interface DirectReport {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    title: string;
    department: string;
    avatarColor: string;
    lastRecognizedDaysAgo: number | null;
    recognitionsThisQuarter: number;
    /** Monthly recognition counts, oldest-first, covering the past 9 months */
    recognitionsByMonth: number[];
    recognitionHistory: RecognitionRecord[];
    isFrontline?: boolean;
    personalEmail?: string;
    location?: string;
}

interface ManagerProfile {
    id: string;
    firstName: string;
    lastName: string;
    title: string;
    budgetAllocatedCents: number;
    budgetSpentCents: number;
    budgetPeriodLabel: string;
    budgetWeeksRemaining: number;
    directReports: DirectReport[];
}

const MANAGER: ManagerProfile = {
    id: 'mgr_001',
    firstName: 'Rachael',
    lastName: 'Alpert',
    title: 'VP Customer Success',
    budgetAllocatedCents: 30000,
    budgetSpentCents: 2500,
    budgetPeriodLabel: 'Q2 2026',
    budgetWeeksRemaining: 6,
    directReports: [
        {
            id: 'emp_001',
            firstName: 'Samuel',
            lastName: 'Abramsky',
            email: 'agrunwald+4@clearcompany.com',
            title: 'Customer Success Specialist',
            department: 'Customer Success',
            avatarColor: 'blue',
            lastRecognizedDaysAgo: 5,
            recognitionsThisQuarter: 1,
            recognitionsByMonth: [0, 1, 0, 2, 1, 0, 1, 0, 1],
            recognitionHistory: [
                {
                    id: 'rec_001',
                    value: 'Customer at the Core',
                    message:
                        'Samuel went above and beyond during the Q1 onboarding push. He unblocked three enterprise accounts, stayed late to ensure the handoffs went smoothly, and wrote thorough runbooks afterward. His customer focus made the whole team stronger.',
                    date: '2026-04-24T10:30:00Z',
                    rewardSent: true,
                    rewardAmount: 2500,
                },
            ],
        },
        {
            id: 'emp_002',
            firstName: 'Jordan',
            lastName: 'Beaman',
            email: 'agrunwald+5@clearcompany.com',
            title: 'Implementation Manager',
            department: 'Customer Success',
            avatarColor: 'violet',
            lastRecognizedDaysAgo: 47,
            recognitionsThisQuarter: 0,
            recognitionsByMonth: [1, 0, 1, 0, 0, 1, 0, 0, 0],
            recognitionHistory: [],
        },
        {
            id: 'emp_003',
            firstName: 'Maddy',
            lastName: 'Bender',
            email: 'agrunwald+6@clearcompany.com',
            title: 'Customer Success Manager',
            department: 'Customer Success',
            avatarColor: 'teal',
            lastRecognizedDaysAgo: 12,
            recognitionsThisQuarter: 2,
            recognitionsByMonth: [1, 0, 2, 1, 0, 1, 0, 1, 0],
            recognitionHistory: [],
        },
    ],
};

// Thomas Badeen — Sales Manager with frontline team
const FRONTLINE_MANAGER: ManagerProfile = {
    id: 'mgr_003',
    firstName: 'Thomas',
    lastName: 'Badeen',
    title: 'Sales Manager',
    budgetAllocatedCents: 50000,
    budgetSpentCents: 0,
    budgetPeriodLabel: 'Q2 2026',
    budgetWeeksRemaining: 6,
    directReports: [
        {
            id: 'emp_008',
            firstName: 'Lorraine',
            lastName: 'Alexus',
            email: 'agrunwald+11@clearcompany.com',
            personalEmail: 'lorraine.alexus@gmail.com',
            title: 'Account Executive',
            department: 'Sales',
            location: 'Atlanta, GA',
            avatarColor: 'pink',
            lastRecognizedDaysAgo: null,
            recognitionsThisQuarter: 0,
            recognitionsByMonth: [0, 0, 0, 0, 0, 0, 0, 0, 0],
            recognitionHistory: [],
            isFrontline: true,
        },
        {
            id: 'emp_010',
            firstName: 'Daironex',
            lastName: 'Batista',
            email: 'agrunwald+13@clearcompany.com',
            personalEmail: 'daironex.batista@gmail.com',
            title: 'Sales Development Representative',
            department: 'Sales',
            location: 'Miami, FL',
            avatarColor: 'teal',
            lastRecognizedDaysAgo: 38,
            recognitionsThisQuarter: 0,
            recognitionsByMonth: [0, 1, 0, 0, 1, 0, 0, 0, 0],
            recognitionHistory: [],
            isFrontline: true,
        },
    ],
};

const MANAGER_OPTIONS: { value: string; label: string; manager: ManagerProfile }[] = [
    { value: 'mgr_001', label: 'Rachael Alpert — VP Customer Success', manager: MANAGER },
    { value: 'mgr_003', label: 'Thomas Badeen — Sales Manager (Frontline)', manager: FRONTLINE_MANAGER },
];

// Company values with emoji — matches backend seed data / admin configuration
const COMPANY_VALUE_CHIPS: { value: string; emoji: string; accent: string; bg: string; border: string }[] = [
    { value: 'Customer at the Core', emoji: '🤝', accent: '#0369a1', bg: '#e0f2fe', border: '#7dd3fc' },
    { value: 'Listen to Many, Execute as One', emoji: '💬', accent: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd' },
    { value: 'Embrace Change', emoji: '🌱', accent: '#059669', bg: '#ecfdf5', border: '#6ee7b7' },
    { value: 'Accountable to Outcomes', emoji: '🎯', accent: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
    { value: 'Raise the Bar', emoji: '📈', accent: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
];

const OVERDUE_THRESHOLD = 30; // days

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysSinceLabel(days: number | null): string {
    if (days === null) return 'Never recognized';
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
}

function recognitionBadge(days: number | null) {
    if (days === null)
        return (
            <Badge color="error" variant="light" size="sm">
                Never recognized
            </Badge>
        );
    if (days > OVERDUE_THRESHOLD)
        return (
            <Badge color="warning" variant="light" size="sm">
                {daysSinceLabel(days)} — overdue
            </Badge>
        );
    return (
        <Badge color="success" variant="light" size="sm">
            Recognized {daysSinceLabel(days)}
        </Badge>
    );
}

function formatCents(cents: number): string {
    return `$${(cents / 100).toFixed(0)}`;
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ManagerSwitcher removed — manager profile is now driven by the top-level
// persona selected in PersonaSwitcher (Rachael Alpert or Thomas Badeen).
// See recognitionPersonaContext.tsx for the consolidated persona system.

// ---------------------------------------------------------------------------
// RecognizeDrawer — 3-step slide-in compose panel
// ---------------------------------------------------------------------------

type DrawerStep = 'compose' | 'confirm' | 'success';
type Visibility = 'company' | 'team' | 'private';
type DeliveryStatus = 'sending' | 'delivered' | 'failed';

const MSG_MIN = 150;
const MSG_MAX = 500;

const VISIBILITY_OPTIONS: { value: Visibility; label: string; description: string }[] = [
    { value: 'company', label: 'Company-wide', description: 'Visible to everyone' },
    { value: 'team', label: 'Team only', description: 'Visible to your team' },
    { value: 'private', label: 'Private', description: 'Recipient & admins only' },
];

const VISIBILITY_LABELS: Record<Visibility, string> = {
    company: '🌐 Company-wide',
    team: '👥 Team only',
    private: '🔒 Private',
};

interface RecognizeDrawerProps {
    /** Pre-selected employee. null = show empty picker (from "Recognize someone" header CTA). */
    initialEmployee: DirectReport | null;
    /** All employees available for selection in the picker */
    allEmployees: DirectReport[];
    managerFirstName: string;
    opened: boolean;
    onClose: () => void;
}

function RecognizeDrawer({ initialEmployee, allEmployees, managerFirstName, opened, onClose }: RecognizeDrawerProps) {
    const [step, setStep] = useState<DrawerStep>('compose');
    // Internal selected employee — reset each time the drawer opens
    const [employee, setEmployee] = useState<DirectReport | null>(initialEmployee);
    const [value, setValue] = useState('');
    const [message, setMessage] = useState('');
    const [visibility, setVisibility] = useState<Visibility>('company');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>('sending');
    const [shoutoutId, setShoutoutId] = useState<string | null>(null);
    const [includeReward, setIncludeReward] = useState(true);
    const [aiDrafting, setAiDrafting] = useState(false);
    const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
    const [copySuccess, setCopySuccess] = useState(false);

    // Sync employee + reset form whenever drawer (re-)opens
    useEffect(() => {
        if (opened) {
            setEmployee(initialEmployee);
            setStep('compose');
            setValue('');
            setMessage('');
            setVisibility('company');
            setIncludeReward(true);
            setIsSubmitting(false);
            setDeliveryStatus('sending');
            setShoutoutId(null);
            setAiDrafting(false);
            setAiSuggestion(null);
            setCopySuccess(false);
        }
    }, [opened, initialEmployee]);

    const handleClose = () => {
        setStep('compose');
        setValue('');
        setMessage('');
        setVisibility('company');
        setIncludeReward(true);
        setIsSubmitting(false);
        setDeliveryStatus('sending');
        setShoutoutId(null);
        setAiDrafting(false);
        setAiSuggestion(null);
        setCopySuccess(false);
        setEmployee(null);
        onClose();
    };

    const handleAiDraft = async () => {
        if (!value || !employee) return;
        setAiDrafting(true);
        setAiSuggestion(null); // clear any previous suggestion while fetching
        try {
            const res = await fetch('/api/rr/ai/draft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipientName: employee.firstName,
                    valueLabel: value,
                    senderContext: `Manager ${managerFirstName} recognizing ${employee.title} ${employee.isFrontline ? '(frontline employee)' : ''}`,
                    existingDraft: message.trim(),
                }),
            });
            if (res.ok) {
                const data = (await res.json()) as { draft: string };
                // Show as a suggestion the user can accept or dismiss — don't auto-apply
                setAiSuggestion(data.draft);
            }
        } catch {
            /* silent */
        } finally {
            setAiDrafting(false);
        }
    };

    const handleSubmit = async () => {
        if (!employee) return;
        setIsSubmitting(true);
        try {
            const res = await fetch('/api/rr/recognize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employeeId: employee.id,
                    reason: value,
                    message: message.trim(),
                    visibility,
                    includeReward,
                }),
            });

            if (!res.ok) {
                const err = (await res.json().catch(() => ({ error: 'Request failed' }))) as { error: string };
                throw new Error(err.error ?? `HTTP ${res.status}`);
            }

            const data = (await res.json()) as { recognitionId: string; shoutoutId?: string };

            // Capture shoutout ID for QR/share link
            setShoutoutId(data.shoutoutId ?? data.recognitionId ?? null);

            // Poll for delivery status
            setStep('success');
            setDeliveryStatus('sending');

            const poll = async () => {
                try {
                    const statusRes = await fetch(`/api/rr/recognize/status/${data.recognitionId}`);
                    if (!statusRes.ok) return;
                    const statusData = (await statusRes.json()) as { status: string };
                    if (statusData.status === 'delivered') setDeliveryStatus('delivered');
                    else if (statusData.status === 'failed') setDeliveryStatus('failed');
                    else setTimeout(() => void poll(), 5000);
                } catch {
                    // silent — keep polling
                }
            };

            void poll();
        } catch (err) {
            alert(`Failed to send recognition: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const trimmed = message.trim();
    const canProceed = employee !== null && value !== '' && trimmed.length >= MSG_MIN;
    const remaining = MSG_MAX - message.length;
    const charsToMin = Math.max(0, MSG_MIN - trimmed.length);

    const drawerTitle =
        step === 'success' ? `Recognized ✨` : employee ? `Recognize ${employee.firstName} ✨` : 'Recognize Someone ✨';

    return (
        <Drawer
            opened={opened}
            onClose={handleClose}
            title={drawerTitle}
            position="right"
            size={step === 'compose' ? 'xl' : 'md'}
        >
            {/* Step indicators */}
            {step !== 'success' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
                    {(['compose', 'confirm'] as DrawerStep[]).map((s, i, arr) => {
                        const stepIdx = ['compose', 'confirm', 'success'].indexOf(step);
                        const sIdx = ['compose', 'confirm', 'success'].indexOf(s);
                        const isDone = stepIdx > sIdx;
                        const isActive = s === step;
                        return (
                            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <div
                                        style={{
                                            width: 22,
                                            height: 22,
                                            borderRadius: '50%',
                                            background: isActive ? '#1a56db' : isDone ? '#22c55e' : '#e2e8f0',
                                            color: isActive || isDone ? '#fff' : '#94a3b8',
                                            fontSize: 11,
                                            fontWeight: 700,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        {isDone ? '✓' : i + 1}
                                    </div>
                                    <span
                                        style={{
                                            fontSize: 12,
                                            fontWeight: isActive ? 600 : 400,
                                            color: isActive ? '#1e293b' : '#94a3b8',
                                        }}
                                    >
                                        {s.charAt(0).toUpperCase() + s.slice(1)}
                                    </span>
                                </div>
                                {i < arr.length - 1 && <div style={{ width: 20, height: 1, background: '#e2e8f0' }} />}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Step 1: Compose ──────────────────────────────────── */}
            {step === 'compose' && (
                <div style={{ display: 'flex', gap: 24 }}>
                    {/* Form */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
                        {/* Recipient */}
                        <div>
                            <div
                                style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: '#64748b',
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase',
                                    marginBottom: 6,
                                }}
                            >
                                To
                            </div>
                            <select
                                value={employee?.id ?? ''}
                                onChange={e => {
                                    const found = allEmployees.find(emp => emp.id === e.target.value) ?? null;
                                    setEmployee(found);
                                    // Clear the AI draft when recipient changes
                                    setMessage('');
                                    setValue('');
                                }}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    fontSize: 14,
                                    border: employee ? '1px solid #2563eb' : '1px solid #e2e8f0',
                                    borderLeft: employee ? '4px solid #2563eb' : '4px solid #e2e8f0',
                                    borderRadius: 8,
                                    background: '#f8fafc',
                                    color: employee ? '#1e293b' : '#94a3b8',
                                    outline: 'none',
                                    cursor: 'pointer',
                                    appearance: 'auto',
                                }}
                            >
                                <option value="" disabled>
                                    Select team member…
                                </option>
                                {allEmployees.map(emp => (
                                    <option key={emp.id} value={emp.id}>
                                        {emp.firstName} {emp.lastName} — {emp.title}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* ── Rest of form — only shown once a recipient is selected ── */}
                        {employee && (
                            <>
                                {/* Company value — emoji chip cards */}
                                <div>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: '#64748b',
                                            letterSpacing: '0.06em',
                                            textTransform: 'uppercase' as const,
                                            marginBottom: 8,
                                        }}
                                    >
                                        Company value <span style={{ color: '#ef4444' }}>*</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {COMPANY_VALUE_CHIPS.map(chip => {
                                            const isSelected = value === chip.value;
                                            return (
                                                <button
                                                    key={chip.value}
                                                    type="button"
                                                    onClick={() => setValue(isSelected ? '' : chip.value)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 10,
                                                        padding: '10px 14px',
                                                        borderRadius: 8,
                                                        border: `2px solid ${isSelected ? chip.border : '#e2e8f0'}`,
                                                        background: isSelected ? chip.bg : '#fafafa',
                                                        cursor: 'pointer',
                                                        textAlign: 'left',
                                                        transition: 'all 0.15s',
                                                        width: '100%',
                                                        boxShadow: isSelected ? `0 0 0 3px ${chip.border}40` : 'none',
                                                    }}
                                                >
                                                    <span style={{ fontSize: 20, lineHeight: 1 }}>{chip.emoji}</span>
                                                    <span
                                                        style={{
                                                            fontSize: 13,
                                                            fontWeight: isSelected ? 700 : 500,
                                                            color: isSelected ? chip.accent : '#374151',
                                                            flex: 1,
                                                        }}
                                                    >
                                                        {chip.value}
                                                    </span>
                                                    {isSelected && (
                                                        <span
                                                            style={{
                                                                color: chip.accent,
                                                                fontSize: 13,
                                                                fontWeight: 700,
                                                            }}
                                                        >
                                                            ✓
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Frontline delivery notice */}
                                {employee.isFrontline && (
                                    <div
                                        style={{
                                            padding: '10px 14px',
                                            background: '#fdf4ff',
                                            border: '1px solid #e9d5ff',
                                            borderRadius: 8,
                                            fontSize: 13,
                                            color: '#6b21a8',
                                            display: 'flex',
                                            gap: 8,
                                            alignItems: 'flex-start',
                                        }}
                                    >
                                        <span style={{ flexShrink: 0 }}>📱</span>
                                        <span>
                                            <strong>{employee.firstName}</strong> is a frontline employee — no corporate
                                            email. Recognition will be delivered via a <strong>personal QR link</strong>{' '}
                                            they can open on their phone.
                                        </span>
                                    </div>
                                )}

                                {/* Visibility — own section */}
                                <div>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: '#64748b',
                                            letterSpacing: '0.06em',
                                            textTransform: 'uppercase' as const,
                                            marginBottom: 8,
                                        }}
                                    >
                                        Visibility
                                    </div>
                                    <div
                                        style={{
                                            display: 'flex',
                                            gap: 2,
                                            background: '#f1f5f9',
                                            borderRadius: 8,
                                            padding: 3,
                                        }}
                                    >
                                        {VISIBILITY_OPTIONS.map(opt => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                title={opt.description}
                                                onClick={() => setVisibility(opt.value)}
                                                style={{
                                                    flex: 1,
                                                    padding: '6px 0',
                                                    borderRadius: 6,
                                                    border: 'none',
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    background: visibility === opt.value ? '#fff' : 'transparent',
                                                    color: visibility === opt.value ? '#1e293b' : '#94a3b8',
                                                    boxShadow:
                                                        visibility === opt.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                                    transition: 'all 0.1s',
                                                }}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                                        {VISIBILITY_OPTIONS.find(o => o.value === visibility)?.description}
                                    </div>
                                </div>

                                {/* Message */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: '#64748b',
                                            letterSpacing: '0.06em',
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        Message <span style={{ color: '#ef4444' }}>*</span>
                                    </div>

                                    {/* AI Draft / Improve button */}
                                    <button
                                        type="button"
                                        onClick={() => void handleAiDraft()}
                                        disabled={!value || aiDrafting}
                                        style={{
                                            alignSelf: 'flex-start',
                                            padding: '6px 14px',
                                            borderRadius: 20,
                                            border: 'none',
                                            background:
                                                !value || aiDrafting
                                                    ? '#e2e8f0'
                                                    : 'linear-gradient(135deg, #7c3aed, #2563eb)',
                                            color: !value || aiDrafting ? '#94a3b8' : '#fff',
                                            fontSize: 12,
                                            fontWeight: 700,
                                            cursor: !value || aiDrafting ? 'not-allowed' : 'pointer',
                                            letterSpacing: '0.02em',
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        {aiDrafting
                                            ? message.trim().length > 0
                                                ? '✨ Improving…'
                                                : '✨ Drafting…'
                                            : message.trim().length > 0
                                              ? '✨ Improve with AI'
                                              : '✨ Draft with AI'}
                                    </button>
                                    {!value && (
                                        <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
                                            Pick a company value above to enable AI drafting
                                        </div>
                                    )}

                                    {/* AI suggestion card — shown after AI responds, before user accepts/dismisses */}
                                    {aiSuggestion !== null && (
                                        <div
                                            style={{
                                                border: '1.5px solid #c4b5fd',
                                                borderRadius: 10,
                                                overflow: 'hidden',
                                                boxShadow: '0 2px 12px rgba(124,58,237,0.10)',
                                            }}
                                        >
                                            {/* Header */}
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '8px 14px',
                                                    background: 'linear-gradient(135deg, #7c3aed18, #2563eb12)',
                                                    borderBottom: '1px solid #c4b5fd',
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        fontSize: 11,
                                                        fontWeight: 700,
                                                        color: '#7c3aed',
                                                        letterSpacing: '0.04em',
                                                    }}
                                                >
                                                    ✨ AI SUGGESTION
                                                </span>
                                                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                                                    Review and accept or dismiss
                                                </span>
                                            </div>
                                            {/* Suggestion text */}
                                            <div
                                                style={{
                                                    padding: '12px 14px',
                                                    background: '#faf5ff',
                                                    fontSize: 13,
                                                    color: '#374151',
                                                    lineHeight: 1.65,
                                                    whiteSpace: 'pre-wrap',
                                                }}
                                            >
                                                {aiSuggestion}
                                            </div>
                                            {/* Accept / Dismiss actions */}
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    gap: 8,
                                                    padding: '10px 14px',
                                                    background: '#f5f3ff',
                                                    borderTop: '1px solid #e9d5ff',
                                                }}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setMessage(aiSuggestion);
                                                        setAiSuggestion(null);
                                                    }}
                                                    style={{
                                                        flex: 1,
                                                        padding: '7px 0',
                                                        borderRadius: 8,
                                                        border: 'none',
                                                        background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
                                                        color: '#fff',
                                                        fontSize: 12,
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    ✓ Accept
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setAiSuggestion(null)}
                                                    style={{
                                                        flex: 1,
                                                        padding: '7px 0',
                                                        borderRadius: 8,
                                                        border: '1.5px solid #c4b5fd',
                                                        background: '#fff',
                                                        color: '#7c3aed',
                                                        fontSize: 12,
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    ✕ Dismiss
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <TextArea
                                        value={message}
                                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                                            setMessage(e.target.value)
                                        }
                                        maxLength={MSG_MAX}
                                        placeholder={`Tell ${employee.firstName} why they're being recognized… (minimum ${MSG_MIN} characters)`}
                                        minRows={6}
                                    />

                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span
                                            style={{
                                                fontSize: 11,
                                                color: charsToMin > 0 ? '#f59e0b' : '#22c55e',
                                            }}
                                        >
                                            {charsToMin > 0
                                                ? `${charsToMin} more characters needed`
                                                : '✓ Minimum reached'}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: 11,
                                                color: remaining < 50 ? '#ef4444' : '#94a3b8',
                                            }}
                                        >
                                            {remaining} left
                                        </span>
                                    </div>
                                </div>

                                {/* Reward toggle — sits below the message */}
                                <div>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: '#64748b',
                                            letterSpacing: '0.06em',
                                            textTransform: 'uppercase',
                                            marginBottom: 8,
                                        }}
                                    >
                                        Reward
                                    </div>
                                    <label
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 14,
                                            padding: '12px 16px',
                                            border: `1.5px solid ${includeReward ? '#bfdbfe' : '#e2e8f0'}`,
                                            borderRadius: 10,
                                            background: includeReward ? '#eff6ff' : '#fafafa',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        {/* Toggle track */}
                                        <div
                                            onClick={() => setIncludeReward(v => !v)}
                                            style={{
                                                position: 'relative',
                                                width: 40,
                                                height: 22,
                                                borderRadius: 11,
                                                background: includeReward ? '#2563eb' : '#cbd5e1',
                                                flexShrink: 0,
                                                cursor: 'pointer',
                                                transition: 'background 0.2s',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    top: 3,
                                                    left: includeReward ? 21 : 3,
                                                    width: 16,
                                                    height: 16,
                                                    borderRadius: '50%',
                                                    background: '#fff',
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                                    transition: 'left 0.2s',
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
                                                Include a Guusto gift card reward
                                            </div>
                                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>
                                                {includeReward
                                                    ? '$25 USD · Guusto Gift Card · sent instantly'
                                                    : 'Optional — recognition is valuable on its own'}
                                            </div>
                                        </div>
                                    </label>
                                </div>

                                <Button
                                    variant="primary"
                                    onClick={() => setStep('confirm')}
                                    disabled={!canProceed}
                                    fullWidth
                                >
                                    Preview &amp; confirm →
                                </Button>
                                {!canProceed && (
                                    <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                                        {!employee
                                            ? 'Select a team member to continue'
                                            : !value
                                              ? 'Select a company value to continue'
                                              : `${charsToMin} more characters needed (min ${MSG_MIN})`}
                                    </div>
                                )}

                                {/* end employee null gate */}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── Step 2: Confirm ──────────────────────────────────── */}
            {step === 'confirm' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div>
                        <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: '#1e293b' }}>
                            Confirm recognition
                        </h3>
                        <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>
                            Review the details below, then send. {employee.firstName} will receive an email with their
                            gift card.
                        </p>
                    </div>

                    {/* Summary card */}
                    <Card>
                        <div
                            style={{
                                padding: '16px 20px',
                                borderBottom: '1px solid #f1f5f9',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                            }}
                        >
                            <Avatar
                                alt={`${employee.firstName} ${employee.lastName}`}
                                size="md"
                                color={employee.avatarColor}
                            >
                                {`${employee.firstName[0]}${employee.lastName[0]}`}
                            </Avatar>
                            <div>
                                <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
                                    {employee.firstName} {employee.lastName}
                                </div>
                                <div style={{ fontSize: 13, color: '#94a3b8' }}>{employee.email}</div>
                            </div>
                        </div>

                        <div
                            style={{
                                padding: '16px 20px',
                                borderBottom: '1px solid #f1f5f9',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <div>
                                <div
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: '#94a3b8',
                                        letterSpacing: '0.08em',
                                        textTransform: 'uppercase',
                                        marginBottom: 8,
                                    }}
                                >
                                    Company value
                                </div>
                                {(() => {
                                    const chip = COMPANY_VALUE_CHIPS.find(c => c.value === value);
                                    return chip ? (
                                        <div
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 6,
                                                padding: '4px 10px',
                                                borderRadius: 6,
                                                border: `1.5px solid ${chip.border}`,
                                                background: chip.bg,
                                                color: chip.accent,
                                                fontSize: 13,
                                                fontWeight: 600,
                                            }}
                                        >
                                            <span>{chip.emoji}</span>
                                            <span>{chip.value}</span>
                                        </div>
                                    ) : (
                                        <Badge color="info" variant="light">
                                            {value}
                                        </Badge>
                                    );
                                })()}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: '#94a3b8',
                                        letterSpacing: '0.08em',
                                        textTransform: 'uppercase',
                                        marginBottom: 8,
                                    }}
                                >
                                    Visibility
                                </div>
                                <Badge color="info" variant="outline" size="sm">
                                    {VISIBILITY_LABELS[visibility]}
                                </Badge>
                            </div>
                        </div>

                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                            <div
                                style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: '#94a3b8',
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    marginBottom: 8,
                                }}
                            >
                                Message
                            </div>
                            <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.6 }}>{message}</p>
                        </div>

                        <div
                            style={{
                                padding: '16px 20px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <div>
                                {includeReward ? (
                                    <>
                                        <div style={{ fontSize: 22, fontWeight: 800, color: '#1e293b' }}>$25 USD</div>
                                        <div style={{ fontSize: 12, color: '#94a3b8' }}>
                                            Guusto Gift Card · 60,000+ merchants
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b' }}>No reward</div>
                                        <div style={{ fontSize: 12, color: '#94a3b8' }}>Recognition only</div>
                                    </>
                                )}
                            </div>
                            <div style={{ fontSize: 13, color: '#64748b' }}>
                                From: <strong>{managerFirstName}</strong>
                            </div>
                        </div>
                    </Card>

                    <AlertBanner variant="success" title="No approval needed" headingVariant="h5">
                        As the manager, you&apos;re authorizing this recognition directly. The reward will be sent
                        immediately.
                    </AlertBanner>

                    <div style={{ display: 'flex', gap: 10 }}>
                        <Button variant="secondary" onClick={() => setStep('compose')} disabled={isSubmitting}>
                            ← Back
                        </Button>
                        <Button variant="primary" onClick={() => void handleSubmit()} loading={isSubmitting} fullWidth>
                            {includeReward ? 'Send Recognition & $25 Reward 🎁' : 'Send Recognition ✨'}
                        </Button>
                    </div>
                </div>
            )}

            {/* ── Step 3: Success ──────────────────────────────────── */}
            {step === 'success' && (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        padding: '24px 0',
                        gap: 16,
                    }}
                >
                    <div style={{ fontSize: 64, lineHeight: 1 }}>
                        {deliveryStatus === 'failed' ? '⚠️' : deliveryStatus === 'sending' ? '⏳' : '🎉'}
                    </div>

                    <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', margin: 0 }}>
                        {deliveryStatus === 'failed'
                            ? 'Reward delivery failed'
                            : deliveryStatus === 'sending'
                              ? 'Recognition sent!'
                              : `${employee.firstName} has been recognized!`}
                    </h2>

                    <p style={{ fontSize: 15, color: '#64748b', margin: 0, lineHeight: 1.6, maxWidth: 320 }}>
                        {deliveryStatus === 'failed'
                            ? `The recognition was recorded, but we couldn't send the Guusto reward. Please contact support.`
                            : deliveryStatus === 'sending'
                              ? `Your recognition has been submitted and the $25 Guusto reward is on its way to ${employee.email}.`
                              : `Your recognition was recorded and ${employee.firstName} received a $25 Guusto gift card at ${employee.email}.`}
                    </p>

                    {deliveryStatus === 'sending' && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '10px 20px',
                                background: '#eff6ff',
                                borderRadius: 20,
                                fontSize: 13,
                                color: '#1d4ed8',
                            }}
                        >
                            <Loader size="sm" />
                            Delivering reward…
                        </div>
                    )}

                    {deliveryStatus !== 'sending' && !employee.isFrontline && (
                        <AlertBanner
                            variant={deliveryStatus === 'failed' ? 'error' : 'success'}
                            title={
                                deliveryStatus === 'failed'
                                    ? 'Guusto reward could not be delivered. The recognition is still recorded.'
                                    : `Gift card delivered to ${employee.email}`
                            }
                            headingVariant="h5"
                        />
                    )}

                    {/* Frontline QR delivery */}
                    {employee.isFrontline && shoutoutId && (
                        <div
                            style={{
                                width: '100%',
                                borderRadius: 14,
                                overflow: 'hidden',
                                border: '1px solid #e9d5ff',
                                boxShadow: '0 4px 16px rgba(124,58,237,0.08)',
                            }}
                        >
                            {/* Header strip */}
                            <div
                                style={{
                                    padding: '14px 20px',
                                    background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                }}
                            >
                                <span style={{ fontSize: 18 }}>📱</span>
                                <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                                    Share with {employee.firstName}
                                </span>
                            </div>
                            {/* QR body */}
                            <div
                                style={{
                                    padding: '20px',
                                    background: '#fdf4ff',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: 12,
                                }}
                            >
                                <img
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`${window.location.origin}/shoutout/${shoutoutId}`)}`}
                                    alt="QR code"
                                    style={{
                                        borderRadius: 10,
                                        border: '5px solid #fff',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
                                    }}
                                />
                                <div
                                    style={{
                                        fontSize: 12,
                                        color: '#7c3aed',
                                        textAlign: 'center',
                                        lineHeight: 1.5,
                                        maxWidth: 240,
                                    }}
                                >
                                    Show this QR code to {employee.firstName} — they can open their recognition on any
                                    phone, no login required.
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void navigator.clipboard
                                            .writeText(`${window.location.origin}/shoutout/${shoutoutId}`)
                                            .then(() => {
                                                setCopySuccess(true);
                                                setTimeout(() => setCopySuccess(false), 2000);
                                            });
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '10px 16px',
                                        borderRadius: 8,
                                        border: 'none',
                                        background: copySuccess
                                            ? 'linear-gradient(135deg, #16a34a, #15803d)'
                                            : 'linear-gradient(135deg, #7c3aed, #9333ea)',
                                        color: '#fff',
                                        fontSize: 13,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    {copySuccess ? '✓ Link copied!' : '🔗 Copy personal link'}
                                </button>
                            </div>
                        </div>
                    )}

                    <Button variant="primary" onClick={handleClose}>
                        Done
                    </Button>
                </div>
            )}
        </Drawer>
    );
}

// ---------------------------------------------------------------------------
// Budget panel
// ---------------------------------------------------------------------------

function BudgetPanel({ manager }: { manager: ManagerProfile }) {
    const { budgetAllocatedCents, budgetSpentCents, budgetPeriodLabel, budgetWeeksRemaining, directReports } = manager;
    const pct = Math.round((budgetSpentCents / budgetAllocatedCents) * 100);
    const remaining = budgetAllocatedCents - budgetSpentCents;
    const recognizedCount = directReports.filter(r => r.recognitionsThisQuarter > 0).length;
    const totalReports = directReports.length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Balance hero */}
            <Card>
                <div style={{ padding: '24px 28px' }}>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            marginBottom: 20,
                        }}
                    >
                        <div>
                            <div
                                style={{
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: '#64748b',
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase',
                                    marginBottom: 4,
                                }}
                            >
                                Recognition budget · {budgetPeriodLabel}
                            </div>
                            <div
                                style={{
                                    fontSize: 36,
                                    fontWeight: 800,
                                    color: '#1e293b',
                                    letterSpacing: '-0.02em',
                                }}
                            >
                                {formatCents(remaining)}{' '}
                                <span style={{ fontSize: 16, fontWeight: 500, color: '#94a3b8' }}>remaining</span>
                            </div>
                        </div>
                        <Badge color="info" variant="light">
                            {budgetWeeksRemaining} weeks left
                        </Badge>
                    </div>

                    <Progress value={pct} ariaLabel="Budget utilisation" style={{ marginBottom: 8 }} />

                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 12,
                            color: '#94a3b8',
                        }}
                    >
                        <span>{formatCents(budgetSpentCents)} spent</span>
                        <span>{formatCents(budgetAllocatedCents)} allocated</span>
                    </div>

                    {/* Equity nudge — PRD §6.3 advisory message */}
                    <div
                        style={{
                            marginTop: 20,
                            padding: '12px 16px',
                            background: '#eff6ff',
                            borderRadius: 8,
                            fontSize: 13,
                            color: '#1d4ed8',
                            lineHeight: 1.5,
                            display: 'flex',
                            gap: 10,
                            alignItems: 'flex-start',
                        }}
                    >
                        <span style={{ flexShrink: 0, marginTop: 1 }}>💡</span>
                        <span>
                            You have <strong>{formatCents(remaining)}</strong> remaining with {budgetWeeksRemaining}{' '}
                            weeks left in {budgetPeriodLabel}. You&apos;ve recognized{' '}
                            <strong>
                                {recognizedCount} of {totalReports}
                            </strong>{' '}
                            direct reports this quarter.
                        </span>
                    </div>
                </div>
            </Card>

            {/* Transaction log */}
            <Card>
                <div
                    style={{
                        padding: '16px 20px 0',
                        borderBottom: '1px solid #e9ecef',
                    }}
                >
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', paddingBottom: 16 }}>
                        Transaction history
                    </div>
                </div>
                {directReports.flatMap(r => r.recognitionHistory).length === 0 ? (
                    <div
                        style={{
                            padding: '40px 20px',
                            textAlign: 'center',
                            color: '#94a3b8',
                            fontSize: 14,
                        }}
                    >
                        No rewards sent yet this quarter.
                    </div>
                ) : (
                    directReports
                        .flatMap(r => r.recognitionHistory.map(h => ({ ...h, employee: r })))
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map(tx => (
                            <div
                                key={tx.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 14,
                                    padding: '14px 20px',
                                    borderBottom: '1px solid #f8f9fa',
                                }}
                            >
                                <Avatar
                                    alt={`${tx.employee.firstName} ${tx.employee.lastName}`}
                                    size="sm"
                                    color={tx.employee.avatarColor}
                                >
                                    {`${tx.employee.firstName[0]}${tx.employee.lastName[0]}`}
                                </Avatar>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                                        {tx.employee.firstName} {tx.employee.lastName}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 1 }}>
                                        {tx.value} · {formatDate(tx.date)}
                                    </div>
                                </div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: '#2f9e44' }}>
                                    +{formatCents(tx.rewardAmount)}
                                </div>
                                <Badge color="success" variant="light" size="sm">
                                    Delivered
                                </Badge>
                            </div>
                        ))
                )}
            </Card>
        </div>
    );
}

// ---------------------------------------------------------------------------
// History panel
// ---------------------------------------------------------------------------

function HistoryPanel({ manager }: { manager: ManagerProfile }) {
    const allHistory = manager.directReports
        .flatMap(r => r.recognitionHistory.map(h => ({ record: h, employee: r })))
        .sort((a, b) => new Date(b.record.date).getTime() - new Date(a.record.date).getTime());

    return (
        <Card>
            {allHistory.length === 0 ? (
                <div
                    style={{
                        padding: '60px 24px',
                        textAlign: 'center',
                        color: '#94a3b8',
                    }}
                >
                    <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
                    <div style={{ fontWeight: 600, marginBottom: 6, color: '#495057' }}>No recognitions sent yet</div>
                    <div style={{ fontSize: 13 }}>Recognitions you send will appear here as a timeline.</div>
                </div>
            ) : (
                allHistory.map(({ record, employee }) => (
                    <div
                        key={record.id}
                        style={{
                            display: 'flex',
                            gap: 16,
                            padding: '20px 24px',
                            borderBottom: '1px solid #f8f9fa',
                        }}
                    >
                        {/* Timeline dot */}
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                paddingTop: 4,
                            }}
                        >
                            <div
                                style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: '50%',
                                    background: '#339af0',
                                    flexShrink: 0,
                                }}
                            />
                            <div
                                style={{
                                    width: 1,
                                    flex: 1,
                                    background: '#dee2e6',
                                    marginTop: 4,
                                }}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    marginBottom: 6,
                                    flexWrap: 'wrap',
                                }}
                            >
                                <Avatar
                                    alt={`${employee.firstName} ${employee.lastName}`}
                                    size="xs"
                                    color={employee.avatarColor}
                                >
                                    {`${employee.firstName[0]}${employee.lastName[0]}`}
                                </Avatar>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                                    {employee.firstName} {employee.lastName}
                                </span>
                                <Badge color="info" variant="light" size="xs">
                                    {record.value}
                                </Badge>
                                {record.rewardSent && (
                                    <Badge color="success" variant="light" size="xs">
                                        {formatCents(record.rewardAmount)} reward
                                    </Badge>
                                )}
                                <span
                                    style={{
                                        fontSize: 11,
                                        color: '#adb5bd',
                                        marginLeft: 'auto',
                                    }}
                                >
                                    {formatDate(record.date)}
                                </span>
                            </div>
                            <p
                                style={{
                                    margin: 0,
                                    fontSize: 13,
                                    color: '#495057',
                                    lineHeight: 1.6,
                                    fontStyle: 'italic',
                                    padding: '10px 14px',
                                    background: '#f8f9fa',
                                    borderRadius: 6,
                                    borderLeft: '3px solid #74c0fc',
                                }}
                            >
                                &ldquo;{record.message}&rdquo;
                            </p>
                        </div>
                    </div>
                ))
            )}
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Team row
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// MiniSparkline — SVG bar chart, 9 months, oldest → newest (left → right)
// ---------------------------------------------------------------------------

function MiniSparkline({
    data,
    globalMax,
    width = 88,
    height = 32,
}: {
    data: number[];
    globalMax: number;
    width?: number;
    height?: number;
}) {
    const max = Math.max(globalMax, 1);
    const barW = Math.floor((width - (data.length - 1) * 2) / data.length);
    const months = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];

    return (
        <svg width={width} height={height + 12} aria-hidden="true" style={{ display: 'block' }}>
            {data.map((v, i) => {
                const barH = Math.max(v === 0 ? 2 : Math.round((v / max) * height), 2);
                const x = i * (barW + 2);
                const y = height - barH;
                const isEmpty = v === 0;
                return (
                    <g key={i}>
                        <rect
                            x={x}
                            y={y}
                            width={barW}
                            height={barH}
                            rx={2}
                            fill={isEmpty ? '#e2e8f0' : '#4f46e5'}
                            opacity={isEmpty ? 1 : 0.7 + (i / data.length) * 0.3}
                        />
                        {i === data.length - 1 && !isEmpty && (
                            <text
                                x={x + barW / 2}
                                y={height + 11}
                                textAnchor="middle"
                                fontSize={8}
                                fill="#4f46e5"
                                fontWeight={700}
                            >
                                {v}
                            </text>
                        )}
                    </g>
                );
            })}
            <title>{months.map((m, i) => `${m}: ${data[i]}`).join(', ')}</title>
        </svg>
    );
}

// ---------------------------------------------------------------------------
// TeamRow
// ---------------------------------------------------------------------------

interface TeamRowProps {
    report: DirectReport;
    onRecognize: (emp: DirectReport) => void;
    suggestionCount?: number;
    onSuggestionClick?: () => void;
    /** Shared Y-axis max across all rows so sparklines are comparable */
    sparklineMax: number;
}

function TeamRow({ report, onRecognize, suggestionCount = 0, onSuggestionClick, sparklineMax }: TeamRowProps) {
    const isOverdue = report.lastRecognizedDaysAgo === null || report.lastRecognizedDaysAgo > OVERDUE_THRESHOLD;

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '16px 24px',
                borderBottom: '1px solid #f8f9fa',
                background: isOverdue ? '#fff9f0' : 'white',
                transition: 'background 0.15s',
            }}
        >
            {/* ── Employee ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                <Avatar alt={`${report.firstName} ${report.lastName}`} size="lg" color={report.avatarColor}>
                    {`${report.firstName[0]}${report.lastName[0]}`}
                </Avatar>
                <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
                            {report.firstName} {report.lastName}
                        </span>
                        {report.isFrontline && (
                            <span
                                style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: '2px 6px',
                                    borderRadius: 999,
                                    background: '#fce7f3',
                                    color: '#9d174d',
                                    letterSpacing: '0.05em',
                                    textTransform: 'uppercase' as const,
                                }}
                            >
                                Frontline
                            </span>
                        )}
                        {suggestionCount > 0 && (
                            <button
                                type="button"
                                onClick={onSuggestionClick}
                                title={`${suggestionCount} AI suggestion${suggestionCount !== 1 ? 's' : ''} from Gong`}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '2px 8px',
                                    borderRadius: 10,
                                    background: 'linear-gradient(135deg, #f97316, #ef4444)',
                                    color: '#fff',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    border: 'none',
                                    cursor: 'pointer',
                                    letterSpacing: '0.02em',
                                }}
                            >
                                🎙 {suggestionCount} AI suggestion{suggestionCount !== 1 ? 's' : ''}
                            </button>
                        )}
                    </div>
                    <div
                        style={{
                            fontSize: 12,
                            color: '#94a3b8',
                            marginTop: 1,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {report.title} · {report.department}
                        {report.location ? ` · ${report.location}` : ''}
                    </div>
                    {report.isFrontline && (
                        <div style={{ fontSize: 11, color: '#a78bfa', marginTop: 1 }}>📱 QR link delivery</div>
                    )}
                </div>
            </div>

            {/* ── 9-month sparkline ── */}
            <div
                style={{
                    width: 100,
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                }}
            >
                <MiniSparkline data={report.recognitionsByMonth} globalMax={sparklineMax} />
                <span style={{ fontSize: 10, color: '#94a3b8' }}>9-mo trend</span>
            </div>

            {/* ── Recognition status — width:180 matches header ── */}
            <div style={{ width: 180, flexShrink: 0, textAlign: 'center' }}>
                {recognitionBadge(report.lastRecognizedDaysAgo)}
                <div style={{ fontSize: 11, color: '#adb5bd', marginTop: 3 }}>
                    {report.recognitionsThisQuarter} recognition
                    {report.recognitionsThisQuarter !== 1 ? 's' : ''} this quarter
                </div>
            </div>

            {/* ── Actions — width:130 matches header, right-aligned ── */}
            <div style={{ width: 130, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="primary" size="slim" onClick={() => onRecognize(report)}>
                    Recognize ✨
                </Button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Gong AI Suggestions
// ---------------------------------------------------------------------------

interface GongSuggestion {
    approvalId: string;
    recognitionId: string;
    expiresAt: string;
    employeeFirstName: string;
    employeeId: string | null;
    evidenceQuote: string | null;
    recognitionMessage: string | null;
    rewardAmountCents: number;
    confidence: number | null;
}

type SuggestionAction = 'recognize_only' | 'recognize_reward' | 'dismiss';
type SuggestionStatus = 'idle' | 'loading' | 'done' | 'error';

function confidenceLabel(score: number | null): string {
    if (score === null) return '';
    if (score >= 0.85) return 'High confidence';
    if (score >= 0.65) return 'Medium confidence';
    return 'Low confidence';
}

function confidenceColor(score: number | null): string {
    if (score === null) return '#94a3b8';
    if (score >= 0.85) return '#16a34a';
    if (score >= 0.65) return '#d97706';
    return '#dc2626';
}

async function callSuggestionAction(recognitionId: string, action: SuggestionAction): Promise<void> {
    if (action === 'dismiss') {
        await fetch(`/api/rr/dismiss-by-id?recognition_id=${recognitionId}`);
        return;
    }
    // Both recognize_only and recognize_reward use approve endpoint.
    // withReward param controls whether Guusto gift card is sent.
    const withReward = action === 'recognize_reward';
    await fetch(`/api/rr/approve-by-id?recognition_id=${recognitionId}&withReward=${withReward}`);
}

interface SuggestionCardProps {
    suggestion: GongSuggestion;
    onDone: (id: string) => void;
}

function SuggestionCard({ suggestion, onDone }: SuggestionCardProps) {
    const [status, setStatus] = useState<Record<SuggestionAction, SuggestionStatus>>({
        recognize_only: 'idle',
        recognize_reward: 'idle',
        dismiss: 'idle',
    });

    const anyLoading = Object.values(status).some(s => s === 'loading');

    const handleAction = async (action: SuggestionAction) => {
        setStatus(prev => ({ ...prev, [action]: 'loading' }));
        try {
            await callSuggestionAction(suggestion.recognitionId, action);
            setStatus(prev => ({ ...prev, [action]: 'done' }));
            // Small delay so the user sees the success state, then remove
            setTimeout(() => onDone(suggestion.approvalId), 800);
        } catch {
            setStatus(prev => ({ ...prev, [action]: 'error' }));
        }
    };

    const isDone = Object.values(status).some(s => s === 'done');
    const reward = formatCents(suggestion.rewardAmountCents > 0 ? suggestion.rewardAmountCents : 2500);

    return (
        <div
            style={{
                background: isDone ? '#f0fdf4' : '#fff',
                border: `1px solid ${isDone ? '#86efac' : '#e2e8f0'}`,
                borderRadius: 10,
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                transition: 'all 0.2s',
                opacity: isDone ? 0.7 : 1,
            }}
        >
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Gong logo pill */}
                    <div
                        style={{
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            background: 'linear-gradient(135deg, #f97316, #ef4444)',
                            color: '#fff',
                            padding: '3px 8px',
                            borderRadius: 6,
                            flexShrink: 0,
                        }}
                    >
                        GONG AI
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
                        {suggestion.employeeFirstName}
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {suggestion.confidence !== null && (
                        <span
                            style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: confidenceColor(suggestion.confidence),
                            }}
                        >
                            {confidenceLabel(suggestion.confidence)} ({Math.round(suggestion.confidence * 100)}%)
                        </span>
                    )}
                    <button
                        type="button"
                        aria-label="Dismiss suggestion"
                        disabled={anyLoading}
                        onClick={() => void handleAction('dismiss')}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: anyLoading ? 'default' : 'pointer',
                            fontSize: 16,
                            color: '#94a3b8',
                            padding: '2px 4px',
                            lineHeight: 1,
                            opacity: anyLoading ? 0.4 : 1,
                        }}
                    >
                        ×
                    </button>
                </div>
            </div>

            {/* Evidence quote */}
            {suggestion.evidenceQuote && (
                <blockquote
                    style={{
                        margin: 0,
                        padding: '10px 14px',
                        background: '#f8fafc',
                        borderLeft: '3px solid #f97316',
                        borderRadius: '0 6px 6px 0',
                        fontSize: 13,
                        color: '#475569',
                        lineHeight: 1.6,
                        fontStyle: 'italic',
                    }}
                >
                    &ldquo;{suggestion.evidenceQuote}&rdquo;
                </blockquote>
            )}

            {/* Draft recognition message */}
            {suggestion.recognitionMessage && (
                <div>
                    <div
                        style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: '#94a3b8',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            marginBottom: 4,
                        }}
                    >
                        Draft message
                    </div>
                    <p
                        style={{
                            margin: 0,
                            fontSize: 13,
                            color: '#374151',
                            lineHeight: 1.6,
                        }}
                    >
                        {suggestion.recognitionMessage}
                    </p>
                </div>
            )}

            {/* Action buttons */}
            {!isDone ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button
                        variant="secondary"
                        size="slim"
                        onClick={() => void handleAction('recognize_only')}
                        loading={status.recognize_only === 'loading'}
                        disabled={anyLoading}
                    >
                        Recognize only ✨
                    </Button>
                    <Button
                        variant="primary"
                        size="slim"
                        onClick={() => void handleAction('recognize_reward')}
                        loading={status.recognize_reward === 'loading'}
                        disabled={anyLoading}
                    >
                        Recognize + {reward} reward 🎁
                    </Button>
                </div>
            ) : (
                <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>✓ Done — recognition submitted</div>
            )}

            {Object.values(status).some(s => s === 'error') && (
                <div style={{ fontSize: 12, color: '#dc2626' }}>Action failed — please try again.</div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Hook — lift Gong suggestion state so it can be shared across tabs/rows
// ---------------------------------------------------------------------------

function useGongSuggestions() {
    const [suggestions, setSuggestions] = useState<GongSuggestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const fetchSuggestions = useCallback(async () => {
        try {
            const res = await fetch('/api/rr/manager/suggestions', {
                headers: { 'x-user-id': 'demo-mgr-001', 'x-user-role': 'manager' },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { suggestions: GongSuggestion[] };
            setSuggestions(data.suggestions);
            setError(false);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchSuggestions();
        const interval = setInterval(() => void fetchSuggestions(), 30_000);
        return () => clearInterval(interval);
    }, [fetchSuggestions]);

    const handleDone = useCallback((approvalId: string) => {
        setSuggestions(prev => prev.filter(s => s.approvalId !== approvalId));
    }, []);

    return { suggestions, loading, error, handleDone };
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function ManagerDashboardPage() {
    const [activeTab, setActiveTab] = useState('team');
    const [recognizeDrawerOpen, setRecognizeDrawerOpen] = useState(false);
    const [recognizeTarget, setRecognizeTarget] = useState<DirectReport | null>(null);

    // Manager profile is driven by the top-level persona (Rachael or Thomas)
    const { persona } = useRecognitionPersona();
    const manager = MANAGER_OPTIONS.find(o => o.value === persona.managerId)?.manager ?? MANAGER;

    // Outlet context from RecognitionArea — lets us inject action buttons into the
    // white PageHeader banner that lives in the area wrapper (RecognitionArea).
    const { setHeaderActions } = useOutletContext<RecognitionAreaOutletContext>();

    // Suggestions fetched once at page level so they can drive:
    // - the "AI Suggestions" tab badge count
    // - per-employee pills in the My Team tab
    const { suggestions, loading: suggestionsLoading, error: suggestionsError, handleDone } = useGongSuggestions();

    // Count suggestions per employee first name (simple match for POC)
    const suggestionCountByFirstName = suggestions.reduce<Record<string, number>>((acc, s) => {
        const key = s.employeeFirstName;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
    }, {});

    const totalSuggestions = suggestions.length;

    const TABS: NavigationTabItem[] = [
        { value: 'team', label: 'Team members' },
        {
            value: 'ai',
            label: totalSuggestions > 0 ? `AI suggestions (${totalSuggestions})` : 'AI suggestions',
        },
        { value: 'history', label: 'My recognition history' },
        { value: 'budget', label: 'My rewards budget' },
    ];

    const overdueReports = manager.directReports.filter(
        r => r.lastRecognizedDaysAgo === null || r.lastRecognizedDaysAgo > OVERDUE_THRESHOLD,
    );

    const budgetPctLeft = Math.round(
        ((manager.budgetAllocatedCents - manager.budgetSpentCents) / manager.budgetAllocatedCents) * 100,
    );

    // Push budget badge + Recognize CTA into the white PageHeader banner via outlet context.
    // Runs whenever manager or budgetPctLeft changes so the badge colour stays fresh.
    useEffect(() => {
        const actions: ReactNode[] = [
            <Badge key="budget" color={budgetPctLeft > 40 ? 'success' : 'warning'} variant="light">
                {formatCents(manager.budgetAllocatedCents - manager.budgetSpentCents)} budget remaining
            </Badge>,
            <Button
                key="recognize"
                variant="primary"
                onClick={() => {
                    setRecognizeTarget(null);
                    setRecognizeDrawerOpen(true);
                }}
            >
                Recognize Greatness ✨
            </Button>,
        ];
        setHeaderActions(actions);
        // Clear on unmount so other pages start with a clean header
        return () => setHeaderActions([]);
    }, [budgetPctLeft, manager, setHeaderActions]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px 0' }}>
            {/* Tab navigation */}
            <NavigationTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

            {/* Tab content */}

            {/* ── My Team ─────────────────────────────────────────────── */}
            {activeTab === 'team' && (
                <>
                    {/* Equity gap alert — lives inside the tab so it only shows on Team members */}
                    {overdueReports.length > 0 && (
                        <AlertBanner
                            variant="warning"
                            title={`${overdueReports.length} direct report${overdueReports.length > 1 ? 's' : ''} haven't been recognized in over 30 days`}
                            headingVariant="h4"
                        >
                            {overdueReports.map(r => r.firstName).join(', ')}{' '}
                            {overdueReports.length === 1 ? 'is' : 'are'} overdue for recognition. A quick
                            acknowledgement goes a long way — use the Recognize button below.
                        </AlertBanner>
                    )}
                    <Card>
                        {/* Column headers — widths must mirror TeamRow exactly */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 16,
                                padding: '10px 24px',
                                borderBottom: '1px solid #dee2e6',
                                background: '#f8f9fa',
                            }}
                        >
                            {/* Employee — flex:1, same as row */}
                            <div
                                style={{
                                    flex: 1,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: '#94a3b8',
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase' as const,
                                }}
                            >
                                Employee
                            </div>
                            {/* Trend — width:100, same as row sparkline cell */}
                            <div
                                style={{
                                    width: 100,
                                    flexShrink: 0,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: '#94a3b8',
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase' as const,
                                    textAlign: 'center',
                                }}
                            >
                                Trend (9 mo)
                            </div>
                            {/* Status — width:180, same as row status cell */}
                            <div
                                style={{
                                    width: 180,
                                    flexShrink: 0,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: '#94a3b8',
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase' as const,
                                    textAlign: 'center',
                                }}
                            >
                                Recognition status
                            </div>
                            {/* Actions — width:130, same as row actions cell */}
                            <div
                                style={{
                                    width: 130,
                                    flexShrink: 0,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: '#94a3b8',
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase' as const,
                                    textAlign: 'right',
                                }}
                            >
                                Actions
                            </div>
                        </div>

                        {(() => {
                            // Compute shared Y-axis max across all rows so sparklines are visually comparable
                            const sparklineMax = Math.max(
                                ...manager.directReports.flatMap(r => r.recognitionsByMonth),
                                1,
                            );
                            return manager.directReports.map(report => (
                                <TeamRow
                                    key={report.id}
                                    report={report}
                                    onRecognize={emp => {
                                        setRecognizeTarget(emp);
                                        setRecognizeDrawerOpen(true);
                                    }}
                                    suggestionCount={suggestionCountByFirstName[report.firstName] ?? 0}
                                    onSuggestionClick={() => setActiveTab('ai')}
                                    sparklineMax={sparklineMax}
                                />
                            ));
                        })()}

                        {/* Footer hint */}
                        <div
                            style={{
                                padding: '14px 24px',
                                background: '#f8f9fa',
                                borderTop: '1px solid #dee2e6',
                                fontSize: 12,
                                color: '#94a3b8',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                            }}
                        >
                            <span
                                style={{
                                    display: 'inline-block',
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: '#fd7e14',
                                }}
                            />
                            Highlighted rows indicate employees overdue for recognition (&gt;30 days)
                        </div>
                    </Card>
                </>
            )}

            {/* ── AI Suggestions ──────────────────────────────────────── */}
            {activeTab === 'ai' && (
                <Card>
                    <div
                        style={{
                            padding: '16px 20px',
                            borderBottom: '1px solid #e9ecef',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                        }}
                    >
                        <div
                            style={{
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                background: 'linear-gradient(135deg, #f97316, #ef4444)',
                                color: '#fff',
                                padding: '3px 8px',
                                borderRadius: 6,
                            }}
                        >
                            GONG AI
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                            Recognition opportunities from your calls
                        </span>
                        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>
                            Auto-refreshes every 30s
                        </span>
                    </div>
                    <div style={{ padding: '16px 20px' }}>
                        {suggestionsLoading ? (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    fontSize: 13,
                                    color: '#64748b',
                                    padding: '8px 0',
                                }}
                            >
                                <Loader size="sm" /> Checking Gong for recognition opportunities…
                            </div>
                        ) : suggestionsError ? (
                            <div
                                style={{
                                    padding: '12px 16px',
                                    background: '#fef9f0',
                                    border: '1px solid #fed7aa',
                                    borderRadius: 8,
                                    fontSize: 13,
                                    color: '#92400e',
                                }}
                            >
                                ⚠ Could not reach the Gong pipeline backend. Make sure{' '}
                                <code style={{ fontSize: 12 }}>localhost:3001</code> is running.
                            </div>
                        ) : suggestions.length === 0 ? (
                            <div style={{ padding: '20px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                                🎙 No pending suggestions from Gong right now — check back later.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {suggestions.map(s => (
                                    <SuggestionCard key={s.approvalId} suggestion={s} onDone={handleDone} />
                                ))}
                            </div>
                        )}
                    </div>
                </Card>
            )}

            {activeTab === 'history' && <HistoryPanel manager={manager} />}
            {activeTab === 'budget' && <BudgetPanel manager={manager} />}

            {/* Recognize drawer */}
            <RecognizeDrawer
                initialEmployee={recognizeTarget}
                allEmployees={manager.directReports}
                managerFirstName={manager.firstName}
                opened={recognizeDrawerOpen}
                onClose={() => {
                    setRecognizeDrawerOpen(false);
                    setRecognizeTarget(null);
                }}
            />
        </div>
    );
}
