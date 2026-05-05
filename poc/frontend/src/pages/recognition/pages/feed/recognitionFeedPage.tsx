/**
 * RecognitionFeedPage — /r/recognition/feed
 *
 * Company-wide recognition feed. Fetches live from GET /api/rr/shoutouts,
 * supports emoji reactions (POST /api/rr/shoutouts/:id/reactions),
 * full-text search, value filtering, and load-more pagination.
 *
 * Header actions (Give Recognition button) are injected into the
 * PageWrapper banner via RecognitionArea outlet context.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Button, Card, Loader, AlertBanner } from '@clearcompany/clearco-ui';
import type { RecognitionAreaOutletContext } from '../../recognitionArea';

// ---------------------------------------------------------------------------
// Types
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURRENT_USER_ID = 'demo-mgr-001';
const ALLOWED_REACTIONS = ['👏', '⭐', '🙌', '🔥', '❤️', '🚀'];
const PAGE_SIZE = 10;

// Company value emoji map (mirrors seed data)
const VALUE_EMOJI: Record<string, string> = {
    'Customer at the Core': '🤝',
    'Listen to Many, Execute as One': '💬',
    'Embrace Change': '🌱',
    'Accountable to Outcomes': '🎯',
    'Raise the Bar': '📈',
};

// Deterministic avatar colours keyed by name initial
const AVATAR_COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0284c7'];
function avatarColor(name: string): string {
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// ShoutoutCard
// ---------------------------------------------------------------------------

interface ShoutoutCardProps {
    shoutout: Shoutout;
    onReact: (id: string, emoji: string) => void;
    reactingId: string | null;
}

function ShoutoutCard({ shoutout, onReact, reactingId }: ShoutoutCardProps) {
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);

    // Close picker on outside click
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
                {/* ── Header: avatar + "Recipient recognized by Sender" ── */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                    {/* Recipient avatar */}
                    <div
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            background: avatarColor(shoutout.recipientName),
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
                        {/* Recognition headline */}
                        <div style={{ fontSize: 15, lineHeight: 1.4 }}>
                            <span style={{ fontWeight: 700, color: '#1e293b' }}>{shoutout.recipientName}</span>
                            <span style={{ color: '#64748b' }}> recognized by </span>
                            <span style={{ fontWeight: 700, color: '#1e293b' }}>{shoutout.senderName}</span>
                        </div>

                        {/* Timestamp + metadata row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>{relativeTime(shoutout.createdAt)}</span>

                            {/* Visibility badge */}
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

                            {/* AI sourced badge */}
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

                            {/* Gift badge */}
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

                {/* ── Value badges ── */}
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
                <p
                    style={{
                        margin: '0 0 16px',
                        fontSize: 14,
                        lineHeight: 1.6,
                        color: '#374151',
                    }}
                >
                    {shoutout.message}
                </p>

                {/* ── Reactions bar ── */}
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
                    {/* Existing reactions */}
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

                    {/* Add reaction button */}
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
// Main page
// ---------------------------------------------------------------------------

