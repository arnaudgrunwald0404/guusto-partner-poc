import { useState, useEffect, ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { PageWrapper } from '@cc-shared/appLayout/page-wrapper';
import { isLocationMatch } from '@cc-shared/appLayout/navigation/navigationUtils';
import { recognitionSecondaryNavigation } from './routes';
import { Error4xx, ErrorPageType } from '../error4xx/4xx';
import { RRThemeProvider } from './recognitionThemeContext';
import { RecognitionPersonaProvider, PersonaSwitcher, useRecognitionPersona } from './recognitionPersonaContext';

/**
 * Context shape exposed to child pages via <Outlet context={...} />.
 * Pages can call setHeaderActions([...]) to inject action buttons into
 * the white PageHeader banner (rendered by RecognitionArea's PageWrapper).
 * Pages can call setPendingGiftCount(n) to update the Redeem nav badge.
 */
export interface RecognitionAreaOutletContext {
    setHeaderActions: (actions: ReactNode[]) => void;
    setHeaderDescription: (description: string) => void;
    setPendingGiftCount: (count: number) => void;
}

// ---------------------------------------------------------------------------
// Inner area — has access to both persona + theme contexts
// ---------------------------------------------------------------------------

function RecognitionAreaInner() {
    const location = useLocation();
    const { persona } = useRecognitionPersona();

    // Header actions injected by child pages (e.g. ManagerDashboardPage)
    const [headerActions, setHeaderActions] = useState<ReactNode[]>([]);

    // Header description injected by child pages (shown below the page title)
    const [headerDescription, setHeaderDescription] = useState<string>('');

    // Pending gift count — persona-based default; overridden by RecognitionRedeemPage on mount
    // Employee (Arnaud) = 3 pending gifts; Managers (Rachael, Thomas) = 0
    const [pendingGiftCount, setPendingGiftCount] = useState<number>(persona.type === 'employee' ? 3 : 0);

    // Reset to persona default whenever the persona switches
    useEffect(() => {
        setPendingGiftCount(persona.type === 'employee' ? 3 : 0);
    }, [persona.id]);

    const secondaryNavigation = recognitionSecondaryNavigation(pendingGiftCount);

    // Find current page from nav to set title
    const currentPage = secondaryNavigation.subNavigation?.find(item =>
        isLocationMatch(item.route, location.pathname, location.search),
    );

    // Unknown sub-route → React 404
    const isAreaBaseRoute =
        secondaryNavigation.baseAreaRoute &&
        isLocationMatch(secondaryNavigation.baseAreaRoute, location.pathname, location.search, true);

    if (!currentPage && !isAreaBaseRoute) {
        return <Error4xx variant={ErrorPageType.ERROR_404} />;
    }

    return (
        <>
            {/* Persona switcher — floats in the top-right corner for demo convenience */}
            <div style={{ position: 'fixed', top: 10, right: 68, zIndex: 9999 }}>
                <PersonaSwitcher />
            </div>
            <PageWrapper
                title={currentPage?.title ?? secondaryNavigation.areaTitle ?? 'Rewards & Recognition'}
                description={headerDescription || undefined}
                secondaryNavigation={secondaryNavigation}
                isMixedMode={false}
                contentWidth="fullWidth"
                actions={headerActions.length > 0 ? headerActions : undefined}
            >
                <Outlet
                    context={
                        {
                            setHeaderActions,
                            setHeaderDescription,
                            setPendingGiftCount,
                        } satisfies RecognitionAreaOutletContext
                    }
                />
            </PageWrapper>
        </>
    );
}

/**
 * Area wrapper for the Rewards & Recognition module.
 *
 * Unlike other areas (Performance, Me, Team), Recognition is a brand-new module
 * with no backend navigation API support yet (hackathon POC). Secondary navigation
 * is hardcoded in routes.ts and will be wired to the header API once the module
 * ships to production.
 *
 * This area is always pure-React (isMixedMode = false) — there is no Backbone
 * counterpart to fall back to.
 *
 * A PersonaSwitcher floats in the top-right corner for demo persona switching.
 */
export const RecognitionArea = () => {
    return (
        <RecognitionPersonaProvider>
            <RRThemeProvider>
                <RecognitionAreaInner />
            </RRThemeProvider>
        </RecognitionPersonaProvider>
    );
};

// Named export required for lazy() + Component pattern
export { RecognitionArea as Component };
