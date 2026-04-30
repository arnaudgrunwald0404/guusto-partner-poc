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
  const [data, setData] = useState<{ managers: ManagerBalance[]; orgSummary: OrgSummary } | null>(null);
  const [loading, setLoading] = useState(true);
  const [allocatingId, setAllocatingId] = useState<string | null>(null);
  const [allocAmount, setAllocAmount] = useState('');
  const [allocNote, setAllocNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`${API}/api/rr/admin/budget`, { headers: ADMIN_GET_HEADERS });
    const d = await r.json() as { managers: ManagerBalance[]; orgSummary: OrgSummary };
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
  const [senderName, setSenderName] = useState('Sarah Park');
  const [recipientName, setRecipientName] = useState('Carmen Rodriguez');
  const [message, setMessage] = useState('Carmen absolutely crushed it this weekend — she helped 12 customers in a row, each one leaving with a smile. Her patience and product knowledge are unmatched. The team is lucky to have her.');
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
// Main AdminPage
// ---------------------------------------------------------------------------

const TABS: NavigationTabItem[] = [
  { value: 'setup',   label: '⚙️  Setup' },
  { value: 'budget',  label: '💰  Budget' },
  { value: 'reports', label: '📊  Reports' },
  { value: 'audit',   label: '📋  Audit Log' },
  { value: 'slack',   label: '💬  Slack' },
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

      {activeTab === 'setup'   && <SetupTab />}
      {activeTab === 'budget'  && <BudgetTab />}
      {activeTab === 'reports' && <ReportsTab />}
      {activeTab === 'audit'   && <AuditTab />}
      {activeTab === 'slack'   && <SlackTab />}
    </div>
  );
}
