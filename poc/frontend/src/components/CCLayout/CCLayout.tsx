/**
 * CCLayout — ClearCompany chrome shell.
 * Sidebar nav + top bar + content area.
 * Approximates the real CC chrome for demo fidelity.
 */

import { Link, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { icon: '⊞', label: 'Dashboard', path: '/' },
  { icon: '👤', label: 'Employees', path: '/employees' },
  { icon: '👥', label: 'My Team', path: '/manager' },
  { icon: '🎯', label: 'Goals', path: '#' },
  { icon: '📋', label: 'Reviews', path: '#' },
  { icon: '🤝', label: '1:1s', path: '#' },
  { icon: '📢', label: 'Recognition', path: '#' },
  { icon: '📊', label: 'Reports', path: '#' },
];

interface CCLayoutProps {
  children: React.ReactNode;
}

export function CCLayout({ children }: CCLayoutProps) {
  const location = useLocation();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f3f4f6', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" }}>

      {/* Sidebar */}
      <nav style={{
        width: 220,
        background: '#1e293b',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 100,
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em' }}>
            Clear<span style={{ color: '#60a5fa' }}>Company</span>
          </div>
          <div style={{ color: '#64748b', fontSize: 10, marginTop: 2, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            R&amp;R Hackathon POC
          </div>
        </div>

        {/* Nav items */}
        <div style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
          {NAV_ITEMS.map(item => {
            const isActive = item.path !== '#' && location.pathname === item.path;
            return (
              <Link
                key={item.label}
                to={item.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 20px',
                  color: isActive ? '#fff' : '#94a3b8',
                  background: isActive ? 'rgba(96,165,250,0.15)' : 'transparent',
                  borderLeft: isActive ? '3px solid #60a5fa' : '3px solid transparent',
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ width: 18, textAlign: 'center', fontSize: 15 }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Bottom — user */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: '#334155',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#94a3b8', fontSize: 13, fontWeight: 700,
          }}>A</div>
          <div>
            <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>Arnaud G.</div>
            <div style={{ color: '#64748b', fontSize: 11 }}>Admin</div>
          </div>
        </div>
      </nav>

      {/* Main content (offset for sidebar) */}
      <div style={{ marginLeft: 220, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Top bar */}
        <div style={{
          height: 52,
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              placeholder="Search employees, goals, reviews…"
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 13,
                color: '#374151',
                width: 280,
                outline: 'none',
                background: '#f9fafb',
              }}
              readOnly
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 13, color: '#6b7280' }}>🔔</span>
            <span style={{ fontSize: 13, color: '#6b7280' }}>⚙️</span>
          </div>
        </div>

        {/* Page content */}
        <main style={{ flex: 1, padding: '28px 32px', maxWidth: 1100 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
