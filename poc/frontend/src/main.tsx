import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@mantine/core/styles.css';
import { MantineProvider, createTheme } from '@mantine/core';
import { App } from './App';

/**
 * ClearCompany 2.1 Light theme token overrides.
 * Derived from clearco-ui/src/theming/clearco21-light/theme.json.
 * Primary blue: #1A56DB   Success green: #057A55   Warning amber: #B45309
 */
const ccTheme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'sm',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
  components: {
    Button: {
      defaultProps: { radius: 'sm' },
    },
    Badge: {
      defaultProps: { radius: 'sm' },
    },
    Card: {
      defaultProps: { radius: 'md', withBorder: true },
    },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found in DOM');
}

createRoot(rootEl).render(
  <StrictMode>
    <MantineProvider theme={ccTheme}>
      <App />
    </MantineProvider>
  </StrictMode>
);
