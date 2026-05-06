/**
 * db/pg.ts — Async Postgres client for Netlify/Supabase deployment.
 *
 * Drop-in async replacement for better-sqlite3's synchronous getDb().
 * Uses the `postgres` npm package (postgres.js) with the Supabase
 * transaction pooler connection string.
 *
 * Required env var: DATABASE_URL
 *   Format: postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
 *   Get it from: Supabase dashboard → Settings → Database → Connection string → Transaction pooler
 *
 * Usage:
 *   import { sqlAll, sqlGet, sqlRun } from '../db/pg.js';
 *
 *   const rows = await sqlAll<MyRow>('SELECT * FROM t WHERE manager_id = ?', [managerId]);
 *   const row  = await sqlGet<MyRow>('SELECT * FROM t WHERE id = ?', [id]);
 *   await sqlRun('INSERT INTO t (a, b) VALUES (?, ?)', [a, b]);
 *
 * Note: ? placeholders are automatically converted to $1, $2, ... (Postgres style).
 */

import postgres from 'postgres';

let _client: ReturnType<typeof postgres> | null = null;

function getClient(): ReturnType<typeof postgres> {
  if (!_client) {
    const url = process.env['DATABASE_URL'];
    if (!url) {
      throw new Error(
        'DATABASE_URL is not set. ' +
        'Get it from Supabase dashboard → Settings → Database → Connection string → Transaction pooler'
      );
    }
    _client = postgres(url, { ssl: 'require', max: 5 });
  }
  return _client;
}

/** Convert ? placeholders to $1, $2, ... (Postgres positional params) */
function toPositional(query: string): string {
  let i = 0;
  return query.replace(/\?/g, () => `$${++i}`);
}

/** Execute a SELECT and return all matching rows. */
export async function sqlAll<T extends Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  const sql = getClient();
  return sql.unsafe(toPositional(query), params as never[]) as unknown as T[];
}

/** Execute a SELECT and return the first row, or undefined if not found. */
export async function sqlGet<T extends Record<string, unknown>>(
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
  const sql = getClient();
  await sql.unsafe(toPositional(query), params as never[]);
}

/** Execute multiple statements in a transaction (sequential awaits). */
export async function sqlTransaction<T>(
  fn: () => Promise<T>
): Promise<T> {
  // For the POC: runs statements sequentially without explicit DB transaction.
  // For production, use: sql.begin(async sql => { ... })
  return fn();
}
