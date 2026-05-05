/**
 * RecognitionHomePage — /r/recognition/home
 *
 * Employee-facing recognition home page.
 *
 * Layout:
 *   Two-column: left (feed + compose bar) / right (widget rail, 320px).
 *   At ≤768px the right rail stacks below the feed.
 *
 * Data:
 *   Feed       GET /api/rr/feed/home?scope=company|team&page=N&limit=10
 *   Nudges     GET /api/rr/nudges/people-to-recognize?limit=5
 *   Leaderboard GET /api/rr/leaderboard?period=month|quarter&metric=received|sent&limit=5
 */

import React, { useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Badge, Button, Card, Avatar, Skeleton, Drawer, TextArea, Loader } from '@clearcompany/clearco-ui';
import type { RecognitionAreaOutletContext } from '../../recognitionArea';
import { useRecognitionPersona } from '../../recognitionPersonaContext';

// ---------------------------------------------------------------------------
// Types — mirrors recognitionFeedPage shapes
// ---------------------------------------------------------------------------

interface ShoutoutValue {
    id: string;
    label: string;
}

interface ShoutoutReaction {
    emoji: string;
    count: number;
}

interface Shoutout {
    id: string;
    senderId: string;
    senderName: string;
    recipientId: string;
    recipientName: string;
    message: string;
    visibility: 'company' | 'team' | 'private';
    source: 'direct' | 'gong' | 'manual';
    giftAmountCents: number | null;
    giftStatus: string | null;
    values: ShoutoutValue[];
    reactions: ShoutoutReaction[];
    createdAt: string;
}

