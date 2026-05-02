/**
 * AdminPage — /admin/rr
 *
 * HR Admin control centre for the R&R program. Four tabs:
 *
 *   Setup    — Company values (CRUD, max 8) + program configuration
 *   Budget   — Org-wide budget overview, per-manager balances, allocations
 *   Reports  — Program health metrics (30d default), alerts, CSV export
 *   Audit    — Immutable audit log (read-only)
 *
 * All API calls include x-user-role: hr_admin (POC mock auth).
 * Uses the ClearCompany design-system components from ../lib/clearco-ui.
 *
 * Backend endpoints consumed:
 *   GET  /api/rr/admin/values
 *   POST /api/rr/admin/values
 *   PATCH /api/rr/admin/values/:id
 *   GET  /api/rr/admin/budget
 *   POST /api/rr/admin/budget/allocate
 *   GET  /api/rr/admin/reports/summary?days=N
 *   GET  /api/rr/admin/reports/export
 *   GET  /api/rr/admin/config
 *   PUT  /api/rr/admin/config
 *   GET  /api/rr/admin/audit
 */

import { useState, useEffect, useCallback } from 'react';
import {
  PageHeader,
  NavigationTabs,
  AlertBanner,
  Card,
  Badge,
  Button,
  Progress,
  type NavigationTabItem,
} from '../lib/clearco-ui';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API = 'http://localhost:3001';
const ADMIN_HEADERS = {
  'x-user-id': 'admin',
  'x-user-role': 'hr_admin',
  'Content-Type': 'application/json',
};
const ADMIN_GET_HEADERS = { 'x-user-id': 'admin', 'x-user-role': 'hr_admin' };

function fmt$(cents: number) { return `$${(cents / 100).toFixed(0)}`; }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

const sectionLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--mantine-color-gray-5)',
  letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12,
};
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '14px 20px',
  borderBottom: '1px solid var(--mantine-color-gray-1)',
};
const inputStyle: React.CSSProperties = {
  border: '1px solid var(--mantine-color-gray-3)',
  borderRadius: 6, padding: '7px 10px',
  fontSize: 13, color: 'var(--mantine-color-gray-9)',
  outline: 'none', background: '#fff',
};
const smallBtn = (color = '#1a56db', textColor = '#fff'): React.CSSProperties => ({
  padding: '6px 14px', borderRadius: 6, border: 'none',
  background: color, color: textColor,
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
});

// ---------------------------------------------------------------------------
// Types (mirror backend response shapes)
// ---------------------------------------------------------------------------

interface CompanyValue {
  id: string;
  label: string;
  emoji: string;
  sort_order: number;
  is_active: number; // 0 | 1
}

interface ManagerBalance {
  managerId: string;
  managerName: string;
  balanceCents: number;
  totalAllocatedCents: number;
  totalSpentCents: number;
  utilizationPct: string;
}

interface OrgSummary {
  totalAllocatedCents: number;
  totalSpentCents: number;
  totalBalanceCents: number;
  utilizationPct: string;
}

interface GuustoWorkspace {
  balanceCents: number | null;
  balanceDollars: string | null;
  alertThresholdCents: number;
  alertThresholdDollars: string;
  isLow: boolean;
  checkedAt: string | null;
  live: boolean;
}

interface ReportSummary {
  period: { days: number; since: string };
  shoutouts: {
    totalSent: number; uniqueSenders: number; uniqueRecipients: number;
    withGift: number; totalGiftedDollars: string;
    giftsDelivered: number; giftsRedeemed: number; redemptionRate: string;
  };
  coverage: { totalEmployees: number; recognizedEmployees: number; coveragePct: string };
  managerActivation: {
    managersWithBudget: number; managersWithGiftActivity: number; activationRate: string;
  };
  alerts: {
    unrecognizedEmployees: Array<{ employeeId: string; name: string }>;
    gapThresholdDays: number;
    inactiveManagers: Array<{ managerId: string; balanceCents: number }>;
  };
}

interface TenantConfig {
  min_gift_cents: string;
  max_gift_cents: string;
  message_min_chars: string;
  message_max_chars: string;
  recognition_gap_alert_days: string;
  require_values: string;
  default_visibility: string;
  monetary_rewards_enabled: string;
  max_values_per_recognition: string;
  peer_gifting_enabled: string;
}

interface AuditEntry {
  id: string;
  actor_id: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Shared — inline toast banner
// ---------------------------------------------------------------------------

function Toast({ msg, onDone }: { msg: { text: string; ok: boolean } | null; onDone: () => void }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [msg, onDone]);
  if (!msg) return null;
  return (
    <AlertBanner
      variant={msg.ok ? 'success' : 'error'}
      title={msg.text}
      headingVariant="h5"
      onClose={onDone}
    />
  );
}

// ---------------------------------------------------------------------------
// TAB 1 — Setup: Company Values
// ---------------------------------------------------------------------------

const EMOJI_SUGGESTIONS = ['⭐', '🤝', '💡', '🏆', '🚀', '🛡️', '🎯', '💎', '🌟', '🔥', '❤️', '🌱'];

