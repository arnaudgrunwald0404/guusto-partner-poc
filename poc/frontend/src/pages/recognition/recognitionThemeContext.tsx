/**
 * recognitionThemeContext.tsx
 *
 * Lightweight theme switcher for the Rewards & Recognition module.
 * Instead of swapping the root ThemeProvider (which would affect the whole app),
 * this context injects CSS custom-property overrides on a wrapper div.
 * Mantine components inherit custom properties from their nearest ancestor, so
 * all clearco-ui components inside the recognition area automatically pick up the
 * new palette.
 *
 * Theme values are sourced directly from clearco-ui design tokens:
 *   - clearco-webapp/node_modules/@clearcompany/clearco-ui/src/theming/clearco21-light/theme.json
 *   - designTokens/primitives/color/brand-21.tokens.json
 */

import { createContext, useContext, useState, ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Token-derived palette type
// ---------------------------------------------------------------------------

export interface RRTheme {
    id: string;
    label: string;
    emoji: string;
    /** 10-stop palette (0-9), used to override --mantine-color-blue-* */
    palette: readonly string[];
    /** CSS variables to inject on the wrapper div */
    vars: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Theme definitions — all hex values come from clearco-ui design tokens
// ---------------------------------------------------------------------------

/**
 * Builds the full set of Mantine CSS variable overrides for a given palette.
 * `palette` must be a 10-stop array (indices 0–9).
 */
function buildVars(palette: readonly string[], filledIdx = 6, lightTextIdx = 7): Record<string, string> {
    const filled = palette[filledIdx];
    const filledHover = palette[filledIdx + 1] ?? palette[filledIdx];
    const light = palette[1];
    const lightHover = palette[2];
    const lightColor = palette[lightTextIdx];

    return {
        // Primary semantic vars (used by Button variant="primary", Badge color="info", etc.)
        '--mantine-primary-color-filled': filled,
        '--mantine-primary-color-filled-hover': filledHover,
        '--mantine-primary-color-light': light,
        '--mantine-primary-color-light-hover': lightHover,
        '--mantine-primary-color-light-color': lightColor,
        '--mantine-primary-color-contrast': '#ffffff',
        // Palette vars (used by color-aware components like Badge color="info")
        ...Object.fromEntries(palette.map((hex, i) => [`--mantine-color-blue-${i}`, hex])),
        // Anchor / link color
        '--mantine-color-anchor': palette[filledIdx],
    };
}

// ── Blue (ClearCo 21 Classic — default) ────────────────────────────────────
// Source: clearco21-light/theme.json > colorPalette.blue
const BLUE_PALETTE = [
    '#f3f8fc',
    '#e8f0fd',
    '#cce0f9',
    '#adcdf5',
    '#4791eb',
    '#186cd3',
    '#145eb8',
    '#0f468a',
    '#0a2f5c',
    '#072345',
] as const;

// ── ClearCo Navy (brand-21 navyBlue) ────────────────────────────────────────
// Source: designTokens/primitives/color/brand-21.tokens.json > navyBlue
const NAVY_PALETTE = [
    '#EFF6FF',
    '#D0E3FF',
    '#A0C6FF',
    '#81A6DE',
    '#6084BA',
    '#476A9D',
    '#345588',
    '#254677',
    '#092958',
    '#001840',
] as const;

// ── Violet ───────────────────────────────────────────────────────────────────
// Source: clearco21-light/theme.json > colorPalette.violet
const VIOLET_PALETTE = [
    '#f3f0ff',
    '#e5dbff',
    '#d0bfff',
    '#b197fc',
    '#9775fa',
    '#845ef7',
    '#7950f2',
    '#7048e8',
    '#6741d9',
    '#5f3dc4',
] as const;

// ── Teal ─────────────────────────────────────────────────────────────────────
// Source: clearco21-light/theme.json > colorPalette.teal
const TEAL_PALETTE = [
    '#e6fcf5',
    '#c3fae8',
    '#96f2d7',
    '#63e6be',
    '#38d9a9',
    '#20c997',
    '#12b886',
    '#0ca678',
    '#099268',
    '#087f5b',
] as const;

// ── Orange ───────────────────────────────────────────────────────────────────
// Source: clearco21-light/theme.json > colorPalette.orange
const ORANGE_PALETTE = [
    '#fff4e6',
    '#ffe8cc',
    '#ffd8a8',
    '#ffc078',
    '#ffa94d',
    '#ff922b',
    '#fd7e14',
    '#f76707',
    '#e8590c',
    '#d9480f',
] as const;

export const RR_THEMES: RRTheme[] = [
    {
        id: 'blue',
        label: 'Classic Blue',
        emoji: '🔵',
        palette: BLUE_PALETTE,
        vars: buildVars(BLUE_PALETTE),
    },
    {
        id: 'navy',
        label: 'ClearCo Navy',
        emoji: '🏢',
        palette: NAVY_PALETTE,
        vars: buildVars(NAVY_PALETTE, 7),
    },
    {
        id: 'violet',
        label: 'Violet',
        emoji: '🟣',
        palette: VIOLET_PALETTE,
        vars: buildVars(VIOLET_PALETTE),
    },
    {
        id: 'teal',
        label: 'Teal',
        emoji: '🌿',
        palette: TEAL_PALETTE,
        vars: buildVars(TEAL_PALETTE, 6, 8),
    },
    {
        id: 'orange',
        label: 'Warm Orange',
        emoji: '🟠',
        palette: ORANGE_PALETTE,
        vars: buildVars(ORANGE_PALETTE, 6, 8),
    },
];

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface RRThemeContextValue {
    activeTheme: RRTheme;
    setThemeId: (id: string) => void;
    themes: RRTheme[];
}

const RRThemeContext = createContext<RRThemeContextValue>({
    activeTheme: RR_THEMES[0],
    setThemeId: () => undefined,
    themes: RR_THEMES,
});

export function useRRTheme() {
    return useContext(RRThemeContext);
}

// ---------------------------------------------------------------------------
// Provider — wraps the Recognition area and injects CSS vars
// ---------------------------------------------------------------------------

export function RRThemeProvider({ children }: { children: ReactNode }) {
    const [themeId, setThemeId] = useState<string>('blue');
    const activeTheme = RR_THEMES.find(t => t.id === themeId) ?? RR_THEMES[0];

    return (
        <RRThemeContext.Provider value={{ activeTheme, setThemeId, themes: RR_THEMES }}>
            <div style={activeTheme.vars as React.CSSProperties}>{children}</div>
        </RRThemeContext.Provider>
    );
}

// ---------------------------------------------------------------------------
// ThemeSwitcher UI component — drop it anywhere inside RRThemeProvider
// ---------------------------------------------------------------------------

export function RRThemeSwitcher() {
    const { activeTheme, setThemeId, themes } = useRRTheme();

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
                style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.35)',
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase',
                    flexShrink: 0,
                }}
            >
                Theme
            </span>
            <div
                style={{
                    display: 'flex',
                    gap: 4,
                    background: 'rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    padding: 3,
                }}
            >
                {themes.map(theme => {
                    const isActive = theme.id === activeTheme.id;
                    return (
                        <button
                            key={theme.id}
                            type="button"
                            title={theme.label}
                            onClick={() => setThemeId(theme.id)}
                            style={{
                                width: 26,
                                height: 26,
                                borderRadius: 5,
                                border: isActive ? `2px solid ${theme.palette[4]}` : '2px solid rgba(255,255,255,0.15)',
                                background: isActive ? 'rgba(255,255,255,0.18)' : 'transparent',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: 0,
                                boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                                transition: 'all 0.12s',
                                position: 'relative',
                            }}
                            aria-pressed={isActive}
                            aria-label={`${theme.label} theme`}
                        >
                            {/* Colour swatch */}
                            <div
                                style={{
                                    width: 14,
                                    height: 14,
                                    borderRadius: 3,
                                    background: `linear-gradient(135deg, ${theme.palette[4]}, ${theme.palette[7]})`,
                                    flexShrink: 0,
                                }}
                            />
                        </button>
                    );
                })}
            </div>
            {/* Active theme label */}
            <span
                style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.7)',
                    minWidth: 72,
                }}
            >
                {activeTheme.emoji} {activeTheme.label}
            </span>
        </div>
    );
}