interface FeedResponse {
    items: Shoutout[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

interface NudgeEmployee {
    id: string;
    firstName: string;
    lastName: string;
    title: string;
    daysSinceLastRecognized: number | null;
    avatarColor?: string;
}

interface NudgesResponse {
    employees: NudgeEmployee[];
}

interface LeaderboardEntry {
    rank: number;
    employeeId: string;
    employeeName: string;
    avatarColor?: string;
    count: number;
}

interface LeaderboardResponse {
    entries: LeaderboardEntry[];
    period: string;
    metric: string;
}

// ---------------------------------------------------------------------------
// Mock employee list for the compose drawer
// ---------------------------------------------------------------------------

interface MockEmployee {
    id: string;
    firstName: string;
    lastName: string;
    title: string;
    email: string;
    avatarColor: string;
    isFrontline?: boolean;
    lastRecognizedDaysAgo: number | null;
    recognitionsThisQuarter: number;
    recognitionsByMonth: number[];
    recognitionHistory: [];
    hireDate?: string; // ISO "YYYY-MM-DD"
    birthday?: string; // ISO "YYYY-MM-DD" (year is ignored — only MM-DD used)
}

const MOCK_ALL_EMPLOYEES: MockEmployee[] = [
    {
        id: 'emp_001',
        firstName: 'Samuel',
        lastName: 'Abramsky',
        title: 'Customer Success Specialist',
        email: 'agrunwald+4@clearcompany.com',
        avatarColor: 'blue',
        lastRecognizedDaysAgo: 5,
        recognitionsThisQuarter: 1,
        recognitionsByMonth: [0, 1, 0, 2, 1, 0, 1, 0, 1],
        recognitionHistory: [],
        hireDate: '2021-05-03', // 5-yr anniversary May 3 (3 days away)
        birthday: '1990-05-08', // birthday May 8
    },
    {
        id: 'emp_002',
        firstName: 'Jordan',
        lastName: 'Beaman',
        title: 'Implementation Manager',
        email: 'agrunwald+5@clearcompany.com',
        avatarColor: 'violet',
        lastRecognizedDaysAgo: 47,
        recognitionsThisQuarter: 0,
        recognitionsByMonth: [1, 0, 1, 0, 0, 1, 0, 0, 0],
        recognitionHistory: [],
        hireDate: '2023-05-15', // 3-yr anniversary May 15
        birthday: '1988-06-15', // birthday June 15
    },
    {
        id: 'emp_003',
        firstName: 'Maddy',
        lastName: 'Bender',
        title: 'Customer Success Manager',
        email: 'agrunwald+6@clearcompany.com',
        avatarColor: 'teal',
        lastRecognizedDaysAgo: 12,
        recognitionsThisQuarter: 2,
        recognitionsByMonth: [1, 0, 2, 1, 0, 1, 0, 1, 0],
        recognitionHistory: [],
        hireDate: '2025-06-01', // 1-yr anniversary June 1
        birthday: '1992-05-25', // birthday May 25
    },
    {
        id: 'emp_008',
        firstName: 'Lorraine',
        lastName: 'Alexus',
        title: 'Account Executive',
        email: 'agrunwald+11@clearcompany.com',
        avatarColor: 'pink',
        isFrontline: true,
        lastRecognizedDaysAgo: null,
        recognitionsThisQuarter: 0,
        recognitionsByMonth: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        recognitionHistory: [],
        hireDate: '2024-05-22', // 2-yr anniversary May 22
        birthday: '1995-07-04', // birthday July 4
    },
    {
        id: 'emp_010',
        firstName: 'Daironex',
        lastName: 'Batista',
        title: 'Sales Development Representative',
        email: 'agrunwald+13@clearcompany.com',
        avatarColor: 'orange',
        isFrontline: true,
        lastRecognizedDaysAgo: 38,
        recognitionsThisQuarter: 0,
        recognitionsByMonth: [0, 1, 0, 0, 1, 0, 0, 0, 0],
        recognitionHistory: [],
        hireDate: '2022-06-10', // 4-yr anniversary June 10
        birthday: '1994-06-02', // birthday June 2
    },
];

// ---------------------------------------------------------------------------
// Helpers — mirrors recognitionFeedPage
// ---------------------------------------------------------------------------

const PAGE_SIZE = 10;
const CURRENT_USER_ID = 'demo-emp-001';
const ALLOWED_REACTIONS = ['👏', '⭐', '🙌', '🔥', '❤️', '🚀'];

const VALUE_EMOJI: Record<string, string> = {
    'Customer at the Core': '🤝',
    'Listen to Many, Execute as One': '💬',
    'Embrace Change': '🌱',
    'Accountable to Outcomes': '🎯',
    'Raise the Bar': '📈',
};

const COMPANY_VALUE_CHIPS: {
    value: string;
    emoji: string;
    accent: string;
    bg: string;
    border: string;
}[] = [
    { value: 'Customer at the Core', emoji: '🤝', accent: '#0369a1', bg: '#e0f2fe', border: '#7dd3fc' },
    { value: 'Listen to Many, Execute as One', emoji: '💬', accent: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd' },
    { value: 'Embrace Change', emoji: '🌱', accent: '#059669', bg: '#ecfdf5', border: '#6ee7b7' },
    { value: 'Accountable to Outcomes', emoji: '🎯', accent: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
    { value: 'Raise the Bar', emoji: '📈', accent: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
];

const AVATAR_COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0284c7'];
function avatarColorFromName(name: string): string {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name: string): string {
    return name
        .split(' ')
        .map(p => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
}
function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 2) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function formatCents(cents: number): string {
    return `$${(cents / 100).toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// ShoutoutCard — copied from recognitionFeedPage (same shape, same behaviour)
// ---------------------------------------------------------------------------

interface ShoutoutCardProps {
    shoutout: Shoutout;
    onReact: (id: string, emoji: string) => void;
    reactingId: string | null;
}

function ShoutoutCard({ shoutout, onReact, reactingId }: ShoutoutCardProps) {
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showReactionPicker) return;
        const handler = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setShowReactionPicker(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showReactionPicker]);

    const isReacting = reactingId === shoutout.id;

    return (
        <Card>
            <div style={{ padding: '20px 24px' }}>
                {/* ── Header ── */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                    <div
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            background: avatarColorFromName(shoutout.recipientName),
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 14,
                            fontWeight: 700,
                            flexShrink: 0,
                        }}
                    >
                        {initials(shoutout.recipientName)}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, lineHeight: 1.4 }}>
                            <span style={{ fontWeight: 700, color: '#1e293b' }}>{shoutout.recipientName}</span>
                            <span style={{ color: '#64748b' }}> recognized by </span>
                            <span style={{ fontWeight: 700, color: '#1e293b' }}>{shoutout.senderName}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>{relativeTime(shoutout.createdAt)}</span>
                            <span
                                style={{
                                    fontSize: 11,
                                    color: '#64748b',
                                    background: '#f1f5f9',
                                    borderRadius: 4,
                                    padding: '1px 6px',
                                }}
                            >
                                {shoutout.visibility === 'company'
                                    ? '🌐 Company-wide'
                                    : shoutout.visibility === 'team'
                                      ? '👥 Team'
                                      : '🔒 Private'}
                            </span>
                            {shoutout.source === 'gong' && (
                                <span
                                    style={{
                                        fontSize: 11,
                                        color: '#7c3aed',
                                        background: '#f5f3ff',
                                        border: '1px solid #ddd6fe',
                                        borderRadius: 4,
                                        padding: '1px 6px',
                                    }}
                                >
                                    🎙 AI-suggested · Gong
                                </span>
                            )}
                            {shoutout.giftAmountCents && shoutout.giftAmountCents > 0 && (
                                <span
                                    style={{
                                        fontSize: 11,
                                        color: '#059669',
                                        background: '#f0fdf4',
                                        border: '1px solid #bbf7d0',
                                        borderRadius: 4,
                                        padding: '1px 6px',
                                    }}
                                >
                                    🎁 {formatCents(shoutout.giftAmountCents)} gift card sent
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Values ── */}
                {shoutout.values.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                        {shoutout.values.map(v => (
                            <span
                                key={v.id}
                                style={{
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: '#1e40af',
                                    background: '#eff6ff',
                                    border: '1px solid #bfdbfe',
                                    borderRadius: 20,
                                    padding: '3px 10px',
                                }}
                            >
                                {VALUE_EMOJI[v.label] ?? '⭐'} {v.label}
                            </span>
                        ))}
                    </div>
                )}

                {/* ── Message ── */}
                <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.6, color: '#374151' }}>
                    {shoutout.message}
                </p>

                {/* ── Reactions ── */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        flexWrap: 'wrap',
                        paddingTop: 12,
                        borderTop: '1px solid #f1f5f9',
                        position: 'relative',
                    }}
                >
                    {shoutout.reactions.map(r => (
                        <button
                            key={r.emoji}
                            disabled={isReacting}
                            onClick={() => onReact(shoutout.id, r.emoji)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '3px 8px',
                                borderRadius: 20,
                                border: '1px solid #e2e8f0',
                                background: '#f8fafc',
                                cursor: isReacting ? 'not-allowed' : 'pointer',
                                fontSize: 13,
                                color: '#374151',
                                transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => {
                                (e.currentTarget as HTMLButtonElement).style.background = '#e0e7ff';
                                (e.currentTarget as HTMLButtonElement).style.borderColor = '#a5b4fc';
                            }}
                            onMouseLeave={e => {
                                (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc';
                                (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0';
                            }}
                        >
                            <span>{r.emoji}</span>
                            <span style={{ fontWeight: 600, fontSize: 12 }}>{r.count}</span>
                        </button>
                    ))}
                    <div style={{ position: 'relative' }} ref={pickerRef}>
                        <button
                            disabled={isReacting}
                            onClick={() => setShowReactionPicker(p => !p)}
                            style={{
                                padding: '3px 8px',
                                borderRadius: 20,
                                border: '1px dashed #cbd5e1',
                                background: 'transparent',
                                cursor: isReacting ? 'not-allowed' : 'pointer',
                                fontSize: 12,
                                color: '#94a3b8',
                                transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => {
                                (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9';
                                (e.currentTarget as HTMLButtonElement).style.color = '#64748b';
                            }}
                            onMouseLeave={e => {
                                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                                (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8';
                            }}
                        >
                            {isReacting ? '…' : '＋ React'}
                        </button>
                        {showReactionPicker && (
                            <div
                                style={{
                                    position: 'absolute',
                                    bottom: '110%',
                                    left: 0,
                                    background: '#fff',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 12,
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                                    padding: '8px 10px',
                                    display: 'flex',
                                    gap: 6,
                                    zIndex: 100,
                                }}
                            >
                                {ALLOWED_REACTIONS.map(emoji => (
                                    <button
                                        key={emoji}
                                        onClick={() => {
                                            onReact(shoutout.id, emoji);
                                            setShowReactionPicker(false);
                                        }}
                                        style={{
                                            fontSize: 20,
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: '2px 4px',
                                            borderRadius: 6,
                                            transition: 'transform 0.1s',
                                        }}
                                        onMouseEnter={e => {
                                            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.3)';
                                            (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9';
                                        }}
                                        onMouseLeave={e => {
                                            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                                            (e.currentTarget as HTMLButtonElement).style.background = 'none';
                                        }}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// RecognizeDrawer — inline simplified version for the employee home page
// ---------------------------------------------------------------------------

type DrawerStep = 'compose' | 'confirm' | 'success';
type Visibility = 'company' | 'team' | 'private';

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

interface HomeRecognizeDrawerProps {
    initialEmployee: MockEmployee | null;
    allEmployees: MockEmployee[];
    senderFirstName: string;
    opened: boolean;
    onClose: () => void;
}

function HomeRecognizeDrawer({
    initialEmployee,
    allEmployees,
    senderFirstName,
    opened,
    onClose,
}: HomeRecognizeDrawerProps) {
    const [step, setStep] = useState<DrawerStep>('compose');
    const [employee, setEmployee] = useState<MockEmployee | null>(initialEmployee);
    const [selectedValues, setSelectedValues] = useState<string[]>([]);
    const [message, setMessage] = useState('');
    const [visibility, setVisibility] = useState<Visibility>('company');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [aiDrafting, setAiDrafting] = useState(false);
    const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);

    // Keep a single `value` alias for backward-compat with confirm step
    const value = selectedValues[0] ?? '';

    const toggleValue = (v: string) => {
        setSelectedValues(prev => {
            if (prev.includes(v)) return prev.filter(x => x !== v);
            if (prev.length >= 2) return prev; // max 2
            return [...prev, v];
        });
    };

    useEffect(() => {
        if (opened) {
            setEmployee(initialEmployee);
            setStep('compose');
            setSelectedValues([]);
            setMessage('');
            setVisibility('company');
            setIsSubmitting(false);
            setAiDrafting(false);
            setAiSuggestion(null);
        }
    }, [opened, initialEmployee]);

    const handleClose = () => {
        setStep('compose');
        setSelectedValues([]);
        setMessage('');
        setVisibility('company');
        setIsSubmitting(false);
        setAiDrafting(false);
        setAiSuggestion(null);
        setEmployee(null);
        onClose();
    };

    const handleAiDraft = async () => {
        if (!selectedValues.length || !employee) return;
        setAiDrafting(true);
        setAiSuggestion(null);
        try {
            const res = await fetch('/api/rr/ai/draft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipientName: employee.firstName,
                    valueLabel: selectedValues.join(' · '),
                    senderContext: `${senderFirstName} recognizing ${employee.firstName} (${employee.title})`,
                    existingDraft: message.trim(),
                }),
            });
            if (res.ok) {
                const data = (await res.json()) as { draft: string };
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
                    includeReward: false,
                }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setStep('success');
        } catch (err) {
            alert(`Failed to send recognition: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const trimmed = message.trim();
    const canProceed = employee !== null && selectedValues.length > 0 && trimmed.length >= MSG_MIN;
    const remaining = MSG_MAX - message.length;
    const charsToMin = Math.max(0, MSG_MIN - trimmed.length);

    const drawerTitle =
        step === 'success' ? 'Recognized ✨' : employee ? `Recognize ${employee.firstName} ✨` : 'Recognize Someone ✨';

    return (
        <Drawer
            opened={opened}
            onClose={handleClose}
            title={drawerTitle}
            position="right"
            size={step === 'compose' ? 'xl' : 'md'}
        >
            {/* ── Step indicators ── */}
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

            {/* ── Compose ── */}
            {step === 'compose' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {/* ── Section 1: Recipient ── */}
                    <div>
                        <div
                            style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: '#64748b',
                                letterSpacing: '0.07em',
                                textTransform: 'uppercase',
                                marginBottom: 6,
                            }}
                        >
                            Recognizing
                        </div>
                        <select
                            value={employee?.id ?? ''}
                            onChange={e => {
                                const found = allEmployees.find(emp => emp.id === e.target.value) ?? null;
                                setEmployee(found);
                                setMessage('');
                                setSelectedValues([]);
                            }}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                fontSize: 14,
                                border: employee ? '1px solid #2563eb' : '1px solid #e2e8f0',
                                borderLeft: employee ? '4px solid #2563eb' : '4px solid #cbd5e1',
                                borderRadius: 8,
                                background: '#f8fafc',
                                color: employee ? '#1e293b' : '#94a3b8',
                                outline: 'none',
                                cursor: 'pointer',
                                appearance: 'auto',
                            }}
                        >
                            <option value="" disabled>
                                Select a colleague…
                            </option>
                            {allEmployees.map(emp => (
                                <option key={emp.id} value={emp.id}>
                                    {emp.firstName} {emp.lastName} — {emp.title}
                                </option>
                            ))}
                        </select>
                    </div>

                    {employee && (
                        <>
                            {/* ── Section 2: Company values ── */}
                            <div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: '#64748b',
                                            letterSpacing: '0.07em',
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        Company Value <span style={{ color: '#ef4444' }}>*</span>
                                    </div>
                                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>
                                        — pick up to 2
                                        {selectedValues.length > 0 ? ` · ${selectedValues.length} selected` : ''}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {COMPANY_VALUE_CHIPS.map(chip => {
                                        const isSelected = selectedValues.includes(chip.value);
                                        const isDisabled = !isSelected && selectedValues.length >= 2;
                                        return (
                                            <button
                                                key={chip.value}
                                                type="button"
                                                onClick={() => !isDisabled && toggleValue(chip.value)}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 10,
                                                    padding: '9px 12px',
                                                    borderRadius: 8,
                                                    border: `2px solid ${isSelected ? chip.border : '#e2e8f0'}`,
                                                    background: isSelected
                                                        ? chip.bg
                                                        : isDisabled
                                                          ? '#f8fafc'
                                                          : '#fafafa',
                                                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                                                    textAlign: 'left',
                                                    transition: 'all 0.15s',
                                                    width: '100%',
                                                    opacity: isDisabled ? 0.45 : 1,
                                                    boxShadow: isSelected ? `0 0 0 3px ${chip.border}30` : 'none',
                                                }}
                                            >
                                                <span style={{ fontSize: 18, lineHeight: 1 }}>{chip.emoji}</span>
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
                                                <span
                                                    style={{
                                                        width: 18,
                                                        height: 18,
                                                        borderRadius: 4,
                                                        flexShrink: 0,
                                                        border: isSelected
                                                            ? `2px solid ${chip.border}`
                                                            : '2px solid #d1d5db',
                                                        background: isSelected ? chip.accent : '#fff',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: 10,
                                                        color: '#fff',
                                                        fontWeight: 900,
                                                        transition: 'all 0.15s',
                                                    }}
                                                >
                                                    {isSelected && '✓'}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── Section 3: Message ── */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: '#64748b',
                                            letterSpacing: '0.07em',
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        Message <span style={{ color: '#ef4444' }}>*</span>
                                    </div>
                                    {/* AI Draft button — top right of message section */}
                                    <button
                                        type="button"
                                        onClick={() => void handleAiDraft()}
                                        disabled={!selectedValues.length || aiDrafting}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 5,
                                            padding: '5px 12px',
                                            borderRadius: 20,
                                            border:
                                                selectedValues.length && !aiDrafting
                                                    ? '1.5px solid #c4b5fd'
                                                    : '1.5px solid #e2e8f0',
                                            background:
                                                selectedValues.length && !aiDrafting
                                                    ? 'linear-gradient(135deg, #7c3aed14, #2563eb0d)'
                                                    : '#f8fafc',
                                            color: selectedValues.length && !aiDrafting ? '#7c3aed' : '#94a3b8',
                                            fontSize: 12,
                                            fontWeight: 700,
                                            cursor: !selectedValues.length || aiDrafting ? 'not-allowed' : 'pointer',
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        <span>{aiDrafting ? '⏳' : '✨'}</span>
                                        {aiDrafting
                                            ? message.trim().length > 0
                                                ? 'Improving…'
                                                : 'Drafting…'
                                            : message.trim().length > 0
                                              ? 'Improve with AI'
                                              : 'Draft with AI'}
                                    </button>
                                </div>

                                {/* AI suggestion card */}
                                {aiSuggestion !== null && (
                                    <div
                                        style={{
                                            border: '1.5px solid #c4b5fd',
                                            borderRadius: 10,
                                            overflow: 'hidden',
                                            boxShadow: '0 2px 12px rgba(124,58,237,0.10)',
                                        }}
                                    >
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
                                                Review, then accept or dismiss
                                            </span>
                                        </div>
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
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
                                    maxLength={MSG_MAX}
                                    placeholder={`Tell ${employee.firstName} why they're being recognized… (minimum ${MSG_MIN} characters)`}
                                    minRows={5}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: 11, color: charsToMin > 0 ? '#f59e0b' : '#22c55e' }}>
                                        {charsToMin > 0 ? `${charsToMin} more characters needed` : '✓ Minimum reached'}
                                    </span>
                                    <span style={{ fontSize: 11, color: remaining < 50 ? '#ef4444' : '#94a3b8' }}>
                                        {remaining} left
                                    </span>
                                </div>
                            </div>

                            {/* ── Section 4: Visibility ── */}
                            <div>
                                <div
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: '#64748b',
                                        letterSpacing: '0.07em',
                                        textTransform: 'uppercase',
                                        marginBottom: 10,
                                    }}
                                >
                                    Visibility
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {VISIBILITY_OPTIONS.map(opt => {
                                        const icons: Record<Visibility, string> = {
                                            company: '🌐',
                                            team: '👥',
                                            private: '🔒',
                                        };
                                        const isActive = visibility === opt.value;
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => setVisibility(opt.value)}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 12,
                                                    padding: '10px 14px',
                                                    borderRadius: 8,
                                                    border: `2px solid ${isActive ? '#2563eb' : '#e2e8f0'}`,
                                                    background: isActive ? '#eff6ff' : '#fafafa',
                                                    cursor: 'pointer',
                                                    textAlign: 'left',
                                                    transition: 'all 0.15s',
                                                    width: '100%',
                                                    boxShadow: isActive ? '0 0 0 3px rgba(37,99,235,0.12)' : 'none',
                                                }}
                                            >
                                                <span style={{ fontSize: 18, lineHeight: 1 }}>{icons[opt.value]}</span>
                                                <div style={{ flex: 1 }}>
                                                    <div
                                                        style={{
                                                            fontSize: 13,
                                                            fontWeight: isActive ? 700 : 500,
                                                            color: isActive ? '#1d4ed8' : '#374151',
                                                        }}
                                                    >
                                                        {opt.label}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                                                        {opt.description}
                                                    </div>
                                                </div>
                                                <span
                                                    style={{
                                                        width: 18,
                                                        height: 18,
                                                        borderRadius: '50%',
                                                        flexShrink: 0,
                                                        border: isActive ? '2px solid #2563eb' : '2px solid #d1d5db',
                                                        background: isActive ? '#2563eb' : '#fff',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: 8,
                                                        color: '#fff',
                                                        transition: 'all 0.15s',
                                                    }}
                                                >
                                                    {isActive && '●'}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <Button
                                variant="primary"
                                onClick={() => setStep('confirm')}
                                disabled={!canProceed}
                                fullWidth
                            >
                                Preview &amp; confirm →
                            </Button>
                        </>
                    )}
                </div>
            )}

            {/* ── Confirm ── */}
            {step === 'confirm' &&
                employee &&
                (() => {
                    const chip = COMPANY_VALUE_CHIPS.find(c => c.value === value); // primary chip (first selected)
                    const allChips = selectedValues
                        .map(v => COMPANY_VALUE_CHIPS.find(c => c.value === v))
                        .filter(Boolean);
                    const rewardAmountUsd = 25; // demo: manager default award
                    const isFrontline = employee.isFrontline === true;
                    const qrData = encodeURIComponent(
                        `https://app.clearcompany.com/claim?emp=${employee.id}&ref=recognition-${Date.now()}`,
                    );
                    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${qrData}&margin=8&color=1e293b`;

                    return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* ── Recipient ── */}
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 14,
                                    padding: '16px 18px',
                                    background: '#f8fafc',
                                    borderRadius: 12,
                                    border: '1px solid #e2e8f0',
                                }}
                            >
                                <Avatar
                                    alt={`${employee.firstName} ${employee.lastName}`}
                                    size="lg"
                                    color={employee.avatarColor}
                                >
                                    {`${employee.firstName[0]}${employee.lastName[0]}`}
                                </Avatar>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                                            {employee.firstName} {employee.lastName}
                                        </span>
                                        {isFrontline && (
                                            <span
                                                style={{
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    letterSpacing: '0.06em',
                                                    textTransform: 'uppercase',
                                                    color: '#9333ea',
                                                    background: '#faf5ff',
                                                    border: '1px solid #d8b4fe',
                                                    borderRadius: 4,
                                                    padding: '2px 6px',
                                                }}
                                            >
                                                Frontline
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{employee.title}</div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 1 }}>{employee.email}</div>
                                </div>
                            </div>

                            {/* ── Recognition card ── */}
                            <div
                                style={{
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 12,
                                    overflow: 'hidden',
                                    background: '#fff',
                                }}
                            >
                                {/* Value chips row */}
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        flexWrap: 'wrap',
                                        gap: 6,
                                        padding: '14px 18px',
                                        borderBottom: '1px solid #f1f5f9',
                                    }}
                                >
                                    {allChips.map(
                                        c =>
                                            c && (
                                                <div
                                                    key={c.value}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 6,
                                                        padding: '4px 11px',
                                                        borderRadius: 20,
                                                        border: `1.5px solid ${c.border}`,
                                                        background: c.bg,
                                                        color: c.accent,
                                                        fontSize: 12,
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    <span style={{ fontSize: 14 }}>{c.emoji}</span>
                                                    <span>{c.value}</span>
                                                </div>
                                            ),
                                    )}
                                </div>

                                {/* Visibility row */}
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '10px 18px',
                                        borderBottom: '1px solid #f1f5f9',
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: '#94a3b8',
                                            letterSpacing: '0.06em',
                                            textTransform: 'uppercase',
                                            flex: 1,
                                        }}
                                    >
                                        Visibility
                                    </span>
                                    <Badge color="info" variant="outline" size="sm">
                                        {VISIBILITY_LABELS[visibility]}
                                    </Badge>
                                </div>

                                {/* Message */}
                                <div style={{ padding: '16px 18px', borderBottom: '1px solid #f1f5f9' }}>
                                    <div
                                        style={{
                                            fontSize: 10,
                                            fontWeight: 700,
                                            letterSpacing: '0.08em',
                                            textTransform: 'uppercase',
                                            color: '#94a3b8',
                                            marginBottom: 10,
                                        }}
                                    >
                                        Message
                                    </div>
                                    <div
                                        style={{
                                            borderLeft: '3px solid #e2e8f0',
                                            paddingLeft: 14,
                                        }}
                                    >
                                        <p
                                            style={{
                                                margin: 0,
                                                fontSize: 14,
                                                color: '#1e293b',
                                                lineHeight: 1.7,
                                                whiteSpace: 'pre-wrap',
                                            }}
                                        >
                                            {message}
                                        </p>
                                    </div>
                                    <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>
                                        From: <strong style={{ color: '#64748b' }}>{senderFirstName}</strong>
                                    </div>
                                </div>

                                {/* Reward */}
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 14,
                                        padding: '14px 18px',
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: 10,
                                            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: 20,
                                            flexShrink: 0,
                                        }}
                                    >
                                        🎁
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>
                                            ${rewardAmountUsd} USD
                                        </div>
                                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 1 }}>
                                            Guusto Gift Card · 60,000+ merchants
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── Frontline QR code ── */}
                            {isFrontline && (
                                <div
                                    style={{
                                        border: '1.5px solid #d8b4fe',
                                        borderRadius: 12,
                                        background: '#faf5ff',
                                        padding: '16px 18px',
                                        display: 'flex',
                                        gap: 16,
                                        alignItems: 'flex-start',
                                    }}
                                >
                                    <img
                                        src={qrUrl}
                                        alt="QR code for frontline employee to claim gift"
                                        width={80}
                                        height={80}
                                        style={{ borderRadius: 8, flexShrink: 0, border: '1px solid #e9d5ff' }}
                                    />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div
                                            style={{
                                                fontSize: 13,
                                                fontWeight: 700,
                                                color: '#7e22ce',
                                                marginBottom: 4,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                            }}
                                        >
                                            <span>📲</span> Frontline claim code
                                        </div>
                                        <p style={{ margin: 0, fontSize: 12, color: '#6b21a8', lineHeight: 1.55 }}>
                                            {employee.firstName} doesn't have a ClearCompany account. Show them this QR
                                            code so they can claim their gift card from any phone — no login needed.
                                        </p>
                                        <div
                                            style={{
                                                marginTop: 8,
                                                fontSize: 11,
                                                fontWeight: 600,
                                                color: '#9333ea',
                                                fontFamily: 'monospace',
                                                background: '#f3e8ff',
                                                border: '1px solid #e9d5ff',
                                                borderRadius: 6,
                                                padding: '4px 8px',
                                                display: 'inline-block',
                                            }}
                                        >
                                            Also sent to: {employee.email}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── Approval status ── */}
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: 12,
                                    padding: '14px 18px',
                                    background: '#f0fdf4',
                                    border: '1px solid #bbf7d0',
                                    borderRadius: 12,
                                }}
                            >
                                <div
                                    style={{
                                        width: 24,
                                        height: 24,
                                        borderRadius: '50%',
                                        background: '#22c55e',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                        marginTop: 1,
                                    }}
                                >
                                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>✓</span>
                                </div>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>
                                        No approval needed
                                    </div>
                                    <div style={{ fontSize: 12, color: '#166534', marginTop: 2, lineHeight: 1.5 }}>
                                        As the manager, you're authorizing this recognition directly. The reward will be
                                        sent immediately.
                                    </div>
                                </div>
                            </div>

                            {/* ── CTAs ── */}
                            <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                                <Button variant="secondary" onClick={() => setStep('compose')} disabled={isSubmitting}>
                                    ← Back
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={() => void handleSubmit()}
                                    loading={isSubmitting}
                                    fullWidth
                                >
                                    Send Recognition & ${rewardAmountUsd} Reward 🎁
                                </Button>
                            </div>
                        </div>
                    );
                })()}

            {/* ── Success ── */}
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
                    <div style={{ fontSize: 64, lineHeight: 1 }}>🎉</div>
                    <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', margin: 0 }}>Recognition sent!</h2>
                    <p style={{ fontSize: 15, color: '#64748b', margin: 0, lineHeight: 1.6, maxWidth: 320 }}>
                        Your recognition has been submitted and will appear in the company feed.
                    </p>
                    <Button variant="primary" onClick={handleClose}>
                        Done
                    </Button>
                </div>
            )}
        </Drawer>
    );
}

// ---------------------------------------------------------------------------
// PeopleToRecognizeWidget
// ---------------------------------------------------------------------------

interface PeopleToRecognizeWidgetProps {
    onRecognize: (emp: MockEmployee) => void;
    scope: 'company' | 'team';
}

// Team-scope employees (CS team) for mock fallback when scope === 'team'
const TEAM_EMPLOYEE_IDS = new Set(['emp_001', 'emp_002', 'emp_003']);

function PeopleToRecognizeWidget({ onRecognize, scope }: PeopleToRecognizeWidgetProps) {
    const [employees, setEmployees] = useState<NudgeEmployee[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams({ limit: '5', scope });
                const res = await fetch(`/api/rr/nudges/people-to-recognize?${params}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data: NudgesResponse = await res.json();
                if (!cancelled) setEmployees(data.employees ?? []);
            } catch {
                // Fall back to mock data filtered by scope
                if (!cancelled) {
                    const pool =
                        scope === 'team'
                            ? MOCK_ALL_EMPLOYEES.filter(e => TEAM_EMPLOYEE_IDS.has(e.id))
                            : MOCK_ALL_EMPLOYEES;
                    setEmployees(
                        pool.slice(0, 5).map(e => ({
                            id: e.id,
                            firstName: e.firstName,
                            lastName: e.lastName,
                            title: e.title,
                            daysSinceLastRecognized: e.lastRecognizedDaysAgo,
                            avatarColor: e.avatarColor,
                        })),
                    );
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [scope]); // re-fetch whenever scope changes

    const overdueCount = employees.filter(
        e => e.daysSinceLastRecognized === null || e.daysSinceLastRecognized > 30,
    ).length;

    return (
        <Card>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: !loading && overdueCount > 0 ? 4 : 0,
                    }}
                >
                    <span style={{ fontSize: 16 }}>👥</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>People to Recognize</span>
                </div>
                {!loading && overdueCount > 0 && (
                    <p style={{ margin: 0, fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                        It's been a while since you recognized some of your team members.
                    </p>
                )}
            </div>

            {/* Body — horizontal scroll grid */}
            <div style={{ padding: '12px 16px' }}>
                {loading ? (
                    <div style={{ display: 'flex', gap: 12 }}>
                        {[1, 2, 3, 4].map(i => (
                            <div
                                key={i}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: 6,
                                    minWidth: 68,
                                }}
                            >
                                <Skeleton height={52} width={52} circle />
                                <Skeleton height={8} width={48} />
                                <Skeleton height={7} width={32} />
                            </div>
                        ))}
                    </div>
                ) : employees.length === 0 ? (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                        Your team is all caught up 🎉
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
                        {employees.map(emp => {
                            const mockEmp = MOCK_ALL_EMPLOYEES.find(m => m.id === emp.id) ?? {
                                ...emp,
                                email: `${emp.firstName.toLowerCase()}.${emp.lastName.toLowerCase()}@company.com`,
                                avatarColor: emp.avatarColor ?? 'blue',
                                isFrontline: false,
                                lastRecognizedDaysAgo: emp.daysSinceLastRecognized,
                                recognitionsThisQuarter: 0,
                                recognitionsByMonth: [0, 0, 0, 0, 0, 0, 0, 0, 0] as number[],
                                recognitionHistory: [] as [],
                            };
                            const isOverdue = emp.daysSinceLastRecognized === null || emp.daysSinceLastRecognized > 30;
                            return (
                                <button
                                    key={emp.id}
                                    type="button"
                                    onClick={() => onRecognize(mockEmp as MockEmployee)}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: 5,
                                        padding: '10px 8px 8px',
                                        borderRadius: 12,
                                        border: '1.5px solid transparent',
                                        background: 'none',
                                        cursor: 'pointer',
                                        minWidth: 72,
                                        flex: '0 0 auto',
                                        transition: 'background 0.12s, border-color 0.12s',
                                    }}
                                    onMouseEnter={e => {
                                        (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc';
                                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0';
                                    }}
                                    onMouseLeave={e => {
                                        (e.currentTarget as HTMLButtonElement).style.background = 'none';
                                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent';
                                    }}
                                >
                                    <Avatar
                                        alt={`${emp.firstName} ${emp.lastName}`}
                                        size="md"
                                        color={emp.avatarColor ?? 'blue'}
                                    >
                                        {`${emp.firstName[0]}${emp.lastName[0]}`}
                                    </Avatar>
                                    <span
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 600,
                                            color: '#1e293b',
                                            textAlign: 'center',
                                            maxWidth: 68,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {emp.firstName}
                                    </span>
                                    <span
                                        style={{
                                            fontSize: 10,
                                            color: isOverdue ? '#d97706' : '#94a3b8',
                                            fontWeight: isOverdue ? 600 : 400,
                                            textAlign: 'center',
                                        }}
                                    >
                                        {emp.daysSinceLastRecognized === null
                                            ? 'Never'
                                            : `${emp.daysSinceLastRecognized}d ago`}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// UpcomingCelebrationsWidget
// ---------------------------------------------------------------------------

type CelebrationTab = 'anniversary' | 'birthday';

interface CelebrationEntry {
    id: string;
    firstName: string;
    lastName: string;
    avatarColor: string;
    /** MM-DD of the upcoming event */
    mmdd: string;
    /** Years (for anniversaries) */
    years?: number;
}

function getDaysUntilNextOccurrence(mmdd: string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [mm, dd] = mmdd.split('-').map(Number);
    const next = new Date(today.getFullYear(), (mm as number) - 1, dd as number);
    if (next < today) next.setFullYear(next.getFullYear() + 1);
    return Math.round((next.getTime() - today.getTime()) / 86400000);
}

function formatCelebrationDate(mmdd: string): string {
    const [mm, dd] = mmdd.split('-').map(Number);
    const date = new Date(2000, (mm as number) - 1, dd as number);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

function buildCelebrationList(employees: MockEmployee[], type: CelebrationTab, today: Date): CelebrationEntry[] {
    const todayMs = today.getTime();

    return employees
        .flatMap(emp => {
            const raw = type === 'anniversary' ? emp.hireDate : emp.birthday;
            if (!raw) return [];
            const [yyyy, mm, dd] = raw.split('-').map(Number);
            const nextDate = new Date(today.getFullYear(), (mm as number) - 1, dd as number);
            if (nextDate.getTime() < todayMs) nextDate.setFullYear(nextDate.getFullYear() + 1);
            const mmdd = `${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
            const years = type === 'anniversary' ? nextDate.getFullYear() - (yyyy as number) : undefined;
            return [
                {
                    id: emp.id,
                    firstName: emp.firstName,
                    lastName: emp.lastName,
                    avatarColor: emp.avatarColor,
                    mmdd,
                    years,
                    _ms: nextDate.getTime(),
                },
            ];
        })
        .sort((a, b) => a._ms - b._ms)
        .slice(0, 5)
        .map(({ _ms: _unused, ...rest }) => rest);
}

function UpcomingCelebrationsWidget() {
    const [tab, setTab] = useState<CelebrationTab>('anniversary');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const entries = buildCelebrationList(MOCK_ALL_EMPLOYEES, tab, today);

    const TAB_STYLES = (active: boolean): React.CSSProperties => ({
        padding: '5px 12px',
        borderRadius: 20,
        border: 'none',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        background: active ? '#0f766e' : 'transparent',
        color: active ? '#fff' : '#64748b',
        transition: 'all 0.12s',
        whiteSpace: 'nowrap',
        flex: 1,
    });

    return (
        <Card>
            {/* Header */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>
                    🎉 Upcoming Celebrations
                </div>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 24, padding: 3 }}>
                    <button style={TAB_STYLES(tab === 'anniversary')} onClick={() => setTab('anniversary')}>
                        Work Anniversaries
                    </button>
                    <button style={TAB_STYLES(tab === 'birthday')} onClick={() => setTab('birthday')}>
                        Birthdays
                    </button>
                </div>
            </div>

            {/* Horizontal scroll row */}
            <div style={{ padding: '12px 16px' }}>
                {entries.length === 0 ? (
                    <div style={{ padding: '16px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                        No upcoming {tab === 'anniversary' ? 'anniversaries' : 'birthdays'}
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
                        {entries.map(entry => {
                            const daysAway = getDaysUntilNextOccurrence(entry.mmdd);
                            const isToday = daysAway === 0;
                            const isSoon = daysAway <= 7;
                            return (
                                <div
                                    key={entry.id}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: 5,
                                        padding: '10px 8px 8px',
                                        borderRadius: 12,
                                        minWidth: 76,
                                        flex: '0 0 auto',
                                        background: isToday ? '#f0fdfa' : 'transparent',
                                        border: isToday ? '1.5px solid #99f6e4' : '1.5px solid transparent',
                                    }}
                                >
                                    <Avatar
                                        alt={`${entry.firstName} ${entry.lastName}`}
                                        size="md"
                                        color={entry.avatarColor}
                                    >
                                        {`${entry.firstName[0]}${entry.lastName[0]}`}
                                    </Avatar>
                                    <span
                                        style={{ fontSize: 11, fontWeight: 600, color: '#1e293b', textAlign: 'center' }}
                                    >
                                        {entry.firstName}
                                    </span>
                                    <span
                                        style={{
                                            fontSize: 10,
                                            fontWeight: 700,
                                            letterSpacing: '0.04em',
                                            color: isToday ? '#0f766e' : isSoon ? '#d97706' : '#94a3b8',
                                            textAlign: 'center',
                                            lineHeight: 1.3,
                                        }}
                                    >
                                        {isToday ? '🎉 Today!' : formatCelebrationDate(entry.mmdd)}
                                        {entry.years !== undefined && (
                                            <span style={{ display: 'block', fontWeight: 400 }}>
                                                ({entry.years} yr{entry.years !== 1 ? 's' : ''})
                                            </span>
                                        )}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// LastRecognizedByYouWidget
// ---------------------------------------------------------------------------

interface RecentGiftRecipient {
    id: string;
    firstName: string;
    lastName: string;
    daysAgo: number;
    avatarColor: string;
}

// Static demo data — 3 most recent gift recognitions sent by this manager
const RECENT_GIFT_RECIPIENTS: RecentGiftRecipient[] = [
    { id: 'emp_008', firstName: 'Lorraine', lastName: 'Alexus', daysAgo: 2, avatarColor: 'pink' },
    { id: 'emp_004', firstName: 'Daironex', lastName: 'Batista', daysAgo: 14, avatarColor: 'orange' },
    { id: 'emp_003', firstName: 'Maddy', lastName: 'Bender', daysAgo: 30, avatarColor: 'teal' },
];

function LastRecognizedByYouWidget() {
    return (
        <Card>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                    Last Recognized by You <span style={{ color: '#f59e0b' }}>· Gifts</span>
                </span>
            </div>
            <div style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
                    {RECENT_GIFT_RECIPIENTS.map(person => (
                        <div
                            key={person.id}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 5,
                                padding: '10px 10px 8px',
                                borderRadius: 12,
                                minWidth: 88,
                                flex: '0 0 auto',
                            }}
                        >
                            <Avatar alt={`${person.firstName} ${person.lastName}`} size="lg" color={person.avatarColor}>
                                {`${person.firstName[0]}${person.lastName[0]}`}
                            </Avatar>
                            <span
                                style={{
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: '#1e293b',
                                    textAlign: 'center',
                                }}
                            >
                                {person.firstName}
                            </span>
                            <span
                                style={{
                                    fontSize: 11,
                                    color: '#94a3b8',
                                    textAlign: 'center',
                                }}
                            >
                                {person.daysAgo} day{person.daysAgo !== 1 ? 's' : ''} ago
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// LeaderboardWidget
// ---------------------------------------------------------------------------

type LeaderboardMetric = 'received' | 'sent';
type LeaderboardPeriod = 'month' | 'quarter';

function rankLabel(rank: number): string {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `${rank}`;
}

function rankStyle(rank: number): React.CSSProperties {
    if (rank === 1) return { fontSize: 20 };
    if (rank === 2) return { fontSize: 20 };
    if (rank === 3) return { fontSize: 20 };
    return { color: '#cbd5e1', fontWeight: 700, fontSize: 13 };
}

function LeaderboardWidget() {
    const [metric, setMetric] = useState<LeaderboardMetric>('received');
    const [period, setPeriod] = useState<LeaderboardPeriod>('month');
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);

    // Distinct static fallback datasets so each metric+period combo shows
    // different people in a different order, making the toggles feel meaningful.
    const FALLBACK: Record<string, LeaderboardEntry[]> = {
        'received:month': [
            { rank: 1, employeeId: 'emp_003', employeeName: 'Maddy Bender', avatarColor: 'teal', count: 9 },
            { rank: 2, employeeId: 'emp_001', employeeName: 'Samuel Abramsky', avatarColor: 'blue', count: 7 },
            { rank: 3, employeeId: 'emp_010', employeeName: 'Daironex Batista', avatarColor: 'teal', count: 5 },
            { rank: 4, employeeId: 'emp_002', employeeName: 'Jordan Beaman', avatarColor: 'violet', count: 3 },
            { rank: 5, employeeId: 'emp_008', employeeName: 'Lorraine Alexus', avatarColor: 'pink', count: 2 },
        ],
        'received:quarter': [
            { rank: 1, employeeId: 'emp_001', employeeName: 'Samuel Abramsky', avatarColor: 'blue', count: 18 },
            { rank: 2, employeeId: 'emp_003', employeeName: 'Maddy Bender', avatarColor: 'teal', count: 14 },
            { rank: 3, employeeId: 'emp_008', employeeName: 'Lorraine Alexus', avatarColor: 'pink', count: 11 },
            { rank: 4, employeeId: 'emp_010', employeeName: 'Daironex Batista', avatarColor: 'teal', count: 7 },
            { rank: 5, employeeId: 'emp_002', employeeName: 'Jordan Beaman', avatarColor: 'violet', count: 4 },
        ],
        'sent:month': [
            { rank: 1, employeeId: 'emp_002', employeeName: 'Jordan Beaman', avatarColor: 'violet', count: 6 },
            { rank: 2, employeeId: 'emp_008', employeeName: 'Lorraine Alexus', avatarColor: 'pink', count: 5 },
            { rank: 3, employeeId: 'emp_001', employeeName: 'Samuel Abramsky', avatarColor: 'blue', count: 3 },
            { rank: 4, employeeId: 'emp_003', employeeName: 'Maddy Bender', avatarColor: 'teal', count: 2 },
            { rank: 5, employeeId: 'emp_010', employeeName: 'Daironex Batista', avatarColor: 'teal', count: 1 },
        ],
        'sent:quarter': [
            { rank: 1, employeeId: 'emp_008', employeeName: 'Lorraine Alexus', avatarColor: 'pink', count: 15 },
            { rank: 2, employeeId: 'emp_002', employeeName: 'Jordan Beaman', avatarColor: 'violet', count: 12 },
            { rank: 3, employeeId: 'emp_010', employeeName: 'Daironex Batista', avatarColor: 'teal', count: 9 },
            { rank: 4, employeeId: 'emp_001', employeeName: 'Samuel Abramsky', avatarColor: 'blue', count: 6 },
            { rank: 5, employeeId: 'emp_003', employeeName: 'Maddy Bender', avatarColor: 'teal', count: 3 },
        ],
    };

    const fetchLeaderboard = useCallback(async (m: LeaderboardMetric, p: LeaderboardPeriod) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ period: p, metric: m, limit: '5' });
            const res = await fetch(`/api/rr/leaderboard?${params}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: LeaderboardResponse = await res.json();
            setEntries(data.entries ?? []);
        } catch {
            setEntries(FALLBACK[`${m}:${p}`] ?? []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchLeaderboard(metric, period);
    }, [metric, period, fetchLeaderboard]);

    return (
        <Card>
            {/* Header */}
            <div
                style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }}
            >
                <span style={{ fontSize: 16 }}>🏆</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Recognition Leaderboard</span>
            </div>

            {/* Toggles */}
            <div
                style={{
                    padding: '12px 20px',
                    borderBottom: '1px solid #f1f5f9',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                }}
            >
                {/* Metric toggle */}
                <div
                    style={{
                        display: 'flex',
                        gap: 2,
                        background: '#f1f5f9',
                        borderRadius: 8,
                        padding: 3,
                    }}
                >
                    {(
                        [
                            { value: 'received', label: 'Most Recognized' },
                            { value: 'sent', label: 'Top Recognizers' },
                        ] as { value: LeaderboardMetric; label: string }[]
                    ).map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => setMetric(opt.value)}
                            style={{
                                flex: 1,
                                padding: '4px 8px',
                                borderRadius: 5,
                                border: metric === opt.value ? '1.5px solid #145eb8' : '1.5px solid transparent',
                                background: metric === opt.value ? '#fff' : 'transparent',
                                cursor: 'pointer',
                                fontSize: 11,
                                fontWeight: 600,
                                color: metric === opt.value ? '#145eb8' : '#64748b',
                                boxShadow: metric === opt.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.1s',
                                whiteSpace: 'nowrap' as const,
                            }}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                {/* Period toggle */}
                <div
                    style={{
                        display: 'flex',
                        gap: 2,
                        background: '#f1f5f9',
                        borderRadius: 8,
                        padding: 3,
                    }}
                >
                    {(
                        [
                            { value: 'month', label: 'This Month' },
                            { value: 'quarter', label: 'This Quarter' },
                        ] as { value: LeaderboardPeriod; label: string }[]
                    ).map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => setPeriod(opt.value)}
                            style={{
                                flex: 1,
                                padding: '4px 8px',
                                borderRadius: 5,
                                border: period === opt.value ? '1.5px solid #145eb8' : '1.5px solid transparent',
                                background: period === opt.value ? '#fff' : 'transparent',
                                cursor: 'pointer',
                                fontSize: 11,
                                fontWeight: 600,
                                color: period === opt.value ? '#145eb8' : '#64748b',
                                boxShadow: period === opt.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.1s',
                            }}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Entries */}
            <div style={{ padding: '8px 0' }}>
                {loading ? (
                    [1, 2, 3, 4, 5].map(i => (
                        <div
                            key={i}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '10px 20px',
                            }}
                        >
                            <Skeleton height={20} width={20} />
                            <Skeleton height={32} width={32} circle />
                            <div style={{ flex: 1 }}>
                                <Skeleton height={10} mb={4} />
                            </div>
                            <Skeleton height={20} width={30} />
                        </div>
                    ))
                ) : entries.length === 0 ? (
                    <div style={{ padding: '24px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                        No recognitions yet this period.
                    </div>
                ) : (
                    entries.map(entry => (
                        <div
                            key={entry.employeeId}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '10px 20px',
                                borderBottom: '1px solid #f8f9fa',
                            }}
                        >
                            <div style={{ width: 24, textAlign: 'center', flexShrink: 0, ...rankStyle(entry.rank) }}>
                                {rankLabel(entry.rank)}
                            </div>
                            <Avatar alt={entry.employeeName} size="sm" color={entry.avatarColor ?? 'blue'}>
                                {initials(entry.employeeName)}
                            </Avatar>
                            <div
                                style={{
                                    flex: 1,
                                    fontSize: 13,
                                    fontWeight: entry.rank <= 3 ? 600 : 400,
                                    color: '#1e293b',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                {entry.employeeName}
                            </div>
                            <Badge color="info" variant="light" size="sm">
                                {entry.count}
                            </Badge>
                        </div>
                    ))
                )}
            </div>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function RecognitionHomePage() {
    const { setHeaderActions, setHeaderDescription } = useOutletContext<RecognitionAreaOutletContext>();
    const { persona } = useRecognitionPersona();

    const [scope, setScope] = useState<'company' | 'team'>('company');
    const [shoutouts, setShoutouts] = useState<Shoutout[]>([]);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [reactingId, setReactingId] = useState<string | null>(null);

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerTarget, setDrawerTarget] = useState<MockEmployee | null>(null);

    const openDrawer = useCallback((emp: MockEmployee | null) => {
        setDrawerTarget(emp);
        setDrawerOpen(true);
    }, []);

    // ── Header subtitle ──
    useEffect(() => {
        setHeaderDescription(
            persona.type === 'manager'
                ? "See who's been recognized and celebrate your team."
                : "See who's been recognized and celebrate your colleagues.",
        );
        return () => setHeaderDescription('');
    }, [setHeaderDescription, persona.type]);

    // ── Header action ──
    useEffect(() => {
        const actions: ReactNode[] = [
            <Button key="recognize" variant="primary" onClick={() => openDrawer(null)}>
                Recognize Greatness ✨
            </Button>,
        ];
        setHeaderActions(actions);
        return () => setHeaderActions([]);
    }, [setHeaderActions, openDrawer]);

    // ── Feed fetch — passes userId so the backend can scope "My Team" correctly ──
    const fetchFeed = useCallback(async (p: number, s: 'company' | 'team', append: boolean, userId: string) => {
        if (p === 1) setLoading(true);
        else setLoadingMore(true);
        try {
            const params = new URLSearchParams({ scope: s, page: String(p), limit: String(PAGE_SIZE) });
            const res = await fetch(`/api/rr/feed/home?${params}`, {
                headers: { 'x-user-id': userId },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: FeedResponse = await res.json();
            setShoutouts(prev => (append ? [...prev, ...data.items] : data.items));
            setTotalPages(data.totalPages);
        } catch {
            // Fall back to the generic shoutouts endpoint (same data, no scope filter)
            try {
                const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) });
                const res = await fetch(`/api/rr/shoutouts?${params}`, {
                    headers: { 'x-user-id': userId },
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data: FeedResponse = await res.json();
                setShoutouts(prev => (append ? [...prev, ...data.items] : data.items));
                setTotalPages(data.totalPages);
            } catch {
                /* silent — empty state handles it */
            }
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, []);

    useEffect(() => {
        setPage(1);
        void fetchFeed(1, scope, false, persona.userId);
    }, [scope, persona.userId]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleLoadMore = () => {
        const next = page + 1;
        setPage(next);
        void fetchFeed(next, scope, true, persona.userId);
    };

    // ── Reactions ──
    const handleReact = useCallback(async (shoutoutId: string, emoji: string) => {
        // Optimistic update — toggle immediately so the UI feels instant
        setShoutouts(prev =>
            prev.map(s => {
                if (s.id !== shoutoutId) return s;
                const existing = s.reactions.find(r => r.emoji === emoji);
                const reactions = existing
                    ? s.reactions.map(r => (r.emoji === emoji ? { ...r, count: r.count + 1 } : r))
                    : [...s.reactions, { emoji, count: 1 }];
                return { ...s, reactions };
            }),
        );
        setReactingId(shoutoutId);
        try {
            const res = await fetch(`/api/rr/shoutouts/${shoutoutId}/reactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-id': CURRENT_USER_ID },
                body: JSON.stringify({ emoji }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: { reactions: ShoutoutReaction[]; action: string } = await res.json();
            // Sync with authoritative server state
            setShoutouts(prev => prev.map(s => (s.id === shoutoutId ? { ...s, reactions: data.reactions } : s)));
        } catch {
            // Keep optimistic update visible for this session
        } finally {
            setReactingId(null);
        }
    }, []);

    // ── Responsive breakpoint (simple JS-driven) ──
    const [isNarrow, setIsNarrow] = useState(() => window.innerWidth <= 768);
    useEffect(() => {
        const handler = () => setIsNarrow(window.innerWidth <= 768);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px 0' }}>
            {/* ── Scope filter bar — controls both feed and People to Recognize ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
                    {scope === 'company' ? 'Showing company-wide recognitions' : 'Showing your team only'}
                </span>
                <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
                    {(
                        [
                            { value: 'company', label: 'Company', icon: '🌐' },
                            { value: 'team', label: 'My Team', icon: '👥' },
                        ] as { value: 'company' | 'team'; label: string; icon: string }[]
                    ).map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => setScope(opt.value)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 7,
                                padding: '7px 16px',
                                borderRadius: 7,
                                border: 'none',
                                background: scope === opt.value ? '#fff' : 'transparent',
                                cursor: 'pointer',
                                fontSize: 13,
                                fontWeight: scope === opt.value ? 700 : 500,
                                color: scope === opt.value ? '#0f172a' : '#64748b',
                                boxShadow:
                                    scope === opt.value
                                        ? '0 1px 4px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)'
                                        : 'none',
                                transition: 'all 0.12s',
                                whiteSpace: 'nowrap' as const,
                            }}
                        >
                            <span style={{ fontSize: 14 }}>{opt.icon}</span>
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Two-column layout ── */}
            <div
                style={{
                    display: 'flex',
                    gap: 24,
                    alignItems: 'flex-start',
                    flexDirection: isNarrow ? 'column' : 'row',
                }}
            >
                {/* ── Left column ── */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Quick-compose bar */}
                    <Card>
                        <div style={{ padding: '14px 20px 10px' }}>
                            <button
                                type="button"
                                onClick={() => openDrawer(null)}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '10px 14px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 8,
                                    background: '#f8fafc',
                                    color: '#94a3b8',
                                    fontSize: 14,
                                    cursor: 'pointer',
                                    outline: 'none',
                                    transition: 'border-color 0.15s',
                                    marginBottom: 10,
                                }}
                                onMouseEnter={e =>
                                    ((e.currentTarget as HTMLButtonElement).style.borderColor = '#93c5fd')
                                }
                                onMouseLeave={e =>
                                    ((e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0')
                                }
                            >
                                Recognize a colleague…
                            </button>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={() => openDrawer(null)}
                                    style={{
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 6,
                                        padding: '7px 16px',
                                        borderRadius: 20,
                                        border: '1.5px solid #bfdbfe',
                                        background: '#eff6ff',
                                        color: '#1d4ed8',
                                        fontSize: 13,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        transition: 'all 0.12s',
                                    }}
                                    onMouseEnter={e => {
                                        (e.currentTarget as HTMLButtonElement).style.background = '#dbeafe';
                                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#93c5fd';
                                    }}
                                    onMouseLeave={e => {
                                        (e.currentTarget as HTMLButtonElement).style.background = '#eff6ff';
                                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#bfdbfe';
                                    }}
                                >
                                    ✨ Shoutout
                                </button>
                                <button
                                    type="button"
                                    onClick={() => openDrawer(null)}
                                    style={{
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 6,
                                        padding: '7px 16px',
                                        borderRadius: 20,
                                        border: '1.5px solid #bbf7d0',
                                        background: '#f0fdf4',
                                        color: '#15803d',
                                        fontSize: 13,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        transition: 'all 0.12s',
                                    }}
                                    onMouseEnter={e => {
                                        (e.currentTarget as HTMLButtonElement).style.background = '#dcfce7';
                                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#86efac';
                                    }}
                                    onMouseLeave={e => {
                                        (e.currentTarget as HTMLButtonElement).style.background = '#f0fdf4';
                                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#bbf7d0';
                                    }}
                                >
                                    🎁 Gift
                                </button>
                            </div>
                        </div>
                    </Card>

                    {/* Feed */}
                    {loading ? (
                        [1, 2, 3].map(i => (
                            <Card key={i}>
                                <div style={{ padding: '20px 24px' }}>
                                    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                                        <Skeleton height={40} width={40} circle />
                                        <div style={{ flex: 1 }}>
                                            <Skeleton height={12} mb={8} width="60%" />
                                            <Skeleton height={10} width="40%" />
                                        </div>
                                    </div>
                                    <Skeleton height={10} mb={6} />
                                    <Skeleton height={10} mb={6} width="90%" />
                                    <Skeleton height={10} width="70%" />
                                </div>
                            </Card>
                        ))
                    ) : shoutouts.length === 0 ? (
                        <Card>
                            <div style={{ padding: '60px 24px', textAlign: 'center' }}>
                                <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
                                <div
                                    style={{
                                        fontWeight: 700,
                                        fontSize: 16,
                                        color: '#1e293b',
                                        marginBottom: 8,
                                    }}
                                >
                                    No recognitions yet — be the first to send one 🎯
                                </div>
                                <div style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>
                                    Recognize a colleague and it will appear here.
                                </div>
                                <Button variant="primary" onClick={() => openDrawer(null)}>
                                    Send Recognition ✨
                                </Button>
                            </div>
                        </Card>
                    ) : (
                        shoutouts.map(s => (
                            <ShoutoutCard key={s.id} shoutout={s} onReact={handleReact} reactingId={reactingId} />
                        ))
                    )}

                    {/* Load more */}
                    {!loading && page < totalPages && (
                        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
                            <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
                                {loadingMore ? (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Loader size="sm" /> Loading…
                                    </span>
                                ) : (
                                    'Load more'
                                )}
                            </Button>
                        </div>
                    )}
                </div>

                {/* ── Right rail ── */}
                <div
                    style={{
                        width: isNarrow ? '100%' : 320,
                        flexShrink: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 20,
                    }}
                >
                    <PeopleToRecognizeWidget onRecognize={emp => openDrawer(emp)} scope={scope} />
                    <UpcomingCelebrationsWidget />
                    <LastRecognizedByYouWidget />
                    <LeaderboardWidget />
                </div>
            </div>

            {/* ── Recognize drawer ── */}
            <HomeRecognizeDrawer
                initialEmployee={drawerTarget}
                allEmployees={MOCK_ALL_EMPLOYEES}
                senderFirstName={persona.name.split(' ')[0]}
                opened={drawerOpen}
                onClose={() => {
                    setDrawerOpen(false);
                    setDrawerTarget(null);
                }}
            />
        </div>
    );
}
