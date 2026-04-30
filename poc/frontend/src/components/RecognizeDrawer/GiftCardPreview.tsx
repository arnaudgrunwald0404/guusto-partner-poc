/**
 * GiftCardPreview — Live preview of the Guusto gift that will be sent.
 * Updates as the manager types. Mirrors the right-side preview in Guusto's
 * "Send Gifts" UI (product-demo-frame-007.png).
 */

interface GiftCardPreviewProps {
  employeeFirstName: string;
  managerFirstName: string;
  reason: string;
  message: string;
  amountCents: number;
}

const REASON_EMOJI: Record<string, string> = {
  'Customer Focus': '🤝',
  'Lead (take initiative)': '🚀',
  'Team Player': '🙌',
  'Innovation': '💡',
  'Above & Beyond': '⭐',
  'Integrity': '🏆',
  'Problem Solver': '🔧',
};

export function GiftCardPreview({
  employeeFirstName,
  managerFirstName,
  reason,
  message,
  amountCents,
}: GiftCardPreviewProps) {
  const amount = (amountCents / 100).toFixed(0);
  const emoji = reason ? REASON_EMOJI[reason] ?? '🎁' : '🎁';
  const displayMessage = message.trim() || 'Your message will appear here…';
  const isPlaceholder = !message.trim();

  return (
    <div style={{
      background: 'linear-gradient(160deg, #0f2044 0%, #1a3a6e 60%, #1e4d8c 100%)',
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '0 20px 60px rgba(0,0,0,0.35), 0 4px 16px rgba(0,0,0,0.2)',
      width: '100%',
      maxWidth: 280,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
      color: '#fff',
    }}>
      {/* Card header */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
          To {employeeFirstName || 'Recipient'}
        </div>

        {/* Amount badge */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>$</span>
          <span style={{ fontSize: 48, fontWeight: 800, lineHeight: 1, color: '#fff', letterSpacing: '-0.02em' }}>{amount}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)', alignSelf: 'flex-end', marginBottom: 6 }}>USD</span>
        </div>

        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Guusto Gift Card</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Redeemable at 60,000+ merchants</div>
      </div>

      {/* Decorative strip */}
      <div style={{
        margin: '16px 0 0',
        height: 4,
        background: 'linear-gradient(90deg, #14b8a6, #3b82f6, #a855f7, #ec4899)',
      }} />

      {/* Message body */}
      <div style={{ padding: '16px 20px' }}>
        {reason && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'rgba(255,255,255,0.12)',
            borderRadius: 20, padding: '4px 10px',
            fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
            marginBottom: 12, letterSpacing: '0.04em',
          }}>
            {emoji} {reason}
          </div>
        )}

        <p style={{
          margin: 0,
          fontSize: 13,
          lineHeight: 1.65,
          color: isPlaceholder ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.85)',
          fontStyle: isPlaceholder ? 'italic' : 'normal',
          minHeight: 60,
          transition: 'color 0.2s',
        }}>
          {displayMessage.length > 120
            ? displayMessage.slice(0, 120) + '…'
            : displayMessage}
        </p>
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 20px 16px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
          From {managerFirstName || 'Manager'}
        </div>
        <div style={{
          background: '#14b8a6',
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          padding: '5px 12px',
          borderRadius: 20,
          letterSpacing: '0.04em',
        }}>
          Claim gift →
        </div>
      </div>
    </div>
  );
}
