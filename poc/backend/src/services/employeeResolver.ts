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
 * - "Samuel" → matches "Samuel Abramsky" (first-name-only works).
 * - "Samuel Abramsky" → matches exactly.
 * - Threshold: simple token-containment check (no Levenshtein for POC).
 *
 * Employee roster sourced from W2 DOB_DOH.xlsx census (April 2026).
 * Emails follow the agrunwald+N@clearcompany.com demo pattern.
 * Hire dates are real; DOB years are masked so not stored here.
 *
 * [ASSUMED] ClearCompany employee directory is not accessible via API during
 * the hackathon. Replace STUB_EMPLOYEES with a real DB/API call before
 * production.
 */

import { Employee, ResolverResult } from '../types.js';

// ---------------------------------------------------------------------------
// Stub employee directory
// [ASSUMED] Replace this with a real DB query in production.
// ---------------------------------------------------------------------------

// Extended employee with optional frontline delivery fields
export interface FrontlineEmployee extends Employee {
  isFrontline?: boolean;
  personalEmail?: string;
  personalPhone?: string;
  title?: string;
  department?: string;
  location?: string;
}

export const STUB_EMPLOYEES: FrontlineEmployee[] = [
  // ── Managers ──────────────────────────────────────────────────────────────
  {
    id: 'mgr_001',
    firstName: 'Rachael',
    lastName: 'Alpert',
    email: 'agrunwald@clearcompany.com',
    managerId: 'exec_001',
    managerEmail: 'exec@clearcompany.com',
    managerFirstName: 'CEO',
    title: 'VP Customer Success',
    department: 'Customer Success',
    location: 'Philadelphia, PA',
  },
  {
    id: 'mgr_002',
    firstName: 'David',
    lastName: 'Almeida',
    email: 'agrunwald+1@clearcompany.com',
    managerId: 'exec_001',
    managerEmail: 'exec@clearcompany.com',
    managerFirstName: 'CEO',
    title: 'Director of Engineering',
    department: 'Engineering',
    location: 'Austin, TX',
  },
  {
    id: 'mgr_003',
    firstName: 'Thomas',
    lastName: 'Badeen',
    email: 'agrunwald+2@clearcompany.com',
    managerId: 'exec_001',
    managerEmail: 'exec@clearcompany.com',
    managerFirstName: 'CEO',
    title: 'Sales Manager',
    department: 'Sales',
    location: 'Chicago, IL',
  },
  {
    id: 'mgr_004',
    firstName: 'Abigail',
    lastName: 'Anderson',
    email: 'agrunwald+3@clearcompany.com',
    managerId: 'exec_001',
    managerEmail: 'exec@clearcompany.com',
    managerFirstName: 'CEO',
    title: 'HR & Operations Manager',
    department: 'People Operations',
    location: 'New York, NY',
  },

  // ── Customer Success (reports to Rachael Alpert / mgr_001) ───────────────
  {
    id: 'emp_001',
    firstName: 'Samuel',
    lastName: 'Abramsky',
    email: 'agrunwald+4@clearcompany.com',
    managerId: 'mgr_001',
    managerEmail: 'agrunwald@clearcompany.com',
    managerFirstName: 'Rachael',
    title: 'Customer Success Specialist',
    department: 'Customer Success',
    location: 'New York, NY',
    isFrontline: true,
    personalEmail: 'samuel.abramsky@gmail.com',
    personalPhone: '+1-212-555-0147',
  },
  {
    id: 'emp_002',
    firstName: 'Jordan',
    lastName: 'Beaman',
    email: 'agrunwald+5@clearcompany.com',
    managerId: 'mgr_001',
    managerEmail: 'agrunwald@clearcompany.com',
    managerFirstName: 'Rachael',
    title: 'Implementation Manager',
    department: 'Customer Success',
    location: 'Austin, TX',
    isFrontline: true,
    personalEmail: 'jordan.beaman@gmail.com',
    personalPhone: '+1-512-555-0283',
  },
  {
    id: 'emp_003',
    firstName: 'Maddy',
    lastName: 'Bender',
    email: 'agrunwald+6@clearcompany.com',
    managerId: 'mgr_001',
    managerEmail: 'agrunwald@clearcompany.com',
    managerFirstName: 'Rachael',
    title: 'Customer Success Manager',
    department: 'Customer Success',
    location: 'Chicago, IL',
  },
  {
    id: 'emp_004',
    firstName: 'Colin',
    lastName: 'Beverstock',
    email: 'agrunwald+7@clearcompany.com',
    managerId: 'mgr_001',
    managerEmail: 'agrunwald@clearcompany.com',
    managerFirstName: 'Rachael',
    title: 'Senior Customer Success Manager',
    department: 'Customer Success',
    location: 'San Francisco, CA',
  },

  // ── Engineering (reports to David Almeida / mgr_002) ─────────────────────
  {
    id: 'emp_005',
    firstName: 'Eddie',
    lastName: 'Amori',
    email: 'agrunwald+8@clearcompany.com',
    managerId: 'mgr_002',
    managerEmail: 'agrunwald+1@clearcompany.com',
    managerFirstName: 'David',
    title: 'Software Engineer',
    department: 'Engineering',
    location: 'Remote',
  },
  {
    id: 'emp_006',
    firstName: 'Jake',
    lastName: 'Axsom',
    email: 'agrunwald+9@clearcompany.com',
    managerId: 'mgr_002',
    managerEmail: 'agrunwald+1@clearcompany.com',
    managerFirstName: 'David',
    title: 'Associate Software Engineer',
    department: 'Engineering',
    location: 'Denver, CO',
  },
  {
    id: 'emp_007',
    firstName: 'Melanie',
    lastName: 'Baravik',
    email: 'agrunwald+10@clearcompany.com',
    managerId: 'mgr_002',
    managerEmail: 'agrunwald+1@clearcompany.com',
    managerFirstName: 'David',
    title: 'Product Manager',
    department: 'Engineering',
    location: 'Boston, MA',
  },

  // ── Sales (reports to Thomas Badeen / mgr_003) ───────────────────────────
  {
    id: 'emp_008',
    firstName: 'Lorraine',
    lastName: 'Alexus',
    email: 'agrunwald+11@clearcompany.com',
    managerId: 'mgr_003',
    managerEmail: 'agrunwald+2@clearcompany.com',
    managerFirstName: 'Thomas',
    title: 'Account Executive',
    department: 'Sales',
    location: 'Atlanta, GA',
    isFrontline: true,
    personalEmail: 'lorraine.alexus@gmail.com',
    personalPhone: '+1-404-555-0319',
  },
  {
    id: 'emp_009',
    firstName: 'Jeremy',
    lastName: 'Allen',
    email: 'agrunwald+12@clearcompany.com',
    managerId: 'mgr_003',
    managerEmail: 'agrunwald+2@clearcompany.com',
    managerFirstName: 'Thomas',
    title: 'Senior Account Executive',
    department: 'Sales',
    location: 'Dallas, TX',
  },
  {
    id: 'emp_010',
    firstName: 'Daironex',
    lastName: 'Batista',
    email: 'agrunwald+13@clearcompany.com',
    managerId: 'mgr_003',
    managerEmail: 'agrunwald+2@clearcompany.com',
    managerFirstName: 'Thomas',
    title: 'Sales Development Representative',
    department: 'Sales',
    location: 'Miami, FL',
    isFrontline: true,
    personalEmail: 'daironex.batista@gmail.com',
    personalPhone: '+1-305-555-0462',
  },

  // ── Demo personas (used by web-clearcompany frontend persona switcher) ────
  {
    id: 'arnaud',
    firstName: 'Arnaud',
    lastName: 'G',
    email: 'agrunwald@clearcompany.com',
    managerId: 'exec_001',   // exec level — peers are all 4 dept managers
    managerEmail: 'exec@clearcompany.com',
    managerFirstName: 'CEO',
    title: 'Head of Product & Design',
    department: 'Product',
    location: 'Philadelphia, PA',
  },
  {
    id: 'sarah',
    firstName: 'Sarah',
    lastName: 'Chen',
    email: 'sarah.chen@clearcompany.com',
    managerId: 'mgr_002',    // reports to David Almeida — Engineering team
    managerEmail: 'agrunwald+1@clearcompany.com',
    managerFirstName: 'David',
    title: 'Customer Success Manager',
    department: 'Engineering',
    location: 'New York, NY',
  },

  // ── People Operations (reports to Abigail Anderson / mgr_004) ────────────
  {
    id: 'emp_011',
    firstName: 'Gilbert',
    lastName: 'Apodaca',
    email: 'agrunwald+14@clearcompany.com',
    managerId: 'mgr_004',
    managerEmail: 'agrunwald+3@clearcompany.com',
    managerFirstName: 'Abigail',
    title: 'HR Business Partner',
    department: 'People Operations',
    location: 'Phoenix, AZ',
  },
  {
    id: 'emp_012',
    firstName: 'Kaya',
    lastName: 'Adams',
    email: 'agrunwald+15@clearcompany.com',
    managerId: 'mgr_004',
    managerEmail: 'agrunwald+3@clearcompany.com',
    managerFirstName: 'Abigail',
    title: 'Talent Acquisition Specialist',
    department: 'People Operations',
    location: 'Seattle, WA',
  },
];

// ---------------------------------------------------------------------------
// Helper: normalize a name string to lowercase tokens
// ---------------------------------------------------------------------------

/**
 * Strips punctuation, lowercases, and splits into tokens.
 * "Samuel Abramsky!" → ["samuel", "abramsky"]
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
 * full name tokens. This lets "Samuel" match "Samuel Abramsky" while
 * requiring "Samuel Abramsky" to match exactly (not "Samuel Kim").
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
