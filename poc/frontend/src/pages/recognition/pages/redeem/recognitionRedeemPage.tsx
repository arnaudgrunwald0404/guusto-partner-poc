/**
 * RecognitionRedeemPage — /r/recognition/redeem
 *
 * Employee-facing "Redeem Your Gifts" inbox.
 * Shows pending/available/redeemed/expired Guusto gift cards for the current user.
 *
 * Data:
 *   GET /api/rr/recipient/pending-gifts
 */

import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Badge, Button, Card, Avatar, Skeleton } from '@clearcompany/clearco-ui';
import type { RecognitionAreaOutletContext } from '../../recognitionArea';
import { useRecognitionPersona } from '../../recognitionPersonaContext';
import { GiftRedemptionFlow } from './GiftRedemptionFlow';
import { GuustoIframeModal } from './GuustoIframeModal';

// ---------------------------------------------------------------------------
// Route helper — decides which redemption path to use
//
// Real URL  → GuustoIframeModal  (live Guusto portal, domain-approved iframe)
// Demo "#"  → GiftRedemptionFlow (custom React flow, no backend needed)
// ---------------------------------------------------------------------------

function isRealGuustoUrl(url: string): boolean {
    return Boolean(url) && url !== '#' && (url.startsWith('https://') || url.startsWith('http://'));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RedeemedAmount {
    merchant: string;
    amountCents: number;
    redeemedAt: string;
}

interface Gift {
    id: string;
    status: 'unclaimed' | 'available' | 'redeemed' | 'expired';
    senderName: string;
    senderOrg: string;
    senderId: string;
    recognitionMessage: string;
    valueTag: string;
    valueEmoji: string;
    totalAmountCents: number;
    remainingAmountCents: number;
    currency: string;
    expiryDate: string;
    redeemedAmounts: RedeemedAmount[];
    guustoRedeemUrl: string;
    createdAt: string;
}

interface PendingGiftsResponse {
    pendingCount: number;
    gifts: Gift[];
    page: number;
    limit: number;
    total: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function formatCentsAsDollars(cents: number, currency: string): string {
    return `$${(cents / 100).toFixed(2)} ${currency}`;
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function daysUntil(iso: string): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(iso);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

type BadgeColor = 'info' | 'warning' | 'neutral' | 'error';

function statusBadgeProps(status: Gift['status']): { color: BadgeColor; label: string } {
    switch (status) {
        case 'available':
            return { color: 'info', label: 'Available' };
        case 'unclaimed':
            return { color: 'warning', label: 'Unclaimed — claim to activate' };
        case 'redeemed':
            return { color: 'neutral', label: 'Redeemed' };
        case 'expired':
            return { color: 'error', label: 'Expired' };
    }
}

// ---------------------------------------------------------------------------
// GiftCard component
// ---------------------------------------------------------------------------

interface GiftCardProps {
    gift: Gift;
    onRedeem: (gift: Gift) => void;
}

function GiftCard({ gift, onRedeem }: GiftCardProps) {
    const [partialOpen, setPartialOpen] = useState(false);
    const badge = statusBadgeProps(gift.status);
    const isActive = gift.status === 'available' || gift.status === 'unclaimed';
    const days = daysUntil(gift.expiryDate);
    const expiryWarning = isActive && days <= 14;

    const msgExcerpt = gift.recognitionMessage;

    return (
        <Card>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 16,
                    padding: '20px 24px',
                }}
            >
                {/* ── LEFT: avatar + sender + message + value chip ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                            style={{
                                width: 48,
                                height: 48,
                                borderRadius: '50%',
                                background: avatarColorFromName(gift.senderOrg),
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 16,
                                fontWeight: 700,
                                flexShrink: 0,
                            }}
                        >
                            {initials(gift.senderOrg)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div
                                style={{
                                    fontSize: 14,
                                    fontWeight: 600,
                                    color: '#1e293b',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                {gift.senderOrg}
                                <span style={{ color: '#94a3b8', fontWeight: 400 }}> · from {gift.senderName}</span>
                            </div>
                        </div>
                    </div>

                    <p
                        style={{
                            margin: 0,
                            fontSize: 13,
                            color: '#374151',
                            lineHeight: 1.55,
                        }}
                    >
                        {msgExcerpt}
                    </p>

                    {/* Value chip */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span
                            style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#1e40af',
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                borderRadius: 20,
                                padding: '2px 10px',
                            }}
                        >
                            {gift.valueEmoji} {gift.valueTag}
                        </span>
                    </div>
                </div>

                {/* ── CENTER: status badge + amount + expiry + partial redemptions ── */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                        flexShrink: 0,
                        minWidth: 180,
                    }}
                >
                    <Badge color={badge.color} variant="light" size="sm">
                        {badge.label}
                    </Badge>

                    <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', textAlign: 'center' }}>
                        {isActive
                            ? formatCentsAsDollars(gift.remainingAmountCents, gift.currency)
                            : formatCentsAsDollars(gift.totalAmountCents, gift.currency)}
                    </div>

                    {isActive && <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>remaining</div>}

                    {/* Expiry */}
                    {isActive ? (
                        expiryWarning ? (
                            <div
                                style={{
                                    fontSize: 12,
                                    color: '#d97706',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    textAlign: 'center',
                                }}
                            >
                                ⚠ Expires in {days} day{days !== 1 ? 's' : ''}
                            </div>
                        ) : (
                            <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                                Expires {formatDate(gift.expiryDate)}
                            </div>
                        )
                    ) : null}

                    {/* Partial redemptions collapsible */}
                    {gift.redeemedAmounts.length > 0 && (
                        <div style={{ width: '100%', marginTop: 4 }}>
                            <button
                                type="button"
                                onClick={() => setPartialOpen(o => !o)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: 11,
                                    color: '#64748b',
                                    padding: 0,
                                    textDecoration: 'underline',
                                    width: '100%',
                                    textAlign: 'center',
                                }}
                            >
                                {partialOpen ? '▲ Hide' : '▼ Partial redemptions'}
                            </button>
                            {partialOpen && (
                                <div
                                    style={{
                                        marginTop: 6,
                                        padding: '8px 10px',
                                        background: '#f8fafc',
                                        borderRadius: 6,
                                        border: '1px solid #e2e8f0',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 4,
                                    }}
                                >
                                    {gift.redeemedAmounts.map((ra, idx) => (
                                        <div
                                            key={idx}
                                            style={{
                                                fontSize: 11,
                                                color: '#374151',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                gap: 8,
                                            }}
                                        >
                                            <span>{ra.merchant}</span>
                                            <span style={{ fontWeight: 600 }}>
                                                {formatCentsAsDollars(ra.amountCents, gift.currency)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── RIGHT: CTA ── */}
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    {gift.status === 'available' && (
                        <Button variant="primary" onClick={() => onRedeem(gift)}>
                            Redeem Now →
                        </Button>
                    )}
                    {gift.status === 'unclaimed' && (
                        <Button variant="secondary" onClick={() => onRedeem(gift)}>
                            Claim Gift
                        </Button>
                    )}
                    {gift.status === 'redeemed' && (
                        <span style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>Fully redeemed</span>
                    )}
                    {gift.status === 'expired' && (
                        <span style={{ fontSize: 13, color: '#ef4444', fontStyle: 'italic' }}>
                            Expired {formatDate(gift.expiryDate)}
                        </span>
                    )}
                </div>
            </div>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Skeleton rows (loading state)
// ---------------------------------------------------------------------------

function GiftCardSkeleton() {
    return (
        <Card>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '20px 24px' }}>
                <Skeleton height={48} width={48} circle />
                <div style={{ flex: 1 }}>
                    <Skeleton height={12} mb={10} width="55%" />
                    <Skeleton height={10} mb={6} />
                    <Skeleton height={10} width="80%" />
                </div>
                <div style={{ width: 160, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                    <Skeleton height={22} width={100} />
                    <Skeleton height={18} width={120} />
                    <Skeleton height={10} width={80} />
                </div>
                <Skeleton height={36} width={120} />
            </div>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

// Persona-based demo fallback: Arnaud has 3 pending gifts, Sarah has 0
const DEMO_PENDING_COUNTS: Record<string, number> = {
    arnaud: 3,
    sarah: 0,
};

export function RecognitionRedeemPage() {
    const { setHeaderActions, setPendingGiftCount } = useOutletContext<RecognitionAreaOutletContext>();
    const { persona } = useRecognitionPersona();

    const [gifts, setGifts] = useState<Gift[]>([]);
    const [loading, setLoading] = useState(true);
    /** Custom React flow (demo / mock gifts with guustoRedeemUrl="#") */
    const [redeemingGift, setRedeemingGift] = useState<Gift | null>(null);
    /** Live Guusto iframe (real gifts with a valid guustoRedeemUrl) */
    const [iframeGift, setIframeGift] = useState<Gift | null>(null);

    /** Route a gift to the correct redemption path */
    const handleRedeem = (gift: Gift) => {
        if (isRealGuustoUrl(gift.guustoRedeemUrl)) {
            setIframeGift(gift); // → embedded Guusto portal
        } else {
            setRedeemingGift(gift); // → custom React flow
        }
    };

    // Clear header actions — this page has no header buttons
    useEffect(() => {
        setHeaderActions([]);
    }, [setHeaderActions]);

    // Fetch gifts — falls back to persona-based demo count if API is unavailable
    useEffect(() => {
        let cancelled = false;
        const demoPendingCount = DEMO_PENDING_COUNTS[persona.userId] ?? 0;
        const load = async () => {
            setLoading(true);
            try {
                const res = await fetch('/api/rr/recipient/pending-gifts', {
                    headers: { 'x-user-id': persona.userId },
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data: PendingGiftsResponse = await res.json();
                if (!cancelled) {
                    setGifts(data.gifts);
                    setPendingGiftCount(data.pendingCount);
                }
            } catch {
                // Backend unavailable — use persona-based demo count
                if (!cancelled) {
                    setPendingGiftCount(demoPendingCount);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [setPendingGiftCount, persona.userId]);

    // Manager persona guard
    if (persona.type === 'manager') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px 0' }}>
                <Card>
                    <div
                        style={{
                            padding: '60px 24px',
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 16,
                        }}
                    >
                        <div style={{ fontSize: 48, lineHeight: 1 }}>🔍</div>
                        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' }}>
                            Manager view active
                        </h2>
                        <p style={{ margin: 0, fontSize: 15, color: '#64748b', maxWidth: 380 }}>
                            Switch to the Employee persona in the demo bar to see a personal gift inbox.
                        </p>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px 0' }}>
            {/* ── Gift list ── */}
            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <GiftCardSkeleton />
                    <GiftCardSkeleton />
                    <GiftCardSkeleton />
                </div>
            ) : gifts.length === 0 ? (
                <Card>
                    <div style={{ padding: '60px 24px', textAlign: 'center' }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>🎁</div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b', marginBottom: 8 }}>
                            No gifts yet
                        </div>
                        <div style={{ fontSize: 14, color: '#64748b' }}>
                            Recognitions with monetary rewards will appear here.
                        </div>
                    </div>
                </Card>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {gifts.map(gift => (
                        <GiftCard key={gift.id} gift={gift} onRedeem={handleRedeem} />
                    ))}
                </div>
            )}

            {/* Path A — custom React flow (demo gifts with url="#") */}
            {redeemingGift && <GiftRedemptionFlow gift={redeemingGift} onClose={() => setRedeemingGift(null)} />}

            {/* Path B — live Guusto portal in iframe (real guustoRedeemUrl) */}
            {iframeGift && <GuustoIframeModal gift={iframeGift} onClose={() => setIframeGift(null)} />}
        </div>
    );
}

// Named export required for lazy() + Component pattern
export { RecognitionRedeemPage as Component };
