/**
 * RecognitionDetailPage — /recognition/:id  (RR-041)
 *
 * Full-detail view of a single shoutout, inside the CC layout.
 * Shows: sender, recipient, value chips, message, reactions (interactive),
 *        gift status, share/copy link, and back navigation.
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

const API = 'http://localhost:3001';
const ADMIN_HEADERS = { 'x-user-id': 'admin-1', 'x-user-role': 'hr_admin' };
const ALLOWED_REACTIONS = ['👏', '⭐', '🙌', '🔥', '❤️', '🚀'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShoutoutDetail {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  message: string;
  visibility: string;
  source: string;
  giftAmountCents: number | null;
  giftStatus: string | null;
  values: Array<{ id: string; label: string; emoji?: string }>;
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
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = ['#bfdbfe', '#bbf7d0', '#fde68a', '#fecaca', '#ddd6fe', '#fed7aa'];
function avatarColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const VISIBILITY_DISPLAY: Record<string, { label: string; color: string; bg: string }> = {
  company: { label: '🌐 Company-wide', color: '#1e40af', bg: '#eff6ff' },
  team:    { label: '👥 Team only',    color: '#065f46', bg: '#ecfdf5' },
  private: { label: '🔒 Private',      color: '#92400e', bg: '#fffbeb' },
};

const GIFT_STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  pending:  { label: 'Pending',  color: '#92400e' },
  sending:  { label: 'Sending',  color: '#1d4ed8' },
  sent:     { label: 'Sent',     color: '#065f46' },
  failed:   { label: 'Failed',   color: '#b91c1c' },
  redeemed: { label: 'Redeemed', color: '#5b21b6' },
};

// ---------------------------------------------------------------------------
// ReactionsBar
// ---------------------------------------------------------------------------

function ReactionsBar({ shoutoutId, initialReactions }: {
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
      if (alreadyReacted) next.delete(emoji); else next.add(emoji);
      return next;
    });
    setReactions(prev => {
      if (alreadyReacted) {
        return prev.map(r => r.emoji === emoji ? { ...r, count: Math.max(0, r.count - 1) } : r)
          .filter(r => r.count > 0);
      }
      const existing = prev.find(r => r.emoji === emoji);
      if (existing) return prev.map(r => r.emoji === emoji ? { ...r, count: r.count + 1 } : r);
      return [...prev, { emoji, count: 1 }];
    });

    try {
      const res = await fetch(`${API}/api/rr/shoutouts/${shoutoutId}/reactions`, {
        method: 'POST',
        headers: { ...ADMIN_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      if (res.ok) {
        const d = await res.json() as { reactions: Array<{ emoji: string; count: number }> };
        setReactions(d.reactions);
      }
    } catch {/* silent */}
    finally { setPending(null); }
  }

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
        Reactions
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {ALLOWED_REACTIONS.map(emoji => {
          const count = reactionMap[emoji] ?? 0;
          const mine = myReactions.has(emoji);
          return (
            <button
              key={emoji}
              onClick={() => handleReaction(emoji)}
              disabled={pending === emoji}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 20,
                border: mine ? '2px solid #1a56db' : '1px solid #e5e7eb',
                background: mine ? '#eff6ff' : '#f9fafb',
                cursor: 'pointer', fontSize: 16, fontWeight: 600,
                color: mine ? '#1a56db' : '#374151',
                transition: 'all 0.15s',
              }}
            >
              <span>{emoji}</span>
              {count > 0 && <span style={{ fontSize: 12 }}>{count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecognitionDetailPage
// ---------------------------------------------------------------------------

export function RecognitionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ShoutoutDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) { setError('Invalid ID'); setLoading(false); return; }

    fetch(`${API}/api/rr/shoutouts/${id}`, { headers: ADMIN_HEADERS })
      .then(async r => {
        if (!r.ok) throw new Error('Recognition not found');
        return r.json() as Promise<ShoutoutDetail>;
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError((e as Error).message); setLoading(false); });
  }, [id]);

  function handleCopy() {
    navigator.clipboard.writeText(`${window.location.origin}/r/${id}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
        <div style={{
          width: 36, height: 36, border: '3px solid #e5e7eb',
          borderTopColor: '#1a56db', borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
          margin: '0 auto 12px',
        }} />
        Loading…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
          Recognition not found
        </div>
        <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 20 }}>
          {error ?? 'This recognition may have been removed or is private.'}
        </div>
        <Link to="/" style={{ color: '#1a56db', fontSize: 14 }}>← Back to dashboard</Link>
      </div>
    );
  }

  const visDisplay = VISIBILITY_DISPLAY[data.visibility] ?? VISIBILITY_DISPLAY['company'];
  const giftDisplay = data.giftStatus ? GIFT_STATUS_DISPLAY[data.giftStatus] : null;
  const publicUrl = `${window.location.origin}/r/${data.id}`;

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20, display: 'flex', gap: 6, alignItems: 'center' }}>
        <Link to="/" style={{ color: '#6b7280', textDecoration: 'none' }}>Dashboard</Link>
        <span>›</span>
        <span style={{ color: '#374151' }}>Recognition</span>
      </div>

      <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Main card */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden' }}>
          {/* Header gradient strip */}
          <div style={{
            height: 6,
            background: 'linear-gradient(90deg, #1a56db, #7c3aed)',
          }} />

          <div style={{ padding: '28px 32px' }}>
            {/* Sender → Recipient */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
              {/* Sender */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: avatarColor(data.senderName),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 800, color: '#1e293b', flexShrink: 0,
                }}>
                  {initials(data.senderName)}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{data.senderName}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>Sender</div>
                </div>
              </div>

              <div style={{ fontSize: 22, color: '#d1d5db' }}>→</div>

              {/* Recipient */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Link to={`/employee/${data.recipientId}`} style={{ textDecoration: 'none' }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: avatarColor(data.recipientName),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 800, color: '#1e293b', flexShrink: 0,
                  }}>
                    {initials(data.recipientName)}
                  </div>
                </Link>
                <div>
                  <Link to={`/employee/${data.recipientId}`} style={{ textDecoration: 'none' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{data.recipientName}</div>
                  </Link>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>Recipient</div>
                </div>
              </div>

              {/* Meta badges */}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: visDisplay.color, background: visDisplay.bg,
                  padding: '4px 10px', borderRadius: 12,
                }}>
                  {visDisplay.label}
                </span>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>{timeAgo(data.createdAt)}</span>
              </div>
            </div>

            {/* Values */}
            {data.values.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                {data.values.map(v => (
                  <span key={v.id} style={{
                    background: '#eff6ff', border: '1px solid #bfdbfe',
                    borderRadius: 20, padding: '5px 14px',
                    fontSize: 13, fontWeight: 700, color: '#1e40af',
                  }}>
                    {v.emoji ?? '⭐'} {v.label}
                  </span>
                ))}
              </div>
            )}

            {/* Message */}
            <blockquote style={{
              margin: '0 0 24px',
              padding: '18px 22px',
              background: 'linear-gradient(135deg, #f8faff 0%, #f3f4f6 100%)',
              borderLeft: '4px solid #1a56db',
              borderRadius: '0 10px 10px 0',
              fontSize: 16, lineHeight: 1.7,
              color: '#1e293b', fontStyle: 'italic',
            }}>
              "{data.message}"
            </blockquote>

            {/* Gift row */}
            {data.giftAmountCents && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 18px',
                background: '#f0fdf4', border: '1px solid #bbf7d0',
                borderRadius: 10, marginBottom: 24,
              }}>
                <span style={{ fontSize: 24 }}>🎁</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#166534' }}>
                    ${(data.giftAmountCents / 100).toFixed(0)} Guusto Gift Card
                  </div>
                  {giftDisplay && (
                    <div style={{ fontSize: 12, color: giftDisplay.color, fontWeight: 600, marginTop: 2 }}>
                      Status: {giftDisplay.label}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Reactions */}
            <div style={{ paddingTop: 20, borderTop: '1px solid #f1f5f9' }}>
              <ReactionsBar shoutoutId={data.id} initialReactions={data.reactions} />
            </div>
          </div>
        </div>

        {/* Share card */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 14 }}>
            Share this recognition
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              flex: 1, padding: '10px 14px',
              background: '#f9fafb', border: '1px solid #e5e7eb',
              borderRadius: 8, fontSize: 13, color: '#6b7280',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {publicUrl}
            </div>
            <button
              onClick={handleCopy}
              style={{
                padding: '10px 18px', borderRadius: 8,
                border: 'none',
                background: copied ? '#059669' : '#1a56db',
                color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'background 0.2s', whiteSpace: 'nowrap',
              }}
            >
              {copied ? '✓ Copied' : '🔗 Copy'}
            </button>
            <Link
              to={`/r/${data.id}`}
              target="_blank"
              style={{
                padding: '10px 14px', borderRadius: 8,
                border: '1px solid #e5e7eb',
                background: '#fff', color: '#374151',
                fontSize: 13, fontWeight: 500,
                textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >
              Preview ↗
            </Link>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}>
            Public link — works for frontline employees without a ClearCompany login
          </div>
        </div>

        {/* Meta info */}
        <div style={{
          background: '#f9fafb', border: '1px solid #e5e7eb',
          borderRadius: 12, padding: '16px 20px',
          display: 'flex', gap: 24, flexWrap: 'wrap',
          fontSize: 13, color: '#6b7280',
        }}>
          <div><span style={{ fontWeight: 600, color: '#374151' }}>Recognition ID</span> · {data.id}</div>
          <div><span style={{ fontWeight: 600, color: '#374151' }}>Source</span> · {data.source}</div>
          <div>
            <span style={{ fontWeight: 600, color: '#374151' }}>Created</span> · {new Date(data.createdAt).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
