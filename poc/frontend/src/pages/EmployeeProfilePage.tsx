/**
 * EmployeeProfilePage — /employee/:id
 *
 * Full ClearCompany-style employee profile with:
 * - Profile header (avatar, name, title, manager, metadata)
 * - Live RecognitionBanner (polls backend every 10s)
 * - Tab navigation: Recognition | Goals | Reviews | 1:1 | Feedback
 * - Recognition tab: shows recognition history with quote cards
 */

import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { RecognitionBanner } from '../components/RecognitionBanner/RecognitionBanner';
import { RecognizeDrawer } from '../components/RecognizeDrawer/RecognizeDrawer';
import { GiftRedemptionPanel } from '../components/GiftRedemption/GiftRedemptionPanel';
import { useRecognitionStatus } from '../hooks/useRecognitionStatus';
import { getEmployee, type EmployeeProfile } from '../data/employees';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InitialsAvatar({ employee, size = 72 }: { employee: EmployeeProfile; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: employee.avatarColor,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 700, color: '#1e293b',
      flexShrink: 0, border: '3px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
    }}>
      {employee.firstName[0]}{employee.lastName[0]}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '0 20px', borderRight: '1px solid #e5e7eb' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, whiteSpace: 'nowrap' }}>{label}</div>
    </div>
  );
}

