/**
 * RecognitionAdminPage — /recognition/admin
 *
 * HR Admin control centre for the R&R program. Five tabs:
 *
 *   Setup    — Company values (CRUD, max 8) + program configuration
 *   Budget   — Org-wide budget overview, per-manager balances, allocations
 *   Reports  — Program health metrics (30d default), alerts, CSV export
 *   Audit    — Immutable audit log (read-only)
 *   Slack    — Block Kit preview + /recognize slash command info
 *
 * All API calls include x-user-role: hr_admin (POC mock auth).
 * Uses the ClearCompany design-system components from @clearcompany/clearco-ui.
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

import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
    NavigationTabs,
    AlertBanner,
    Card,
    Badge,
    Button,
    Progress,
    type NavigationTabItem,
} from '@clearcompany/clearco-ui';
import type { RecognitionAreaOutletContext } from '../../recognitionArea';
import { MicrosoftTeamsLogo } from '../../MicrosoftTeamsLogo';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADMIN_HEADERS = {
    'x-user-id': 'admin',
    'x-user-role': 'hr_admin',
    'Content-Type': 'application/json',
};
const ADMIN_GET_HEADERS = { 'x-user-id': 'admin', 'x-user-role': 'hr_admin' };

function fmt$(cents: number) {
    return `$${(cents / 100).toFixed(0)}`;
}
function fmtDate(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

const sectionLabel: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: '#6b7280',
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    marginBottom: 12,
};
const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 20px',
    borderBottom: '1px solid #f3f4f6',
};
const inputStyle: React.CSSProperties = {
    border: '1px solid #d1d5db',
    borderRadius: 6,
    padding: '7px 10px',
    fontSize: 13,
    color: '#111827',
    outline: 'none',
    background: '#fff',
};
const smallBtn = (color = '#1a56db', textColor = '#fff'): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: 6,
    border: 'none',
    background: color,
    color: textColor,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
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
        totalSent: number;
        uniqueSenders: number;
        uniqueRecipients: number;
        withGift: number;
        totalGiftedDollars: string;
        giftsDelivered: number;
        giftsRedeemed: number;
        redemptionRate: string;
    };
    coverage: { totalEmployees: number; recognizedEmployees: number; coveragePct: string };
    managerActivation: {
        managersWithBudget: number;
        managersWithGiftActivity: number;
        activationRate: string;
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
    return <AlertBanner variant={msg.ok ? 'success' : 'error'} title={msg.text} headingVariant="h5" onClose={onDone} />;
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
        const r = await fetch(`/api/rr/admin/values`, { headers: ADMIN_GET_HEADERS });
        const d = (await r.json()) as { values: CompanyValue[] };
        setValues(d.values);
        setLoading(false);
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const activeCount = values.filter(v => v.is_active === 1).length;

    const startEdit = (v: CompanyValue) => {
        setEditingId(v.id);
        setEditLabel(v.label);
        setEditEmoji(v.emoji);
    };

    const saveEdit = async (id: string) => {
        setSaving(true);
        try {
            const r = await fetch(`/api/rr/admin/values/${id}`, {
                method: 'PATCH',
                headers: ADMIN_HEADERS,
                body: JSON.stringify({ label: editLabel.trim(), emoji: editEmoji }),
            });
            if (!r.ok) {
                const e = (await r.json()) as { error: string };
                setToast({ text: e.error, ok: false });
            } else {
                setToast({ text: 'Value updated', ok: true });
                setEditingId(null);
                void load();
            }
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (v: CompanyValue) => {
        const r = await fetch(`/api/rr/admin/values/${v.id}`, {
            method: 'PATCH',
            headers: ADMIN_HEADERS,
            body: JSON.stringify({ is_active: v.is_active === 0 }),
        });
        if (!r.ok) {
            const e = (await r.json()) as { error: string };
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
            const r = await fetch(`/api/rr/admin/values`, {
                method: 'POST',
                headers: ADMIN_HEADERS,
                body: JSON.stringify({ label: addLabel.trim(), emoji: addEmoji }),
            });
            if (!r.ok) {
                const e = (await r.json()) as { error: string };
                setToast({ text: e.error, ok: false });
            } else {
                setToast({ text: `"${addLabel.trim()}" added`, ok: true });
                setAddLabel('');
                setAddEmoji('⭐');
                setShowAddForm(false);
                void load();
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <div
                style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}
            >
                <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Company Values</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                        {activeCount} active · 8 maximum · deactivating never alters historical records
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Badge color={activeCount >= 8 ? 'warning' : 'info'} variant="light">
                        {activeCount}/8 active
                    </Badge>
                    {activeCount < 8 && (
                        <button onClick={() => setShowAddForm(s => !s)} style={smallBtn()}>
                            + Add value
                        </button>
                    )}
                </div>
            </div>

            <Toast msg={toast} onDone={() => setToast(null)} />

            {loading ? (
                <div
                    style={{
                        padding: '32px 20px',
                        textAlign: 'center',
                        color: '#6b7280',
                        fontSize: 13,
                    }}
                >
                    Loading values…
                </div>
            ) : (
                <>
                    {values.map(v => (
                        <div
                            key={v.id}
                            style={{
                                ...rowStyle,
                                background: v.is_active === 0 ? '#f9fafb' : 'white',
                                opacity: v.is_active === 0 ? 0.65 : 1,
                            }}
                        >
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
                                                    background: editEmoji === em ? '#dbeafe' : '#f8fafc',
                                                    border:
                                                        editEmoji === em ? '1px solid #60a5fa' : '1px solid #e2e8f0',
                                                    borderRadius: 4,
                                                    padding: '2px 4px',
                                                    cursor: 'pointer',
                                                    fontSize: 16,
                                                }}
                                            >
                                                {em}
                                            </button>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                        <button
                                            onClick={() => void saveEdit(v.id)}
                                            disabled={saving}
                                            style={smallBtn()}
                                        >
                                            {saving ? '…' : 'Save'}
                                        </button>
                                        <button
                                            onClick={() => setEditingId(null)}
                                            style={smallBtn('#f1f5f9', '#374151')}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </>
                            ) : (
                                /* Display row */
                                <>
                                    <span style={{ fontSize: 22, flexShrink: 0 }}>{v.emoji}</span>
                                    <span
                                        style={{
                                            flex: 1,
                                            fontSize: 14,
                                            fontWeight: 600,
                                            color: '#1f2937',
                                            textDecoration: v.is_active === 0 ? 'line-through' : 'none',
                                        }}
                                    >
                                        {v.label}
                                    </span>
                                    <Badge color={v.is_active === 1 ? 'success' : 'gray'} variant="light" size="sm">
                                        {v.is_active === 1 ? 'Active' : 'Inactive'}
                                    </Badge>
                                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                        <button onClick={() => startEdit(v)} style={smallBtn('#f1f5f9', '#374151')}>
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => void toggleActive(v)}
                                            style={smallBtn(
                                                v.is_active === 1 ? '#fef2f2' : '#f0fdf4',
                                                v.is_active === 1 ? '#b91c1c' : '#166534',
                                            )}
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
                        <div
                            style={{
                                padding: '16px 20px',
                                background: '#eff6ff',
                                borderTop: '1px solid #bfdbfe',
                            }}
                        >
                            <div style={{ ...sectionLabel, color: '#1d4ed8' }}>New Value</div>
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
                                                background: addEmoji === em ? '#dbeafe' : '#fff',
                                                border: addEmoji === em ? '1px solid #60a5fa' : '1px solid #e2e8f0',
                                                borderRadius: 4,
                                                padding: '2px 4px',
                                                cursor: 'pointer',
                                                fontSize: 16,
                                            }}
                                        >
                                            {em}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => void addValue()}
                                    disabled={saving || !addLabel.trim()}
                                    style={smallBtn(
                                        addLabel.trim() ? '#1a56db' : '#e2e8f0',
                                        addLabel.trim() ? '#fff' : '#94a3b8',
                                    )}
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
        const r = await fetch(`/api/rr/admin/config`, { headers: ADMIN_GET_HEADERS });
        const d = (await r.json()) as { config: TenantConfig };
        setConfig(d.config);
        setDraft({ ...d.config });
        setLoading(false);
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const save = async () => {
        if (!draft) return;
        setSaving(true);
        try {
            const r = await fetch(`/api/rr/admin/config`, {
                method: 'PUT',
                headers: ADMIN_HEADERS,
                body: JSON.stringify(draft),
            });
            const d = (await r.json()) as { updated: string[]; count: number };
            setToast({ text: `${d.count} setting${d.count !== 1 ? 's' : ''} saved`, ok: true });
            setConfig({ ...draft });
        } catch {
            setToast({ text: 'Save failed — check backend connection', ok: false });
        } finally {
            setSaving(false);
        }
    };

    const isDirty = draft && config && JSON.stringify(draft) !== JSON.stringify(config);

    if (loading || !draft) {
        return (
            <Card>
                <div
                    style={{
                        padding: '40px 20px',
                        textAlign: 'center',
                        color: '#6b7280',
                        fontSize: 13,
                    }}
                >
                    Loading configuration…
                </div>
            </Card>
        );
    }

    const set = (key: keyof TenantConfig, value: string) => setDraft(d => (d ? { ...d, [key]: value } : d));

    return (
        <Card>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Program Settings</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
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
                            min={1}
                            max={3}
                            onChange={v => set('max_values_per_recognition', String(v))}
                        />
                        <SelectSetting
                            label="Default visibility"
                            description="Pre-selected visibility when composing"
                            value={draft.default_visibility}
                            options={[
                                { value: 'company', label: '🌐 Company-wide' },
                                { value: 'team', label: '👥 Team only' },
                                { value: 'private', label: '🔒 Private' },
                            ]}
                            onChange={v => set('default_visibility', v)}
                        />
                        <NumberSetting
                            label="Recognition gap alert (days)"
                            description="Warn managers after this many days without recognizing"
                            value={parseInt(draft.recognition_gap_alert_days)}
                            min={7}
                            max={90}
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
                            min={10}
                            max={200}
                            onChange={v => set('message_min_chars', String(v))}
                        />
                        <NumberSetting
                            label="Maximum characters"
                            description="Message length hard cap"
                            value={parseInt(draft.message_max_chars)}
                            min={100}
                            max={2000}
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
                            min={1}
                            max={100}
                            prefix="$"
                            onChange={v => set('min_gift_cents', String(v * 100))}
                        />
                        <NumberSetting
                            label="Maximum gift (USD)"
                            description="Largest gift card value allowed"
                            value={Math.round(parseInt(draft.max_gift_cents) / 100)}
                            min={5}
                            max={500}
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
                    <Button variant="primary" size="sm" onClick={() => void save()} disabled={!isDirty || saving}>
                        {saving ? 'Saving…' : isDirty ? 'Save changes' : 'All saved ✓'}
                    </Button>
                </div>
            </div>
        </Card>
    );
}

