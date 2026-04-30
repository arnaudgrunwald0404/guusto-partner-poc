/**
 * AlertBanner shim — matches @clearcompany/clearco-ui AlertBanner API.
 * Wraps Mantine Alert with CC colour semantics and icon set.
 */
import { type ReactNode } from 'react';
import { Alert, Group, Text, CloseButton } from '@mantine/core';
import {
  IconAlertTriangleFilled,
  IconCircleCheckFilled,
  IconInfoCircleFilled,
  IconAlertCircleFilled,
} from '@tabler/icons-react';

export interface AlertBannerProps {
  variant: 'success' | 'error' | 'warning' | 'info';
  title: string;
  headingVariant: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  children?: ReactNode | string;
  onClose?: () => void;
  testId?: string;
}

const CONFIG = {
  success: { color: 'green',  Icon: IconCircleCheckFilled },
  error:   { color: 'red',    Icon: IconAlertCircleFilled },
  warning: { color: 'orange', Icon: IconAlertTriangleFilled },
  info:    { color: 'blue',   Icon: IconInfoCircleFilled },
} as const;

export function AlertBanner({ variant, title, children, onClose, testId }: AlertBannerProps) {
  const { color, Icon } = CONFIG[variant];

  return (
    <Alert
      color={color}
      icon={<Icon size={18} />}
      data-testid={testId}
      styles={{ root: { borderRadius: 8 } }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Text fw={600} size="sm" mb={children ? 4 : 0}>{title}</Text>
          {children && <Text size="sm" c="dimmed">{children}</Text>}
        </div>
        {onClose && <CloseButton size="sm" onClick={onClose} />}
      </Group>
    </Alert>
  );
}