function GoalBar({ goal }: { goal: { title: string; progress: number; due: string } }) {
  const color = goal.progress === 100 ? '#059669' : goal.progress >= 70 ? '#2563eb' : '#f59e0b';
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 14, color: '#374151', fontWeight: 500 }}>{goal.title}</span>
        <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 12, whiteSpace: 'nowrap' }}>
          {goal.progress}% · {goal.due}
        </span>
      </div>
      <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${goal.progress}%`,
          background: color, borderRadius: 3,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type Tab = 'recognition' | 'gifts' | 'goals' | 'reviews' | 'oneonone' | 'feedback';

const TABS: { id: Tab; label: string }[] = [
  { id: 'recognition', label: 'Recognition' },
  { id: 'gifts', label: 'Gifts 🎁' },
  { id: 'goals', label: 'Goals' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'oneonone', label: '1:1s' },
  { id: 'feedback', label: 'Feedback' },
];

// ---------------------------------------------------------------------------
// Tab content panels
// ---------------------------------------------------------------------------

function RecognitionPanel({ employee }: { employee: EmployeeProfile }) {
  const { data } = useRecognitionStatus(employee.id);

  const hasActiveRecognition = data && data.status !== null;

  return (
    <div>
      {/* Active recognition card */}
      {hasActiveRecognition && data.status === 'delivered' && (
        <div style={{
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: 10,
          padding: 20,
          marginBottom: 24,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <span style={{
                fontSize: 11, fontWeight: 600, color: '#059669', letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}>🎉 Recent recognition</span>
              <h3 style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                Exceptional customer feedback
              </h3>
            </div>
            <div style={{
              background: '#dcfce7', border: '1px solid #86efac', borderRadius: 20,
              padding: '4px 12px', fontSize: 12, fontWeight: 600, color: '#166534',
            }}>
              $25 reward sent
            </div>
          </div>
          <blockquote style={{
            margin: '0 0 12px',
            padding: '12px 16px',
            background: '#fff',
            borderLeft: '3px solid #22c55e',
            borderRadius: '0 6px 6px 0',
            fontStyle: 'italic',
            color: '#374151',
            fontSize: 14,
            lineHeight: 1.6,
          }}>
            "{data.evidence_quote}"
          </blockquote>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            Recognized by {data.manager_first_name} · AI-detected from a Gong call · {new Date().toLocaleDateString()}
          </div>
        </div>
      )}

      {/* Placeholder history */}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
          Recognition history
        </h3>
        {!hasActiveRecognition || data.status !== 'delivered' ? (
          <div style={{
            textAlign: 'center', padding: '40px 20px',
            background: '#f9fafb', borderRadius: 8,
            border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: 14,
          }}>
            No recognitions yet. They'll appear here when a manager approves one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Current recognition echoed as a history item */}
            <div style={{
              background: '#fff', border: '1px solid #e5e7eb',
              borderRadius: 8, padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ fontSize: 20 }}>🎁</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#1e293b' }}>
                  Customer praise — $25 Guusto reward
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                  Approved by {data.manager_first_name} · {new Date().toLocaleDateString()}
                </div>
              </div>
              <span style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 10,
                background: '#dcfce7', color: '#166534', fontWeight: 600,
              }}>Delivered</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GoalsPanel({ employee }: { employee: EmployeeProfile }) {
  const avgProgress = Math.round(
    employee.goals.reduce((sum, g) => sum + g.progress, 0) / employee.goals.length
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#374151', margin: 0 }}>
          Active goals · {employee.goals.length} total
        </h3>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          Avg. progress: <strong style={{ color: '#2563eb' }}>{avgProgress}%</strong>
        </div>
      </div>
      {employee.goals.map((goal, i) => (
        <GoalBar key={i} goal={goal} />
      ))}
      <div style={{
        marginTop: 24, padding: '16px', background: '#f9fafb',
        borderRadius: 8, border: '1px dashed #e5e7eb',
        textAlign: 'center', color: '#9ca3af', fontSize: 13,
      }}>
        + More goals in previous cycles · View all
      </div>
    </div>
  );
}

function ComingSoonPanel({ tab }: { tab: string }) {
  return (
    <div style={{
      textAlign: 'center', padding: '60px 20px',
      color: '#9ca3af', fontSize: 14,
    }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🚧</div>
      <div style={{ fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>{tab} — not scoped for hackathon</div>
      <div>This panel would show {tab.toLowerCase()} data from ClearCompany.</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('recognition');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const employee = getEmployee(id ?? '');

  if (!employee) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>👤</div>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Employee not found</div>
        <Link to="/employees" style={{ color: '#2563eb', fontSize: 14 }}>← Back to employees</Link>
      </div>
    );
  }

  const tenure = Math.floor(
    (Date.now() - new Date(employee.startDate).getTime()) / (365.25 * 24 * 3600 * 1000)
  );

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16, display: 'flex', gap: 6, alignItems: 'center' }}>
        <Link to="/employees" style={{ color: '#6b7280', textDecoration: 'none' }}>Employees</Link>
        <span>›</span>
        <span style={{ color: '#374151' }}>{employee.firstName} {employee.lastName}</span>
      </div>

      {/* Profile card */}
      <div style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 20,
      }}>
        {/* Cover band */}
        <div style={{
          height: 80,
          background: 'linear-gradient(135deg, #1e3a5f 0%, #1a56db 100%)',
        }} />

        {/* Profile header */}
        <div style={{ padding: '0 28px 24px', position: 'relative' }}>
          {/* Avatar — overlaps the cover */}
          <div style={{ marginTop: -36, marginBottom: 16 }}>
            <InitialsAvatar employee={employee} size={80} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', margin: '0 0 4px' }}>
                {employee.firstName} {employee.lastName}
              </h1>
              <div style={{ fontSize: 15, color: '#374151', marginBottom: 6 }}>{employee.title}</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#6b7280' }}>
                <span>🏢 {employee.department}</span>
                <span>📍 {employee.location}</span>
                <span>📅 {tenure}yr tenure</span>
                <span>👤 Reports to {employee.managerName}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{
                padding: '8px 16px', borderRadius: 6, border: '1px solid #e5e7eb',
                background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}>
                Message
              </button>
              <button
                onClick={() => setDrawerOpen(true)}
                style={{
                  padding: '8px 16px', borderRadius: 6, border: 'none',
                  background: '#1a56db', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Recognize ✨
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div style={{
            marginTop: 20, paddingTop: 20,
            borderTop: '1px solid #f3f4f6',
            display: 'flex',
          }}>
            <StatPill label="Goals on track" value={`${Math.round(employee.goals.filter(g => g.progress >= 70).length / employee.goals.length * 100)}%`} />
            <StatPill label="Goals total" value={String(employee.goals.length)} />
            <StatPill label="Reviews completed" value="3" />
            <div style={{ textAlign: 'center', padding: '0 20px' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>4.8</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Avg. review score</div>
            </div>
          </div>
        </div>

        {/* ── Recognition Banner — live from backend ── */}
        <div style={{ padding: '0 28px 20px' }}>
          <RecognitionBanner employeeId={employee.id} />
        </div>
      </div>

      {/* Recognize drawer */}
      {drawerOpen && (
        <RecognizeDrawer
          employee={employee}
          managerFirstName={employee.managerName.split(' ')[0]}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {/* Tab navigation */}
      <div style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #e5e7eb',
          padding: '0 20px',
          gap: 4,
        }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '14px 16px',
                border: 'none',
                background: 'transparent',
                fontSize: 14,
                fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? '#1a56db' : '#6b7280',
                borderBottom: activeTab === tab.id ? '2px solid #1a56db' : '2px solid transparent',
                cursor: 'pointer',
                marginBottom: -1,
                transition: 'color 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: 24 }}>
          {activeTab === 'recognition' && <RecognitionPanel employee={employee} />}
          {activeTab === 'gifts' && <GiftRedemptionPanel employeeId={employee.id} />}
          {activeTab === 'goals' && <GoalsPanel employee={employee} />}
          {activeTab === 'reviews' && <ComingSoonPanel tab="Reviews" />}
          {activeTab === 'oneonone' && <ComingSoonPanel tab="1:1s" />}
          {activeTab === 'feedback' && <ComingSoonPanel tab="Feedback" />}
        </div>
      </div>
    </div>
  );
}
