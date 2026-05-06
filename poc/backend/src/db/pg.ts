/**
 * db/pg.ts — Async database layer via Supabase PostgREST RPC.
 *
 * Calls the `pg_query` SECURITY DEFINER function over HTTPS (no direct TCP
 * postgres connection) so the code works inside Netlify Functions where
 * PgBouncer direct connections are unreliable.
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
 * ? placeholders are converted to $1, $2, ... before passing to pg_query(),
 * which substitutes values with quote_literal() for safe binding.
 */

const SUPABASE_URL = process.env['SUPABASE_URL'];
const SUPABASE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'];

function getRpcUrl(): string {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. ' +
      'Add both to your Netlify environment variables.'
    );
  }
  return `${SUPABASE_URL}/rest/v1/rpc/pg_query`;
}

function getHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY!,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Prefer': 'return=representation',
  };
}

/** Convert ? placeholders to $1, $2, ... (Postgres positional params) */
function toPositional(query: string): string {
  let i = 0;
  return query.replace(/\?/g, () => `$${++i}`);
}

/**
 * Execute a SELECT and return all matching rows.
 * Also handles INSERT/UPDATE/DELETE (returns [] for DML).
 */
export async function sqlAll<T extends object = Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await fetch(getRpcUrl(), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      query: toPositional(query),
      params: params,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DB error ${res.status}: ${text} | query: ${query.slice(0, 100)}`);
  }

  const data = await res.json() as unknown;

  // pg_query returns jsonb which PostgREST returns as a JSON value.
  // For SELECT: an array of row objects. For DML: [].
  if (Array.isArray(data)) return data as T[];
  // Sometimes PostgREST wraps a single jsonb return in an object
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
