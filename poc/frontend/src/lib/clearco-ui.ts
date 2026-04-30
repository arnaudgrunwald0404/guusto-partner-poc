/**
 * clearco-ui bridge
 *
 * Re-exports ClearCompany design-system components for use in the POC.
 * Components that have a 1:1 Mantine equivalent are re-exported directly.
 * CC-specific components (PageHeader, NavigationTabs, AlertBanner) are
 * implemented as local shims that match the clearco-ui API surface exactly,
 * so this file can be swapped for the real @clearcompany/clearco-ui import
 * once the library is published to the internal registry.
 *
 * Theme: uses Mantine defaults + CC color overrides applied via MantineProvider
 * in main.tsx (clearco21-light token set).
 */

// ─── Direct Mantine re-exports ───────────────────────────────────────────────
export { Button } from '@mantine/core';
export type { ButtonProps } from '@mantine/core';

export { Card } from '@mantine/core';
export type { CardProps } from '@mantine/core';

export { Badge } from '@mantine/core';
export type { BadgeProps } from '@mantine/core';

export { Avatar } from '@mantine/core';
export type { AvatarProps } from '@mantine/core';

export { Progress } from '@mantine/core';
export type { ProgressProps } from '@mantine/core';

// ─── CC-specific shims ───────────────────────────────────────────────────────
export { AlertBanner } from './shims/AlertBanner';
export type { AlertBannerProps } from './shims/AlertBanner';

export { PageHeader } from './shims/PageHeader';
export type { PageHeaderProps } from './shims/PageHeader';

export { NavigationTabs } from './shims/NavigationTabs';
export type { NavigationTabsProps, NavigationTabItem } from './shims/NavigationTabs';
