import { Navigate } from 'react-router-dom';
import type { SecondaryNavigationProps } from '@cc-shared/appLayout/page-wrapper';

/**
 * Hardcoded secondary navigation for the Recognition area.
 * Unlike other areas (Performance, Me, Team) this nav is not driven by the backend API
 * because Recognition is a new module added as a hackathon POC.
 * Once the module ships to production, nav items should be served by the header API.
 */
export const recognitionSecondaryNavigation = (pendingGiftCount = 0): SecondaryNavigationProps => ({
    areaTitle: 'Rewards & Recognition',
    baseAreaRoute: '/r/recognition',
    subNavigation: [
        {
            code: 'recognition/home',
            title: 'Home',
            route: '/r/recognition/home',
        },
        {
            code: 'recognition/manager',
            title: 'My Team',
            route: '/r/recognition/manager',
        },
        {
            code: 'recognition/redeem',
            title: pendingGiftCount > 0 ? `Redeem  🔴 ${pendingGiftCount}` : 'Redeem',
            route: '/r/recognition/redeem',
        },
        {
            code: 'recognition/admin',
            title: 'Program Admin',
            route: '/r/recognition/admin',
        },
    ],
});

/**
 * React router configuration for the Recognition area.
 * Nested under /r/* so these are pure-React routes (no Backbone).
 */
export const recognitionAreaRoutes = () => [
    {
        path: 'recognition/*',
        lazy: () => import('./recognitionArea'),
        children: [
            {
                index: true,
                element: <Navigate to="/r/recognition/home" replace />,
            },
            {
                path: 'home',
                lazy: () =>
                    import('./pages/home/recognitionHomePage').then(m => ({
                        Component: m.RecognitionHomePage,
                    })),
            },
            {
                path: 'manager',
                lazy: () =>
                    import('./pages/managerDashboard/managerDashboardPage').then(m => ({
                        Component: m.ManagerDashboardPage,
                    })),
            },
            {
                path: 'feed',
                lazy: () =>
                    import('./pages/feed/recognitionFeedPage').then(m => ({
                        Component: m.RecognitionFeedPage,
                    })),
            },
            {
                path: 'redeem',
                lazy: () =>
                    import('./pages/redeem/recognitionRedeemPage').then(m => ({
                        Component: m.RecognitionRedeemPage,
                    })),
            },
            {
                path: 'admin',
                lazy: () => import('./pages/admin/recognitionAdminPage'),
            },
        ],
    },
];