function CompanyValuesCard() {
  const [values, setValues] = useState<CompanyValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [addLabel, setAddLabel] = useState('');
  const [addEmoji, setAddEmoji] = useState('⭐');
  const [showAddForm, setShowAddForm] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`${API}/api/rr/admin/values`, { headers: ADMIN_GET_HEADERS });
    const d = await r.json() as { values: CompanyValue[] };
    setValues(d.values);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeCount = values.filter(v => v.is_active === 1).length;

  const startEdit = (v: CompanyValue) => {
    setEditingId(v.id);
    setEditLabel(v.label);
    setEditEmoji(v.emoji);
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/rr/admin/values/${id}`, {
        method: 'PATCH',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({ label: editLabel.trim(), emoji: editEmoji }),
      });
      if (!r.ok) {
        const e = await r.json() as { error: string };
        setToast({ text: e.error, ok: false });
      } else {
        setToast({ text: 'Value updated', ok: true });
        setEditingId(null);
        void load();
      }
    } finally { setSaving(false); }
  };

  const toggleActive = async (v: CompanyValue) => {
    const r = await fetch(`${API}/api/rr/admin/values/${v.id}`, {
      method: 'PATCH',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ is_active: v.is_active === 0 }),
    });
    if (!r.ok) {
      const e = await r.json() as { error: string };
      setToast({ text: e.error, ok: false });
    } else {
      setToast({ text: `Value ${v.is_active === 1 ? 'deactivated' : 'activated'}`, ok: true });
      void load();
    }
  };

  const addValue = async () => {
    if (!addLabel.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/rr/admin/values`, {
        method: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({ label: addLabel.trim(), emoji: addEmoji }),
      });
      if (!r.ok) {
        const e = await r.json() as { error: string };
        setToast({ text: e.error, ok: false });
      } else {
        setToast({ text: `"${addLabel.trim()}" added`, ok: true });
        setAddLabel('');
        setAddEmoji('⭐');
        setShowAddForm(false);
        void load();
      }
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--mantine-color-gray-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--mantine-color-gray-9)' }}>Company Values</div>
          <div style={{ fontSize: 12, color: 'var(--mantine-color-gray-5)', marginTop: 2 }}>
            {activeCount} active · 8 maximum · deactivating never alters historical records
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Badge color={activeCount >= 8 ? 'warning' : 'info'} variant="light">
            {activeCount}/8 active
          </Badge>
          {activeCount < 8 && (
            <button
              onClick={() => setShowAddForm(s => !s)}
              style={smallBtn()}
            >
              + Add value
            </button>
          )}
        </div>
      </div>

      <Toast msg={toast} onDone={() => setToast(null)} />

      {loading ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--mantine-color-gray-5)', fontSize: 13 }}>
          Loading values…
        </div>
      ) : (
        <>
          {values.map(v => (
            <div key={v.id} style={{
              ...rowStyle,
              background: v.is_active === 0 ? 'var(--mantine-color-gray-0)' : 'white',
              opacity: v.is_active === 0 ? 0.65 : 1,
            }}>
              {editingId === v.id ? (
                /* Inline edit row */
                <>
                  {/* Emoji picker */}
                  <div style={{ position: 'relative' }}>
                    <input
                      value={editEmoji}
                      onChange={e => setEditEmoji(e.target.value)}
                      style={{ ...inputStyle, width: 52, textAlign: 'center', fontSize: 20 }}
                      maxLength={4}
                      title="Emoji"
                    />
                  </div>
                  <input
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder="Value label"
                    onKeyDown={e => e.key === 'Enter' && void saveEdit(v.id)}
                    autoFocus
                  />
                  {/* Emoji quick-pick */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 200 }}>
                    {EMOJI_SUGGESTIONS.map(em => (
                      <button
                        key={em}
                        onClick={() => setEditEmoji(em)}
                        title={em}
                        style={{
                          background: editEmoji === em ? 'var(--mantine-color-blue-1)' : '#f8fafc',
                          border: editEmoji === em ? '1px solid var(--mantine-color-blue-4)' : '1px solid #e2e8f0',
                          borderRadius: 4, padding: '2px 4px', cursor: 'pointer', fontSize: 16,
                        }}
                      >{em}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => void saveEdit(v.id)} disabled={saving} style={smallBtn()}>
                      {saving ? '…' : 'Save'}
                    </button>
                    <button onClick={() => setEditingId(null)} style={smallBtn('#f1f5f9', '#374151')}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                /* Display row */
                <>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{v.emoji}</span>
                  <span style={{
                    flex: 1, fontSize: 14, fontWeight: 600,
                    color: 'var(--mantine-color-gray-8)',
                    textDecoration: v.is_active === 0 ? 'line-through' : 'none',
                  }}>
                    {v.label}
                  </span>
                  <Badge
                    color={v.is_active === 1 ? 'success' : 'gray'}
                    variant="light" size="sm"
                  >
                    {v.is_active === 1 ? 'Active' : 'Inactive'}
                  </Badge>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => startEdit(v)} style={smallBtn('#f1f5f9', '#374151')}>
                      Edit
                    </button>
                    <button
                      onClick={() => void toggleActive(v)}
                      style={smallBtn(v.is_active === 1 ? '#fef2f2' : '#f0fdf4', v.is_active === 1 ? '#b91c1c' : '#166534')}
                    >
                      {v.is_active === 1 ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Add value form */}
          {showAddForm && (
            <div style={{
              padding: '16px 20px',
              background: 'var(--mantine-color-blue-0)',
              borderTop: '1px solid var(--mantine-color-blue-2)',
            }}>
              <div style={{ ...sectionLabel, color: 'var(--mantine-color-blue-7)' }}>New Value</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={addEmoji}
                  onChange={e => setAddEmoji(e.target.value)}
                  style={{ ...inputStyle, width: 52, textAlign: 'center', fontSize: 20 }}
                  maxLength={4}
                  title="Emoji"
                />
                <input
                  value={addLabel}
                  onChange={e => setAddLabel(e.target.value)}
                  style={{ ...inputStyle, flex: 1, minWidth: 160 }}
                  placeholder="Label (e.g. Customer Focus)"
                  onKeyDown={e => e.key === 'Enter' && void addValue()}
                  autoFocus
                />
                {/* Quick emoji pick */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {EMOJI_SUGGESTIONS.slice(0, 8).map(em => (
                    <button
                      key={em}
                      onClick={() => setAddEmoji(em)}
                      style={{
                        background: addEmoji === em ? 'var(--mantine-color-blue-1)' : '#fff',
                        border: addEmoji === em ? '1px solid var(--mantine-color-blue-4)' : '1px solid #e2e8f0',
                        borderRadius: 4, padding: '2px 4px', cursor: 'pointer', fontSize: 16,
                      }}
                    >{em}</button>
                  ))}
                </div>
                <button
                  onClick={() => void addValue()}
                  disabled={saving || !addLabel.trim()}
                  style={smallBtn(addLabel.trim() ? '#1a56db' : '#e2e8f0', addLabel.trim() ? '#fff' : '#94a3b8')}
                >
                  {saving ? '…' : 'Add'}
                </button>
                <button onClick={() => setShowAddForm(false)} style={smallBtn('#f1f5f9', '#374151')}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TAB 1 — Setup: Program Configuration
// ---------------------------------------------------------------------------

function ProgramConfigCard() {
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [draft, setDraft] = useState<TenantConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`${API}/api/rr/admin/config`, { headers: ADMIN_GET_HEADERS });
    const d = await r.json() as { config: TenantConfig };
    setConfig(d.config);
    setDraft({ ...d.config });
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/rr/admin/config`, {
        method: 'PUT',
        headers: ADMIN_HEADERS,
        body: JSON.stringify(draft),
      });
      const d = await r.json() as { updated: string[]; count: number };
      setToast({ text: `${d.count} setting${d.count !== 1 ? 's' : ''} saved`, ok: true });
      setConfig({ ...draft });
    } catch {
      setToast({ text: 'Save failed — check backend connection', ok: false });
    } finally { setSaving(false); }
  };

  const isDirty = draft && config && JSON.stringify(draft) !== JSON.stringify(config);

  if (loading || !draft) {
    return (
      <Card>
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--mantine-color-gray-5)', fontSize: 13 }}>
          Loading configuration…
        </div>
      </Card>
    );
  }

  const set = (key: keyof TenantConfig, value: string) =>
    setDraft(d => d ? { ...d, [key]: value } : d);

  return (
    <Card>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--mantine-color-gray-9)' }}>Program Settings</div>
        <div style={{ fontSize: 12, color: 'var(--mantine-color-gray-5)', marginTop: 2 }}>
          Changes take effect immediately for all new recognitions.
        </div>
      </div>

      <Toast msg={toast} onDone={() => setToast(null)} />

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* Recognition Rules */}
        <div>
          <div style={sectionLabel}>Recognition Rules</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <ToggleSetting
              label="Values required"
              description="Sender must pick at least one company value"
              value={draft.require_values === 'true'}
              onChange={v => set('require_values', v ? 'true' : 'false')}
            />
            <NumberSetting
              label="Max values per recognition"
              description="How many values can be tagged at once (1–3)"
              value={parseInt(draft.max_values_per_recognition)}
              min={1} max={3}
              onChange={v => set('max_values_per_recognition', String(v))}
            />
            <SelectSetting
              label="Default visibility"
              description="Pre-selected visibility when composing"
              value={draft.default_visibility}
              options={[
                { value: 'company', label: '🌐 Company-wide' },
                { value: 'team',    label: '👥 Team only' },
                { value: 'private', label: '🔒 Private' },
              ]}
              onChange={v => set('default_visibility', v)}
            />
            <NumberSetting
              label="Recognition gap alert (days)"
              description="Warn managers after this many days without recognizing"
              value={parseInt(draft.recognition_gap_alert_days)}
              min={7} max={90}
              onChange={v => set('recognition_gap_alert_days', String(v))}
            />
          </div>
        </div>

        {/* Message Constraints */}
        <div>
          <div style={sectionLabel}>Message Constraints</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <NumberSetting
              label="Minimum characters"
              description="Shortest message accepted"
              value={parseInt(draft.message_min_chars)}
              min={10} max={200}
              onChange={v => set('message_min_chars', String(v))}
            />
            <NumberSetting
              label="Maximum characters"
              description="Message length hard cap"
              value={parseInt(draft.message_max_chars)}
              min={100} max={2000}
              onChange={v => set('message_max_chars', String(v))}
            />
          </div>
        </div>

        {/* Monetary Rewards */}
        <div>
          <div style={sectionLabel}>Monetary Rewards (Guusto)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <ToggleSetting
              label="Enable monetary rewards"
              description="Allow managers to attach Guusto gift cards"
              value={draft.monetary_rewards_enabled === 'true'}
              onChange={v => set('monetary_rewards_enabled', v ? 'true' : 'false')}
            />
            <ToggleSetting
              label="Peer gifting"
              description="Allow non-managers to send gift cards"
              value={draft.peer_gifting_enabled === 'true'}
              onChange={v => set('peer_gifting_enabled', v ? 'true' : 'false')}
            />
            <NumberSetting
              label="Minimum gift (USD)"
              description="Smallest gift card value allowed"
              value={Math.round(parseInt(draft.min_gift_cents) / 100)}
              min={1} max={100}
              prefix="$"
              onChange={v => set('min_gift_cents', String(v * 100))}
            />
            <NumberSetting
              label="Maximum gift (USD)"
              description="Largest gift card value allowed"
              value={Math.round(parseInt(draft.max_gift_cents) / 100)}
              min={5} max={500}
              prefix="$"
              onChange={v => set('max_gift_cents', String(v * 100))}
            />
          </div>
        </div>

        {/* Save */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
          {isDirty && (
            <button onClick={() => setDraft({ ...config! })} style={smallBtn('#f1f5f9', '#374151')}>
              Reset
            </button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={() => void save()}
            disabled={!isDirty || saving}
          >
            {saving ? 'Saving…' : isDirty ? 'Save changes' : 'All saved ✓'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* Mini form controls */
function ToggleSetting({ label, description, value, onChange }: {
  label: string; description: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 8, border: '1px solid var(--mantine-color-gray-2)',
      display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        style={{
          width: 40, height: 22, borderRadius: 11, border: 'none',
          background: value ? '#1a56db' : 'var(--mantine-color-gray-3)',
          cursor: 'pointer', position: 'relative', flexShrink: 0, marginTop: 2,
          transition: 'background 0.15s',
        }}
      >
        <span style={{
          position: 'absolute', top: 3, left: value ? 21 : 3,
          width: 16, height: 16, borderRadius: '50%', background: '#fff',
          transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mantine-color-gray-8)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--mantine-color-gray-5)', marginTop: 2 }}>{description}</div>
      </div>
    </div>
  );
}

function NumberSetting({ label, description, value, min, max, prefix, onChange }: {
  label: string; description: string; value: number; min: number; max: number;
  prefix?: string; onChange: (v: number) => void;
}) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 8, border: '1px solid var(--mantine-color-gray-2)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mantine-color-gray-8)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--mantine-color-gray-5)', marginBottom: 8 }}>{description}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {prefix && <span style={{ fontSize: 14, color: 'var(--mantine-color-gray-6)' }}>{prefix}</span>}
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={e => onChange(Math.min(max, Math.max(min, parseInt(e.target.value) || min)))}
          style={{ ...inputStyle, width: 80 }}
        />
        <span style={{ fontSize: 11, color: 'var(--mantine-color-gray-4)' }}>{min}–{max}</span>
      </div>
    </div>
  );
}

function SelectSetting({ label, description, value, options, onChange }: {
  label: string; description: string; value: string;
  options: Array<{ value: string; label: string }>; onChange: (v: string) => void;
}) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 8, border: '1px solid var(--mantine-color-gray-2)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mantine-color-gray-8)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--mantine-color-gray-5)', marginBottom: 8 }}>{description}</div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          ...inputStyle, width: '100%',
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14L2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 28,
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function SetupTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <CompanyValuesCard />
      <ProgramConfigCard />
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB 2 — Budget
// ---------------------------------------------------------------------------

function BudgetTab() {
  const [data, setData] = useState<{ managers: ManagerBalance[]; orgSummary: OrgSummary; guustoWorkspace?: GuustoWorkspace } | null>(null);
  const [loading, setLoading] = useState(true);
  const [allocatingId, setAllocatingId] = useState<string | null>(null);
  const [allocAmount, setAllocAmount] = useState('');
  const [allocNote, setAllocNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`${API}/api/rr/admin/budget`, { headers: ADMIN_GET_HEADERS });
    const d = await r.json() as { managers: ManagerBalance[]; orgSummary: OrgSummary; guustoWorkspace?: GuustoWorkspace };
    setData(d);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const allocate = async (managerId: string) => {
    const cents = Math.round(parseFloat(allocAmount) * 100);
    if (!cents || cents <= 0) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/rr/admin/budget/allocate`, {
        method: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({
          managerId,
          amountCents: cents,
          periodLabel: allocNote || `Manual allocation ${new Date().toISOString().slice(0, 10)}`,
        }),
      });
      if (!r.ok) {
        const e = await r.json() as { error: string };
        setToast({ text: e.error, ok: false });
      } else {
        const d = await r.json() as { newBalanceDollars: string };
        setToast({ text: `Allocated $${(cents / 100).toFixed(0)} · new balance $${d.newBalanceDollars}`, ok: true });
        setAllocatingId(null);
        setAllocAmount('');
        setAllocNote('');
        void load();
      }
    } finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Toast msg={toast} onDone={() => setToast(null)} />

      {/* Org summary */}
      {data && (
        <Card>
          <div style={{ padding: '20px 24px' }}>
            <div style={sectionLabel}>Organization Budget Summary — Q2 2026</div>
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              {[
                { label: 'Total Allocated', value: fmt$(data.orgSummary.totalAllocatedCents), color: 'var(--mantine-color-gray-9)' },
                { label: 'Total Spent', value: fmt$(data.orgSummary.totalSpentCents), color: 'var(--mantine-color-blue-7)' },
                { label: 'Remaining', value: fmt$(data.orgSummary.totalBalanceCents), color: 'var(--mantine-color-green-7)' },
                { label: 'Utilization', value: `${data.orgSummary.utilizationPct}%`, color: 'var(--mantine-color-gray-7)' },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mantine-color-gray-5)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Guusto Workspace Balance */}
      {data?.guustoWorkspace && (() => {
        const ws = data.guustoWorkspace!;
        const checkedAgo = ws.checkedAt
          ? Math.round((Date.now() - new Date(ws.checkedAt).getTime()) / 60000)
          : null;
        return (
          <Card>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={sectionLabel}>Guusto Workspace Balance</div>
                {ws.isLow && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 20,
                    background: '#fef2f2', border: '1px solid #fecaca',
                    fontSize: 12, fontWeight: 700, color: '#dc2626',
                  }}>
                    ⚠ Low Balance — Top up Guusto workspace
                  </div>
                )}
                {!ws.isLow && ws.balanceCents !== null && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 20,
                    background: '#f0fdf4', border: '1px solid #bbf7d0',
                    fontSize: 12, fontWeight: 700, color: '#16a34a',
                  }}>
                    ✓ Funded
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mantine-color-gray-5)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>
                    Workspace Balance
                  </div>
                  <div style={{
                    fontSize: 32, fontWeight: 800,
                    color: ws.isLow ? '#dc2626' : ws.balanceCents !== null ? 'var(--mantine-color-green-7)' : 'var(--mantine-color-gray-4)',
                  }}>
                    {ws.balanceDollars !== null ? `$${ws.balanceDollars}` : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mantine-color-gray-5)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>
                    Alert Threshold
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--mantine-color-gray-6)' }}>
                    ${ws.alertThresholdDollars}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mantine-color-gray-5)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>
                    Last Checked
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--mantine-color-gray-6)' }}>
                    {checkedAgo === null ? '—' : checkedAgo === 0 ? 'Just now' : `${checkedAgo}m ago`}
                    {!ws.live && <span style={{ marginLeft: 6, fontSize: 11, color: '#f59e0b' }}>(cached)</span>}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--mantine-color-gray-5)' }}>
                This balance covers all Guusto gift cards sent across all managers. Checked live on each page load and hourly by the server.
              </div>
            </div>
          </Card>
        );
      })()}

      {/* Per-manager table */}
      <Card>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--mantine-color-gray-2)', background: 'var(--mantine-color-gray-0)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 110px 80px 120px', gap: 12, alignItems: 'center' }}>
            {['Manager', 'Allocated', 'Spent', 'Balance', 'Utilization', ''].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--mantine-color-gray-5)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</div>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--mantine-color-gray-5)', fontSize: 13 }}>
            Loading budgets…
          </div>
        ) : data?.managers.map(m => (
          <div key={m.managerId}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--mantine-color-gray-1)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 110px 80px 120px', gap: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--mantine-color-gray-9)' }}>{m.managerName}</div>
                  <div style={{ fontSize: 11, color: 'var(--mantine-color-gray-4)', marginTop: 1 }}>{m.managerId}</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--mantine-color-gray-7)' }}>{fmt$(m.totalAllocatedCents)}</div>
                <div style={{ fontSize: 14, color: 'var(--mantine-color-gray-7)' }}>{fmt$(m.totalSpentCents)}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: m.balanceCents > 0 ? 'var(--mantine-color-green-7)' : 'var(--mantine-color-gray-5)' }}>
                  {fmt$(m.balanceCents)}
                </div>
                <div>
                  <Progress
                    value={parseFloat(m.utilizationPct)}
                    color={parseFloat(m.utilizationPct) > 80 ? 'orange' : 'blue'}
                    size="sm"
                  />
                  <div style={{ fontSize: 10, color: 'var(--mantine-color-gray-4)', marginTop: 2 }}>{m.utilizationPct}%</div>
                </div>
                <div>
                  <button
                    onClick={() => { setAllocatingId(allocatingId === m.managerId ? null : m.managerId); setAllocAmount(''); setAllocNote(''); }}
                    style={smallBtn(allocatingId === m.managerId ? '#f1f5f9' : '#1a56db', allocatingId === m.managerId ? '#374151' : '#fff')}
                  >
                    {allocatingId === m.managerId ? 'Cancel' : '+ Allocate'}
                  </button>
                </div>
              </div>
            </div>

            {/* Inline allocation form */}
            {allocatingId === m.managerId && (
              <div style={{ padding: '12px 20px 16px', background: 'var(--mantine-color-blue-0)', borderBottom: '1px solid var(--mantine-color-blue-2)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mantine-color-blue-8)', marginBottom: 8 }}>
                  Add allocation for {m.managerName}
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 14, color: 'var(--mantine-color-gray-6)' }}>$</span>
                    <input
                      type="number"
                      value={allocAmount}
                      onChange={e => setAllocAmount(e.target.value)}
                      style={{ ...inputStyle, width: 90 }}
                      placeholder="500"
                      min={1}
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && void allocate(m.managerId)}
                    />
                    <span style={{ fontSize: 11, color: 'var(--mantine-color-gray-4)' }}>USD</span>
                  </div>
                  <input
                    value={allocNote}
                    onChange={e => setAllocNote(e.target.value)}
                    style={{ ...inputStyle, flex: 1, minWidth: 160 }}
                    placeholder="Note (e.g. Q2 2026 allocation)"
                  />
                  <button
                    onClick={() => void allocate(m.managerId)}
                    disabled={saving || !allocAmount}
                    style={smallBtn(allocAmount ? '#1a56db' : '#e2e8f0', allocAmount ? '#fff' : '#94a3b8')}
                  >
                    {saving ? '…' : 'Confirm'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB 3 — Reports
// ---------------------------------------------------------------------------

const PERIOD_OPTIONS = [
  { label: '7 days',  value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
];

function MetricCard({ label, value, sub, color = 'var(--mantine-color-gray-9)' }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div style={{
      padding: '20px 20px',
      background: '#fff',
      border: '1px solid var(--mantine-color-gray-2)',
      borderRadius: 10,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--mantine-color-gray-5)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--mantine-color-gray-4)', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function ReportsTab() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    const r = await fetch(`${API}/api/rr/admin/reports/summary?days=${d}`, { headers: ADMIN_GET_HEADERS });
    const json = await r.json() as ReportSummary;
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => { void load(days); }, [load, days]);

  const exportCsv = () => {
    window.open(`${API}/api/rr/admin/reports/export`, '_blank');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Period selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', borderRadius: 8, padding: 3 }}>
          {PERIOD_OPTIONS.map(p => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              style={{
                padding: '6px 16px', borderRadius: 6, border: 'none',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: days === p.value ? '#fff' : 'transparent',
                color: days === p.value ? '#1e293b' : '#94a3b8',
                boxShadow: days === p.value ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={exportCsv}>
          ↓ Export CSV
        </Button>
      </div>

      {loading || !data ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--mantine-color-gray-5)', fontSize: 13 }}>
          Loading report…
        </div>
      ) : (
        <>
          {/* Metric grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <MetricCard
              label="Recognitions sent"
              value={data.shoutouts.totalSent}
              sub={`${data.shoutouts.uniqueSenders} unique senders`}
            />
            <MetricCard
              label="Employee coverage"
              value={data.coverage.coveragePct}
              sub={`${data.coverage.recognizedEmployees} of ${data.coverage.totalEmployees} employees`}
              color={parseFloat(data.coverage.coveragePct) >= 50 ? 'var(--mantine-color-green-7)' : 'var(--mantine-color-orange-6)'}
            />
            <MetricCard
              label="Manager activation"
              value={data.managerActivation.activationRate}
              sub={`${data.managerActivation.managersWithGiftActivity} of ${data.managerActivation.managersWithBudget} with budget`}
              color="var(--mantine-color-blue-7)"
            />
            <MetricCard
              label="Gift redemption"
              value={data.shoutouts.redemptionRate}
              sub={`${data.shoutouts.giftsRedeemed} of ${data.shoutouts.giftsDelivered} delivered`}
              color="var(--mantine-color-teal-7)"
            />
          </div>

          {/* Second row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <MetricCard
              label="Total gifts value"
              value={`$${data.shoutouts.totalGiftedDollars}`}
              sub={`${data.shoutouts.withGift} recognitions with gift`}
              color="var(--mantine-color-violet-7)"
            />
            <MetricCard
              label="Gifts delivered"
              value={data.shoutouts.giftsDelivered}
              sub="Via Guusto"
            />
            <MetricCard
              label="Unique recipients"
              value={data.shoutouts.uniqueRecipients}
              sub={`of ${data.coverage.totalEmployees} total employees`}
            />
          </div>

          {/* Alerts */}
          {(data.alerts.unrecognizedEmployees.length > 0 || data.alerts.inactiveManagers.length > 0) && (
            <Card>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--mantine-color-gray-8)' }}>⚠️ Program Alerts</div>
              </div>

              {data.alerts.unrecognizedEmployees.length > 0 && (
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--mantine-color-gray-1)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mantine-color-orange-7)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Not recognized in {data.alerts.gapThresholdDays}+ days
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {data.alerts.unrecognizedEmployees.map(e => (
                      <Badge key={e.employeeId} color="warning" variant="light" size="sm">{e.name}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {data.alerts.inactiveManagers.length > 0 && (
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mantine-color-red-7)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Managers with unused budget (60+ days)
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {data.alerts.inactiveManagers.map(m => (
                      <Badge key={m.managerId} color="error" variant="light" size="sm">
                        {m.managerId} · {fmt$(m.balanceCents)} unspent
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {data.alerts.unrecognizedEmployees.length === 0 && data.alerts.inactiveManagers.length === 0 && (
            <div style={{
              padding: '16px 20px', borderRadius: 10,
              background: 'var(--mantine-color-green-0)',
              border: '1px solid var(--mantine-color-green-2)',
              fontSize: 14, color: 'var(--mantine-color-green-8)', fontWeight: 500,
            }}>
              ✅ No alerts for this period — program is healthy!
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB 4 — Audit Log
// ---------------------------------------------------------------------------

const ACTION_COLORS: Record<string, string> = {
  budget_allocated:   'blue',
  shoutout_deleted:   'red',
  recognition_sent:   'green',
};

function AuditTab() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const LIMIT = 20;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    const r = await fetch(`${API}/api/rr/admin/audit?page=${p}&limit=${LIMIT}`, { headers: ADMIN_GET_HEADERS });
    const d = await r.json() as { items: AuditEntry[]; total: number };
    setItems(d.items);
    setTotal(d.total);
    setLoading(false);
  }, []);

  useEffect(() => { void load(page); }, [load, page]);

  const totalPages = Math.ceil(total / LIMIT) || 1;

  return (
    <Card>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--mantine-color-gray-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--mantine-color-gray-9)' }}>Audit Log</div>
          <div style={{ fontSize: 12, color: 'var(--mantine-color-gray-5)', marginTop: 1 }}>
            {total} entries · immutable, append-only
          </div>
        </div>
        <Badge color="info" variant="light">Read-only</Badge>
      </div>

      {/* Column headers */}
      <div style={{
        padding: '10px 20px',
        borderBottom: '1px solid var(--mantine-color-gray-2)',
        background: 'var(--mantine-color-gray-0)',
        display: 'grid',
        gridTemplateColumns: '160px 120px 160px 140px 1fr',
        gap: 12,
      }}>
        {['Timestamp', 'Actor', 'Action', 'Entity', 'Details'].map(h => (
          <div key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--mantine-color-gray-5)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</div>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--mantine-color-gray-5)', fontSize: 13 }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 14, color: 'var(--mantine-color-gray-6)', fontWeight: 500 }}>No audit entries yet</div>
          <div style={{ fontSize: 12, color: 'var(--mantine-color-gray-4)', marginTop: 4 }}>
            Budget allocations, moderation actions, and config changes will appear here.
          </div>
        </div>
      ) : (
        items.map(entry => (
          <div key={entry.id} style={{
            padding: '13px 20px',
            borderBottom: '1px solid var(--mantine-color-gray-1)',
            display: 'grid',
            gridTemplateColumns: '160px 120px 160px 140px 1fr',
            gap: 12,
            alignItems: 'start',
          }}>
            <div style={{ fontSize: 12, color: 'var(--mantine-color-gray-6)', fontFamily: 'monospace' }}>
              {fmtDate(entry.created_at)}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mantine-color-gray-8)' }}>{entry.actor_id}</div>
              <div style={{ fontSize: 10, color: 'var(--mantine-color-gray-4)', marginTop: 1 }}>{entry.actor_role}</div>
            </div>
            <div>
              <Badge
                color={ACTION_COLORS[entry.action] ?? 'gray'}
                variant="light" size="sm"
              >
                {entry.action}
              </Badge>
            </div>
            <div>
              <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--mantine-color-gray-7)' }}>{entry.entity_id}</div>
              <div style={{ fontSize: 10, color: 'var(--mantine-color-gray-4)' }}>{entry.entity_type}</div>
            </div>
            <div style={{
              fontSize: 11, fontFamily: 'monospace',
              color: 'var(--mantine-color-gray-5)',
              background: 'var(--mantine-color-gray-0)',
              padding: '4px 8px', borderRadius: 4,
              wordBreak: 'break-all',
            }}>
              {JSON.stringify(entry.details)}
            </div>
          </div>
        ))
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          padding: '14px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--mantine-color-gray-0)',
          borderTop: '1px solid var(--mantine-color-gray-2)',
        }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={smallBtn(page === 1 ? '#f1f5f9' : '#fff', page === 1 ? '#94a3b8' : '#374151')}
          >
            ← Prev
          </button>
          <span style={{ fontSize: 12, color: 'var(--mantine-color-gray-5)' }}>
            Page {page} of {totalPages} · {total} entries
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={smallBtn(page === totalPages ? '#f1f5f9' : '#fff', page === totalPages ? '#94a3b8' : '#374151')}
          >
            Next →
          </button>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TAB 5 — Slack Integration (RR-031 / RR-032 mock)
// ---------------------------------------------------------------------------

function SlackTab() {
  const [senderName, setSenderName] = useState('Rachael Alpert');
  const [recipientName, setRecipientName] = useState('Samuel Abramsky');
  const [message, setMessage] = useState('Samuel absolutely crushed it this week — he handled 12 escalations in a row, each customer leaving satisfied. His patience and product knowledge are unmatched. The team is lucky to have him.');
  const [valueLabel, setValueLabel] = useState('Customer Focus');
  const [valueEmoji, setValueEmoji] = useState('🤝');
  const [giftCents, setGiftCents] = useState(2500);
  const [preview, setPreview] = useState<{ blocks: unknown[] } | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const generatePreview = async () => {
    setSending(true);
    try {
      const r = await fetch(`${API}/api/rr/ai/slack/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...ADMIN_GET_HEADERS },
        body: JSON.stringify({
          senderName, recipientName, message,
          values: [{ label: valueLabel, emoji: valueEmoji }],
          giftAmountCents: giftCents,
        }),
      });
      const d = await r.json() as { payload: { blocks: unknown[] }; ok: boolean };
      setPreview(d.payload);
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } finally { setSending(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <AlertBanner variant="info" headingVariant="h4" title="Slack integration — POC preview mode">
        This panel shows what the Slack Block Kit notification would look like.
        In production, connect your Slack workspace and add the webhook URL to your environment config.
      </AlertBanner>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Compose panel */}
        <Card>
          <div style={{ padding: '20px 24px' }}>
            <div style={sectionLabel}>Preview a notification</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Sender name', value: senderName, set: setSenderName },
                { label: 'Recipient name', value: recipientName, set: setRecipientName },
                { label: 'Company value', value: valueLabel, set: setValueLabel },
                { label: 'Value emoji', value: valueEmoji, set: setValueEmoji },
              ].map(({ label, value, set }) => (
                <div key={label}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5 }}>{label}</div>
                  <input
                    value={value}
                    onChange={e => set(e.target.value)}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
              ))}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5 }}>Gift amount ($)</div>
                <input
                  type="number"
                  value={giftCents / 100}
                  min={0} max={500}
                  onChange={e => setGiftCents(parseInt(e.target.value) * 100 || 0)}
                  style={{ ...inputStyle, width: 100 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5 }}>Message</div>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={4}
                  style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                />
              </div>
              <button
                onClick={generatePreview}
                disabled={sending}
                style={{
                  padding: '10px 0', width: '100%',
                  background: sent ? '#059669' : '#1a56db',
                  color: '#fff', border: 'none', borderRadius: 8,
                  fontSize: 14, fontWeight: 700, cursor: sending ? 'wait' : 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {sent ? '✓ Block Kit preview generated!' : sending ? 'Generating…' : '📣 Generate Slack preview'}
              </button>
            </div>
          </div>
        </Card>

        {/* Slack-style preview */}
        <Card>
          <div style={{ padding: '20px 24px' }}>
            <div style={sectionLabel}>Slack message preview</div>

            {/* Fake Slack UI */}
            <div style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              overflow: 'hidden',
              fontFamily: '-apple-system, "Helvetica Neue", sans-serif',
            }}>
              {/* Slack top bar */}
              <div style={{
                background: '#4a154b', padding: '8px 16px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Slack</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>#recognition</div>
              </div>

              {/* Message content */}
              <div style={{ padding: '16px 16px 12px' }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 6,
                    background: '#1a56db',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, fontSize: 14, fontWeight: 800, color: '#fff',
                  }}>
                    CC
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#1d1c1d' }}>ClearCompany R&R</span>
                      <span style={{ fontSize: 11, color: '#616061' }}>just now</span>
                      <span style={{
                        fontSize: 10, fontWeight: 600, color: '#fff',
                        background: '#007a5a', borderRadius: 4, padding: '1px 5px',
                      }}>APP</span>
                    </div>

                    {/* Simulated block kit message */}
                    <div style={{
                      borderLeft: '4px solid #007a5a',
                      paddingLeft: 12, marginTop: 4,
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1d1c1d', marginBottom: 6 }}>
                        🎉 {recipientName} just got recognized!
                      </div>
                      <div style={{ fontSize: 13, color: '#1d1c1d', marginBottom: 8, lineHeight: 1.5 }}>
                        <strong>{senderName}</strong> recognized <strong>{recipientName}</strong>
                        {valueLabel && <div style={{ marginTop: 4 }}>{valueEmoji} {valueLabel}</div>}
                      </div>
                      <div style={{
                        background: '#f8f8f8', borderRadius: 6,
                        padding: '10px 12px', marginBottom: 10,
                        fontSize: 13, color: '#1d1c1d', lineHeight: 1.6,
                        fontStyle: 'italic',
                      }}>
                        &gt; {message}
                        {giftCents > 0 && (
                          <div style={{ marginTop: 8, fontStyle: 'normal', fontWeight: 700, color: '#007a5a' }}>
                            🎁 ${(giftCents / 100).toFixed(0)} Guusto gift card is on its way!
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{
                          padding: '6px 14px', borderRadius: 4,
                          background: '#007a5a', color: '#fff',
                          fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}>
                          👏 React
                        </div>
                        <div style={{
                          padding: '6px 14px', borderRadius: 4,
                          border: '1px solid #d1d5db', color: '#1d1c1d',
                          fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}>
                          View recognition
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: '#616061', marginTop: 10 }}>
                        Powered by ClearCompany R&R
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {preview && (
              <div style={{ marginTop: 16 }}>
                <div style={sectionLabel}>Block Kit JSON (copy to Slack)</div>
                <pre style={{
                  background: '#1e293b', color: '#e2e8f0',
                  padding: 14, borderRadius: 8, fontSize: 11,
                  overflow: 'auto', maxHeight: 200,
                  margin: 0, fontFamily: 'monospace',
                }}>
                  {JSON.stringify(preview, null, 2)}
                </pre>
              </div>
            )}

            {/* Slash command info */}
            <div style={{
              marginTop: 16, padding: '14px 16px',
              background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: 8,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                🤖 /recognize Slash command (RR-032)
              </div>
              <div style={{
                fontFamily: 'monospace', fontSize: 12,
                background: '#1e293b', color: '#a5b4fc',
                padding: '8px 12px', borderRadius: 6, marginBottom: 8,
              }}>
                /recognize @carmen "Customer Focus" She was incredible with customers today!
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6 }}>
                Managers type this in any Slack channel → ClearCompany processes it →
                recognition is posted + Guusto gift triggered.
                Available once Slack app is installed in your workspace.
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB 6 — Automations: AI-powered R&R workflow builder
// ---------------------------------------------------------------------------

type TriggerType = 'gong' | 'crm_deal' | 'hris_event' | 'slack_command';
type IntegrationStatus = 'connected' | 'needs_setup' | 'unknown';
type Visibility = 'company' | 'team' | 'private';

interface AutomationTrigger {
  type: TriggerType;
  label: string;
  integrationStatus?: IntegrationStatus;
  integrationRequired?: string;
  conditions?: string[];
}

interface AutomationBusinessRules {
  requireManagerApproval: boolean;
  recognitionEnabled: boolean;
  recognitionVisibility: Visibility;
  rewardEnabled: boolean;
  rewardAmountCents?: number;
  frequencyLimit?: string;
}

interface AutomationSpec {
  name?: string;
  description?: string;
  trigger?: AutomationTrigger;
  businessRules?: AutomationBusinessRules;
  ready?: boolean;
}

interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  triggerType: TriggerType;
  triggerConfig: Record<string, unknown>;
  conditions: string[];
  requireManagerApproval: boolean;
  recognitionEnabled: boolean;
  recognitionVisibility: Visibility;
  rewardEnabled: boolean;
  rewardAmountCents: number | null;
  frequencyLimit: string | null;
  status: 'active' | 'paused' | 'draft';
  createdAt: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const TRIGGER_META: Record<TriggerType, { icon: string; label: string; color: string }> = {
  gong:           { icon: '🎙️', label: 'Gong',         color: '#7c3aed' },
  crm_deal:       { icon: '💼', label: 'CRM Deal',     color: '#0369a1' },
  hris_event:     { icon: '👤', label: 'HRIS Event',   color: '#065f46' },
  slack_command:  { icon: '💬', label: 'Slack',        color: '#4a154b' },
};

const VISIBILITY_LABEL: Record<Visibility, string> = {
  company: '🌐 Company-wide',
  team:    '👥 Team only',
  private: '🔒 Private',
};

// ---- Spec preview card ----

function SpecPreviewCard({ spec }: { spec: AutomationSpec }) {
  const empty = !spec.name && !spec.trigger && !spec.businessRules;

  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--mantine-color-gray-2)',
      borderRadius: 12,
      overflow: 'hidden',
      position: 'sticky',
      top: 0,
    }}>
      <div style={{
        padding: '14px 18px',
        background: 'var(--mantine-color-gray-0)',
        borderBottom: '1px solid var(--mantine-color-gray-2)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--mantine-color-gray-7)' }}>
          Automation preview
        </span>
        {spec.ready && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#166534',
            background: '#dcfce7', padding: '2px 8px', borderRadius: 20,
          }}>
            Ready to save
          </span>
        )}
      </div>

      {empty ? (
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🤖</div>
          <div style={{ fontSize: 13, color: 'var(--mantine-color-gray-5)', lineHeight: 1.6 }}>
            Describe your goal in the chat and your automation rule will take shape here.
          </div>
        </div>
      ) : (
        <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Name */}
          {spec.name && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--mantine-color-gray-4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Name</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--mantine-color-gray-9)' }}>{spec.name}</div>
              {spec.description && (
                <div style={{ fontSize: 12, color: 'var(--mantine-color-gray-5)', marginTop: 3, lineHeight: 1.5 }}>{spec.description}</div>
              )}
            </div>
          )}

          {/* Trigger */}
          {spec.trigger && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--mantine-color-gray-4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Trigger</div>
              <div style={{
                padding: '12px 14px', borderRadius: 8,
                background: `${TRIGGER_META[spec.trigger.type]?.color}12`,
                border: `1px solid ${TRIGGER_META[spec.trigger.type]?.color}30`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 16 }}>{TRIGGER_META[spec.trigger.type]?.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: TRIGGER_META[spec.trigger.type]?.color }}>
                    {spec.trigger.label}
                  </span>
                  {spec.trigger.integrationStatus && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                      background: spec.trigger.integrationStatus === 'connected' ? '#dcfce7' : '#fef3c7',
                      color: spec.trigger.integrationStatus === 'connected' ? '#166534' : '#92400e',
                    }}>
                      {spec.trigger.integrationStatus === 'connected' ? '✓ Connected' : '⚡ Setup needed'}
                    </span>
                  )}
                </div>
                {spec.trigger.conditions && spec.trigger.conditions.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {spec.trigger.conditions.map((c, i) => (
                      <li key={i} style={{ fontSize: 12, color: 'var(--mantine-color-gray-6)', lineHeight: 1.5 }}>{c}</li>
                    ))}
                  </ul>
                )}
              </div>
              {spec.trigger.integrationRequired && spec.trigger.integrationStatus !== 'connected' && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#92400e', background: '#fef3c7', padding: '6px 10px', borderRadius: 6 }}>
                  ⚡ {spec.trigger.integrationRequired}
                </div>
              )}
            </div>
          )}

          {/* Business rules */}
          {spec.businessRules && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--mantine-color-gray-4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Rules</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  {
                    icon: '✅',
                    label: 'Manager approval',
                    value: spec.businessRules.requireManagerApproval ? 'Required' : 'Auto-send',
                    color: spec.businessRules.requireManagerApproval ? '#166534' : '#0369a1',
                  },
                  {
                    icon: '📣',
                    label: 'Recognition',
                    value: spec.businessRules.recognitionEnabled
                      ? VISIBILITY_LABEL[spec.businessRules.recognitionVisibility]
                      : 'Disabled',
                    color: spec.businessRules.recognitionEnabled ? '#0369a1' : '#6b7280',
                  },
                  ...(spec.businessRules.rewardEnabled ? [{
                    icon: '🎁',
                    label: 'Guusto gift card',
                    value: spec.businessRules.rewardAmountCents
                      ? `$${(spec.businessRules.rewardAmountCents / 100).toFixed(0)}`
                      : 'Amount TBD',
                    color: '#7c3aed',
                  }] : []),
                  ...(spec.businessRules.frequencyLimit ? [{
                    icon: '🔁',
                    label: 'Frequency',
                    value: spec.businessRules.frequencyLimit,
                    color: '#374151',
                  }] : []),
                ].map(row => (
                  <div key={row.label} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 7,
                    background: 'var(--mantine-color-gray-0)',
                    border: '1px solid var(--mantine-color-gray-1)',
                  }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{row.icon}</span>
                    <span style={{ fontSize: 12, color: 'var(--mantine-color-gray-5)', flex: 1 }}>{row.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: row.color }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Rule list card ----

function AutomationRuleCard({
  rule,
  onToggle,
}: {
  rule: AutomationRule;
  onToggle: (id: string, status: 'active' | 'paused') => void;
}) {
  const meta = TRIGGER_META[rule.triggerType] ?? { icon: '⚙️', label: rule.triggerType, color: '#6b7280' };
  const isActive = rule.status === 'active';
  const integrationStatus = (rule.triggerConfig['integrationStatus'] as string) ?? 'unknown';

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${isActive ? 'var(--mantine-color-gray-2)' : 'var(--mantine-color-gray-1)'}`,
      borderRadius: 10,
      overflow: 'hidden',
      opacity: isActive ? 1 : 0.75,
    }}>
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        {/* Trigger icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
          background: `${meta.color}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20,
        }}>
          {meta.icon}
        </div>

        {/* Body */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--mantine-color-gray-9)' }}>
              {rule.name}
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
              background: isActive ? '#dcfce7' : '#f3f4f6',
              color: isActive ? '#166534' : '#6b7280',
            }}>
              {isActive ? '● Active' : '○ Paused'}
            </span>
            {integrationStatus === 'needs_setup' && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                background: '#fef3c7', color: '#92400e',
              }}>
                ⚡ Setup needed
              </span>
            )}
          </div>
          {rule.description && (
            <div style={{ fontSize: 12, color: 'var(--mantine-color-gray-5)', marginTop: 4, lineHeight: 1.5 }}>
              {rule.description}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: meta.color, fontWeight: 600 }}>
              {meta.icon} {meta.label}
            </span>
            {rule.requireManagerApproval && (
              <span style={{ fontSize: 11, color: 'var(--mantine-color-gray-5)' }}>✅ Manager approval</span>
            )}
            {rule.rewardEnabled && rule.rewardAmountCents && (
              <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>
                🎁 ${(rule.rewardAmountCents / 100).toFixed(0)} gift card
              </span>
            )}
            {rule.frequencyLimit && (
              <span style={{ fontSize: 11, color: 'var(--mantine-color-gray-4)' }}>🔁 {rule.frequencyLimit}</span>
            )}
          </div>
          {rule.conditions.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {rule.conditions.map((c, i) => (
                <span key={i} style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 20,
                  background: 'var(--mantine-color-gray-0)',
                  border: '1px solid var(--mantine-color-gray-2)',
                  color: 'var(--mantine-color-gray-6)',
                }}>
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Toggle */}
        <button
          onClick={() => onToggle(rule.id, isActive ? 'paused' : 'active')}
          style={{
            padding: '6px 14px', borderRadius: 6, border: 'none',
            background: isActive ? '#fef2f2' : '#f0fdf4',
            color: isActive ? '#b91c1c' : '#166534',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
          }}
        >
          {isActive ? 'Pause' : 'Activate'}
        </button>
      </div>
    </div>
  );
}

// ---- Chat builder ----

const STARTER_PROMPTS = [
  'Recognize employees praised by name on Gong customer calls',
  'Reward salespeople who close 3 deals in a row',
  'Celebrate work anniversaries with a shoutout and gift card',
  'Auto-recognize when a manager uses /recognize on Slack',
];

function AutomationBuilder({
  onSaved,
  onCancel,
}: {
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "Hi! I'll help you set up an automated recognition workflow. Describe your goal in plain English — for example: *\"Recognize employees who get praised by name in Gong customer calls\"* — and I'll ask a few follow-up questions to configure the details.",
    },
  ]);
  const [input, setInput] = useState('');
  const [spec, setSpec] = useState<AutomationSpec>({});
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const chatEndRef = { current: null as HTMLDivElement | null };

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    // Only send actual conversation turns (skip the seeded assistant greeting)
    const apiMessages = nextMessages.filter(m => !(m.role === 'assistant' && nextMessages.indexOf(m) === 0));

    try {
      const r = await fetch(`${API}/api/rr/admin/automations/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...ADMIN_GET_HEADERS },
        body: JSON.stringify({ messages: apiMessages, currentSpec: spec }),
      });

      if (!r.ok) {
        const e = await r.json() as { error: string };
        setToast({ text: e.error, ok: false });
        return;
      }

      const d = await r.json() as { reply: string; spec: AutomationSpec; isComplete: boolean };
      setMessages(prev => [...prev, { role: 'assistant', content: d.reply }]);
      setSpec(d.spec);
      setIsComplete(d.isComplete);
      setTimeout(scrollToBottom, 50);
    } catch {
      setToast({ text: 'Failed to reach AI — check backend connection', ok: false });
    } finally {
      setLoading(false);
    }
  };

  const saveAutomation = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/rr/admin/automations`, {
        method: 'POST',
        headers: ADMIN_HEADERS,
        body: JSON.stringify({ spec }),
      });
      if (!r.ok) {
        const e = await r.json() as { error: string };
        setToast({ text: e.error, ok: false });
      } else {
        onSaved();
      }
    } finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Toast msg={toast} onDone={() => setToast(null)} />

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={onCancel}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mantine-color-blue-6)', fontSize: 13, padding: 0 }}
        >
          ← Automations
        </button>
        <span style={{ color: 'var(--mantine-color-gray-3)', fontSize: 13 }}>/</span>
        <span style={{ fontSize: 13, color: 'var(--mantine-color-gray-6)' }}>New automation</span>
      </div>

      {/* Split panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>

        {/* Chat panel */}
        <div style={{
          background: '#fff',
          border: '1px solid var(--mantine-color-gray-2)',
          borderRadius: 12,
          display: 'flex', flexDirection: 'column',
          height: 560,
        }}>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 12px' }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                display: 'flex',
                flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
                gap: 10, marginBottom: 16,
              }}>
                {m.role === 'assistant' && (
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: '#1a56db',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14,
                  }}>
                    🤖
                  </div>
                )}
                <div style={{
                  maxWidth: '80%',
                  padding: '10px 14px',
                  borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
                  background: m.role === 'user' ? '#1a56db' : 'var(--mantine-color-gray-0)',
                  color: m.role === 'user' ? '#fff' : 'var(--mantine-color-gray-8)',
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.content.replace(/\*([^*]+)\*/g, '$1')}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                  background: '#1a56db',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14,
                }}>
                  🤖
                </div>
                <div style={{
                  padding: '10px 16px',
                  borderRadius: '4px 14px 14px 14px',
                  background: 'var(--mantine-color-gray-0)',
                  display: 'flex', gap: 4, alignItems: 'center',
                }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: 'var(--mantine-color-gray-4)',
                      animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}

            <div ref={el => { chatEndRef.current = el; }} />
          </div>

          {/* Starter prompts — show only before first user message */}
          {messages.filter(m => m.role === 'user').length === 0 && (
            <div style={{ padding: '0 20px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STARTER_PROMPTS.map(p => (
                <button
                  key={p}
                  onClick={() => void sendMessage(p)}
                  style={{
                    padding: '5px 12px', borderRadius: 20,
                    border: '1px solid var(--mantine-color-blue-3)',
                    background: 'var(--mantine-color-blue-0)',
                    color: 'var(--mantine-color-blue-7)',
                    fontSize: 12, cursor: 'pointer',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--mantine-color-gray-2)',
            display: 'flex', gap: 10,
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(input); } }}
              placeholder="Describe your recognition goal…"
              disabled={loading}
              style={{
                flex: 1, border: '1px solid var(--mantine-color-gray-3)',
                borderRadius: 8, padding: '8px 12px',
                fontSize: 13, outline: 'none',
                background: loading ? 'var(--mantine-color-gray-0)' : '#fff',
              }}
            />
            <button
              onClick={() => void sendMessage(input)}
              disabled={loading || !input.trim()}
              style={{
                padding: '8px 18px', borderRadius: 8, border: 'none',
                background: input.trim() && !loading ? '#1a56db' : '#e2e8f0',
                color: input.trim() && !loading ? '#fff' : '#94a3b8',
                fontSize: 13, fontWeight: 700, cursor: input.trim() && !loading ? 'pointer' : 'default',
              }}
            >
              Send
            </button>
          </div>
        </div>

        {/* Right panel: spec preview + save */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SpecPreviewCard spec={spec} />

          {isComplete && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void saveAutomation()}
              disabled={saving}
            >
              {saving ? 'Saving…' : '⚡ Save & Activate'}
            </Button>
          )}
        </div>
      </div>

      {/* Inline CSS for the typing pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

// ---- Automations tab root ----

function AutomationsTab() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/rr/admin/automations`, { headers: ADMIN_GET_HEADERS });
      const d = await r.json() as { rules: AutomationRule[] };
      setRules(d.rules);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (id: string, status: 'active' | 'paused') => {
    const r = await fetch(`${API}/api/rr/admin/automations/${id}`, {
      method: 'PATCH',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ status }),
    });
    if (!r.ok) {
      const e = await r.json() as { error: string };
      setToast({ text: e.error, ok: false });
    } else {
      setToast({ text: `Automation ${status === 'active' ? 'activated' : 'paused'}`, ok: true });
      void load();
    }
  };

  if (building) {
    return (
      <AutomationBuilder
        onSaved={() => { setBuilding(false); void load(); setToast({ text: 'Automation saved and active!', ok: true }); }}
        onCancel={() => setBuilding(false)}
      />
    );
  }

  const activeCount = rules.filter(r => r.status === 'active').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Toast msg={toast} onDone={() => setToast(null)} />

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1a56db 0%, #7c3aed 100%)',
        borderRadius: 12, padding: '24px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
            🤖 Automation Builder
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
            Describe your recognition goal in plain English. The AI agent asks a few<br />
            follow-up questions and configures the workflow for you.
          </div>
        </div>
        <button
          onClick={() => setBuilding(true)}
          style={{
            padding: '10px 22px', borderRadius: 8, border: 'none',
            background: '#fff', color: '#1a56db',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          + New automation
        </button>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'flex', gap: 16 }}>
        {[
          { label: 'Active automations', value: activeCount, color: '#166534', bg: '#dcfce7' },
          { label: 'Total rules', value: rules.length, color: '#0369a1', bg: '#dbeafe' },
          { label: 'Need setup', value: rules.filter(r => (r.triggerConfig['integrationStatus'] as string) === 'needs_setup').length, color: '#92400e', bg: '#fef3c7' },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1, padding: '16px 20px', borderRadius: 10,
            background: s.bg, display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: s.color }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Rules list */}
      {loading ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--mantine-color-gray-5)', fontSize: 13 }}>
          Loading automations…
        </div>
      ) : rules.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--mantine-color-gray-7)' }}>
            No automations yet
          </div>
          <div style={{ fontSize: 13, color: 'var(--mantine-color-gray-5)', marginTop: 4 }}>
            Click "New automation" and describe your goal to get started.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={sectionLabel}>Configured rules</div>
          {rules.map(rule => (
            <AutomationRuleCard key={rule.id} rule={rule} onToggle={(id, status) => void toggle(id, status)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main AdminPage
// ---------------------------------------------------------------------------

const TABS: NavigationTabItem[] = [
  { value: 'setup',       label: '⚙️  Setup' },
  { value: 'budget',      label: '💰  Budget' },
  { value: 'reports',     label: '📊  Reports' },
  { value: 'audit',       label: '📋  Audit Log' },
  { value: 'slack',       label: '💬  Slack' },
  { value: 'automations', label: '🤖  Automations' },
];

export function AdminPage() {
  const [activeTab, setActiveTab] = useState('setup');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title="R&R Program Admin"
        description="Configure company values, budgets, and program rules"
        actionButtons={[
          <Badge key="role" color="info" variant="light">HR Admin</Badge>,
        ]}
      />

      <NavigationTabs
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {activeTab === 'setup'       && <SetupTab />}
      {activeTab === 'budget'      && <BudgetTab />}
      {activeTab === 'reports'     && <ReportsTab />}
      {activeTab === 'audit'       && <AuditTab />}
      {activeTab === 'slack'       && <SlackTab />}
      {activeTab === 'automations' && <AutomationsTab />}
    </div>
  );
}