/* Mini form controls */
function ToggleSetting({
    label,
    description,
    value,
    onChange,
}: {
    label: string;
    description: string;
    value: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <div
            style={{
                padding: '14px 16px',
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
            }}
        >
            <button
                role="switch"
                aria-checked={value}
                onClick={() => onChange(!value)}
                style={{
                    width: 40,
                    height: 22,
                    borderRadius: 11,
                    border: 'none',
                    background: value ? '#1a56db' : '#d1d5db',
                    cursor: 'pointer',
                    position: 'relative',
                    flexShrink: 0,
                    marginTop: 2,
                    transition: 'background 0.15s',
                }}
            >
                <span
                    style={{
                        position: 'absolute',
                        top: 3,
                        left: value ? 21 : 3,
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.15s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }}
                />
            </button>
            <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{label}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{description}</div>
            </div>
        </div>
    );
}

function NumberSetting({
    label,
    description,
    value,
    min,
    max,
    prefix,
    onChange,
}: {
    label: string;
    description: string;
    value: number;
    min: number;
    max: number;
    prefix?: string;
    onChange: (v: number) => void;
}) {
    return (
        <div
            style={{
                padding: '14px 16px',
                borderRadius: 8,
                border: '1px solid #e5e7eb',
            }}
        >
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>{description}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {prefix && <span style={{ fontSize: 14, color: '#4b5563' }}>{prefix}</span>}
                <input
                    type="number"
                    value={value}
                    min={min}
                    max={max}
                    onChange={e => onChange(Math.min(max, Math.max(min, parseInt(e.target.value) || min)))}
                    style={{ ...inputStyle, width: 80 }}
                />
                <span style={{ fontSize: 11, color: '#9ca3af' }}>
                    {min}–{max}
                </span>
            </div>
        </div>
    );
}

function SelectSetting({
    label,
    description,
    value,
    options,
    onChange,
}: {
    label: string;
    description: string;
    value: string;
    options: Array<{ value: string; label: string }>;
    onChange: (v: string) => void;
}) {
    return (
        <div
            style={{
                padding: '14px 16px',
                borderRadius: 8,
                border: '1px solid #e5e7eb',
            }}
        >
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>{description}</div>
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                style={{
                    ...inputStyle,
                    width: '100%',
                    appearance: 'none',
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14L2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 10px center',
                    paddingRight: 28,
                }}
            >
                {options.map(o => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
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
        const r = await fetch(`/api/rr/admin/budget`, { headers: ADMIN_GET_HEADERS });
        const d = (await r.json()) as { managers: ManagerBalance[]; orgSummary: OrgSummary };
        setData(d);
        setLoading(false);
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const allocate = async (managerId: string) => {
        const cents = Math.round(parseFloat(allocAmount) * 100);
        if (!cents || cents <= 0) return;
        setSaving(true);
        try {
            const r = await fetch(`/api/rr/admin/budget/allocate`, {
                method: 'POST',
                headers: ADMIN_HEADERS,
                body: JSON.stringify({
                    managerId,
                    amountCents: cents,
                    periodLabel: allocNote || `Manual allocation ${new Date().toISOString().slice(0, 10)}`,
                }),
            });
            if (!r.ok) {
                const e = (await r.json()) as { error: string };
                setToast({ text: e.error, ok: false });
            } else {
                const d = (await r.json()) as { newBalanceDollars: string };
                setToast({
                    text: `Allocated $${(cents / 100).toFixed(0)} · new balance $${d.newBalanceDollars}`,
                    ok: true,
                });
                setAllocatingId(null);
                setAllocAmount('');
                setAllocNote('');
                void load();
            }
        } finally {
            setSaving(false);
        }
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
                                {
                                    label: 'Total Allocated',
                                    value: fmt$(data.orgSummary.totalAllocatedCents),
                                    color: '#111827',
                                },
                                {
                                    label: 'Total Spent',
                                    value: fmt$(data.orgSummary.totalSpentCents),
                                    color: '#1d4ed8',
                                },
                                {
                                    label: 'Remaining',
                                    value: fmt$(data.orgSummary.totalBalanceCents),
                                    color: '#15803d',
                                },
                                {
                                    label: 'Utilization',
                                    value: `${data.orgSummary.utilizationPct}%`,
                                    color: '#374151',
                                },
                            ].map(s => (
                                <div key={s.label}>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 600,
                                            color: '#6b7280',
                                            letterSpacing: '0.07em',
                                            textTransform: 'uppercase',
                                            marginBottom: 4,
                                        }}
                                    >
                                        {s.label}
                                    </div>
                                    <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>
            )}

            {/* Per-manager table */}
            <Card>
                <div
                    style={{
                        padding: '14px 20px',
                        borderBottom: '1px solid #e5e7eb',
                        background: '#f9fafb',
                    }}
                >
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 110px 110px 110px 80px 120px',
                            gap: 12,
                            alignItems: 'center',
                        }}
                    >
                        {['Manager', 'Allocated', 'Spent', 'Balance', 'Utilization', ''].map(h => (
                            <div
                                key={h}
                                style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: '#6b7280',
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase',
                                }}
                            >
                                {h}
                            </div>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div
                        style={{
                            padding: '32px 20px',
                            textAlign: 'center',
                            color: '#6b7280',
                            fontSize: 13,
                        }}
                    >
                        Loading budgets…
                    </div>
                ) : (
                    data?.managers.map(m => (
                        <div key={m.managerId}>
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 110px 110px 110px 80px 120px',
                                        gap: 12,
                                        alignItems: 'center',
                                    }}
                                >
                                    <div>
                                        <div
                                            style={{
                                                fontSize: 14,
                                                fontWeight: 600,
                                                color: '#111827',
                                            }}
                                        >
                                            {m.managerName}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                                            {m.managerId}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>
                                        {fmt$(m.totalAllocatedCents)}
                                    </div>
                                    <div style={{ fontSize: 14, color: '#374151' }}>{fmt$(m.totalSpentCents)}</div>
                                    <div
                                        style={{
                                            fontSize: 14,
                                            fontWeight: 700,
                                            color: m.balanceCents > 0 ? '#15803d' : '#6b7280',
                                        }}
                                    >
                                        {fmt$(m.balanceCents)}
                                    </div>
                                    <div>
                                        <Progress
                                            value={parseFloat(m.utilizationPct)}
                                            color={parseFloat(m.utilizationPct) > 80 ? 'orange' : 'blue'}
                                            size="sm"
                                        />
                                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                                            {m.utilizationPct}%
                                        </div>
                                    </div>
                                    <div>
                                        <button
                                            onClick={() => {
                                                setAllocatingId(allocatingId === m.managerId ? null : m.managerId);
                                                setAllocAmount('');
                                                setAllocNote('');
                                            }}
                                            style={smallBtn(
                                                allocatingId === m.managerId ? '#f1f5f9' : '#1a56db',
                                                allocatingId === m.managerId ? '#374151' : '#fff',
                                            )}
                                        >
                                            {allocatingId === m.managerId ? 'Cancel' : '+ Allocate'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Inline allocation form */}
                            {allocatingId === m.managerId && (
                                <div
                                    style={{
                                        padding: '12px 20px 16px',
                                        background: '#eff6ff',
                                        borderBottom: '1px solid #bfdbfe',
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: 12,
                                            fontWeight: 600,
                                            color: '#1e40af',
                                            marginBottom: 8,
                                        }}
                                    >
                                        Add allocation for {m.managerName}
                                    </div>
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ fontSize: 14, color: '#4b5563' }}>$</span>
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
                                            <span style={{ fontSize: 11, color: '#9ca3af' }}>USD</span>
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
                                            style={smallBtn(
                                                allocAmount ? '#1a56db' : '#e2e8f0',
                                                allocAmount ? '#fff' : '#94a3b8',
                                            )}
                                        >
                                            {saving ? '…' : 'Confirm'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </Card>
        </div>
    );
}

