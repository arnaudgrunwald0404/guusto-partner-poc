/**
 * ManagerDashboardPage — /manager
 *
 * The manager's recognition command centre. Uses ClearCompany's design system
 * components throughout (PageHeader, Card, Badge, Button, Avatar, AlertBanner,
 * Progress, NavigationTabs).
 *
 * Surfaces three areas:
 *   1. Team overview — direct reports with recognition status + quick Recognize
 *   2. Recognition history — per-employee timeline
 *   3. Budget — spend vs. allocated, transaction log
 *
 * PRD references:
 *   §6.5  Manager My Team Dashboard
 *   §6.3  Budget management
 *   P1–P4 Manager user stories
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API = '';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Avatar,
  AlertBanner,
  Progress,
  NavigationTabs,
  type NavigationTabItem,
} from '../lib/clearco-ui';
import { MANAGER, FRONTLINE_MANAGER, type DirectReport, type RecognitionRecord, type ManagerProfile } from '../data/employees';
import { RecognizeDrawer } from '../components/RecognizeDrawer/RecognizeDrawer';
import type { EmployeeProfile } from '../data/employees';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OVERDUE_THRESHOLD = 30; // days

function daysSinceLabel(days: number | null): string {
  if (days === null) return 'Never recognized';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function recognitionBadge(days: number | null) {
  if (days === null)
    return <Badge color="error" variant="light" size="sm">Never recognized</Badge>;
  if (days > OVERDUE_THRESHOLD)
    return <Badge color="warning" variant="light" size="sm">{daysSinceLabel(days)} — overdue</Badge>;
  return <Badge color="success" variant="light" size="sm">Recognized {daysSinceLabel(days)}</Badge>;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Manager switcher
// ---------------------------------------------------------------------------

const MANAGER_OPTIONS: { value: string; label: string; manager: ManagerProfile }[] = [
  { value: 'mgr_001', label: 'Rachael Alpert — VP Customer Success', manager: MANAGER },
  { value: 'mgr_003', label: 'Thomas Badeen — Sales Manager', manager: FRONTLINE_MANAGER },
];

interface ManagerSwitcherProps {
  selectedId: string;
  onChange: (id: string) => void;
}

function ManagerSwitcher({ selectedId, onChange }: ManagerSwitcherProps) {
  const selected = MANAGER_OPTIONS.find(o => o.value === selectedId)!;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 16px',
      background: 'var(--mantine-color-blue-0)',
      borderRadius: 10,
      border: '1px solid var(--mantine-color-blue-2)',
      fontSize: 13,
    }}>
      <span style={{ color: 'var(--mantine-color-blue-7)', fontWeight: 600, flexShrink: 0 }}>
        👤 Viewing as:
      </span>
      <select
        value={selectedId}
        onChange={e => onChange(e.target.value)}
        style={{
          flex: 1,
          border: 'none',
          background: 'transparent',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--mantine-color-gray-8)',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {MANAGER_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {selected.value === 'mgr_003' && (
        <span style={{
          background: 'var(--mantine-color-orange-1)',
          color: 'var(--mantine-color-orange-7)',
          fontSize: 11,
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 999,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}>
          Sales team
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Budget panel
// ---------------------------------------------------------------------------

function BudgetPanel({ manager, liveLedger }: { manager: ManagerProfile; liveLedger: LedgerEntry[] | null }) {
  const { budgetAllocatedCents, budgetSpentCents, budgetPeriodLabel, budgetWeeksRemaining, directReports } = manager;
  const pct = budgetAllocatedCents > 0 ? Math.round((budgetSpentCents / budgetAllocatedCents) * 100) : 0;
  const remaining = budgetAllocatedCents - budgetSpentCents;
  const recognizedCount = directReports.filter(r => r.recognitionsThisQuarter > 0).length;
  const totalReports = directReports.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Balance hero */}
      <Card>
        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mantine-color-gray-6)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
                Recognition budget · {budgetPeriodLabel}
              </div>
              <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--mantine-color-gray-9)', letterSpacing: '-0.02em' }}>
                {formatCents(remaining)} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--mantine-color-gray-5)' }}>remaining</span>
              </div>
            </div>
            <Badge color="info" variant="light">{budgetWeeksRemaining} weeks left</Badge>
          </div>

          <Progress value={pct} aria-label="Budget utilisation" mb={8} />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--mantine-color-gray-5)' }}>
            <span>{formatCents(budgetSpentCents)} spent</span>
            <span>{formatCents(budgetAllocatedCents)} allocated</span>
          </div>

          {/* Equity nudge — mirrors PRD §6.3 advisory message */}
          <div style={{
            marginTop: 20,
            padding: '12px 16px',
            background: 'var(--mantine-color-blue-0)',
            borderRadius: 8,
            fontSize: 13,
            color: 'var(--mantine-color-blue-8)',
            lineHeight: 1.5,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>💡</span>
            <span>
              You have <strong>{formatCents(remaining)}</strong> remaining with {budgetWeeksRemaining} weeks left in {budgetPeriodLabel}.
              You've recognized <strong>{recognizedCount} of {totalReports}</strong> direct reports this quarter.
            </span>
          </div>
        </div>
      </Card>

      {/* Transaction log */}
      <Card>
        <div style={{ padding: '16px 20px 0', borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--mantine-color-gray-8)', paddingBottom: 16 }}>
            Transaction history
          </div>
        </div>
        {(() => {
          // Use live ledger if available; fall back to static recognitionHistory
          if (liveLedger !== null) {
            const debits = liveLedger.filter(e => e.entryType === 'debit' && e.amountCents < 0);
            const allocs = liveLedger.filter(e => e.entryType === 'allocation');
            const entries = [...debits, ...allocs].sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
            if (entries.length === 0) {
              return (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--mantine-color-gray-5)', fontSize: 14 }}>
                  No transactions yet this quarter.
                </div>
              );
            }
            return entries.map(e => (
              <div key={e.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 20px',
                borderBottom: '1px solid var(--mantine-color-gray-1)',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: e.entryType === 'allocation' ? '#d1fae5' : '#dbeafe',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16,
                }}>
                  {e.entryType === 'allocation' ? '💰' : '🎁'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mantine-color-gray-8)' }}>
                    {e.entryType === 'allocation' ? 'Budget allocation' : 'Gift reward sent'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--mantine-color-gray-5)', marginTop: 1 }}>
                    {e.note ?? e.referenceId ?? '—'} · {formatDate(e.createdAt)}
                  </div>
                </div>
                <div style={{
                  fontSize: 15, fontWeight: 700,
                  color: e.amountCents > 0 ? 'var(--mantine-color-green-7)' : 'var(--mantine-color-blue-7)',
                }}>
                  {e.amountCents > 0 ? '+' : ''}{formatCents(Math.abs(e.amountCents))}
                </div>
                <Badge color={e.entryType === 'allocation' ? 'blue' : 'success'} variant="light" size="sm">
                  {e.entryType === 'allocation' ? 'Allocated' : 'Delivered'}
                </Badge>
              </div>
            ));
          }
          // Static fallback (no live data yet)
          const staticTxs = directReports.flatMap(r => r.recognitionHistory);
          if (staticTxs.length === 0) {
            return (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--mantine-color-gray-5)', fontSize: 14 }}>
                No rewards sent yet this quarter.
              </div>
            );
          }
          return directReports.flatMap(r =>
            r.recognitionHistory.map(h => ({ ...h, employee: r }))
          ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .map(tx => (
            <div key={tx.id} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 20px',
              borderBottom: '1px solid var(--mantine-color-gray-1)',
            }}>
              <Avatar alt={`${tx.employee.firstName} ${tx.employee.lastName}`} size="sm" color={tx.employee.avatarColor}>
                {`${tx.employee.firstName[0]}${tx.employee.lastName[0]}`}
              </Avatar>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mantine-color-gray-8)' }}>
                  {tx.employee.firstName} {tx.employee.lastName}
                </div>
                <div style={{ fontSize: 12, color: 'var(--mantine-color-gray-5)', marginTop: 1 }}>
                  {tx.value} · {formatDate(tx.date)}
                </div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--mantine-color-green-7)' }}>
                +{formatCents(tx.rewardAmount)}
              </div>
              <Badge color="success" variant="light" size="sm">Delivered</Badge>
            </div>
          ));
        })()}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History panel
