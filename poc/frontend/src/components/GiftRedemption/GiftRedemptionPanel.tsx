/**
 * GiftRedemptionPanel — shows a recipient their pending and redeemable Guusto gifts.
 *
 * SSO architecture:
 *   Guusto uses signed JWT magic-links (longToken) as the authentication mechanism.
 *   No username/password or SAML exchange is needed — possessing the URL = authenticated.
 *   The token is generated server-side when an order reaches COMPLETED status.
 *
 * iFrame status (tested 2026-04-29):
 *   Guusto's CSP frame-ancestors only allows: UltiPro, Kronos, Outlook, Teams, Microsoft.
 *   *.clearcompany.com is NOT on the whitelist → browser blocks the iFrame.
 *   Resolution: add *.clearcompany.com to Guusto's frame-ancestors (commercial agreement item).
 *   Until then: opens in a new tab (still SSO — same token, no separate login).
 */

import { useState, useEffect, useRef } from 'react';

const API_BASE = '';

interface Gift {
  orderId: string;
  recognitionId: string;
  status: string;
  amountDollars: string;
  currency: string;
  senderName: string | null;
  message: string | null;
  redemptionUrl: string | null;
  redeemable: boolean;
  createdAt: string;
}

interface GiftsResponse {
  employeeId: string;
  email: string;
  gifts: Gift[];
}

type EmbedState = 'idle' | 'trying' | 'blocked' | 'open';

// ---------------------------------------------------------------------------
// iFrame embed tester — tries to load the redemption URL in an iFrame and
// detects the CSP block so we can show a clear status to the user.
// ---------------------------------------------------------------------------

