/**
 * __tests__/employeeResolver.test.ts — Unit tests for the employee resolver.
 *
 * Tests cover: RR-H3 acceptance criteria
 * - "Samuel Abramsky" → resolved to emp_001
 * - "Samuel" → resolved (first-name-only match)
 * - "Xyz Qrst" → not_found
 * - Two employees named "Jordan" → ambiguous (using extended directory)
 * - Match is case-insensitive
 * - Similarity threshold: wrong last name does not match
 * - Resolved row has all required fields
 */

import { describe, it, expect } from 'vitest';
import { resolveEmployee } from '../services/employeeResolver.js';
import type { Employee } from '../types.js';

// ---------------------------------------------------------------------------
// Self-contained test directory — independent of DB or STUB_EMPLOYEES
// ---------------------------------------------------------------------------

const STUB_EMPLOYEES: Employee[] = [
  {
    id: 'emp_001',
    firstName: 'Samuel',
    lastName: 'Abramsky',
    email: 'samuel@clearcompany.com',
    managerId: 'mgr_001',
    managerEmail: 'rachael@clearcompany.com',
    managerFirstName: 'Rachael',
  },
  {
    id: 'emp_002',
    firstName: 'Jordan',
    lastName: 'Beaman',
    email: 'jordan@clearcompany.com',
    managerId: 'mgr_001',
    managerEmail: 'rachael@clearcompany.com',
    managerFirstName: 'Rachael',
  },
  {
    id: 'emp_003',
    firstName: 'Maddy',
    lastName: 'Bender',
    email: 'maddy@clearcompany.com',
    managerId: 'mgr_002',
    managerEmail: 'david@clearcompany.com',
    managerFirstName: 'David',
  },
];

const EXTENDED_DIRECTORY: Employee[] = [
  ...STUB_EMPLOYEES,
  {
    id: 'emp_099',
    firstName: 'Samuel',
    lastName: 'Rivera',
    email: 'agrunwald+99@clearcompany.com',
    managerId: 'mgr_002',
    managerEmail: 'david@clearcompany.com',
    managerFirstName: 'David',
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveEmployee()', () => {
  it('"Samuel Abramsky" → resolved to emp_001', () => {
    const result = resolveEmployee('Samuel Abramsky', STUB_EMPLOYEES);

    expect(result.result).toBe('resolved');
    if (result.result === 'resolved') {
      expect(result.employee.id).toBe('emp_001');
      expect(result.employee.firstName).toBe('Samuel');
      expect(result.employee.lastName).toBe('Abramsky');
    }
  });

  it('"Samuel" (first name only) → resolved to emp_001', () => {
    const result = resolveEmployee('Samuel', STUB_EMPLOYEES);

    expect(result.result).toBe('resolved');
    if (result.result === 'resolved') {
      expect(result.employee.id).toBe('emp_001');
    }
  });

  it('"Jordan Beaman" → resolved to emp_002', () => {
    const result = resolveEmployee('Jordan Beaman', STUB_EMPLOYEES);

    expect(result.result).toBe('resolved');
    if (result.result === 'resolved') {
      expect(result.employee.id).toBe('emp_002');
    }
  });

  it('"Xyz Qrst" → not_found', () => {
    const result = resolveEmployee('Xyz Qrst', STUB_EMPLOYEES);
    expect(result.result).toBe('not_found');
  });

  it('empty string → not_found', () => {
    const result = resolveEmployee('', STUB_EMPLOYEES);
    expect(result.result).toBe('not_found');
  });

  it('"Samuel" with two Samuel employees → ambiguous', () => {
    const result = resolveEmployee('Samuel', EXTENDED_DIRECTORY);

    expect(result.result).toBe('ambiguous');
    if (result.result === 'ambiguous') {
      expect(result.candidates.length).toBe(2);
      const ids = result.candidates.map((c) => c.id);
      expect(ids).toContain('emp_001'); // Samuel Abramsky
      expect(ids).toContain('emp_099'); // Samuel Rivera
    }
  });

  it('match is case-insensitive — "samuel abramsky" → resolved', () => {
    const result = resolveEmployee('samuel abramsky', STUB_EMPLOYEES);

    expect(result.result).toBe('resolved');
    if (result.result === 'resolved') {
      expect(result.employee.id).toBe('emp_001');
    }
  });

  it('match is case-insensitive — "JORDAN" → resolved', () => {
    const result = resolveEmployee('JORDAN', STUB_EMPLOYEES);

    expect(result.result).toBe('resolved');
    if (result.result === 'resolved') {
      expect(result.employee.id).toBe('emp_002');
    }
  });

  it('name with punctuation is normalized — "Samuel Abramsky!" → resolved', () => {
    const result = resolveEmployee('Samuel Abramsky!', STUB_EMPLOYEES);

    expect(result.result).toBe('resolved');
    if (result.result === 'resolved') {
      expect(result.employee.id).toBe('emp_001');
    }
  });

  it('wrong last name → not_found (threshold boundary: "Samuel Lee" does not match "Samuel Abramsky")', () => {
    // "Samuel Lee" has tokens ["samuel", "lee"] — "lee" is not in "samuel abramsky"
    // so it should NOT match, even though "samuel" matches
    const result = resolveEmployee('Samuel Lee', STUB_EMPLOYEES);
    expect(result.result).toBe('not_found');
  });

  it('resolved result has all required fields', () => {
    const result = resolveEmployee('Maddy Bender', STUB_EMPLOYEES);

    expect(result.result).toBe('resolved');
    if (result.result === 'resolved') {
      const { employee } = result;
      expect(employee.id).toBeTruthy();
      expect(employee.firstName).toBeTruthy();
      expect(employee.lastName).toBeTruthy();
      expect(employee.email).toBeTruthy();
      expect(employee.managerId).toBeTruthy();
      expect(employee.managerEmail).toBeTruthy();
      expect(employee.managerFirstName).toBeTruthy();
    }
  });

  it('ambiguous result exposes all candidates with required fields', () => {
    const result = resolveEmployee('Samuel', EXTENDED_DIRECTORY);

    if (result.result === 'ambiguous') {
      for (const candidate of result.candidates) {
        expect(candidate.id).toBeTruthy();
        expect(candidate.email).toBeTruthy();
        expect(candidate.managerId).toBeTruthy();
      }
    }
  });
});