// ---------------------------------------------------------------------------

function HistoryRow({ record, employee }: { record: RecognitionRecord; employee: DirectReport }) {
  return (
    <div style={{
      display: 'flex', gap: 16, padding: '20px 24px',
      borderBottom: '1px solid var(--mantine-color-gray-1)',
    }}>
      {/* Timeline dot + line */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: 'var(--mantine-color-blue-5)', flexShrink: 0,
        }} />
        <div style={{ width: 1, flex: 1, background: 'var(--mantine-color-gray-2)', marginTop: 4 }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <Avatar alt={`${employee.firstName} ${employee.lastName}`} size="xs" color={employee.avatarColor}>
            {`${employee.firstName[0]}${employee.lastName[0]}`}
          </Avatar>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--mantine-color-gray-8)' }}>
            {employee.firstName} {employee.lastName}
          </span>
          <Badge color="info" variant="light" size="xs">{record.value}</Badge>
          {record.rewardSent && (
            <Badge color="success" variant="light" size="xs">
              {formatCents(record.rewardAmount)} reward
            </Badge>
          )}
          <span style={{ fontSize: 11, color: 'var(--mantine-color-gray-4)', marginLeft: 'auto' }}>
            {formatDate(record.date)}
          </span>
        </div>
        <p style={{
          margin: 0, fontSize: 13, color: 'var(--mantine-color-gray-7)',
          lineHeight: 1.6, fontStyle: 'italic',
          padding: '10px 14px',
          background: 'var(--mantine-color-gray-0)',
          borderRadius: 6,
          borderLeft: '3px solid var(--mantine-color-blue-3)',
        }}>
          "{record.message}"
        </p>
      </div>
    </div>
  );
}