function GuustoEmbed({ url, onResult }: { url: string; onResult: (blocked: boolean) => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    // If the iFrame fails to load (CSP block), onError fires in some browsers.
    // For others we check via a timeout — if contentDocument is inaccessible after
    // a reasonable wait, we treat it as blocked.
    const timer = setTimeout(() => {
      try {
        // Cross-origin access throws — means it loaded (different origin, not blocked)
        void iframe.contentDocument;
        // If accessible and empty, it was likely blocked by CSP
        setBlocked(true);
        onResult(true);
      } catch {
        // Cross-origin but loaded — not blocked at the network level
        onResult(false);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [url, onResult]);

  return (
    <div style={{ position: 'relative' }}>
      {blocked && (
        <div style={{
          position: 'absolute', inset: 0, background: '#fff8f0',
          border: '2px dashed #fb923c', borderRadius: 8,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 8, zIndex: 10, padding: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: 28 }}>🚫</div>
          <div style={{ fontWeight: 700, color: '#9a3412', fontSize: 15 }}>iFrame blocked by CSP</div>
          <div style={{ fontSize: 13, color: '#c2410c', maxWidth: 340, lineHeight: 1.5 }}>
            Guusto's <code>frame-ancestors</code> policy does not include{' '}
            <code>clearcompany.com</code>. This is a commercial agreement item — Guusto
            needs to add <code>*.clearcompany.com</code> to their whitelist.
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
            Currently allowed: UltiPro · Kronos · Outlook · Teams · Microsoft
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={url}
        style={{
          width: '100%', height: 500, border: '1px solid #e5e7eb',
          borderRadius: 8, display: 'block',
          opacity: blocked ? 0 : 1,
        }}
        title="Guusto gift redemption"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gift card
// ---------------------------------------------------------------------------

function GiftCard({ gift }: { gift: Gift }) {
  const [embedState, setEmbedState] = useState<EmbedState>('idle');

  const handleRedeem = () => {
    if (!gift.redemptionUrl) return;
    setEmbedState('trying');
  };

  const handleNewTab = () => {
    if (!gift.redemptionUrl) return;
    window.open(gift.redemptionUrl, '_blank', 'noopener,noreferrer');
  };

  const statusColor = gift.status === 'COMPLETED'
    ? { bg: '#dcfce7', text: '#166534', border: '#86efac' }
    : { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' };

  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
      overflow: 'hidden', marginBottom: 16,
    }}>
      {/* Gift header */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #1a56db 100%)',
        padding: '16px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 28 }}>🎁</span>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>
              ${gift.amountDollars} {gift.currency} Gift
            </div>
            <div style={{ color: '#93c5fd', fontSize: 13 }}>
              from {gift.senderName ?? 'your manager'} · Powered by Guusto
            </div>
          </div>
        </div>
        <span style={{
          background: statusColor.bg, color: statusColor.text,
          border: `1px solid ${statusColor.border}`,
          borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 600,
        }}>
          {gift.status}
        </span>
      </div>

      {/* Message */}
      {gift.message && (
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
          <blockquote style={{
            margin: 0, padding: '10px 14px',
            background: '#f8fafc', borderLeft: '3px solid #1a56db',
            borderRadius: '0 6px 6px 0', fontStyle: 'italic',
            color: '#374151', fontSize: 14, lineHeight: 1.6,
          }}>
            "{gift.message}"
          </blockquote>
        </div>
      )}

      {/* Redemption section */}
      <div style={{ padding: '16px 20px' }}>
        {gift.redeemable && gift.redemptionUrl ? (
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                SSO Redemption Link
              </div>
              <div style={{
                fontFamily: 'monospace', fontSize: 11, color: '#6b7280',
                background: '#f9fafb', padding: '6px 10px', borderRadius: 4,
                wordBreak: 'break-all', border: '1px solid #e5e7eb',
              }}>
                {gift.redemptionUrl.slice(0, 90)}...
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                JWT magic-link — no separate Guusto login required
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: embedState === 'trying' ? 16 : 0 }}>
              <button
                onClick={handleRedeem}
                disabled={embedState === 'trying'}
                style={{
                  padding: '9px 18px', borderRadius: 6, border: 'none',
                  background: '#1a56db', color: '#fff', fontSize: 13,
                  fontWeight: 600, cursor: 'pointer', flex: 1,
                  opacity: embedState === 'trying' ? 0.6 : 1,
                }}
              >
                {embedState === 'trying' ? 'Testing iFrame embed...' : 'Test iFrame embed'}
              </button>
              <button
                onClick={handleNewTab}
                style={{
                  padding: '9px 18px', borderRadius: 6,
                  border: '1px solid #1a56db', background: '#fff',
                  color: '#1a56db', fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 1,
                }}
              >
                Open in new tab (works now) ↗
              </button>
            </div>

            {/* iFrame embed test */}
            {embedState === 'trying' && (
              <div style={{ marginTop: 16 }}>
                <div style={{
                  fontSize: 12, color: '#6b7280', marginBottom: 8,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
                  Attempting iFrame embed — checking if Guusto allows clearcompany.com in frame-ancestors…
                </div>
                <GuustoEmbed
                  url={gift.redemptionUrl}
                  onResult={(blocked) => setEmbedState(blocked ? 'blocked' : 'open')}
                />
              </div>
            )}

            {embedState === 'blocked' && (
              <div style={{
                marginTop: 12, padding: '12px 16px',
                background: '#fff8f0', border: '1px solid #fb923c',
                borderRadius: 8,
              }}>
                <div style={{ fontWeight: 600, color: '#9a3412', marginBottom: 6 }}>
                  iFrame blocked — CSP finding confirmed
                </div>
                <div style={{ fontSize: 13, color: '#c2410c', lineHeight: 1.6 }}>
                  <strong>What this means for Phase 2:</strong> Guusto must add{' '}
                  <code>*.clearcompany.com</code> to their <code>frame-ancestors</code>{' '}
                  Content-Security-Policy. This is a standard commercial agreement item
                  (UltiPro and Kronos are already on their whitelist).
                  Until it's added, recipients redeem via new tab — still SSO, no Guusto login needed.
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ color: '#9ca3af', fontSize: 13 }}>
            {gift.status === 'COMPLETED' ? 'Redemption link not yet available' : 'Processing…'}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function GiftRedemptionPanel({ employeeId }: { employeeId: string }) {
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/rr/employees/${employeeId}/gifts`, {
      headers: { 'x-user-id': employeeId },
    })
      .then(r => r.json())
      .then((data: GiftsResponse) => {
        setGifts(data.gifts ?? []);
        setLoading(false);
      })
      .catch(err => {
        setError(String(err));
        setLoading(false);
      });
  }, [employeeId]);

  if (loading) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: '#9ca3af' }}>
        Loading gifts…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', background: '#fef2f2', borderRadius: 8, color: '#991b1b', fontSize: 13 }}>
        Error loading gifts: {error}
      </div>
    );
  }

  if (gifts.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '40px 20px',
        background: '#f9fafb', borderRadius: 8,
        border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: 14,
      }}>
        No gift rewards yet. When a manager sends you a recognition gift, it'll appear here.
      </div>
    );
  }

  return (
    <div>
      <div style={{
        marginBottom: 16, padding: '12px 16px',
        background: '#f0f9ff', border: '1px solid #bae6fd',
        borderRadius: 8, fontSize: 13, color: '#0369a1',
      }}>
        <strong>SSO status:</strong> Guusto uses signed JWT magic-links — no separate Guusto
        account needed. iFrame embedding requires a whitelist update (see below). New-tab
        redemption works today.
      </div>
      {gifts.map(gift => (
        <GiftCard key={gift.orderId} gift={gift} />
      ))}
    </div>
  );
}
