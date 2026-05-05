/**
 * FrontlinePage — /shoutout/:id
 *
 * Public, no-auth, mobile-first recognition page.
 * Designed for frontline employees who receive a link via QR code.
 * No AppLayout — completely standalone and unauthenticated.
 *
 * Features:
 *   - Fetches from GET /api/rr/shoutouts/public/:id (no auth required)
 *   - Mobile-first design, works on any phone
 *   - Shows: hero section, value chips, message, sender, emoji reactions
 *   - Share button copies the URL
 *   - "Powered by ClearCompany" footer
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const ALLOWED_REACTIONS = ['👏', '⭐', '🙌', '🔥', '❤️', '🚀'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PublicShoutout {
    id: string;
    senderName: string;
    recipientName: string;
    message: string;
    visibility: string;
    giftAmountCents: number | null;
    values: Array<{ id: string; label: string; emoji: string }>;
    reactions: Array<{ emoji: string; count: number }>;
    createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function initials(name: string): string {
    return name
        .split(' ')
        .map((p: string) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
}

// ---------------------------------------------------------------------------
// Loading / Error states
// ---------------------------------------------------------------------------

function LoadingState() {
    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #1e3a5f 0%, #1a56db 100%)',
            }}
        >
            <div style={{ textAlign: 'center', color: '#fff' }}>
                <div
                    style={{
                        width: 48,
                        height: 48,
                        border: '3px solid rgba(255,255,255,0.3)',
                        borderTopColor: '#fff',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                        margin: '0 auto 16px',
                    }}
                />
                <div style={{ fontSize: 16, opacity: 0.8 }}>Loading recognition…</div>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

function ErrorState({ message }: { message: string }) {
    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f9fafb',
                padding: 24,
            }}
        >
            <div style={{ textAlign: 'center', maxWidth: 320 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>😔</div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: '0 0 8px' }}>
                    Recognition not found
                </h2>
                <p style={{ fontSize: 15, color: '#6b7280', margin: 0, lineHeight: 1.6 }}>{message}</p>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

function ReactionsSection({
    shoutoutId,
    initialReactions,
}: {
    shoutoutId: string;
    initialReactions: Array<{ emoji: string; count: number }>;
}) {
    const [reactions, setReactions] = useState(initialReactions);
    const [myReactions, setMyReactions] = useState<Set<string>>(new Set());
    const [pending, setPending] = useState<string | null>(null);

    const reactionMap = Object.fromEntries(reactions.map(r => [r.emoji, r.count]));

    async function handleReaction(emoji: string) {
        if (pending) return;
        setPending(emoji);

        const alreadyReacted = myReactions.has(emoji);
        setMyReactions(prev => {
            const next = new Set(prev);
            if (alreadyReacted) next.delete(emoji);
            else next.add(emoji);
            return next;
        });
        setReactions(prev => {
            const existing = prev.find(r => r.emoji === emoji);
            if (alreadyReacted) {
                return prev
                    .map(r => (r.emoji === emoji ? { ...r, count: Math.max(0, r.count - 1) } : r))
                    .filter(r => r.count > 0);
            }
            if (existing) return prev.map(r => (r.emoji === emoji ? { ...r, count: r.count + 1 } : r));
            return [...prev, { emoji, count: 1 }];
        });

        try {
            const res = await fetch(`/api/rr/shoutouts/${shoutoutId}/reactions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': 'frontline_visitor',
                    'x-user-role': 'employee',
                },
                body: JSON.stringify({ emoji }),
            });
            if (res.ok) {
                const data = (await res.json()) as { reactions: Array<{ emoji: string; count: number }> };
                setReactions(data.reactions);
            }
        } catch {
            /* silent — optimistic update stays */
        } finally {
            setPending(null);
        }
    }

    return (
        <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 10 }}>Show some love 👇</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ALLOWED_REACTIONS.map(emoji => {
                    const count = reactionMap[emoji] ?? 0;
                    const mine = myReactions.has(emoji);
                    return (
                        <button
                            key={emoji}
                            onClick={() => void handleReaction(emoji)}
                            disabled={pending === emoji}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '8px 14px',
                                borderRadius: 24,
                                border: mine ? '2px solid #1a56db' : '2px solid #e5e7eb',
                                background: mine ? '#eff6ff' : '#fff',
                                cursor: 'pointer',
                                fontSize: 18,
                                fontWeight: 600,
                                color: mine ? '#1a56db' : '#374151',
                                transition: 'all 0.15s',
                                boxShadow: mine ? '0 0 0 3px rgba(26,86,219,0.1)' : 'none',
                            }}
                        >
                            <span>{emoji}</span>
                            {count > 0 && <span style={{ fontSize: 13, fontWeight: 700 }}>{count}</span>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function FrontlinePage() {
    const { id } = useParams<{ id: string }>();
    const [data, setData] = useState<PublicShoutout | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!id) {
            setError('Invalid recognition link.');
            setLoading(false);
            return;
        }

        fetch(`/api/rr/shoutouts/public/${id}`)
            .then(async r => {
                if (!r.ok) {
                    const err = (await r.json().catch(() => ({ error: 'Not found' }))) as { error: string };
                    throw new Error(err.error ?? 'Recognition not found');
                }
                return r.json() as Promise<PublicShoutout>;
            })
            .then(d => {
                setData(d);
                setLoading(false);
            })
            .catch(e => {
                setError((e as Error).message);
                setLoading(false);
            });
    }, [id]);

    if (loading) return <LoadingState />;
    if (error || !data) return <ErrorState message={error ?? 'Recognition not found.'} />;

    const firstName = data.recipientName.split(' ')[0];
    const pageUrl = window.location.href;

    function handleShare() {
        if (navigator.share) {
            void navigator.share({ title: `${data!.recipientName} got recognized! 🎉`, url: pageUrl });
        } else {
            void navigator.clipboard.writeText(pageUrl).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            });
        }
    }

    return (
        <div
            style={{
                minHeight: '100vh',
                background: '#f3f4f6',
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
            }}
        >
            {/* Hero header */}
            <div
                style={{
                    background: 'linear-gradient(135deg, #1e3a5f 0%, #1a56db 60%, #7c3aed 100%)',
                    padding: '40px 24px 60px',
                    textAlign: 'center',
                    position: 'relative',
                    overflow: 'hidden',
                }}
            >
                {/* Decorative circles */}
                <div
                    style={{
                        position: 'absolute',
                        top: -40,
                        right: -40,
                        width: 200,
                        height: 200,
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.05)',
                    }}
                />
                <div
                    style={{
                        position: 'absolute',
                        bottom: -60,
                        left: -20,
                        width: 150,
                        height: 150,
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.05)',
                    }}
                />

                {/* CC badge */}
                <div
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: 20,
                        padding: '4px 12px',
                        marginBottom: 24,
                        fontSize: 12,
                        color: 'rgba(255,255,255,0.8)',
                        fontWeight: 600,
                        letterSpacing: '0.05em',
                    }}
                >
                    <span style={{ color: '#60a5fa' }}>●</span>
                    ClearCompany Recognition
                </div>

                {/* Avatar */}
                <div
                    style={{
                        width: 84,
                        height: 84,
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.2)',
                        border: '3px solid rgba(255,255,255,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 32,
                        fontWeight: 800,
                        color: '#fff',
                        margin: '0 auto 16px',
                        backdropFilter: 'blur(10px)',
                    }}
                >
                    {initials(data.recipientName)}
                </div>

                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 6, fontWeight: 500 }}>
                    🎉 Congratulations,
                </div>
                <h1 style={{ fontSize: 32, fontWeight: 900, color: '#fff', margin: '0 0 8px', lineHeight: 1.1 }}>
                    {firstName}!
                </h1>
                <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.8)', margin: '0 0 24px', lineHeight: 1.5 }}>
                    You've been recognized by <strong style={{ color: '#fff' }}>{data.senderName}</strong>
                </p>

                {/* Value chips */}
                {data.values.length > 0 && (
                    <div
                        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 4 }}
                    >
                        {data.values.map(v => (
                            <span
                                key={v.id}
                                style={{
                                    background: 'rgba(255,255,255,0.15)',
                                    border: '1px solid rgba(255,255,255,0.3)',
                                    borderRadius: 20,
                                    padding: '6px 14px',
                                    fontSize: 14,
                                    fontWeight: 700,
                                    color: '#fff',
                                    backdropFilter: 'blur(4px)',
                                }}
                            >
                                {v.emoji} {v.label}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Main content card */}
            <div style={{ maxWidth: 480, margin: '-32px auto 0', padding: '0 16px 32px', position: 'relative' }}>
                <div
                    style={{
                        background: '#fff',
                        borderRadius: 16,
                        boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
                        overflow: 'hidden',
                    }}
                >
                    {/* Message */}
                    <div style={{ padding: '28px 24px 20px' }}>
                        <div
                            style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#94a3b8',
                                letterSpacing: '0.1em',
                                textTransform: 'uppercase',
                                marginBottom: 12,
                            }}
                        >
                            Recognition message
                        </div>
                        <blockquote
                            style={{
                                margin: 0,
                                padding: '16px 20px',
                                background: 'linear-gradient(135deg, #f0f7ff 0%, #f5f3ff 100%)',
                                borderLeft: '4px solid #1a56db',
                                borderRadius: '0 10px 10px 0',
                                fontSize: 16,
                                lineHeight: 1.7,
                                color: '#1e293b',
                                fontStyle: 'italic',
                            }}
                        >
                            "{data.message}"
                        </blockquote>

                        {/* Sender / time */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                marginTop: 16,
                                paddingTop: 16,
                                borderTop: '1px solid #f1f5f9',
                            }}
                        >
                            <div
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: '50%',
                                    background: '#dbeafe',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 14,
                                    fontWeight: 700,
                                    color: '#1e40af',
                                    flexShrink: 0,
                                }}
                            >
                                {initials(data.senderName)}
                            </div>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{data.senderName}</div>
                                <div style={{ fontSize: 12, color: '#94a3b8' }}>{timeAgo(data.createdAt)}</div>
                            </div>
                            {data.giftAmountCents && (
                                <div
                                    style={{
                                        marginLeft: 'auto',
                                        background: '#f0fdf4',
                                        border: '1px solid #bbf7d0',
                                        borderRadius: 20,
                                        padding: '4px 12px',
                                        fontSize: 13,
                                        fontWeight: 700,
                                        color: '#166534',
                                    }}
                                >
                                    🎁 ${(data.giftAmountCents / 100).toFixed(0)} gift
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Reactions */}
                    <div style={{ padding: '4px 24px 24px', borderTop: '1px solid #f1f5f9' }}>
                        <ReactionsSection shoutoutId={data.id} initialReactions={data.reactions} />
                    </div>
                </div>

                {/* Share section */}
                <div
                    style={{
                        background: '#fff',
                        borderRadius: 16,
                        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                        padding: '20px 24px',
                        marginTop: 16,
                        textAlign: 'center',
                    }}
                >
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
                        Share this moment 🎉
                    </div>
                    <div
                        style={{
                            display: 'inline-block',
                            padding: 8,
                            background: '#fff',
                            borderRadius: 8,
                            border: '1px solid #e5e7eb',
                            marginBottom: 12,
                        }}
                    >
                        <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(pageUrl)}&bgcolor=ffffff&color=1e293b&margin=2`}
                            alt="QR code for this recognition"
                            width={120}
                            height={120}
                            style={{ display: 'block', borderRadius: 4 }}
                        />
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>
                        Scan to share this recognition
                    </div>
                    <button
                        onClick={handleShare}
                        style={{
                            width: '100%',
                            padding: '12px 0',
                            background: copied ? '#059669' : '#1a56db',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 10,
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'background 0.2s',
                        }}
                    >
                        {copied ? '✓ Link copied!' : '🔗 Copy link'}
                    </button>
                </div>

                {/* Footer */}
                <div style={{ textAlign: 'center', padding: '20px 0 8px', fontSize: 12, color: '#94a3b8' }}>
                    Powered by{' '}
                    <span style={{ color: '#1a56db', fontWeight: 700 }}>
                        Clear<span style={{ color: '#60a5fa' }}>Company</span>
                    </span>{' '}
                    R&R · Employee Recognition Platform
                </div>
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                * { box-sizing: border-box; }
            `}</style>
        </div>
    );
}

// Named export for lazy() + Component pattern
export { FrontlinePage as Component };
