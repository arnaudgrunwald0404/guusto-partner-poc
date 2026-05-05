/**
 * services/employeeResolver.ts — Maps a name string to a CC employee record.
 *
 * Now backed by the rr_employees SQLite table (seeded from HRM User Report export).
 * Falls back to STUB_EMPLOYEES for the small set of synthetic demo personas used
 * by the frontend persona switcher (Arnaud, Sarah Chen, etc.).
 *
 * Matching strategy:
 * - Normalize the extracted name (lowercase, trim, remove punctuation).
 * - Check if ALL tokens appear in the employee's full name (case-insensitive).
 * - "Samuel" → matches "Samuel Abramsky" (first-name-only works).
 * - "Samuel Abramsky" → matches exactly.
 */

import { Employee, ResolverResult } from '../types.js';
import { getDb } from '../db/schema.js';

// ---------------------------------------------------------------------------
// DB row shape
// ---------------------------------------------------------------------------

interface EmployeeRow {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  title: string | null;
  department: string | null;
  office: string | null;
  manager_email: string | null;
  manager_name: string | null;
}

// Extended employee with optional frontline delivery fields (kept for compat)
export interface FrontlineEmployee extends Employee {
  isFrontline?: boolean;
  personalEmail?: string;
  personalPhone?: string;
  title?: string;
  department?: string;
  location?: string;
}

// All employees now come from rr_employees — no synthetic stubs needed.
// Export an empty array for backward compatibility with any imports that
// haven't been updated yet (there should be none after unification).
export const STUB_EMPLOYEES: FrontlineEmployee[] = [];

// ---------------------------------------------------------------------------
// Convert a DB row to the Employee interface
// ---------------------------------------------------------------------------

function rowToEmployee(row: EmployeeRow): FrontlineEmployee {
  // Derive managerId from manager_email (use email as stable ID)
  const managerId = row.manager_email ?? 'exec_001';
  // Parse manager first name from manager_name ("First Last" → "First")
  const managerFirstName = row.manager_name?.split(' ')[0] ?? '';

  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    managerId,
    managerEmail: row.manager_email ?? 'exec@clearcompany.com',
    managerFirstName,
    title: row.title ?? undefined,
    department: row.department ?? undefined,
    location: row.office ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Load all employees from DB + synthetic stubs
// ---------------------------------------------------------------------------

export function loadDirectory(): FrontlineEmployee[] {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM rr_employees').all() as EmployeeRow[];
    return [...rows.map(rowToEmployee), ...STUB_EMPLOYEES];
  } catch {
    // DB not yet initialized (e.g. unit tests) — fall back to stubs only
    return STUB_EMPLOYEES;
  }
}

// ---------------------------------------------------------------------------
// Helper: normalize a name string to lowercase tokens
// ---------------------------------------------------------------------------

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function isMatch(extractedTokens: string[], employee: Employee): boolean {
  if (extractedTokens.length === 0) return false;
  const fullNameTokens = tokenize(`${employee.firstName} ${employee.lastName}`);
  return extractedTokens.every((token) => fullNameTokens.includes(token));
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Resolves an extracted employee name to a directory entry.
 *
 * @param extractedName - The name string from the Claude classifier.
 * @param directory - Employee list (loads from DB when omitted).
 */
export function resolveEmployee(
  extractedName: string,
  directory: Employee[] = loadDirectory()
): ResolverResult {
  const tokens = tokenize(extractedName);
  if (tokens.length === 0) return { result: 'not_found' };

  const matches = directory.filter((emp) => isMatch(tokens, emp));
  if (matches.length === 0) return { result: 'not_found' };
  if (matches.length === 1) return { result: 'resolved', employee: matches[0] };
  return { result: 'ambiguous', candidates: matches };
}