export function RecognitionFeedPage() {
    const navigate = useNavigate();
    const { setHeaderActions } = useOutletContext<RecognitionAreaOutletContext>();

    const [shoutouts, setShoutouts] = useState<Shoutout[]>([]);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filterValue, setFilterValue] = useState('');
    const [reactingId, setReactingId] = useState<string | null>(null);

    // All known values for filter dropdown — collected from feed items
    const [allValues, setAllValues] = useState<ShoutoutValue[]>([]);

    // ── Header action: "Give Recognition" ──────────────────────────────────
    useEffect(() => {
        setHeaderActions([
            <Button key="give" variant="primary" onClick={() => navigate('/r/recognition/manager')}>
                Give Recognition ✨
            </Button>,
        ]);
        return () => setHeaderActions([]);
    }, [setHeaderActions, navigate]);

    // ── Fetch feed ──────────────────────────────────────────────────────────
    const fetchFeed = useCallback(
        async (p: number, append: boolean) => {
            if (p === 1) setLoading(true);
            else setLoadingMore(true);

            try {
                const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) });
                if (filterValue) params.set('valueId', filterValue);
                const res = await fetch(`/api/rr/shoutouts?${params}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data: FeedResponse = await res.json();

                setShoutouts(prev => (append ? [...prev, ...data.items] : data.items));
                setTotalPages(data.totalPages);

                // Accumulate known values for filter bar
                setAllValues(prev => {
                    const existing = new Set(prev.map(v => v.id));
                    const next = [...prev];
                    for (const item of data.items) {
                        for (const v of item.values) {
                            if (!existing.has(v.id)) {
                                next.push(v);
                                existing.add(v.id);
                            }
                        }
                    }
                    return next;
                });
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load feed');
            } finally {
                setLoading(false);
                setLoadingMore(false);
            }
        },
        [filterValue],
    );

    // Initial load + when filter changes
    useEffect(() => {
        setPage(1);
        fetchFeed(1, false);
    }, [filterValue]); // eslint-disable-line react-hooks/exhaustive-deps

    // Load more
    const handleLoadMore = () => {
        const next = page + 1;
        setPage(next);
        fetchFeed(next, true);
    };

    // ── React to a shoutout ─────────────────────────────────────────────────
    const handleReact = useCallback(async (shoutoutId: string, emoji: string) => {
        // Optimistic update — toggle the reaction count immediately so the UI
        // feels instant even when the backend is slow or unavailable.
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
            // Keep optimistic update — the reaction is visible in this session
        } finally {
            setReactingId(null);
        }
    }, []);

    // ── Client-side search filter ───────────────────────────────────────────
    const visible = search.trim()
        ? shoutouts.filter(s => {
              const q = search.toLowerCase();
              return (
                  s.senderName.toLowerCase().includes(q) ||
                  s.recipientName.toLowerCase().includes(q) ||
                  s.message.toLowerCase().includes(q) ||
                  s.values.some(v => v.label.toLowerCase().includes(q))
              );
          })
        : shoutouts;

    // ── Render ──────────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '24px 0' }}>
            {/* Filter bar */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                }}
            >
                {/* Search */}
                <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
                    <span
                        style={{
                            position: 'absolute',
                            left: 10,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            fontSize: 14,
                            color: '#94a3b8',
                            pointerEvents: 'none',
                        }}
                    >
                        🔍
                    </span>
                    <input
                        type="text"
                        placeholder="Search by name or keyword…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '8px 12px 8px 32px',
                            fontSize: 14,
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            outline: 'none',
                            color: '#1e293b',
                        }}
                    />
                </div>

                {/* Value filter */}
                <select
                    value={filterValue}
                    onChange={e => setFilterValue(e.target.value)}
                    style={{
                        flex: '0 1 200px',
                        padding: '8px 12px',
                        fontSize: 14,
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        color: filterValue ? '#1e293b' : '#94a3b8',
                        background: '#fff',
                        outline: 'none',
                        cursor: 'pointer',
                    }}
                >
                    <option value="">All company values</option>
                    {allValues.map(v => (
                        <option key={v.id} value={v.id}>
                            {VALUE_EMOJI[v.label] ?? '⭐'} {v.label}
                        </option>
                    ))}
                </select>

                {/* Result count */}
                {!loading && (
                    <span style={{ fontSize: 13, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {visible.length} recognition{visible.length !== 1 ? 's' : ''}
                        {search ? ' matching' : ''}
                    </span>
                )}
            </div>

            {/* Error */}
            {error && (
                <AlertBanner variant="error" title="Could not load recognition feed">
                    {error} — make sure the backend is running on port 3001.
                </AlertBanner>
            )}

            {/* Loading skeleton */}
            {loading && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                    <Loader />
                </div>
            )}

            {/* Feed cards */}
            {!loading && visible.length === 0 && !error && (
                <Card>
                    <div style={{ padding: '60px 24px', textAlign: 'center' }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>🌟</div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b', marginBottom: 8 }}>
                            {search || filterValue ? 'No recognitions match your filters' : 'No recognitions yet'}
                        </div>
                        <div style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>
                            {search || filterValue
                                ? 'Try a different search term or clear the filter.'
                                : "Be the first to recognize a teammate's great work."}
                        </div>
                        {!search && !filterValue && (
                            <Button variant="primary" onClick={() => navigate('/r/recognition/manager')}>
                                Give Recognition ✨
                            </Button>
                        )}
                    </div>
                </Card>
            )}

            {!loading &&
                visible.map(s => (
                    <ShoutoutCard key={s.id} shoutout={s} onReact={handleReact} reactingId={reactingId} />
                ))}

            {/* Load more */}
            {!loading && !search && page < totalPages && (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
                    <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
                        {loadingMore ? 'Loading…' : 'Load more'}
                    </Button>
                </div>
            )}
        </div>
    );
}