// ---------------------------------------------------------------------------
// TAB 3 — Reports
// ---------------------------------------------------------------------------

const PERIOD_OPTIONS = [
    { label: '7 days', value: 7 },
    { label: '30 days', value: 30 },
    { label: '90 days', value: 90 },
];

function MetricCard({
    label,
    value,
    sub,
    color = '#111827',
}: {
    label: string;
    value: string | number;
    sub?: string;
    color?: string;
}) {
    return (
        <div
            style={{
                padding: '20px 20px',
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 10,
            }}
        >
            <div
                style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#6b7280',
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase',
                    marginBottom: 8,
                }}
            >
                {label}
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>{sub}</div>}
        </div>
    );
}

function ReportsTab() {
    const [days, setDays] = useState(30);
    const [data, setData] = useState<ReportSummary | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async (d: number) => {
        setLoading(true);
        const r = await fetch(`/api/rr/admin/reports/summary?days=${d}`, { headers: ADMIN_GET_HEADERS });
        const json = (await r.json()) as ReportSummary;
        setData(json);
        setLoading(false);
    }, []);

    useEffect(() => {
        void load(days);
    }, [load, days]);

    const exportCsv = () => {
        window.open(`/api/rr/admin/reports/export`, '_blank');
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
                                padding: '6px 16px',
                                borderRadius: 6,
                                border: 'none',
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: 'pointer',
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
                <div
                    style={{
                        padding: '60px 20px',
                        textAlign: 'center',
                        color: '#6b7280',
                        fontSize: 13,
                    }}
                >
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
                            color={parseFloat(data.coverage.coveragePct) >= 50 ? '#15803d' : '#ea580c'}
                        />
                        <MetricCard
                            label="Manager activation"
                            value={data.managerActivation.activationRate}
                            sub={`${data.managerActivation.managersWithGiftActivity} of ${data.managerActivation.managersWithBudget} with budget`}
                            color="#1d4ed8"
                        />
                        <MetricCard
                            label="Gift redemption"
                            value={data.shoutouts.redemptionRate}
                            sub={`${data.shoutouts.giftsRedeemed} of ${data.shoutouts.giftsDelivered} delivered`}
                            color="#0f766e"
                        />
                    </div>

                    {/* Second row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                        <MetricCard
                            label="Total gifts value"
                            value={`$${data.shoutouts.totalGiftedDollars}`}
                            sub={`${data.shoutouts.withGift} recognitions with gift`}
                            color="#7c3aed"
                        />
                        <MetricCard label="Gifts delivered" value={data.shoutouts.giftsDelivered} sub="Via Guusto" />
                        <MetricCard
                            label="Unique recipients"
                            value={data.shoutouts.uniqueRecipients}
                            sub={`of ${data.coverage.totalEmployees} total employees`}
                        />
                    </div>

                    {/* Alerts */}
                    {(data.alerts.unrecognizedEmployees.length > 0 || data.alerts.inactiveManagers.length > 0) && (
                        <Card>
                            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb' }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#1f2937' }}>⚠️ Program Alerts</div>
                            </div>

                            {data.alerts.unrecognizedEmployees.length > 0 && (
                                <div
                                    style={{
                                        padding: '16px 20px',
                                        borderBottom: '1px solid #f3f4f6',
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: 12,
                                            fontWeight: 700,
                                            color: '#c2410c',
                                            marginBottom: 8,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.06em',
                                        }}
                                    >
                                        Not recognized in {data.alerts.gapThresholdDays}+ days
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {data.alerts.unrecognizedEmployees.map(e => (
                                            <Badge key={e.employeeId} color="warning" variant="light" size="sm">
                                                {e.name}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {data.alerts.inactiveManagers.length > 0 && (
                                <div style={{ padding: '16px 20px' }}>
                                    <div
                                        style={{
                                            fontSize: 12,
                                            fontWeight: 700,
                                            color: '#b91c1c',
                                            marginBottom: 8,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.06em',
                                        }}
                                    >
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
                        <div
                            style={{
                                padding: '16px 20px',
                                borderRadius: 10,
                                background: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                fontSize: 14,
                                color: '#166534',
                                fontWeight: 500,
                            }}
                        >
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
    budget_allocated: 'blue',
    shoutout_deleted: 'red',
    recognition_sent: 'green',
};

function AuditTab() {
    const [items, setItems] = useState<AuditEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const LIMIT = 20;

    const load = useCallback(async (p: number) => {
        setLoading(true);
        const r = await fetch(`/api/rr/admin/audit?page=${p}&limit=${LIMIT}`, { headers: ADMIN_GET_HEADERS });
        const d = (await r.json()) as { items: AuditEntry[]; total: number };
        setItems(d.items);
        setTotal(d.total);
        setLoading(false);
    }, []);

    useEffect(() => {
        void load(page);
    }, [load, page]);

    const totalPages = Math.ceil(total / LIMIT) || 1;

    return (
        <Card>
            <div
                style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}
            >
                <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Audit Log</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>
                        {total} entries · immutable, append-only
                    </div>
                </div>
                <Badge color="info" variant="light">
                    Read-only
                </Badge>
            </div>

            {/* Column headers */}
            <div
                style={{
                    padding: '10px 20px',
                    borderBottom: '1px solid #e5e7eb',
                    background: '#f9fafb',
                    display: 'grid',
                    gridTemplateColumns: '160px 120px 160px 140px 1fr',
                    gap: 12,
                }}
            >
                {['Timestamp', 'Actor', 'Action', 'Entity', 'Details'].map(h => (
                    <div
                        key={h}
                        style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#6b7280',
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                        }}
                    >
                        {h}
                    </div>
                ))}
            </div>

            {loading ? (
                <div
                    style={{
                        padding: '40px 20px',
                        textAlign: 'center',
                        color: '#6b7280',
                        fontSize: 13,
                    }}
                >
                    Loading…
                </div>
            ) : items.length === 0 ? (
                <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                    <div style={{ fontSize: 14, color: '#4b5563', fontWeight: 500 }}>No audit entries yet</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                        Budget allocations, moderation actions, and config changes will appear here.
                    </div>
                </div>
            ) : (
                items.map(entry => (
                    <div
                        key={entry.id}
                        style={{
                            padding: '13px 20px',
                            borderBottom: '1px solid #f3f4f6',
                            display: 'grid',
                            gridTemplateColumns: '160px 120px 160px 140px 1fr',
                            gap: 12,
                            alignItems: 'start',
                        }}
                    >
                        <div style={{ fontSize: 12, color: '#4b5563', fontFamily: 'monospace' }}>
                            {fmtDate(entry.created_at)}
                        </div>
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#1f2937' }}>{entry.actor_id}</div>
                            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>{entry.actor_role}</div>
                        </div>
                        <div>
                            <Badge color={ACTION_COLORS[entry.action] ?? 'gray'} variant="light" size="sm">
                                {entry.action}
                            </Badge>
                        </div>
                        <div>
                            <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#374151' }}>
                                {entry.entity_id}
                            </div>
                            <div style={{ fontSize: 10, color: '#9ca3af' }}>{entry.entity_type}</div>
                        </div>
                        <div
                            style={{
                                fontSize: 11,
                                fontFamily: 'monospace',
                                color: '#6b7280',
                                background: '#f9fafb',
                                padding: '4px 8px',
                                borderRadius: 4,
                                wordBreak: 'break-all',
                            }}
                        >
                            {JSON.stringify(entry.details)}
                        </div>
                    </div>
                ))
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div
                    style={{
                        padding: '14px 20px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#f9fafb',
                        borderTop: '1px solid #e5e7eb',
                    }}
                >
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        style={smallBtn(page === 1 ? '#f1f5f9' : '#fff', page === 1 ? '#94a3b8' : '#374151')}
                    >
                        ← Prev
                    </button>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>
                        Page {page} of {totalPages} · {total} entries
                    </span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        style={smallBtn(
                            page === totalPages ? '#f1f5f9' : '#fff',
                            page === totalPages ? '#94a3b8' : '#374151',
                        )}
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
    const [message, setMessage] = useState(
        'Carmen absolutely crushed it this weekend — she helped 12 customers in a row, each one leaving with a smile. Her patience and product knowledge are unmatched. The team is lucky to have her.',
    );
    const [valueLabel, setValueLabel] = useState('Customer Focus');
    const [valueEmoji, setValueEmoji] = useState('🤝');
    const [giftCents, setGiftCents] = useState(2500);
    const [preview, setPreview] = useState<{ blocks: unknown[] } | null>(null);
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    const generatePreview = async () => {
        setSending(true);
        try {
            const r = await fetch(`/api/rr/ai/slack/notify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...ADMIN_GET_HEADERS },
                body: JSON.stringify({
                    senderName,
                    recipientName,
                    message,
                    values: [{ label: valueLabel, emoji: valueEmoji }],
                    giftAmountCents: giftCents,
                }),
            });
            const d = (await r.json()) as { payload: { blocks: unknown[] }; ok: boolean };
            setPreview(d.payload);
            setSent(true);
            setTimeout(() => setSent(false), 3000);
        } finally {
            setSending(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <AlertBanner variant="info" headingVariant="h4" title="Slack integration — POC preview mode">
                This panel shows what the Slack Block Kit notification would look like. In production, connect your
                Slack workspace and add the webhook URL to your environment config.
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
                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5 }}>
                                        {label}
                                    </div>
                                    <input
                                        value={value}
                                        onChange={e => set(e.target.value)}
                                        style={{ ...inputStyle, width: '100%' }}
                                    />
                                </div>
                            ))}
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5 }}>
                                    Gift amount ($)
                                </div>
                                <input
                                    type="number"
                                    value={giftCents / 100}
                                    min={0}
                                    max={500}
                                    onChange={e => setGiftCents(parseInt(e.target.value) * 100 || 0)}
                                    style={{ ...inputStyle, width: 100 }}
                                />
                            </div>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5 }}>
                                    Message
                                </div>
                                <textarea
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                    rows={4}
                                    style={{
                                        ...inputStyle,
                                        width: '100%',
                                        resize: 'vertical',
                                        fontFamily: 'inherit',
                                        lineHeight: 1.5,
                                    }}
                                />
                            </div>
                            <button
                                onClick={generatePreview}
                                disabled={sending}
                                style={{
                                    padding: '10px 0',
                                    width: '100%',
                                    background: sent ? '#059669' : '#1a56db',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 8,
                                    fontSize: 14,
                                    fontWeight: 700,
                                    cursor: sending ? 'wait' : 'pointer',
                                    transition: 'background 0.2s',
                                }}
                            >
                                {sent
                                    ? '✓ Block Kit preview generated!'
                                    : sending
                                      ? 'Generating…'
                                      : '📣 Generate Slack preview'}
                            </button>
                        </div>
                    </div>
                </Card>

                {/* Slack-style preview */}
                <Card>
                    <div style={{ padding: '20px 24px' }}>
                        <div style={sectionLabel}>Slack message preview</div>

                        {/* Fake Slack UI */}
                        <div
                            style={{
                                background: '#fff',
                                border: '1px solid #e5e7eb',
                                borderRadius: 10,
                                overflow: 'hidden',
                                fontFamily: '-apple-system, "Helvetica Neue", sans-serif',
                            }}
                        >
                            {/* Slack top bar */}
                            <div
                                style={{
                                    background: '#4a154b',
                                    padding: '8px 16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                }}
                            >
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Slack</div>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>#recognition</div>
                            </div>

                            {/* Message content */}
                            <div style={{ padding: '16px 16px 12px' }}>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <div
                                        style={{
                                            width: 36,
                                            height: 36,
                                            borderRadius: 6,
                                            background: '#1a56db',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                            fontSize: 14,
                                            fontWeight: 800,
                                            color: '#fff',
                                        }}
                                    >
                                        CC
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div
                                            style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}
                                        >
                                            <span style={{ fontSize: 14, fontWeight: 700, color: '#1d1c1d' }}>
                                                ClearCompany R&R
                                            </span>
                                            <span style={{ fontSize: 11, color: '#616061' }}>just now</span>
                                            <span
                                                style={{
                                                    fontSize: 10,
                                                    fontWeight: 600,
                                                    color: '#fff',
                                                    background: '#007a5a',
                                                    borderRadius: 4,
                                                    padding: '1px 5px',
                                                }}
                                            >
                                                APP
                                            </span>
                                        </div>

                                        {/* Simulated block kit message */}
                                        <div
                                            style={{
                                                borderLeft: '4px solid #007a5a',
                                                paddingLeft: 12,
                                                marginTop: 4,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    fontSize: 14,
                                                    fontWeight: 700,
                                                    color: '#1d1c1d',
                                                    marginBottom: 6,
                                                }}
                                            >
                                                🎉 {recipientName} just got recognized!
                                            </div>
                                            <div
                                                style={{
                                                    fontSize: 13,
                                                    color: '#1d1c1d',
                                                    marginBottom: 8,
                                                    lineHeight: 1.5,
                                                }}
                                            >
                                                <strong>{senderName}</strong> recognized{' '}
                                                <strong>{recipientName}</strong>
                                                {valueLabel && (
                                                    <div style={{ marginTop: 4 }}>
                                                        {valueEmoji} {valueLabel}
                                                    </div>
                                                )}
                                            </div>
                                            <div
                                                style={{
                                                    background: '#f8f8f8',
                                                    borderRadius: 6,
                                                    padding: '10px 12px',
                                                    marginBottom: 10,
                                                    fontSize: 13,
                                                    color: '#1d1c1d',
                                                    lineHeight: 1.6,
                                                    fontStyle: 'italic',
                                                }}
                                            >
                                                &gt; {message}
                                                {giftCents > 0 && (
                                                    <div
                                                        style={{
                                                            marginTop: 8,
                                                            fontStyle: 'normal',
                                                            fontWeight: 700,
                                                            color: '#007a5a',
                                                        }}
                                                    >
                                                        🎁 ${(giftCents / 100).toFixed(0)} Guusto gift card is on its
                                                        way!
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <div
                                                    style={{
                                                        padding: '6px 14px',
                                                        borderRadius: 4,
                                                        background: '#007a5a',
                                                        color: '#fff',
                                                        fontSize: 13,
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    👏 React
                                                </div>
                                                <div
                                                    style={{
                                                        padding: '6px 14px',
                                                        borderRadius: 4,
                                                        border: '1px solid #d1d5db',
                                                        color: '#1d1c1d',
                                                        fontSize: 13,
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                    }}
                                                >
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
                                <pre
                                    style={{
                                        background: '#1e293b',
                                        color: '#e2e8f0',
                                        padding: 14,
                                        borderRadius: 8,
                                        fontSize: 11,
                                        overflow: 'auto',
                                        maxHeight: 200,
                                        margin: 0,
                                        fontFamily: 'monospace',
                                    }}
                                >
                                    {JSON.stringify(preview, null, 2)}
                                </pre>
                            </div>
                        )}

                        {/* Slash command info */}
                        <div
                            style={{
                                marginTop: 16,
                                padding: '14px 16px',
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                            }}
                        >
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                                🤖 /recognize Slash command (RR-032)
                            </div>
                            <div
                                style={{
                                    fontFamily: 'monospace',
                                    fontSize: 12,
                                    background: '#1e293b',
                                    color: '#a5b4fc',
                                    padding: '8px 12px',
                                    borderRadius: 6,
                                    marginBottom: 8,
                                }}
                            >
                                /recognize @carmen "Customer Focus" She was incredible with customers today!
                            </div>
                            <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6 }}>
                                Managers type this in any Slack channel → ClearCompany processes it → recognition is
                                posted + Guusto gift triggered. Available once Slack app is installed in your workspace.
                            </div>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// TAB 6 — Microsoft Teams Integration (RR-033)
// ---------------------------------------------------------------------------
//
// Spec: PRD §11 Phase 3 + TICKETS.md RR-033
//
// Architecture:
//   Notifications sent via the existing ClearCompany Teams app (Adaptive Card v1.5).
//   Independent toggle from Slack — tenants can enable one, both, or neither.
//   Card structure: headline TextBlock (Large/Bolder) → ColumnSet (sender avatar +
//   name + value chips) → message body (subtle) → ActionSet ("View in CC" primary,
//   "React 👏" secondary) → footer ("Recognized via ClearCompany").
//
//   Admin config: Enable toggle + team channel combobox.
//   Key states: unlinked / linked / channel-enabled / outage / token-expired.
// ---------------------------------------------------------------------------

function TeamsTab() {
    // ── Preview form state ──
    const [senderName, setSenderName] = useState('Rachael Alpert');
    const [recipientName, setRecipientName] = useState('Samuel Abramsky');
    const [message, setMessage] = useState(
        'Samuel went above and beyond during the Q1 onboarding push. He unblocked three enterprise accounts, stayed late to ensure the handoffs went smoothly, and wrote thorough runbooks afterward. His customer focus made the whole team stronger.',
    );
    const [valueLabel, setValueLabel] = useState('Customer at the Core');
    const [valueEmoji, setValueEmoji] = useState('🤝');
    const [giftCents, setGiftCents] = useState(2500);

    // ── Integration config state ──
    const [enabled, setEnabled] = useState(false);
    const [channel, setChannel] = useState('#recognition');

    const DEMO_CHANNELS = ['#recognition', '#general', '#hr-announcements', '#team-wins', '#kudos'];

    // ── Adaptive Card preview ──
    //
    // Renders a faithful HTML simulation of how the Teams Adaptive Card v1.5
    // would appear in the Microsoft Teams client.
    // In production this card JSON is POSTed to the tenant's Teams channel
    // via the ClearCompany Teams app — no additional webhook setup required.

    const senderInitials = senderName
        .split(' ')
        .map(p => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    const recipientInitials = recipientName
        .split(' ')
        .map(p => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    const giftLabel = giftCents > 0 ? `$${(giftCents / 100).toFixed(0)} gift included` : null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* ── Status banner ── */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                    padding: '16px 20px',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: 10,
                }}
            >
                {/* Teams logo mark */}
                <MicrosoftTeamsLogo size={40} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', marginBottom: 3 }}>
                        Microsoft Teams integration — POC preview mode
                    </div>
                    <div style={{ fontSize: 13, color: '#1e40af', lineHeight: 1.6, opacity: 0.85 }}>
                        This panel shows what the Adaptive Card notification would look like in Teams. In production,
                        your ClearCompany Teams app handles delivery automatically — no webhook URL needed. This
                        integration ships in <strong>Phase 3</strong> alongside bi-directional reaction sync and the
                        lightweight{' '}
                        <code style={{ fontSize: 11, background: '#dbeafe', padding: '1px 5px', borderRadius: 3 }}>
                            /recognize
                        </code>{' '}
                        Teams action.
                    </div>
                </div>
                <div
                    style={{
                        padding: '4px 10px',
                        background: '#fef9c3',
                        border: '1px solid #fde047',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#854d0e',
                        flexShrink: 0,
                        whiteSpace: 'nowrap' as const,
                    }}
                >
                    Phase 3
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* ── LEFT: Config + compose ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Connection config */}
                    <Card>
                        <div style={{ padding: '20px 24px' }}>
                            <div style={sectionLabel}>Integration settings</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {/* Enable toggle */}
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '12px 14px',
                                        background: '#f8fafc',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: 8,
                                    }}
                                >
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                                            Enable Teams notifications
                                        </div>
                                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                            Independent of Slack — both can be enabled simultaneously
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setEnabled(e => !e)}
                                        style={{
                                            width: 44,
                                            height: 24,
                                            borderRadius: 12,
                                            border: 'none',
                                            background: enabled ? '#2563eb' : '#cbd5e1',
                                            cursor: 'pointer',
                                            position: 'relative',
                                            transition: 'background 0.2s',
                                            flexShrink: 0,
                                        }}
                                        aria-pressed={enabled}
                                        aria-label="Enable Teams notifications"
                                    >
                                        <div
                                            style={{
                                                width: 18,
                                                height: 18,
                                                borderRadius: '50%',
                                                background: '#fff',
                                                position: 'absolute',
                                                top: 3,
                                                left: enabled ? 23 : 3,
                                                transition: 'left 0.2s',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                            }}
                                        />
                                    </button>
                                </div>

                                {/* Channel picker */}
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5 }}>
                                        Post to channel
                                        <span
                                            style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}
                                        >
                                            (optional — leave blank to send only as a DM to the recipient)
                                        </span>
                                    </div>
                                    <select
                                        value={channel}
                                        onChange={e => setChannel(e.target.value)}
                                        disabled={!enabled}
                                        style={{
                                            ...inputStyle,
                                            width: '100%',
                                            opacity: enabled ? 1 : 0.45,
                                        }}
                                    >
                                        <option value="">— DM recipient only —</option>
                                        {DEMO_CHANNELS.map(c => (
                                            <option key={c} value={c}>
                                                {c}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Connection state */}
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        padding: '10px 14px',
                                        background: '#fef9c3',
                                        border: '1px solid #fde047',
                                        borderRadius: 8,
                                    }}
                                >
                                    <span style={{ fontSize: 16 }}>⚡</span>
                                    <div style={{ fontSize: 12, color: '#713f12' }}>
                                        <strong>Setup needed.</strong> Your ClearCompany Teams app must be installed in
                                        the target workspace. Contact your IT admin or{' '}
                                        <a href="#" style={{ color: '#1d4ed8' }}>
                                            follow the setup guide
                                        </a>
                                        .
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Preview compose */}
                    <Card>
                        <div style={{ padding: '20px 24px' }}>
                            <div style={sectionLabel}>Preview card data</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {[
                                    { label: 'Sender name', value: senderName, set: setSenderName },
                                    { label: 'Recipient name', value: recipientName, set: setRecipientName },
                                    { label: 'Company value', value: valueLabel, set: setValueLabel },
                                    { label: 'Value emoji', value: valueEmoji, set: setValueEmoji },
                                ].map(({ label, value, set }) => (
                                    <div key={label}>
                                        <div
                                            style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}
                                        >
                                            {label}
                                        </div>
                                        <input
                                            value={value}
                                            onChange={e => set(e.target.value)}
                                            style={{ ...inputStyle, width: '100%' }}
                                        />
                                    </div>
                                ))}
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                                        Gift amount ($)
                                    </div>
                                    <input
                                        type="number"
                                        value={giftCents / 100}
                                        min={0}
                                        max={500}
                                        onChange={e => setGiftCents(parseInt(e.target.value) * 100 || 0)}
                                        style={{ ...inputStyle, width: 90 }}
                                    />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                                        Message
                                    </div>
                                    <textarea
                                        value={message}
                                        onChange={e => setMessage(e.target.value)}
                                        rows={4}
                                        style={{
                                            ...inputStyle,
                                            width: '100%',
                                            resize: 'vertical' as const,
                                            fontFamily: 'inherit',
                                            lineHeight: 1.5,
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* ── RIGHT: Adaptive Card preview ── */}
                <Card>
                    <div style={{ padding: '20px 24px' }}>
                        <div style={sectionLabel}>Teams Adaptive Card preview (v1.5)</div>
                        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                            Simulates how the card appears in the Microsoft Teams client. The actual card is delivered
                            via your ClearCompany Teams app — no additional configuration required once the app is
                            installed.
                        </p>

                        {/* Fake Teams client chrome */}
                        <div
                            style={{
                                background: '#292929',
                                borderRadius: 10,
                                overflow: 'hidden',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                            }}
                        >
                            {/* Teams top bar */}
                            <div
                                style={{
                                    background: '#1f1f1f',
                                    padding: '8px 14px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    borderBottom: '1px solid #333',
                                }}
                            >
                                <div
                                    style={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        background: '#ff5f56',
                                        flexShrink: 0,
                                    }}
                                />
                                <div
                                    style={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        background: '#ffbd2e',
                                        flexShrink: 0,
                                    }}
                                />
                                <div
                                    style={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        background: '#27c93f',
                                        flexShrink: 0,
                                    }}
                                />
                                <div style={{ fontSize: 11, color: '#888', marginLeft: 6 }}>
                                    Microsoft Teams {channel ? `· ${channel}` : '· Direct Message'}
                                </div>
                            </div>

                            {/* Teams message thread */}
                            <div style={{ padding: '16px 14px', background: '#292929' }}>
                                {/* Sender row */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                                    <div
                                        style={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: '50%',
                                            background: '#5558af',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: '#fff',
                                            flexShrink: 0,
                                        }}
                                    >
                                        CC
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: '#d1d1d1' }}>
                                                ClearCompany
                                            </span>
                                            <span style={{ fontSize: 10, color: '#666' }}>App · just now</span>
                                        </div>

                                        {/* ── Adaptive Card ── */}
                                        <div
                                            style={{
                                                marginTop: 8,
                                                background: '#ffffff',
                                                borderRadius: 8,
                                                overflow: 'hidden',
                                                width: 320,
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                            }}
                                        >
                                            {/* Accent bar */}
                                            <div
                                                style={{
                                                    height: 4,
                                                    background: 'linear-gradient(90deg, #2563eb, #7c3aed)',
                                                }}
                                            />

                                            <div style={{ padding: '16px 16px 12px' }}>
                                                {/* Headline TextBlock — Large/Bolder */}
                                                <div
                                                    style={{
                                                        fontSize: 15,
                                                        fontWeight: 800,
                                                        color: '#1e293b',
                                                        marginBottom: 12,
                                                        lineHeight: 1.3,
                                                    }}
                                                >
                                                    🎉 {recipientInitials} was recognized!
                                                </div>

                                                {/* ColumnSet: sender avatar + name + value chip */}
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 10,
                                                        marginBottom: 10,
                                                    }}
                                                >
                                                    {/* Sender avatar (Person style) */}
                                                    <div
                                                        style={{
                                                            width: 36,
                                                            height: 36,
                                                            borderRadius: '50%',
                                                            background: '#4f46e5',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: 12,
                                                            fontWeight: 700,
                                                            color: '#fff',
                                                            flexShrink: 0,
                                                        }}
                                                    >
                                                        {senderInitials}
                                                    </div>
                                                    <div>
                                                        <div
                                                            style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}
                                                        >
                                                            {senderName}
                                                        </div>
                                                        <div style={{ fontSize: 11, color: '#64748b' }}>
                                                            recognized <strong>{recipientName}</strong>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Value chip */}
                                                <div style={{ marginBottom: 10 }}>
                                                    <span
                                                        style={{
                                                            display: 'inline-block',
                                                            fontSize: 11,
                                                            fontWeight: 600,
                                                            color: '#1e40af',
                                                            background: '#eff6ff',
                                                            border: '1px solid #bfdbfe',
                                                            borderRadius: 20,
                                                            padding: '2px 10px',
                                                        }}
                                                    >
                                                        {valueEmoji} {valueLabel}
                                                    </span>
                                                </div>

                                                {/* Message body — subtle */}
                                                <div
                                                    style={{
                                                        fontSize: 12,
                                                        color: '#374151',
                                                        lineHeight: 1.6,
                                                        padding: '10px 12px',
                                                        background: '#f8fafc',
                                                        borderRadius: 6,
                                                        marginBottom: 12,
                                                        borderLeft: '3px solid #e2e8f0',
                                                    }}
                                                >
                                                    {message.length > 160 ? message.slice(0, 157) + '…' : message}
                                                </div>

                                                {/* Gift badge */}
                                                {giftLabel && (
                                                    <div
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 5,
                                                            fontSize: 11,
                                                            fontWeight: 600,
                                                            color: '#065f46',
                                                            background: '#d1fae5',
                                                            border: '1px solid #6ee7b7',
                                                            borderRadius: 20,
                                                            padding: '2px 10px',
                                                            marginBottom: 14,
                                                        }}
                                                    >
                                                        🎁 {giftLabel}
                                                    </div>
                                                )}

                                                {/* ActionSet */}
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <div
                                                        style={{
                                                            flex: 1,
                                                            padding: '7px 0',
                                                            background: '#2563eb',
                                                            color: '#fff',
                                                            borderRadius: 6,
                                                            fontSize: 12,
                                                            fontWeight: 700,
                                                            textAlign: 'center',
                                                            cursor: 'default',
                                                        }}
                                                    >
                                                        View in ClearCompany
                                                    </div>
                                                    <div
                                                        style={{
                                                            padding: '7px 14px',
                                                            background: '#f1f5f9',
                                                            color: '#374151',
                                                            borderRadius: 6,
                                                            fontSize: 12,
                                                            fontWeight: 600,
                                                            cursor: 'default',
                                                        }}
                                                    >
                                                        React 👏
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Footer */}
                                            <div
                                                style={{
                                                    padding: '8px 16px',
                                                    background: '#f8fafc',
                                                    borderTop: '1px solid #e2e8f0',
                                                    fontSize: 10,
                                                    color: '#94a3b8',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 5,
                                                }}
                                            >
                                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                                    <circle cx="5" cy="5" r="4.5" stroke="#94a3b8" strokeWidth="1" />
                                                    <text
                                                        x="3.2"
                                                        y="7.5"
                                                        fontSize="7"
                                                        fill="#94a3b8"
                                                        fontFamily="sans-serif"
                                                    >
                                                        C
                                                    </text>
                                                </svg>
                                                Recognized via ClearCompany
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Adaptive Card JSON */}
                        <div style={{ marginTop: 16 }}>
                            <div style={sectionLabel}>Adaptive Card JSON (v1.5)</div>
                            <pre
                                style={{
                                    margin: 0,
                                    background: '#0f172a',
                                    color: '#7dd3fc',
                                    borderRadius: 8,
                                    padding: '14px 16px',
                                    fontSize: 10.5,
                                    lineHeight: 1.6,
                                    overflowX: 'auto',
                                    maxHeight: 220,
                                    overflowY: 'auto',
                                }}
                            >
                                {`{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [
    {
      "type": "TextBlock",
      "text": "🎉 ${recipientName} was recognized!",
      "size": "Large",
      "weight": "Bolder",
      "color": "Default"
    },
    {
      "type": "ColumnSet",
      "columns": [
        {
          "type": "Column",
          "width": "auto",
          "items": [{
            "type": "Image",
            "style": "Person",
            "url": "{{senderAvatarUrl}}",
            "altText": "${senderName}",
            "size": "Small"
          }]
        },
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            { "type": "TextBlock", "text": "${senderName}", "weight": "Bolder", "size": "Small" },
            { "type": "TextBlock", "text": "recognized **${recipientName}**", "spacing": "None", "size": "Small", "isSubtle": true }
          ]
        }
      ]
    },
    {
      "type": "TextBlock",
      "text": "${valueEmoji} ${valueLabel}",
      "size": "Small",
      "color": "Accent",
      "weight": "Bolder"
    },
    {
      "type": "TextBlock",
      "text": "${message.slice(0, 200)}${message.length > 200 ? '…' : ''}",
      "wrap": true,
      "isSubtle": true,
      "size": "Small"
    }
  ],
  "actions": [
    { "type": "Action.OpenUrl", "title": "View in ClearCompany", "url": "{{viewUrl}}", "style": "positive" },
    { "type": "Action.Submit", "title": "React 👏", "data": { "action": "react", "shoutoutId": "{{id}}" } }
  ]
}`}
                            </pre>
                        </div>
                    </div>
                </Card>
            </div>

            {/* ── Technical notes ── */}
            <Card>
                <div style={{ padding: '20px 24px' }}>
                    <div style={sectionLabel}>Technical notes (RR-033)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[
                                {
                                    icon: '📡',
                                    label: 'Delivery',
                                    detail: 'ClearCompany Teams app — no additional webhook required. Uses the existing CC Teams app installation.',
                                },
                                {
                                    icon: '🔁',
                                    label: 'Retry logic',
                                    detail: 'Exponential backoff: 1m → 5m → 30m. Dead-letter queue after 3 failed attempts. Does not block email delivery.',
                                },
                                {
                                    icon: '🔐',
                                    label: 'Token expiry',
                                    detail: 'If the tenant Teams app token expires, admins receive a "Reconnect Teams" in-app notification. Notification falls back to email automatically.',
                                },
                            ].map(n => (
                                <div key={n.label} style={{ display: 'flex', gap: 10 }}>
                                    <span style={{ fontSize: 16, flexShrink: 0 }}>{n.icon}</span>
                                    <div>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{n.label}</div>
                                        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.55, marginTop: 1 }}>
                                            {n.detail}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[
                                {
                                    icon: '⚙️',
                                    label: 'Scope',
                                    detail: 'Individual DM to recipient (always) + optional channel post. Channel is configurable per-tenant.',
                                },
                                {
                                    icon: '🌐',
                                    label: 'Accessibility',
                                    detail: 'Adaptive Card honours the Teams host theme (light/dark). All images include altText. No color-only indicators.',
                                },
                                {
                                    icon: '🚀',
                                    label: 'Phase',
                                    detail: 'Phase 3 — ships after Slack (Phase 1). Includes outbound cards + bi-directional reaction sync + lightweight /recognize Teams action.',
                                },
                            ].map(n => (
                                <div key={n.label} style={{ display: 'flex', gap: 10 }}>
                                    <span style={{ fontSize: 16, flexShrink: 0 }}>{n.icon}</span>
                                    <div>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{n.label}</div>
                                        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.55, marginTop: 1 }}>
                                            {n.detail}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
}

// TAB 7 — Automations: AI-powered R&R workflow builder
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
    gong: { icon: '🎙️', label: 'Gong', color: '#7c3aed' },
    crm_deal: { icon: '💼', label: 'CRM Deal', color: '#0369a1' },
    hris_event: { icon: '👤', label: 'HRIS Event', color: '#065f46' },
    slack_command: { icon: '💬', label: 'Slack', color: '#4a154b' },
};

const VISIBILITY_LABEL: Record<Visibility, string> = {
    company: '🌐 Company-wide',
    team: '👥 Team only',
    private: '🔒 Private',
};

function SpecPreviewCard({ spec }: { spec: AutomationSpec }) {
    const empty = !spec.name && !spec.trigger && !spec.businessRules;

    return (
        <div
            style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                overflow: 'hidden',
                position: 'sticky',
                top: 0,
            }}
        >
            <div
                style={{
                    padding: '14px 18px',
                    background: '#f9fafb',
                    borderBottom: '1px solid #e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }}
            >
                <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Automation preview</span>
                {spec.ready && (
                    <span
                        style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#166534',
                            background: '#dcfce7',
                            padding: '2px 8px',
                            borderRadius: 20,
                        }}
                    >
                        Ready to save
                    </span>
                )}
            </div>

            {empty ? (
                <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>🤖</div>
                    <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
                        Describe your goal in the chat and your automation rule will take shape here.
                    </div>
                </div>
            ) : (
                <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {spec.name && (
                        <div>
                            <div
                                style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: '#9ca3af',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.07em',
                                    marginBottom: 4,
                                }}
                            >
                                Name
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{spec.name}</div>
                            {spec.description && (
                                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 1.5 }}>
                                    {spec.description}
                                </div>
                            )}
                        </div>
                    )}

                    {spec.trigger && (
                        <div>
                            <div
                                style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: '#9ca3af',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.07em',
                                    marginBottom: 8,
                                }}
                            >
                                Trigger
                            </div>
                            <div
                                style={{
                                    padding: '12px 14px',
                                    borderRadius: 8,
                                    background: `${TRIGGER_META[spec.trigger.type]?.color}12`,
                                    border: `1px solid ${TRIGGER_META[spec.trigger.type]?.color}30`,
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                    <span style={{ fontSize: 16 }}>{TRIGGER_META[spec.trigger.type]?.icon}</span>
                                    <span
                                        style={{
                                            fontSize: 13,
                                            fontWeight: 700,
                                            color: TRIGGER_META[spec.trigger.type]?.color,
                                        }}
                                    >
                                        {spec.trigger.label}
                                    </span>
                                    {spec.trigger.integrationStatus && (
                                        <span
                                            style={{
                                                fontSize: 10,
                                                fontWeight: 700,
                                                padding: '2px 7px',
                                                borderRadius: 20,
                                                background:
                                                    spec.trigger.integrationStatus === 'connected'
                                                        ? '#dcfce7'
                                                        : '#fef3c7',
                                                color:
                                                    spec.trigger.integrationStatus === 'connected'
                                                        ? '#166534'
                                                        : '#92400e',
                                            }}
                                        >
                                            {spec.trigger.integrationStatus === 'connected'
                                                ? '✓ Connected'
                                                : '⚡ Setup needed'}
                                        </span>
                                    )}
                                </div>
                                {spec.trigger.conditions && spec.trigger.conditions.length > 0 && (
                                    <ul
                                        style={{
                                            margin: 0,
                                            paddingLeft: 16,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 3,
                                        }}
                                    >
                                        {spec.trigger.conditions.map((c, i) => (
                                            <li key={i} style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.5 }}>
                                                {c}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            {spec.trigger.integrationRequired && spec.trigger.integrationStatus !== 'connected' && (
                                <div
                                    style={{
                                        marginTop: 6,
                                        fontSize: 11,
                                        color: '#92400e',
                                        background: '#fef3c7',
                                        padding: '6px 10px',
                                        borderRadius: 6,
                                    }}
                                >
                                    ⚡ {spec.trigger.integrationRequired}
                                </div>
                            )}
                        </div>
                    )}

                    {spec.businessRules && (
                        <div>
                            <div
                                style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: '#9ca3af',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.07em',
                                    marginBottom: 8,
                                }}
                            >
                                Rules
                            </div>
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
                                    ...(spec.businessRules.rewardEnabled
                                        ? [
                                              {
                                                  icon: '🎁',
                                                  label: 'Guusto gift card',
                                                  value: spec.businessRules.rewardAmountCents
                                                      ? `$${(spec.businessRules.rewardAmountCents / 100).toFixed(0)}`
                                                      : 'Amount TBD',
                                                  color: '#7c3aed',
                                              },
                                          ]
                                        : []),
                                    ...(spec.businessRules.frequencyLimit
                                        ? [
                                              {
                                                  icon: '🔁',
                                                  label: 'Frequency',
                                                  value: spec.businessRules.frequencyLimit,
                                                  color: '#374151',
                                              },
                                          ]
                                        : []),
                                ].map(row => (
                                    <div
                                        key={row.label}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            padding: '8px 12px',
                                            borderRadius: 7,
                                            background: '#f9fafb',
                                            border: '1px solid #f3f4f6',
                                        }}
                                    >
                                        <span style={{ fontSize: 14, flexShrink: 0 }}>{row.icon}</span>
                                        <span style={{ fontSize: 12, color: '#6b7280', flex: 1 }}>{row.label}</span>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: row.color }}>
                                            {row.value}
                                        </span>
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
        <div
            style={{
                background: '#fff',
                border: `1px solid ${isActive ? '#e5e7eb' : '#f3f4f6'}`,
                borderRadius: 10,
                overflow: 'hidden',
                opacity: isActive ? 1 : 0.75,
            }}
        >
            <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        flexShrink: 0,
                        background: `${meta.color}15`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                    }}
                >
                    {meta.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{rule.name}</div>
                        <span
                            style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: '2px 7px',
                                borderRadius: 20,
                                background: isActive ? '#dcfce7' : '#f3f4f6',
                                color: isActive ? '#166534' : '#6b7280',
                            }}
                        >
                            {isActive ? '● Active' : '○ Paused'}
                        </span>
                        {integrationStatus === 'needs_setup' && (
                            <span
                                style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: '2px 7px',
                                    borderRadius: 20,
                                    background: '#fef3c7',
                                    color: '#92400e',
                                }}
                            >
                                ⚡ Setup needed
                            </span>
                        )}
                    </div>
                    {rule.description && (
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, lineHeight: 1.5 }}>
                            {rule.description}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' as const }}>
                        <span style={{ fontSize: 11, color: meta.color, fontWeight: 600 }}>
                            {meta.icon} {meta.label}
                        </span>
                        {rule.requireManagerApproval && (
                            <span style={{ fontSize: 11, color: '#6b7280' }}>✅ Manager approval</span>
                        )}
                        {rule.rewardEnabled && rule.rewardAmountCents && (
                            <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>
                                🎁 ${(rule.rewardAmountCents / 100).toFixed(0)} gift card
                            </span>
                        )}
                        {rule.frequencyLimit && (
                            <span style={{ fontSize: 11, color: '#9ca3af' }}>🔁 {rule.frequencyLimit}</span>
                        )}
                    </div>
                    {rule.conditions.length > 0 && (
                        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
                            {rule.conditions.map((c, i) => (
                                <span
                                    key={i}
                                    style={{
                                        fontSize: 10,
                                        padding: '2px 8px',
                                        borderRadius: 20,
                                        background: '#f9fafb',
                                        border: '1px solid #e5e7eb',
                                        color: '#4b5563',
                                    }}
                                >
                                    {c}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                <button
                    onClick={() => onToggle(rule.id, isActive ? 'paused' : 'active')}
                    style={{
                        padding: '6px 14px',
                        borderRadius: 6,
                        border: 'none',
                        background: isActive ? '#fef2f2' : '#f0fdf4',
                        color: isActive ? '#b91c1c' : '#166534',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        flexShrink: 0,
                    }}
                >
                    {isActive ? 'Pause' : 'Activate'}
                </button>
            </div>
        </div>
    );
}

const STARTER_PROMPTS = [
    'Recognize employees praised by name on Gong customer calls',
    'Reward salespeople who close 3 deals in a row',
    'Celebrate work anniversaries with a shoutout and gift card',
    'Auto-recognize when a manager uses /recognize on Slack',
];

function AutomationBuilder({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            role: 'assistant',
            content:
                'Hi! I\'ll help you set up an automated recognition workflow. Describe your goal in plain English — for example: "Recognize employees who get praised by name in Gong customer calls" — and I\'ll ask a few follow-up questions to configure the details.',
        },
    ]);
    const [input, setInput] = useState('');
    const [spec, setSpec] = useState<AutomationSpec>({});
    const [isComplete, setIsComplete] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
    const chatEndRef = React.useRef<HTMLDivElement>(null);

    const sendMessage = async (text: string) => {
        if (!text.trim() || loading) return;
        const userMsg: ChatMessage = { role: 'user', content: text.trim() };
        const nextMessages = [...messages, userMsg];
        setMessages(nextMessages);
        setInput('');
        setLoading(true);

        const apiMessages = nextMessages.filter((_, i) => i > 0);

        try {
            const r = await fetch('/api/rr/admin/automations/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...ADMIN_GET_HEADERS },
                body: JSON.stringify({ messages: apiMessages, currentSpec: spec }),
            });
            if (!r.ok) {
                const e = (await r.json()) as { error: string };
                setToast({ text: e.error, ok: false });
                return;
            }
            const d = (await r.json()) as { reply: string; spec: AutomationSpec; isComplete: boolean };
            setMessages(prev => [...prev, { role: 'assistant', content: d.reply }]);
            setSpec(d.spec);
            setIsComplete(d.isComplete);
            setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        } catch {
            setToast({ text: 'Failed to reach the AI service', ok: false });
        } finally {
            setLoading(false);
        }
    };

    const saveAutomation = async () => {
        setSaving(true);
        try {
            const r = await fetch('/api/rr/admin/automations', {
                method: 'POST',
                headers: ADMIN_HEADERS,
                body: JSON.stringify({ spec }),
            });
            if (!r.ok) {
                const e = (await r.json()) as { error: string };
                setToast({ text: e.error, ok: false });
            } else {
                onSaved();
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {toast && (
                <AlertBanner
                    variant={toast.ok ? 'success' : 'error'}
                    title={toast.text}
                    headingVariant="h5"
                    onClose={() => setToast(null)}
                />
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                    onClick={onCancel}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#1a56db',
                        fontSize: 13,
                        padding: 0,
                    }}
                >
                    ← Automations
                </button>
                <span style={{ color: '#d1d5db', fontSize: 13 }}>/</span>
                <span style={{ fontSize: 13, color: '#4b5563' }}>New automation</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
                <div
                    style={{
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        height: 560,
                    }}
                >
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 12px' }}>
                        {messages.map((m, i) => (
                            <div
                                key={i}
                                style={{
                                    display: 'flex',
                                    flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
                                    gap: 10,
                                    marginBottom: 16,
                                }}
                            >
                                {m.role === 'assistant' && (
                                    <div
                                        style={{
                                            width: 30,
                                            height: 30,
                                            borderRadius: 8,
                                            flexShrink: 0,
                                            background: '#1a56db',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: 14,
                                        }}
                                    >
                                        🤖
                                    </div>
                                )}
                                <div
                                    style={{
                                        maxWidth: '80%',
                                        padding: '10px 14px',
                                        borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
                                        background: m.role === 'user' ? '#1a56db' : '#f9fafb',
                                        color: m.role === 'user' ? '#fff' : '#1f2937',
                                        fontSize: 13,
                                        lineHeight: 1.6,
                                        whiteSpace: 'pre-wrap',
                                    }}
                                >
                                    {m.content.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1')}
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                                <div
                                    style={{
                                        width: 30,
                                        height: 30,
                                        borderRadius: 8,
                                        flexShrink: 0,
                                        background: '#1a56db',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 14,
                                    }}
                                >
                                    🤖
                                </div>
                                <div
                                    style={{
                                        padding: '10px 16px',
                                        borderRadius: '4px 14px 14px 14px',
                                        background: '#f9fafb',
                                        display: 'flex',
                                        gap: 4,
                                        alignItems: 'center',
                                    }}
                                >
                                    {[0, 1, 2].map(i => (
                                        <div
                                            key={i}
                                            style={{
                                                width: 6,
                                                height: 6,
                                                borderRadius: '50%',
                                                background: '#9ca3af',
                                                animation: `rrPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    {messages.filter(m => m.role === 'user').length === 0 && (
                        <div style={{ padding: '0 20px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                            {STARTER_PROMPTS.map(p => (
                                <button
                                    key={p}
                                    onClick={() => void sendMessage(p)}
                                    style={{
                                        padding: '5px 12px',
                                        borderRadius: 20,
                                        border: '1px solid #93c5fd',
                                        background: '#eff6ff',
                                        color: '#1d4ed8',
                                        fontSize: 12,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    )}

                    <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 10 }}>
                        <input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    void sendMessage(input);
                                }
                            }}
                            placeholder="Describe your recognition goal…"
                            disabled={loading}
                            style={{
                                flex: 1,
                                border: '1px solid #d1d5db',
                                borderRadius: 8,
                                padding: '8px 12px',
                                fontSize: 13,
                                outline: 'none',
                                background: loading ? '#f9fafb' : '#fff',
                            }}
                        />
                        <button
                            onClick={() => void sendMessage(input)}
                            disabled={loading || !input.trim()}
                            style={{
                                padding: '8px 18px',
                                borderRadius: 8,
                                border: 'none',
                                background: input.trim() && !loading ? '#1a56db' : '#e2e8f0',
                                color: input.trim() && !loading ? '#fff' : '#94a3b8',
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: input.trim() && !loading ? 'pointer' : 'default',
                            }}
                        >
                            Send
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <SpecPreviewCard spec={spec} />
                    {isComplete && (
                        <Button variant="primary" size="sm" onClick={() => void saveAutomation()} disabled={saving}>
                            {saving ? 'Saving…' : '⚡ Save & Activate'}
                        </Button>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes rrPulse {
                    0%, 100% { opacity: 0.3; transform: scale(0.8); }
                    50% { opacity: 1; transform: scale(1.2); }
                }
            `}</style>
        </div>
    );
}

function AutomationsTab() {
    const [rules, setRules] = useState<AutomationRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [building, setBuilding] = useState(false);
    const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch('/api/rr/admin/automations', { headers: ADMIN_GET_HEADERS });
            const d = (await r.json()) as { rules: AutomationRule[] };
            setRules(d.rules);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const toggle = async (id: string, status: 'active' | 'paused') => {
        const r = await fetch(`/api/rr/admin/automations/${id}`, {
            method: 'PATCH',
            headers: ADMIN_HEADERS,
            body: JSON.stringify({ status }),
        });
        if (!r.ok) {
            const e = (await r.json()) as { error: string };
            setToast({ text: e.error, ok: false });
        } else {
            setToast({ text: `Automation ${status === 'active' ? 'activated' : 'paused'}`, ok: true });
            void load();
        }
    };

    if (building) {
        return (
            <AutomationBuilder
                onSaved={() => {
                    setBuilding(false);
                    void load();
                    setToast({ text: 'Automation saved and active!', ok: true });
                }}
                onCancel={() => setBuilding(false)}
            />
        );
    }

    const activeCount = rules.filter(r => r.status === 'active').length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {toast && (
                <AlertBanner
                    variant={toast.ok ? 'success' : 'error'}
                    title={toast.text}
                    headingVariant="h5"
                    onClose={() => setToast(null)}
                />
            )}

            <div
                style={{
                    background: 'linear-gradient(135deg, #1a56db 0%, #7c3aed 100%)',
                    borderRadius: 12,
                    padding: '24px 28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
                        🤖 Automation Builder
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                        Describe your recognition goal in plain English. The AI agent asks a few
                        <br />
                        follow-up questions and configures the workflow for you.
                    </div>
                </div>
                <button
                    onClick={() => setBuilding(true)}
                    style={{
                        padding: '10px 22px',
                        borderRadius: 8,
                        border: 'none',
                        background: '#fff',
                        color: '#1a56db',
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    }}
                >
                    + New automation
                </button>
            </div>

            <div style={{ display: 'flex', gap: 16 }}>
                {[
                    { label: 'Active automations', value: activeCount, color: '#166534', bg: '#dcfce7' },
                    { label: 'Total rules', value: rules.length, color: '#0369a1', bg: '#dbeafe' },
                    {
                        label: 'Need setup',
                        value: rules.filter(r => (r.triggerConfig['integrationStatus'] as string) === 'needs_setup')
                            .length,
                        color: '#92400e',
                        bg: '#fef3c7',
                    },
                ].map(s => (
                    <div
                        key={s.label}
                        style={{
                            flex: 1,
                            padding: '16px 20px',
                            borderRadius: 10,
                            background: s.bg,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 14,
                        }}
                    >
                        <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: s.color }}>{s.label}</div>
                    </div>
                ))}
            </div>

            {loading ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
                    Loading automations…
                </div>
            ) : rules.length === 0 ? (
                <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>No automations yet</div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                        Click "New automation" and describe your goal to get started.
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={sectionLabel}>Configured rules</div>
                    {rules.map(rule => (
                        <AutomationRuleCard
                            key={rule.id}
                            rule={rule}
                            onToggle={(id, status) => void toggle(id, status)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main RecognitionAdminPage
// ---------------------------------------------------------------------------

const TABS: NavigationTabItem[] = [
    { value: 'setup', label: '⚙️  Setup' },
    { value: 'budget', label: '💰  Budget' },
    { value: 'reports', label: '📊  Reports' },
    { value: 'audit', label: '📋  Audit Log' },
    { value: 'slack', label: '💬  Slack' },
    { value: 'teams', label: '🟦  Teams' },
    { value: 'automations', label: '🤖  Automations' },
];

export function RecognitionAdminPage() {
    const [activeTab, setActiveTab] = useState('setup');
    const { setHeaderActions } = useOutletContext<RecognitionAreaOutletContext>();

    useEffect(() => {
        setHeaderActions([
            <Badge key="title" color="info" variant="light">
                Program Admin
            </Badge>,
        ]);
        return () => setHeaderActions([]);
    }, [setHeaderActions]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px 0' }}>
            <NavigationTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

            {activeTab === 'setup' && <SetupTab />}
            {activeTab === 'budget' && <BudgetTab />}
            {activeTab === 'reports' && <ReportsTab />}
            {activeTab === 'audit' && <AuditTab />}
            {activeTab === 'slack' && <SlackTab />}
            {activeTab === 'teams' && <TeamsTab />}
            {activeTab === 'automations' && <AutomationsTab />}
        </div>
    );
}

export { RecognitionAdminPage as Component };