function HistoryPanel({ manager }: { manager: ManagerProfile }) {
  const allHistory = manager.directReports
    .flatMap(r => r.recognitionHistory.map(h => ({ record: h, employee: r })))
    .sort((a, b) => new Date(b.record.date).getTime() - new Date(a.record.date).getTime());

  return (
    <Card>
      {allHistory.length === 0 ? (
        <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--mantine-color-gray-5)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
          <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--mantine-color-gray-7)' }}>No recognitions sent yet</div>
          <div style={{ fontSize: 13 }}>Recognitions you send will appear here as a timeline.</div>
        </div>
      ) : (
        allHistory.map(({ record, employee }) => (
          <HistoryRow key={record.id} record={record} employee={employee} />
        ))
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Team overview row
// ---------------------------------------------------------------------------

interface TeamRowProps {
  report: DirectReport;
  onRecognize: (emp: EmployeeProfile) => void;
  onViewProfile: (id: string) => void;
}

function TeamRow({ report, onRecognize, onViewProfile }: TeamRowProps) {
  const isOverdue = report.lastRecognizedDaysAgo === null || report.lastRecognizedDaysAgo > OVERDUE_THRESHOLD;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '18px 24px',
      borderBottom: '1px solid var(--mantine-color-gray-1)',
      background: isOverdue ? 'var(--mantine-color-orange-0)' : 'white',
      transition: 'background 0.15s',
    }}>
      {/* Avatar */}
      <Avatar
        alt={`${report.firstName} ${report.lastName}`}
        size="lg"
        color={report.avatarColor}
      >
        {`${report.firstName[0]}${report.lastName[0]}`}
      </Avatar>

      {/* Name + title */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--mantine-color-gray-9)' }}>
            {report.firstName} {report.lastName}
          </span>
          {report.isFrontline && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
              background: 'var(--mantine-color-pink-1)', color: 'var(--mantine-color-pink-7)',
              letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
              Frontline
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--mantine-color-gray-5)', marginTop: 2 }}>
          {report.title} · {report.department}
        </div>
        {report.isFrontline && (
          <div style={{ fontSize: 11, color: 'var(--mantine-color-gray-4)', marginTop: 2 }}>
            📱 Recognition delivered via personal QR link
          </div>
        )}
      </div>

      {/* Recognition status */}
      <div style={{ minWidth: 160, textAlign: 'center' }}>
        {recognitionBadge(report.lastRecognizedDaysAgo)}
        <div style={{ fontSize: 11, color: 'var(--mantine-color-gray-4)', marginTop: 4 }}>
          {report.recognitionsThisQuarter} recognition{report.recognitionsThisQuarter !== 1 ? 's' : ''} this quarter
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <Button variant="tertiary" size="slim" onClick={() => onViewProfile(report.id)}>
          Profile
        </Button>
        <Button variant="primary" size="slim" onClick={() => onRecognize(report)}>
          Recognize ✨
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const TABS: NavigationTabItem[] = [
  { value: 'team',    label: 'My Team' },
  { value: 'history', label: 'Recognition History' },
  { value: 'budget',  label: 'Budget' },
];

// Live team data from /api/rr/manager/team
interface LiveTeamData {
  budget: { balanceCents: number; giftsIssuedCents: number };
  directReports: Array<{
    employeeId: string;
    daysSinceLastRecognized: number | null;
    recognitionsReceived: number;
    flagged: boolean;
  }>;
}

// Live ledger from /api/rr/manager/budget
interface LedgerEntry {
  id: string;
  amountCents: number;
  amountDollars: string;
  entryType: string; // 'allocation'|'debit'|'rollback'|'expiry'
  referenceId: string | null;
  note: string | null;
  createdAt: string;
}

export function ManagerDashboardPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('team');
  const [selectedManagerId, setSelectedManagerId] = useState('mgr_001');
  const [recognizeOpen, setRecognizeOpen] = useState(false);
  const [recognizeTarget, setRecognizeTarget] = useState<EmployeeProfile | null>(null);
  const [liveData, setLiveData] = useState<LiveTeamData | null>(null);
  const [liveLedger, setLiveLedger] = useState<LedgerEntry[] | null>(null);

  // Fetch live team data and ledger whenever manager changes
  useEffect(() => {
    setLiveData(null);
    setLiveLedger(null);
    const headers = { 'x-user-id': selectedManagerId, 'x-user-role': 'manager' };

    fetch(`${API}/api/rr/manager/team`, { headers })
      .then(r => r.json())
      .then((d: { budget?: LiveTeamData['budget']; directReports?: LiveTeamData['directReports'] }) => {
        if (d.budget && d.directReports) {
          setLiveData({ budget: d.budget, directReports: d.directReports });
        }
      })
      .catch(() => {/* use static fallback */});

    fetch(`${API}/api/rr/manager/budget`, { headers })
      .then(r => r.json())
      .then((d: { ledger?: LedgerEntry[] }) => {
        if (d.ledger) setLiveLedger(d.ledger);
      })
      .catch(() => {});
  }, [selectedManagerId]);

  const staticManager = MANAGER_OPTIONS.find(o => o.value === selectedManagerId)!.manager;

  // Merge live data over static stub — live wins where available
  const manager: ManagerProfile = {
    ...staticManager,
    budgetAllocatedCents: liveData
      ? liveData.budget.balanceCents + liveData.budget.giftsIssuedCents
      : staticManager.budgetAllocatedCents,
    budgetSpentCents: liveData
      ? liveData.budget.giftsIssuedCents
      : staticManager.budgetSpentCents,
    directReports: staticManager.directReports.map(report => {
      const live = liveData?.directReports.find(d => d.employeeId === report.id);
      if (!live) return report;
      return {
        ...report,
        lastRecognizedDaysAgo: live.daysSinceLastRecognized,
        recognitionsThisQuarter: live.recognitionsReceived,
      };
    }),
  };

  const overdueReports = manager.directReports.filter(
    r => r.lastRecognizedDaysAgo === null || r.lastRecognizedDaysAgo > OVERDUE_THRESHOLD
  );

  const budgetPctLeft = manager.budgetAllocatedCents > 0
    ? Math.round(
        ((manager.budgetAllocatedCents - manager.budgetSpentCents) / manager.budgetAllocatedCents) * 100
      )
    : 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title="My Team"
        description={`${manager.directReports.length} direct report${manager.directReports.length !== 1 ? 's' : ''} · ${manager.budgetPeriodLabel} recognition program`}
        actionButtons={[
          <Badge key="budget" color={budgetPctLeft > 40 ? 'success' : 'warning'} variant="light">
            {formatCents(manager.budgetAllocatedCents - manager.budgetSpentCents)} budget remaining
          </Badge>,
          <Button key="recognize" variant="primary" onClick={() => { setRecognizeTarget(null); setRecognizeOpen(true); }}>
            Recognize someone ✨
          </Button>,
        ]}
      />

      {/* Manager switcher — demo aid to switch between corporate and frontline manager */}
      <ManagerSwitcher selectedId={selectedManagerId} onChange={id => { setSelectedManagerId(id); setRecognizeTarget(null); setRecognizeOpen(false); }} />

      {/* Equity gap alert — fires when any direct report is overdue */}
      {overdueReports.length > 0 && (
        <AlertBanner
          variant="warning"
          title={`${overdueReports.length} direct report${overdueReports.length > 1 ? 's' : ''} haven't been recognized in over 30 days`}
          headingVariant="h4"
        >
          {overdueReports.map(r => r.firstName).join(', ')} {overdueReports.length === 1 ? 'is' : 'are'} overdue
          for recognition. A quick acknowledgement goes a long way — use the Recognize button below.
        </AlertBanner>
      )}

      {/* Tab navigation */}
      <NavigationTabs
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Tab content */}
      {activeTab === 'team' && (
        <Card>
          {/* Column headers */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '10px 24px',
            borderBottom: '1px solid var(--mantine-color-gray-2)',
            background: 'var(--mantine-color-gray-0)',
          }}>
            <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: 'var(--mantine-color-gray-5)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Employee
            </div>
            <div style={{ minWidth: 160, fontSize: 11, fontWeight: 700, color: 'var(--mantine-color-gray-5)', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'center' }}>
              Recognition status
            </div>
            <div style={{ minWidth: 160, fontSize: 11, fontWeight: 700, color: 'var(--mantine-color-gray-5)', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'right' }}>
              Actions
            </div>
          </div>

          {manager.directReports.map(report => (
            <TeamRow
              key={report.id}
              report={report}
              onRecognize={setRecognizeTarget}
              onViewProfile={id => navigate(`/employee/${id}`)}
            />
          ))}

          {/* Footer hint */}
          <div style={{
            padding: '14px 24px',
            background: 'var(--mantine-color-gray-0)',
            borderTop: '1px solid var(--mantine-color-gray-2)',
            fontSize: 12,
            color: 'var(--mantine-color-gray-5)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{
              display: 'inline-block',
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--mantine-color-orange-4)',
            }} />
            Highlighted rows indicate employees overdue for recognition (&gt;30 days)
          </div>
        </Card>
      )}

      {activeTab === 'history' && <HistoryPanel manager={manager} />}
      {activeTab === 'budget' && <BudgetPanel manager={manager} liveLedger={liveLedger} />}

      {/* Recognize drawer */}
      {(recognizeOpen || recognizeTarget) && (
        <RecognizeDrawer
          employee={recognizeTarget}
          employees={manager.directReports}
          availableBudgetCents={manager.budgetAllocatedCents - manager.budgetSpentCents}
          managerFirstName={manager.firstName}
          onClose={() => { setRecognizeTarget(null); setRecognizeOpen(false); }}
        />
      )}
    </div>
  );
}
