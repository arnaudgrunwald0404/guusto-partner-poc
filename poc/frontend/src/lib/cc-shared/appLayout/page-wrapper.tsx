/**
 * PageWrapper shim — matches the @cc-shared/appLayout/page-wrapper API used in
 * the main ClearCompany app. In the POC we render a simpler version:
 * page header (title + description + actions) + secondary nav tabs + content.
 *
 * This lets the recognition module's recognitionArea.tsx work unchanged in the
 * standalone guusto-partner POC without importing from the full CC app shell.
 */
import { type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Group, Stack, Title, Text } from '@mantine/core';
import { NavigationTabs } from '../../shims/NavigationTabs';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SecondaryNavItem {
    code: string;
    title: string;
    route: string;
    badge?: string | number;
}

export interface SecondaryNavigationProps {
    areaTitle?: string;
    baseAreaRoute?: string;
    subNavigation?: SecondaryNavItem[];
}

export interface PageWrapperProps {
    title: string;
    description?: string;
    secondaryNavigation?: SecondaryNavigationProps;
    /** Unused in POC shim — kept for API parity */
    isMixedMode?: boolean;
    /** Unused in POC shim — kept for API parity */
    contentWidth?: 'fullWidth' | 'standard';
    actions?: ReactNode[];
    children?: ReactNode;
}

// ── Component ────────────────────────────────────────────────────────────────

export function PageWrapper({
    title,
    description,
    secondaryNavigation,
    actions,
    children,
}: PageWrapperProps) {
    const navigate = useNavigate();
    const location = useLocation();

    const navItems = secondaryNavigation?.subNavigation ?? [];

    // Determine active tab by matching current pathname against each route
    const activeItem = navItems.find(item => location.pathname.startsWith(item.route));
    const activeTab = activeItem?.code;

    const tabs = navItems.map(item => ({
        value: item.code,
        label: item.title as ReactNode,
    }));

    return (
        <Box>
            {/* ── Page header ─────────────────────────────────────────── */}
            <Box
                px="xl"
                py="md"
                style={{ background: '#fff', borderBottom: '1px solid var(--mantine-color-gray-2)' }}
            >
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Stack gap={4}>
                        <Title order={1} size="h2" fw={700} c="gray.9" style={{ letterSpacing: '-0.01em' }}>
                            {title}
                        </Title>
                        {description && (
                            <Text size="sm" c="gray.5">
                                {description}
                            </Text>
                        )}
                    </Stack>

                    {actions && actions.length > 0 && (
                        <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
                            {actions}
                        </Group>
                    )}
                </Group>
            </Box>

            {/* ── Secondary nav tabs ───────────────────────────────────── */}
            {tabs.length > 0 && (
                <Box px="xl" style={{ background: '#fff' }}>
                    <NavigationTabs
                        tabs={tabs}
                        activeTab={activeTab}
                        onTabChange={(code) => {
                            const item = navItems.find(n => n.code === code);
                            if (item) navigate(item.route);
                        }}
                    />
                </Box>
            )}

            {/* ── Page content ─────────────────────────────────────────── */}
            <Box style={{ background: '#f8fafc', minHeight: 'calc(100vh - 180px)' }}>
                {children}
            </Box>
        </Box>
    );
}
