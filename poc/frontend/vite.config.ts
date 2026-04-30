import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Resolve clearco-ui imports directly from source — no build step needed
      '@clearcompany/clearco-ui': path.resolve(
        __dirname,
        '../../../clearco-ui/src/indexCore.ts'
      ),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
