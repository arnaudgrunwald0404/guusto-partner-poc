/**
 * services/employeeResolver.ts — Maps a name string to a CC employee record.
 *
 * STUB IMPLEMENTATION: The employee directory is hardcoded for the hackathon
 * POC. In production, this function would query ClearCompany's actual employee
 * table (or the HR API) using the employee's external ID or name.
 *
 * Matching strategy:
 * - Normalize the extracted name (lowercase, trim, remove punctuation).
 * - For each employee, check if ALL tokens in the extracted name appear in
 *   the employee's full name (case-insensitive).
 * - "John" → matches "John Kim" (first-name-only works).
 * - "John Kim" → matches "John Kim" (full name works).
 * - Threshold: simple token-containment check (no Levenshtein for POC).
 *
 * [ASSUMED] ClearCompany employee directory is not accessible via API during
 * the hackathon. Using a 3-person stub. Replace STUB_EMPLOYEES with a real
 * DB/API call before production.
 */

import { Employee, ResolverResult } from '../types.js';

// ---------------------------------------------------------------------------
// Stub employee directory
// [ASSUMED] Replace this with a real DB query in production.
// ---------------------------------------------------------------------------

export const STUB_EMPLOYEES: Employee[] = [
  {
    id: 'emp_001',
    firstName: 'John',
    lastName: 'Kim',
    email: 'john.kim@demo.com',
    managerId: 'mgr_001',
    managerEmail: 'manager@demo.com',
    managerFirstName: 'Sarah',
  },
  {
    id: 'emp_002',
    firstName: 'Maria',
    lastName: 'Santos',
    email: 'maria.santos@demo.com',
    managerId: 'mgr_001',
    managerEmail: 'manager@demo.com',
    managerFirstName: 'Sarah',
  },
  {
    id: 'emp_003',
    firstName: 'Alex',
    lastName: 'Chen',
    email: 'alex.chen@demo.com',
    managerId: 'mgr_002',
    managerEmail: 'manager2@demo.com',
    managerFirstName: 'David',
  },
  // Managers are also in the directory so they can send shoutouts
  {
    id: 'mgr_001',
    firstName: 'Sarah',
    lastName: 'Park',
    email: 'agrunwald@clearcompany.com',
    managerId: 'exec_001',
    managerEmail: 'exec@demo.com',
    managerFirstName: 'CEO',
  },
  {
    id: 'mgr_002',
    firstName: 'David',
    lastName: 'Lee',
    email: 'david.lee@demo.com',
    managerId: 'exec_001',
    managerEmail: 'exec@demo.com',
    managerFirstName: 'CEO',
  },
];

// ---------------------------------------------------------------------------
// Helper: normalize a name string to lowercase tokens
// ---------------------------------------------------------------------------

/**
 * Strips punctuation, lowercases, and splits into tokens.
 * "John Kim!" → ["john", "kim"]
 */
function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '') // remove punctuation/numbers
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Returns true if ALL tokens in extractedTokens appear in the employee's
 * full name tokens. This lets "John" match "John Kim" while requiring
 * "John Kim" to match exactly (not "John Lee").
 */
function isMatch(extractedTokens: string[], employee: Employee): boolean {
  if (extractedTokens.length === 0) return false;

  const fullNameTokens = tokenize(`${employee.firstName} ${employee.lastName}`);

  // Every token in the extracted name must exist somewhere in the full name
  return extractedTokens.every((token) => fullNameTokens.includes(token));
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Resolves an extracted employee name to a directory entry.
 *
 * @param extractedName - The name string from the Claude classifier.
 * @param directory - Employee list (defaults to STUB_EMPLOYEES for POC).
 * @returns A ResolverResult discriminated union.
 */
export function resolveEmployee(
  extractedName: string,
  directory: Employee[] = STUB_EMPLOYEES
): ResolverResult {
  const tokens = tokenize(extractedName);

  if (tokens.length === 0) {
    return { result: 'not_found' };
  }

  const matches = directory.filter((emp) => isMatch(tokens, emp));

  if (matches.length === 0) {
    return { result: 'not_found' };
  }

  if (matches.length === 1) {
    return { result: 'resolved', employee: matches[0] };
  }

  // Multiple matches — ambiguous; surface all candidates for manual review
  return { result: 'ambiguous', candidates: matches };
}
