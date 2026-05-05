/**
 * MicrosoftTeamsLogo
 *
 * Inline SVG replica of the Microsoft Teams product icon (2023 refresh).
 * Purple-to-indigo gradient rounded square with white stylised "T" mark.
 *
 * Props
 *   size   — width/height in px (default 24)
 *   style  — optional extra inline styles on the outer <svg>
 */

import React from 'react';

interface MicrosoftTeamsLogoProps {
    size?: number;
    style?: React.CSSProperties;
}

export function MicrosoftTeamsLogo({ size = 24, style }: MicrosoftTeamsLogoProps) {
    const id = 'teams-grad';
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 48 48"
            style={style}
            aria-label="Microsoft Teams"
            role="img"
        >
            <defs>
                <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#7B83EB" />
                    <stop offset="100%" stopColor="#4B53BC" />
                </linearGradient>
            </defs>

            {/* Background rounded square */}
            <rect width="48" height="48" rx="10" fill={`url(#${id})`} />

            {/* White "T" mark — crossbar + stem */}
            {/* Crossbar */}
            <rect x="11" y="13" width="26" height="6" rx="3" fill="white" />
            {/* Stem */}
            <rect x="21" y="13" width="6" height="22" rx="3" fill="white" />
        </svg>
    );
}
