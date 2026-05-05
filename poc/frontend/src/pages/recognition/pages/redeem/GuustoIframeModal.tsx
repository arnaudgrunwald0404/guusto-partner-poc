/**
 * GuustoIframeModal
 *
 * Full-screen overlay that embeds the live Guusto redemption portal via
 * <iframe>. Shown when a gift has a real guustoRedeemUrl (not "#").
 *
 * Guusto's frame-ancestors CSP allows *.clearcompany.com but NOT localhost.
 * When running on localhost the iframe will be blocked — we detect this and
 * show an explanatory notice with an "Open in Guusto ↗" fallback link.
 * On the production domain (clearcompany.com) the iframe loads normally.
 *
 * The alternative path (for mock/demo gifts with url="#") is GiftRedemptionFlow.
 */

import { useState, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IframeGift {
    id: string;
    senderName: string;
    senderOrg: string;
    totalAmountCents: number;
    remainingAmountCents: number;
    currency: string;
    guustoRedeemUrl: string;
}

interface GuustoIframeModalProps {
    gift: IframeGift;
    onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number, currency: string): string {
    return `$${(cents / 100).toFixed(2)} ${currency}`;
}

/**
 * Returns true when running on a clearcompany.com domain (or any non-localhost
 * origin) — i.e. where Guusto's frame-ancestors CSP will permit the iframe.
 */
function isIframeAllowed(): boolean {
    const { hostname } = window.location;
    return hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.startsWith('192.168.');
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function LoadingSpinner() {
    return (
        <div
            style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f8fafc',
                gap: 16,
            }}
        >
            <div
                style={{
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    border: '3px solid #e2e8f0',
                    borderTopColor: '#2563eb',
                    animation: 'spin 0.8s linear infinite',
                }}
            />
            <div style={{ fontSize: 14, color: '#64748b', fontWeight: 500 }}>Loading Guusto redemption portal…</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

// ---------------------------------------------------------------------------
// LocalhostNotice — shown when iframe is blocked by CSP on localhost
// ---------------------------------------------------------------------------

interface LocalhostNoticeProps {
    gift: IframeGift;
    onClose: () => void;
}

function LocalhostNotice({ gift, onClose }: LocalhostNoticeProps) {
    return (
        <div
            style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 24px',
                background: '#f8fafc',
            }}
        >
            <div
                style={{
                    maxWidth: 480,
                    width: '100%',
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 16,
                    padding: '40px 36px',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 20,
                    textAlign: 'center',
                }}
            >
                {/* Icon */}
                <div
                    style={{
                        width: 64,
                        height: 64,
                        borderRadius: 16,
                        background: '#eff6ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 30,
                    }}
                >
                    🔒
                </div>

                <div>
                    <h2
                        style={{
                            margin: '0 0 8px',
                            fontSize: 20,
                            fontWeight: 700,
                            color: '#1e293b',
                        }}
                    >
                        Iframe blocked on localhost
                    </h2>
                    <p style={{ margin: 0, fontSize: 14, color: '#64748b', lineHeight: 1.65 }}>
                        Guusto's{' '}
                        <code style={{ fontSize: 12, background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>
                            frame-ancestors
                        </code>{' '}
                        CSP allows <strong>*.clearcompany.com</strong> but not <strong>localhost</strong>. This iframe
                        will load correctly when the app is deployed.
                    </p>
                </div>

                {/* Gift summary */}
                <div
                    style={{
                        width: '100%',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 10,
                        padding: '14px 18px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        textAlign: 'left',
                    }}
                >
                    <div
                        style={{
                            fontSize: 12,
                            color: '#94a3b8',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}
                    >
                        Gift
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
                        {formatCents(gift.remainingAmountCents, gift.currency)}
                    </div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                        from {gift.senderOrg} · {gift.senderName}
                    </div>
                </div>

                {/* CTA */}
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <a
                        href={gift.guustoRedeemUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: 'block',
                            width: '100%',
                            padding: '11px 0',
                            background: '#2563eb',
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 700,
                            borderRadius: 8,
                            textDecoration: 'none',
                            textAlign: 'center',
                            boxSizing: 'border-box',
                        }}
                    >
                        Open in Guusto ↗
                    </a>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            padding: '10px 0',
                            fontSize: 14,
                            color: '#64748b',
                            cursor: 'pointer',
                            fontWeight: 600,
                        }}
                    >
                        Back to inbox
                    </button>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// GuustoIframeModal
// ---------------------------------------------------------------------------

export function GuustoIframeModal({ gift, onClose }: GuustoIframeModalProps) {
    const allowed = isIframeAllowed();
    const [loaded, setLoaded] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // Lock body scroll while modal is open
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, []);

    // Close on Escape
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                background: '#f8fafc',
            }}
        >
            {/* ── Top bar ── */}
            <div
                style={{
                    height: 56,
                    borderBottom: '1px solid #e2e8f0',
                    background: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 24px',
                    gap: 14,
                    flexShrink: 0,
                }}
            >
                {/* Back */}
                <button
                    type="button"
                    onClick={onClose}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#2563eb',
                        fontSize: 14,
                        fontWeight: 600,
                        padding: 0,
                        flexShrink: 0,
                    }}
                >
                    ← Back to inbox
                </button>

                <div style={{ width: 1, height: 20, background: '#e2e8f0', flexShrink: 0 }} />

                {/* Gift info */}
                <span style={{ fontSize: 14, color: '#64748b' }}>
                    Redeeming{' '}
                    <strong style={{ color: '#1e293b' }}>
                        {formatCents(gift.remainingAmountCents, gift.currency)}
                    </strong>{' '}
                    from <strong style={{ color: '#1e293b' }}>{gift.senderOrg}</strong>
                </span>

                <div style={{ flex: 1 }} />

                {/* Environment indicator */}
                {!allowed && (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '3px 10px',
                            background: '#fef9c3',
                            border: '1px solid #fde047',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#854d0e',
                            flexShrink: 0,
                        }}
                    >
                        ⚠ localhost — iframe blocked
                    </div>
                )}

                {/* Powered by Guusto */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        padding: '4px 10px',
                        background: '#f1f5f9',
                        border: '1px solid #e2e8f0',
                        borderRadius: 6,
                        flexShrink: 0,
                    }}
                >
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>Powered by</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.2px' }}>
                        Guusto
                    </span>
                </div>

                {/* Close */}
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 15,
                        color: '#64748b',
                        flexShrink: 0,
                    }}
                >
                    ✕
                </button>
            </div>

            {/* ── Body ── */}
            {!allowed ? (
                /* Localhost: explain the CSP block, link to open directly */
                <LocalhostNotice gift={gift} onClose={onClose} />
            ) : (
                /* Production: show spinner then live iframe */
                <>
                    {!loaded && <LoadingSpinner />}
                    <iframe
                        ref={iframeRef}
                        src={gift.guustoRedeemUrl}
                        title="Guusto Gift Redemption"
                        onLoad={() => setLoaded(true)}
                        style={{
                            flex: 1,
                            border: 'none',
                            width: '100%',
                            display: loaded ? 'block' : 'none',
                            background: '#fff',
                        }}
                        allow="payment"
                    />
                </>
            )}
        </div>
    );
}
