/**
 * recognitionPersonaContext.tsx
 *
 * Demo persona switcher for the Rewards & Recognition module.
 * Three concrete personas replace the old Arnaud/Sarah two-level system:
 *
 *   👤 Arnaud G       — Employee    — sees feed + gift inbox
 *   👔 Rachael Alpert — Manager     — VP CS, 3-person CS team
 *   👷 Thomas Badeen  — Manager     — Sales Manager, frontline team
 *
 * The old "Sarah Chen" generic-manager toggle has been removed.
 * The old "Viewing as" ManagerSwitcher inside My Team is also gone —
 * persona selection drives which manager profile is shown.
 */

import { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Persona type
// ---------------------------------------------------------------------------

export interface RRPersona {
    id: 'arnaud' | 'rachael' | 'thomas';
    type: 'employee' | 'manager';
    /** Backend userId for API calls (feed scope, nudges, etc.) */
    userId: string;
    name: string;
    shortName: string;
    role: string;
    /** Abbreviated role for compact display, e.g. "VP CS" */
    shortRole: string;
    avatarInitials: string;
    avatarBg: string;
    /** Maps to ManagerProfile.id in managerDashboardPage — undefined for employees */
    managerId?: string;
}

// ---------------------------------------------------------------------------
// Persona definitions
// ---------------------------------------------------------------------------

export const RR_PERSONAS: RRPersona[] = [
    {
        id: 'arnaud',
        type: 'employee',
        userId: 'arnaud',
        name: 'Arnaud G',
        shortName: 'Arnaud',
        role: 'Head of Product & Design',
        shortRole: 'Product',
        avatarInitials: 'AG',
        avatarBg: '#4f46e5',
    },
    {
        id: 'rachael',
        type: 'manager',
        userId: 'rachael',
        name: 'Rachael Alpert',
        shortName: 'Rachael',
        role: 'VP Customer Success',
        shortRole: 'VP CS',
        avatarInitials: 'RA',
        avatarBg: '#0891b2',
        managerId: 'mgr_001',
    },
    {
        id: 'thomas',
        type: 'manager',
        userId: 'thomas',
        name: 'Thomas Badeen',
        shortName: 'Thomas',
        role: 'Sales Manager · Frontline',
        shortRole: 'Sales Mgr',
        avatarInitials: 'TB',
        avatarBg: '#059669',
        managerId: 'mgr_003',
    },
];

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface RecognitionPersonaContextValue {
    persona: RRPersona;
    setPersonaId: (id: RRPersona['id']) => void;
    personas: RRPersona[];
}

const RecognitionPersonaContext = createContext<RecognitionPersonaContextValue>({
    persona: RR_PERSONAS[0],
    setPersonaId: () => undefined,
    personas: RR_PERSONAS,
});

export function useRecognitionPersona() {
    return useContext(RecognitionPersonaContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function RecognitionPersonaProvider({ children }: { children: ReactNode }) {
    const [personaId, setPersonaId] = useState<RRPersona['id']>('arnaud');
    const persona = RR_PERSONAS.find(p => p.id === personaId) ?? RR_PERSONAS[0];

    return (
        <RecognitionPersonaContext.Provider value={{ persona, setPersonaId, personas: RR_PERSONAS }}>
            {children}
        </RecognitionPersonaContext.Provider>
    );
}

// ---------------------------------------------------------------------------
// PersonaSwitcher — GitHub-style account switcher
// Renders as a pill button with the current persona's avatar + name.
// Clicking opens a dropdown listing all personas.
// Designed to be placed inside a dark/black header bar.
// ---------------------------------------------------------------------------

export function PersonaSwitcher() {
    const { persona, setPersonaId, personas } = useRecognitionPersona();
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        function handleClick(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            {/* ── Trigger ── */}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-haspopup="listbox"
                aria-expanded={open}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 10px 4px 5px',
                    background: open ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.10)',
                    border: '1px solid rgba(255,255,255,0.22)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    color: '#fff',
                    transition: 'background 0.12s',
                }}
            >
                {/* Avatar */}
                <div
                    style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: persona.avatarBg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 800,
                        color: '#fff',
                        flexShrink: 0,
                        letterSpacing: '0.02em',
                    }}
                >
                    {persona.avatarInitials}
                </div>
                {/* Name + role */}
                <div style={{ textAlign: 'left', lineHeight: 1.25 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                        {persona.shortName}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap' }}>
                        {persona.shortRole}
                    </div>
                </div>
                {/* Chevron */}
                <svg
                    width="10"
                    height="6"
                    viewBox="0 0 10 6"
                    fill="none"
                    style={{
                        opacity: 0.5,
                        flexShrink: 0,
                        transform: open ? 'rotate(180deg)' : undefined,
                        transition: 'transform 0.15s',
                    }}
                >
                    <path
                        d="M1 1l4 4 4-4"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </button>

            {/* ── Dropdown ── */}
            {open && (
                <div
                    role="listbox"
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        left: 0,
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 10,
                        boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
                        minWidth: 230,
                        zIndex: 10000,
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            padding: '8px 14px 6px',
                            borderBottom: '1px solid #f1f5f9',
                        }}
                    >
                        <span
                            style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: '#94a3b8',
                                letterSpacing: '0.07em',
                                textTransform: 'uppercase',
                            }}
                        >
                            Switch persona
                        </span>
                    </div>

                    {personas.map(p => {
                        const isActive = p.id === persona.id;
                        return (
                            <button
                                key={p.id}
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                onClick={() => {
                                    setPersonaId(p.id);
                                    setOpen(false);
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    width: '100%',
                                    padding: '10px 14px',
                                    background: isActive ? '#f0f9ff' : 'transparent',
                                    border: 'none',
                                    borderLeft: `3px solid ${isActive ? '#0891b2' : 'transparent'}`,
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                }}
                            >
                                {/* Avatar */}
                                <div
                                    style={{
                                        width: 34,
                                        height: 34,
                                        borderRadius: '50%',
                                        background: p.avatarBg,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 12,
                                        fontWeight: 800,
                                        color: '#fff',
                                        flexShrink: 0,
                                        letterSpacing: '0.02em',
                                    }}
                                >
                                    {p.avatarInitials}
                                </div>
                                {/* Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div
                                        style={{
                                            fontSize: 13,
                                            fontWeight: 700,
                                            color: '#1e293b',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {p.name}
                                    </div>
                                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                                        {p.type === 'employee' ? '👤 Employee' : '👔 Manager'} · {p.role}
                                    </div>
                                </div>
                                {/* Active check */}
                                {isActive && (
                                    <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 14 14"
                                        fill="none"
                                        style={{ flexShrink: 0 }}
                                    >
                                        <path
                                            d="M2 7l4 4 6-7"
                                            stroke="#0891b2"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
