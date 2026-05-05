/**
 * GiftRedemptionFlow
 *
 * Full-screen overlay that walks an employee through redeeming a Guusto gift card
 * entirely within the ClearCompany webapp — no redirect to Guusto needed.
 *
 * Screens (state machine):
 *   A  — Gift detail + amount entry
 *   B  — Select merchant modal (layered on A)
 *   C  — Confirmation modal (layered on A)
 *   D  — Success state
 */

import { useState, useEffect, useRef } from 'react';
import { Button } from '@clearcompany/clearco-ui';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RedeemedAmount {
    merchant: string;
    amountCents: number;
    redeemedAt: string;
}

export interface Gift {
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

interface GiftRedemptionFlowProps {
    gift: Gift;
    onClose: () => void;
}

type FlowScreen = 'A0' | 'A' | 'B' | 'C' | 'D';

// ---------------------------------------------------------------------------
// Merchant catalog
// ---------------------------------------------------------------------------

interface Merchant {
    name: string;
    minUsd: number;
    maxUsd: number;
}

const MERCHANTS: Merchant[] = [
    { name: 'Aerie', minUsd: 15, maxUsd: 200 },
    { name: 'Aeropostale', minUsd: 5, maxUsd: 200 },
    { name: 'Airbnb', minUsd: 25, maxUsd: 500 },
    { name: 'Amazon', minUsd: 5, maxUsd: 500 },
    { name: "Applebee's", minUsd: 5, maxUsd: 200 },
    { name: 'Aquarium', minUsd: 25, maxUsd: 500 },
    { name: 'Athleta', minUsd: 5, maxUsd: 500 },
    { name: "Babin's", minUsd: 25, maxUsd: 500 },
    { name: 'Bahama Breeze', minUsd: 5, maxUsd: 250 },
    { name: 'Banana Republic', minUsd: 5, maxUsd: 250 },
    { name: 'Bath & Body Works', minUsd: 10, maxUsd: 500 },
    { name: 'Best Buy', minUsd: 25, maxUsd: 500 },
    { name: 'Cheesecake Factory', minUsd: 10, maxUsd: 500 },
    { name: 'Chipotle', minUsd: 10, maxUsd: 500 },
    { name: 'Gap', minUsd: 10, maxUsd: 500 },
    { name: 'H&M', minUsd: 10, maxUsd: 200 },
    { name: 'Nike', minUsd: 25, maxUsd: 500 },
    { name: 'Nordstrom', minUsd: 25, maxUsd: 500 },
    { name: 'Sephora', minUsd: 10, maxUsd: 250 },
    { name: 'Starbucks', minUsd: 5, maxUsd: 500 },
    { name: 'Target', minUsd: 10, maxUsd: 500 },
    { name: 'Uber Eats', minUsd: 10, maxUsd: 500 },
    { name: 'Walmart', minUsd: 10, maxUsd: 500 },
];

// ---------------------------------------------------------------------------
// Helpers (self-contained — no imports from the page file)
// ---------------------------------------------------------------------------

const MERCHANT_COLORS = ['#e11d48', '#7c3aed', '#2563eb', '#059669', '#d97706', '#0891b2', '#be123c', '#4f46e5'];

function merchantColor(name: string): string {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
    return MERCHANT_COLORS[h % MERCHANT_COLORS.length];
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

// ---------------------------------------------------------------------------
// MerchantAvatar — colored circle with initials
// ---------------------------------------------------------------------------

function MerchantAvatar({ name, size }: { name: string; size: number }) {
    return (
        <div
            style={{
                width: size,
                height: size,
                borderRadius: '50%',
                background: merchantColor(name),
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: size * 0.33,
                fontWeight: 700,
                flexShrink: 0,
                letterSpacing: '-0.5px',
            }}
        >
            {initials(name)}
        </div>
    );
}

// ---------------------------------------------------------------------------
// GiftCardVisual — shared gift card visual used by A0 and A
// ---------------------------------------------------------------------------

function GiftCardVisual({ gift }: { gift: Gift }) {
    return (
        <div
            style={{
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                background: '#fff',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                padding: '28px 32px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
            }}
        >
            <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'right', marginBottom: -4 }}>
                {formatDate(gift.createdAt)}
            </div>

            <div style={{ fontSize: 14, color: '#64748b' }}>
                To: <span style={{ fontWeight: 600, color: '#1e293b' }}>Arnaud Grunwald</span>
            </div>

            <p
                style={{
                    margin: 0,
                    fontSize: 14,
                    color: '#374151',
                    lineHeight: 1.65,
                    padding: '12px 0',
                    borderTop: '1px solid #f1f5f9',
                    borderBottom: '1px solid #f1f5f9',
                }}
            >
                {gift.recognitionMessage}
            </p>

            <div style={{ fontSize: 14, color: '#64748b' }}>
                From: <span style={{ fontWeight: 600, color: '#1e293b' }}>{gift.senderOrg}</span>
            </div>

            <div style={{ fontSize: 28, fontWeight: 800, color: '#1e293b' }}>
                {formatCentsAsDollars(gift.totalAmountCents, gift.currency)}
            </div>

            <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Ref # <span style={{ fontFamily: 'monospace' }}>{gift.id}</span>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Screen A0 — Pre-claim: gift card only, "Credit my account" CTA
// ---------------------------------------------------------------------------

interface ScreenA0Props {
    gift: Gift;
    onClaim: () => void;
    onClose: () => void;
}

function ScreenA0({ gift, onClaim, onClose }: ScreenA0Props) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 28,
                width: '100%',
                maxWidth: 520,
            }}
        >
            {/* Back button */}
            <div style={{ width: '100%' }}>
                <button
                    type="button"
                    onClick={onClose}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#2563eb',
                        fontSize: 14,
                        fontWeight: 600,
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                    }}
                >
                    ← Back to inbox
                </button>
            </div>

            <GiftCardVisual gift={gift} />

            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Button variant="primary" onClick={onClaim} fullWidth>
                    Credit my account →
                </Button>
                <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', textAlign: 'center', lineHeight: 1.5 }}>
                    Crediting adds this gift to your balance so you can choose a merchant and amount.
                </p>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Screen A — Gift detail + amount entry
