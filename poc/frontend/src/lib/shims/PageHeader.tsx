/**
 * PageHeader shim — matches @clearcompany/clearco-ui PageHeader API.
 * Title + description + right-aligned action buttons.
 */
import { type ReactNode } from 'react';
import { Group, Stack, Title, Text } from '@mantine/core';

export interface PageHeaderProps {
  title: string;
  description?: string | ReactNode;
  actionButtons?: ReactNode[];
  variant?: 'default' | 'avatar';
  avatar?: ReactNode;
  loading?: boolean;
  testId?: string;
}

export function PageHeader({ title, description, actionButtons, avatar, testId }: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-start" data-testid={testId} wrap="nowrap">
      <Group align="flex-start" gap="md" wrap="nowrap">
        {avatar}
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
      </Group>

      {actionButtons && actionButtons.length > 0 && (
        <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
          {actionButtons}
        </Group>
      )}
    </Group>
  );
}
