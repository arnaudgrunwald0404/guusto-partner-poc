/**
 * db/pg.ts — Async database layer for Netlify/Supabase deployment.
 *
 * Uses the Supabase JS client + a SECURITY DEFINER `pg_query` RPC function
 * so that all SQL goes over HTTPS (PostgREST) rather than a direct TCP
 * Postgres connection. This avoids PgBouncer "tenant not found" failures
 * that occur when Netlify Functions attempt a direct pooler connection.
 *
 * Required env vars:
 *   SUPABASE_URL              — e.g. https://wlkpwfmarpuzyuomoopn.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — service role JWT from Supabase dashboard
 *
 * Usage (identical interface to the old better-sqlite3 wrappers):
 *   import { sqlAll, sqlGet, sqlRun } from '../db/pg.js';
 *
 *   const rows = await sqlAll<MyRow>('SELECT * FROM t WHERE id = ?', [id]);
 *   const row  = await sqlGet<MyRow>('SELECT * FROM t WHERE id = ?', [id]);
 *   await sqlRun('INSERT INTO t (a, b) VALUES (?, ?)', [a, b]);
 *
 * Note: ? placeholders are converted to $1, $2, ... before the query is
 * sent to the pg_query() Postgres function, which substitutes values with
 * quote_literal() for safe, type-aware parameter binding.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    const url = process.env['SUPABASE_URL'];
    const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (!url || !key) {
      throw new Error(
        'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. ' +
        'Add both to your Netlify environment variables.'
      );
    }
    _client = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

/** Convert ? placeholders to $1, $2, ... (Postgres positional params) */
function toPositional(query: string): string {
  let i = 0;
  return query.replace(/\?/g, () => `$${++i}`);
}

/**
 * Execute a SELECT and return all matching rows.
 * Also accepts INSERT/UPDATE/DELETE (returns [] for DML).
 */
export async function sqlAll<T extends object = Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  const client = getClient();
  const { data, error } = await client.rpc('pg_query', {
    query: toPositional(query),
    params: params.length > 0 ? params : [],
  });

  if (error) {
    throw new Error(`DB error: ${error.message} | query: ${query.slice(0, 100)}`);
  }

  // pg_query returns jsonb — Supabase JS deserialises it to a JS value.
  // For SELECT it's an array of row objects; for DML it's [].
  if (Array.isArray(data)) return data as T[];
  // Supabase may return the jsonb value already parsed as an object/array
  if (data && typeof data === 'object') return [data] as unknown as T[];
  return [];
}

/** Execute a SELECT and return the first row, or undefined if not found. */
export async function sqlGet<T extends object = Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<T | undefined> {
  const rows = await sqlAll<T>(query, params);
  return rows[0];
}

/** Execute an INSERT, UPDATE, or DELETE (no return value). */
export async function sqlRun(
  query: string,
  params: unknown[] = []
): Promise<void> {
  await sqlAll(query, params);
}

/** Execute multiple statements sequentially (no DB-level transaction for POC). */
export async function sqlTransaction<T>(
  fn: () => Promise<T>
): Promise<T> {
  return fn();
}