// ---------------------------------------------------------------------------

interface ScreenAProps {
    gift: Gift;
    amountUsd: number;
    onAmountChange: (v: number) => void;
    onBrowse: () => void;
    onClose: () => void;
}

function ScreenA({ gift, amountUsd, onAmountChange, onBrowse, onClose }: ScreenAProps) {
    const maxUsd = gift.remainingAmountCents / 100;
    const browseDisabled = amountUsd <= 0 || amountUsd > maxUsd;

    return (
        <div
            style={{
                display: 'flex',
                gap: 32,
                alignItems: 'flex-start',
                width: '100%',
                maxWidth: 900,
            }}
        >
            {/* ── LEFT (55%) ── */}
            <div style={{ flex: '0 0 55%', minWidth: 0 }}>
                {/* Back button */}
                <button
                    type="button"
                    onClick={onClose}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#2563eb',
                        fontSize: 14,
                        fontWeight: 600,
                        padding: 0,
                        marginBottom: 20,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                    }}
                >
                    ← Back to inbox
                </button>

                {/* Gift card */}
                <GiftCardVisual gift={gift} />
            </div>

            {/* ── RIGHT (45%) ── */}
            <div style={{ flex: '0 0 45%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Available to redeem box */}
                <div
                    style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        background: '#fff',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                        padding: '24px 24px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 20,
                    }}
                >
                    {/* Header row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Remaining Amount</span>
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
                            {formatCentsAsDollars(gift.remainingAmountCents, gift.currency)}
                        </span>
                    </div>

                    <div
                        style={{
                            borderTop: '1px solid #f1f5f9',
                            paddingTop: 16,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                        }}
                    >
                        {/* Section label */}
                        <div
                            style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: '#64748b',
                                textTransform: 'uppercase' as const,
                                letterSpacing: '0.06em',
                            }}
                        >
                            Enter Amount to Redeem
                        </div>

                        {/* Dollar input */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                overflow: 'hidden',
                                background: '#f8fafc',
                            }}
                        >
                            <span
                                style={{
                                    padding: '10px 12px',
                                    borderRight: '1px solid #e2e8f0',
                                    fontSize: 15,
                                    fontWeight: 600,
                                    color: '#64748b',
                                    background: '#f1f5f9',
                                }}
                            >
                                $
                            </span>
                            <input
                                type="number"
                                min={1}
                                max={maxUsd}
                                step={1}
                                value={amountUsd === 0 ? '' : amountUsd}
                                onChange={e => {
                                    const v = parseFloat(e.target.value);
                                    if (isNaN(v)) {
                                        onAmountChange(0);
                                    } else {
                                        onAmountChange(Math.min(Math.max(v, 1), maxUsd));
                                    }
                                }}
                                placeholder={`1 – ${maxUsd.toFixed(2)}`}
                                style={{
                                    flex: 1,
                                    border: 'none',
                                    outline: 'none',
                                    background: 'transparent',
                                    padding: '10px 12px',
                                    fontSize: 15,
                                    color: '#1e293b',
                                }}
                            />
                        </div>

                        {amountUsd > maxUsd && (
                            <div style={{ fontSize: 12, color: '#ef4444' }}>
                                Maximum is ${maxUsd.toFixed(2)} {gift.currency}
                            </div>
                        )}
                    </div>

                    {/* Select a Merchant */}
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                        <div
                            style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: '#64748b',
                                textTransform: 'uppercase' as const,
                                letterSpacing: '0.06em',
                                marginBottom: 10,
                            }}
                        >
                            Select a Merchant
                        </div>
                        <Button variant="secondary" onClick={onBrowse} disabled={browseDisabled} fullWidth>
                            Browse →
                        </Button>
                    </div>
                </div>

                {/* Redeemed Amounts */}
                {gift.redeemedAmounts.length > 0 && (
                    <div
                        style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: 12,
                            background: '#fff',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                            padding: '20px 24px',
                        }}
                    >
                        <div
                            style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: '#64748b',
                                textTransform: 'uppercase' as const,
                                letterSpacing: '0.06em',
                                marginBottom: 12,
                            }}
                        >
                            Redeemed Amounts
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {gift.redeemedAmounts.map((ra, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        fontSize: 13,
                                        color: '#374151',
                                    }}
                                >
                                    <span>{ra.merchant}</span>
                                    <span style={{ fontWeight: 600 }}>
                                        {formatCentsAsDollars(ra.amountCents, gift.currency)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Screen B — Select Merchant modal
// ---------------------------------------------------------------------------

interface ScreenBProps {
    amountUsd: number;
    currency: string;
    selectedMerchant: Merchant | null;
    onSelect: (m: Merchant) => void;
    onCancel: () => void;
    onConfirm: () => void;
}

function ScreenB({ amountUsd, currency, selectedMerchant, onSelect, onCancel, onConfirm }: ScreenBProps) {
    const [search, setSearch] = useState('');
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        searchRef.current?.focus();
    }, []);

    const filtered = MERCHANTS.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15,23,42,0.5)',
                zIndex: 1100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <div
                style={{
                    background: '#fff',
                    borderRadius: 16,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                    width: '100%',
                    maxWidth: 520,
                    maxHeight: '85vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid #f1f5f9' }}>
                    <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
                        Select Redemption
                    </h2>
                    <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                        You have{' '}
                        <strong>
                            ${amountUsd.toFixed(2)} {currency}
                        </strong>{' '}
                        to redeem
                    </p>

                    {/* Search */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            background: '#f8fafc',
                            marginTop: 14,
                            overflow: 'hidden',
                        }}
                    >
                        <span style={{ padding: '0 10px', fontSize: 16, color: '#94a3b8' }}>🔍</span>
                        <input
                            ref={searchRef}
                            type="text"
                            placeholder="Search merchants..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{
                                flex: 1,
                                border: 'none',
                                outline: 'none',
                                background: 'transparent',
                                padding: '10px 12px 10px 0',
                                fontSize: 14,
                                color: '#1e293b',
                            }}
                        />
                    </div>
                </div>

                {/* Merchant list */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {filtered.length === 0 ? (
                        <div style={{ padding: '32px 24px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                            No merchants match "{search}"
                        </div>
                    ) : (
                        filtered.map(m => {
                            const isSelected = selectedMerchant?.name === m.name;
                            return (
                                <div
                                    key={m.name}
                                    onClick={() => onSelect(m)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={e => e.key === 'Enter' && onSelect(m)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 14,
                                        padding: '0 20px',
                                        height: 72,
                                        cursor: 'pointer',
                                        borderBottom: '1px solid #f1f5f9',
                                        background: isSelected ? '#eff6ff' : '#fff',
                                        border: isSelected ? '1px solid #3b82f6' : undefined,
                                        transition: 'background 0.1s',
                                    }}
                                    onMouseEnter={e => {
                                        if (!isSelected)
                                            (e.currentTarget as HTMLDivElement).style.background = '#f8fafc';
                                    }}
                                    onMouseLeave={e => {
                                        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#fff';
                                    }}
                                >
                                    <MerchantAvatar name={m.name} size={48} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{m.name}</div>
                                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                                            ${m.minUsd} — ${m.maxUsd} USD
                                        </div>
                                    </div>
                                    {isSelected && (
                                        <span style={{ color: '#3b82f6', fontWeight: 700, fontSize: 18 }}>✓</span>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: 10,
                        padding: '16px 24px',
                        borderTop: '1px solid #f1f5f9',
                        background: '#fafafa',
                    }}
                >
                    <Button variant="secondary" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={onConfirm} disabled={selectedMerchant === null}>
                        Select
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Screen C — Confirmation modal
// ---------------------------------------------------------------------------

interface ScreenCProps {
    amountUsd: number;
    currency: string;
    merchant: Merchant;
    onCancel: () => void;
    onConfirm: () => void;
}

function ScreenC({ amountUsd, currency, merchant, onCancel, onConfirm }: ScreenCProps) {
    const [agreed, setAgreed] = useState(false);

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15,23,42,0.5)',
                zIndex: 1100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <div
                style={{
                    background: '#fff',
                    borderRadius: 16,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                    width: '100%',
                    maxWidth: 420,
                    padding: '32px 32px 28px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 20,
                    textAlign: 'center',
                }}
            >
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' }}>Are you sure?</h2>

                <p style={{ margin: 0, fontSize: 15, color: '#374151' }}>
                    Redeem{' '}
                    <strong>
                        ${amountUsd.toFixed(2)} {currency}
                    </strong>{' '}
                    for <strong>{merchant.name}</strong>
                </p>

                <MerchantAvatar name={merchant.name} size={64} />

                {/* Checkbox */}
                <label
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: 13,
                        color: '#374151',
                        lineHeight: 1.55,
                    }}
                >
                    <input
                        type="checkbox"
                        checked={agreed}
                        onChange={e => setAgreed(e.target.checked)}
                        style={{ marginTop: 2, flexShrink: 0, width: 16, height: 16, cursor: 'pointer' }}
                    />
                    I understand this merchant selection cannot be changed
                </label>

                <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                    <Button variant="secondary" onClick={onCancel} fullWidth>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={onConfirm} disabled={!agreed} fullWidth>
                        Confirm →
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Screen D — Success
// ---------------------------------------------------------------------------

interface ScreenDProps {
    amountUsd: number;
    currency: string;
    merchant: Merchant;
    onClose: () => void;
}

function ScreenD({ amountUsd, currency, merchant, onClose }: ScreenDProps) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: 20,
                padding: '40px 24px',
                maxWidth: 480,
                width: '100%',
            }}
        >
            {/* Checkmark */}
            <div
                style={{
                    width: 88,
                    height: 88,
                    borderRadius: '50%',
                    background: '#dcfce7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <span style={{ fontSize: 44, color: '#22c55e', lineHeight: 1 }}>✓</span>
            </div>

            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#1e293b' }}>Gift redeemed!</h1>

            <p style={{ margin: 0, fontSize: 16, color: '#374151', fontWeight: 500 }}>
                ${amountUsd.toFixed(2)} {currency} at {merchant.name}
            </p>

            <p style={{ margin: 0, fontSize: 14, color: '#64748b', lineHeight: 1.65, maxWidth: 360 }}>
                Your <strong>{merchant.name}</strong> gift card will be emailed to you at{' '}
                <strong>agrunwald@clearcompany.com</strong>
            </p>

            <Button variant="primary" onClick={onClose}>
                Done
            </Button>
        </div>
    );
}

// ---------------------------------------------------------------------------
// GiftRedemptionFlow — main component
// ---------------------------------------------------------------------------

export function GiftRedemptionFlow({ gift, onClose }: GiftRedemptionFlowProps) {
    const [screen, setScreen] = useState<FlowScreen>(gift.status === 'unclaimed' ? 'A0' : 'A');
    const [amountUsd, setAmountUsd] = useState<number>(
        gift.remainingAmountCents > 0 ? gift.remainingAmountCents / 100 : 0,
    );
    const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
    // Committed merchant — set when the user confirms (for Screen D)
    const [confirmedMerchant, setConfirmedMerchant] = useState<Merchant | null>(null);

    // Lock body scroll while overlay is open
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, []);

    const handleBrowse = () => setScreen('B');

    const handleMerchantSelect = (m: Merchant) => setSelectedMerchant(m);

    const handleMerchantConfirm = () => {
        if (selectedMerchant) setScreen('C');
    };

    const handleRedeemConfirm = () => {
        setConfirmedMerchant(selectedMerchant);
        setScreen('D');
    };

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                background: '#f8fafc',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            {/* Top bar */}
            <div
                style={{
                    borderBottom: '1px solid #e2e8f0',
                    background: '#fff',
                    padding: '0 32px',
                    height: 60,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexShrink: 0,
                }}
            >
                <div
                    style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: '#2563eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <span style={{ fontSize: 16 }}>🎁</span>
                </div>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Redeem a Gift</span>
            </div>

            {/* Body */}
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: screen === 'D' || screen === 'A0' ? 'center' : 'flex-start',
                    justifyContent: 'center',
                    padding: screen === 'D' || screen === 'A0' ? '60px 24px' : '40px 32px',
                }}
            >
                {screen === 'A0' && <ScreenA0 gift={gift} onClaim={() => setScreen('A')} onClose={onClose} />}

                {screen === 'D' && confirmedMerchant ? (
                    <ScreenD
                        amountUsd={amountUsd}
                        currency={gift.currency}
                        merchant={confirmedMerchant}
                        onClose={onClose}
                    />
                ) : screen !== 'A0' ? (
                    <>
                        <ScreenA
                            gift={gift}
                            amountUsd={amountUsd}
                            onAmountChange={setAmountUsd}
                            onBrowse={handleBrowse}
                            onClose={onClose}
                        />

                        {screen === 'B' && (
                            <ScreenB
                                amountUsd={amountUsd}
                                currency={gift.currency}
                                selectedMerchant={selectedMerchant}
                                onSelect={handleMerchantSelect}
                                onCancel={() => setScreen('A')}
                                onConfirm={handleMerchantConfirm}
                            />
                        )}

                        {screen === 'C' && selectedMerchant && (
                            <ScreenC
                                amountUsd={amountUsd}
                                currency={gift.currency}
                                merchant={selectedMerchant}
                                onCancel={() => setScreen('B')}
                                onConfirm={handleRedeemConfirm}
                            />
                        )}
                    </>
                ) : null}
            </div>
        </div>
    );
}
