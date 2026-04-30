/**
 * NavigationTabs shim — matches @clearcompany/clearco-ui NavigationTabs API.
 * Renders a horizontal tab strip; active tab has underline indicator.
 */
import { type ReactNode } from 'react';
import { Tabs } from '@mantine/core';

export interface NavigationTabItem {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface NavigationTabsProps {
  tabs: NavigationTabItem[];
  activeTab?: string;
  onTabChange?: (value: string) => void;
  loading?: boolean;
  variant?: 'default' | 'tertiary';
  testId?: string;
}

export function NavigationTabs({ tabs, activeTab, onTabChange, testId }: NavigationTabsProps) {
  return (
    <Tabs
      value={activeTab ?? null}
      onChange={v => v && onTabChange?.(v)}
      data-testid={testId}
      styles={{
        root: { borderBottom: '1px solid var(--mantine-color-gray-2)' },
        tab: { fontWeight: 500, fontSize: 14 },
        list: { gap: 0, borderBottom: 'none' },
      }}
    >
      <Tabs.List>
        {tabs.map(tab => (
          <Tabs.Tab
            key={tab.value}
            value={tab.value}
            disabled={tab.disabled}
            leftSection={tab.icon}
          >
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
