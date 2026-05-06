/**
 * db/supabase.ts — Supabase Postgres client for Netlify deployment.
 *
 * Replaces the better-sqlite3 getDb() used in the local SQLite POC.
 * Uses @supabase/supabase-js with the service role key so all server-side
 * operations bypass Row Level Security (appropriate for a backend API).
 *
 * Environment variables required:
 *   SUPABASE_URL              — e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — from Supabase dashboard → Settings → API
 *
 * Usage (async):
 *   import { supabase, sql } from '../db/supabase.js';
 *
 *   // Raw SQL (matches existing parameterised query patterns):
 *   const rows = await sql<MyRow[]>('SELECT * FROM rr_shoutouts WHERE id = $1', [id]);
 *   const row  = await sqlOne<MyRow>('SELECT * FROM rr_shoutouts WHERE id = $1', [id]);
 *   await sqlRun('INSERT INTO rr_shoutouts (...) VALUES ($1, $2)', [a, b]);
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Singleton Supabase client
// ---------------------------------------------------------------------------

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. ' +
      'Get them from your Supabase project → Settings → API.'
    );
  }

  _client = createClient(url, key, {
    auth: {
      // Server-side client — disable auto session refresh / storage
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return _client;
}

// ---------------------------------------------------------------------------
// Raw SQL helpers — thin wrappers around supabase.rpc / postgrest
//
// We use the Supabase REST "rpc" path to run raw SQL via a helper function.
// For maximum compatibility with the existing codebase (which uses
// parameterised queries like `db.prepare(sql).run(arg1, arg2, ...)`),
// we provide three helpers that mirror the better-sqlite3 API semantics:
//
//   sql<T[]>(query, params?)  → T[]        (all rows)
//   sqlOne<T>(query, params?) → T | null    (first row or null)
//   sqlRun(query, params?)    → void        (INSERT / UPDATE / DELETE)
//
// These all call the `exec_sql` Postgres function defined in the migration
// below. If you prefer to use the Supabase table API instead, import
// `getSupabaseClient()` directly.
// ---------------------------------------------------------------------------

/**
 * Execute a raw SELECT and return all rows.
 * Params use $1, $2, ... positional placeholders (Postgres style).
 */
export async function sql<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('exec_sql', { query, params: JSON.stringify(params) });
  if (error) throw new Error(`[supabase sql] ${error.message} — query: ${query}`);
  return (data ?? []) as T[];
}

/**
 * Execute a raw SELECT and return the first row (or null if no match).
 */
export async function sqlOne<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await sql<T>(query, params);
  return rows[0] ?? null;
}

/**
 * Execute a raw INSERT / UPDATE / DELETE (no return value needed).
 */
export async function sqlRun(
  query: string,
  params: unknown[] = []
): Promise<void> {
  await sql(query, params);
}

// ---------------------------------------------------------------------------
// NOTE: The exec_sql RPC function must exist in Supabase.
// Apply this migration in the Supabase dashboard or via MCP apply_migration:
//
//   CREATE OR REPLACE FUNCTION exec_sql(query text, params text DEFAULT '[]')
//   RETURNS jsonb
//   LANGUAGE plpgsql SECURITY DEFINER AS $$
//   DECLARE
//     result jsonb;
//   BEGIN
//     EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', query)
//       INTO result
//       USING params::jsonb;
//     RETURN COALESCE(result, '[]'::jsonb);
//   END;
//   $$;
//
// This is handled by the `exec_sql_helper` migration in this branch.
// ---------------------------------------------------------------------------
