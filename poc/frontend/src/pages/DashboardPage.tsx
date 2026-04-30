/**
 * DashboardPage — /
 *
 * HR admin landing page.  Phase 1 additions (RR-016, RR-021):
 *   - Live recognition feed with "X new recognitions" banner (polls every 30s)
 *   - Values distribution bar chart (fetched from /api/rr/admin/analytics/values)
 *   - Dynamic program-health stats from /api/rr/admin/reports/summary
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { EMPLOYEES } from '../data/employees';

const API = 'http://localhost:3001';
const ADMIN_HEADERS = { 'x-user-id': 'admin-1', 'x-user-role': 'hr_admin' };
const POLL_MS = 30_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeedItem {
  id: string;
  senderName: string;
  recipientName: string;
  message: string;
  values: Array<{ id: string; label: string }>;
  giftAmountCents: number | null;
  giftStatus: string | null;
  createdAt: string;
}

interface ValueStat {
  label: string;
  count: number;
  pct: number;
}

interface ProgramStats {
  totalShoutouts: number;
  uniqueSenders: number;
  uniqueRecipients: number;
  totalGiftedCents: number;
  redemptionRatePct: number;
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
  return `${Math.floor(hrs / 24)}d ago`;
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

// ---------------------------------------------------------------------------
// QuickStatCard
// ---------------------------------------------------------------------------

function QuickStatCard({ n, label, color }: { n: string; label: string; color: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '20px 24px', flex: 1 }}>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{n}</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ValuesChart — RR-021
// ---------------------------------------------------------------------------

function ValuesChart() {
  const [values, setValues] = useState<ValueStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/rr/admin/analytics/values`, { headers: ADMIN_HEADERS })
      .then(r => r.json())
      .then(d => { setValues(d.values ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const cardStyle: React.CSSProperties = {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden',
  };
  const headerStyle: React.CSSProperties = {
    padding: '14px 20px', borderBottom: '1px solid #e5e7eb',
    fontWeight: 700, fontSize: 14, color: '#374151',
  };

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>Values distribution</div>
      <div style={{ padding: 20 }}>
        {loading && (
          <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Loading…</div>
        )}
        {!loading && values.length === 0 && (
          <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            No recognitions yet — send one to see data here.
          </div>
        )}
        {!loading && values.map((v, i) => (
          <div key={v.label} style={{ marginBottom: i < values.length - 1 ? 14 : 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{v.label}</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{v.count} · {v.pct}%</span>
            </div>
            <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${v.pct}%`,
                background: 'linear-gradient(90deg, #1a56db, #3b82f6)',
                borderRadius: 4, minWidth: v.pct > 0 ? 4 : 0,
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LiveFeed — recognition feed with "X new" banner (RR-016)
// ---------------------------------------------------------------------------

function FeedCard({ item }: { item: FeedItem }) {
  const color = avatarColor(item.senderName);
  return (
    <div style={{
      padding: '14px 20px', borderBottom: '1px solid #f3f4f6',
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', background: color, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, color: '#1e293b',
      }}>
        {initials(item.senderName)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.4 }}>
          <strong style={{ color: '#1e293b' }}>{item.senderName}</strong>
          {' recognized '}
          <strong style={{ color: '#1e293b' }}>{item.recipientName}</strong>
        </div>
        {item.values.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
            {item.values.map(v => (
              <span key={v.id} style={{
                background: '#eff6ff', border: '1px solid #bfdbfe',
                borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: '#1e40af',
              }}>{v.label}</span>
            ))}
          </div>
        )}
        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>{timeAgo(item.createdAt)}</span>
          {item.giftAmountCents && (
            <span style={{ color: '#059669', fontWeight: 600 }}>
              🎁 ${(item.giftAmountCents / 100).toFixed(0)} gift
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function LiveFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [newItems, setNewItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const latestCreatedAt = useRef<string | null>(null);

  const loadFeed = useCallback(() => {
    fetch(`${API}/api/rr/shoutouts?limit=10`, { headers: { 'x-user-id': 'admin-1', 'x-user-role': 'hr_admin' } })
      .then(r => r.json())
      .then(d => {
        const feed: FeedItem[] = d.items ?? [];
        setItems(feed);
        if (feed.length > 0) latestCreatedAt.current = feed[0].createdAt;
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { loadFeed(); }, [loadFeed]);

  // Poll for new items every 30s (RR-016)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!latestCreatedAt.current) return;
      fetch(
        `${API}/api/rr/shoutouts/since?after=${encodeURIComponent(latestCreatedAt.current)}&limit=10`,
        { headers: { 'x-user-id': 'admin-1', 'x-user-role': 'hr_admin' } },
      )
        .then(r => r.json())
        .then(d => {
          const arrived: FeedItem[] = d.items ?? [];
          if (arrived.length > 0) setNewItems(prev => [...arrived, ...prev]);
        })
        .catch(() => {/* silent poll failure per RR-016 spec */});
    }, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  function applyNewItems() {
    setItems(prev => {
      const merged = [...newItems, ...prev];
      if (merged.length > 0) latestCreatedAt.current = merged[0].createdAt;
      return merged;
    });
    setNewItems([]);
  }

  const cardStyle: React.CSSProperties = {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden',
  };

  return (
    <div style={cardStyle}>
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid #e5e7eb',
        fontWeight: 700, fontSize: 14, color: '#374151',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        Recognition feed
        <Link to="/employees" style={{ fontSize: 12, color: '#1a56db', textDecoration: 'none', fontWeight: 500 }}>
          All employees →
        </Link>
      </div>

      {/* RR-016 live banner */}
      {newItems.length > 0 && (
        <button
          onClick={applyNewItems}
          style={{
            display: 'block', width: '100%',
            background: '#eff6ff', border: 'none', borderBottom: '1px solid #bfdbfe',
            padding: '10px 20px', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, color: '#1e40af', textAlign: 'center',
          }}
          role="status"
          aria-live="polite"
        >
          ↑ {newItems.length} new recognition{newItems.length > 1 ? 's' : ''} — click to load
        </button>
      )}

      {loading && (
        <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: '28px 0' }}>Loading…</div>
      )}
      {!loading && items.length === 0 && (
        <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: '28px 0' }}>
          No recognitions yet. Send the first one from an employee profile.
        </div>
      )}
      {items.slice(0, 8).map(item => <FeedCard key={item.id} item={item} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DashboardPage
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const [stats, setStats] = useState<ProgramStats | null>(null);

  useEffect(() => {
    fetch(`${API}/api/rr/admin/reports/summary`, { headers: ADMIN_HEADERS })
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(() => {/* static fallback shown below */});
  }, []);

  return (
    <div>
      {/* Welcome */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>
          Welcome back 👋
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
          Here's what's happening across your organization today.
        </p>
      </div>

      {/* Quick stats — live when summary API responds, static fallback otherwise */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
        <QuickStatCard
          n={stats ? String(stats.totalShoutouts) : '—'}
          label="Recognitions sent"
          color="#1a56db"
        />
        <QuickStatCard
          n={stats ? String(stats.uniqueRecipients) : '—'}
          label="Employees recognized"
          color="#059669"
        />
        <QuickStatCard
          n={stats ? `$${(stats.totalGiftedCents / 100).toFixed(0)}` : '—'}
          label="Rewards sent"
          color="#7c3aed"
        />
        <QuickStatCard
          n={stats ? `${stats.redemptionRatePct}%` : '—'}
          label="Redemption rate"
          color="#d97706"
        />
      </div>

      {/* Main content — 3 panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <LiveFeed />
        <ValuesChart />
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Team list */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{
            padding: '14px 20px', borderBottom: '1px solid #e5e7eb',
            fontWeight: 700, fontSize: 14, color: '#374151',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            Your team
            <Link to="/employees" style={{ fontSize: 12, color: '#1a56db', textDecoration: 'none', fontWeight: 500 }}>
              View all →
            </Link>
          </div>
          {EMPLOYEES.map((emp, i) => (
            <Link key={emp.id} to={`/employee/${emp.id}`} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
                  borderBottom: i < EMPLOYEES.length - 1 ? '1px solid #f3f4f6' : 'none',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = '#f9fafb'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', background: emp.avatarColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, color: '#1e293b', flexShrink: 0,
                }}>
                  {emp.firstName[0]}{emp.lastName[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{emp.firstName} {emp.lastName}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>{emp.title}</div>
                </div>
                <span style={{ color: '#d1d5db', fontSize: 16 }}>›</span>
              </div>
            </Link>
          ))}
        </div>

        {/* AI Pipeline monitor */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{
            padding: '14px 20px', borderBottom: '1px solid #e5e7eb',
            fontWeight: 700, fontSize: 14, color: '#374151',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                display: 'inline-block', width: 8, height: 8, background: '#22c55e',
                borderRadius: '50%', animation: 'pulse 2s infinite',
              }} />
              AI Recognition Pipeline
            </div>
            <a href="http://localhost:3001/dashboard" target="_blank" rel="noopener noreferrer"
               style={{ fontSize: 12, color: '#1a56db', textDecoration: 'none', fontWeight: 500 }}>
              Open monitor →
            </a>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ background: '#f9fafb', borderRadius: 8, padding: '14px 16px', marginBottom: 12, border: '1px solid #f3f4f6' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>How it works</div>
              <ol style={{ margin: 0, padding: '0 0 0 16px', fontSize: 13, color: '#6b7280', lineHeight: 1.8 }}>
                <li>Gong call completes → webhook fires</li>
                <li>Claude AI scans transcript for exceptional praise</li>
                <li>Manager gets one-click approval email</li>
                <li>Employee receives Guusto reward + recognition on profile</li>
              </ol>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                <span style={{ fontSize: 16 }}>✓</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#166534' }}>Recognition detected</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>John Kim · "best support engineer we've ever worked with"</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
                <span style={{ fontSize: 16 }}>⏳</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#92400e' }}>Awaiting identification</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>2 calls — Claude detected a name but couldn't match it</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}
