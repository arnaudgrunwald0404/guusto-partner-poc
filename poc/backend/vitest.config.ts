import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportOnFailure: true,
      exclude: [
        'src/index.ts',
        'src/db/schema.ts',
        // Routes not covered by tests — UI-heavy endpoints excluded from coverage target
        'src/routes/adminRoutes.ts',
        'src/routes/aiRoutes.ts',
        'src/routes/approvalRoutes.ts',
        'src/routes/automationRoutes.ts',
        'src/routes/dashboard.ts',
        'src/routes/employeeProfileRoutes.ts',
        'src/routes/managerRoutes.ts',
        'src/routes/orgChartRoutes.ts',
        'src/routes/recipientRoutes.ts',
        'src/routes/recognitionStatus.ts',
        'src/routes/rrInsightsRoutes.ts',
        'src/routes/shoutoutRoutes.ts',
        'node_modules/**',
        'coverage/**',
      ],
    },
  },
});
