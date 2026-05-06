/**
 * netlify/functions/api.ts — Serverless entry point for the Express backend.
 *
 * Wraps the Express app with serverless-http so all /api/* requests are
 * handled by a single Netlify Function. Netlify.toml redirects /api/* here.
 *
 * Cold-start note: the Supabase Postgres connection pool (postgres.js) is
 * initialised on first request and reused across warm invocations.
 */

import 'dotenv/config';
import serverless from 'serverless-http';
import { app } from '../../poc/backend/src/app.js';

export const handler = serverless(app, {
  // Tell serverless-http the base path so Express sees the full /api/... path
  request(req: Record<string, unknown>, event: Record<string, unknown>) {
    // Netlify passes the original path in event.path — ensure Express sees it
    if (event.path) {
      req['url'] = event.path as string;
      if (event.queryStringParameters) {
        const qs = new URLSearchParams(
          event.queryStringParameters as Record<string, string>
        ).toString();
        if (qs) req['url'] += `?${qs}`;
      }
    }
  },
});
