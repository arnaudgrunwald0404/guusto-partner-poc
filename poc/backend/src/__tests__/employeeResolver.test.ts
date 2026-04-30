/**
 * __tests__/employeeResolver.test.ts — Unit tests for the employee resolver.
 *
 * Tests cover: RR-H3 acceptance criteria
 * - "John Kim" → resolved to emp_001
 * - "John" → resolved (first-name-only match)
 * - "Xyz Qrst" → not_found
 * - Two employees named "Alex" → ambiguous
 * - Match is case-insensitive
 * - Similarity threshold: 0.79 is not a match (token mismatch)
 * - Resolved row has all required fields
 */

import { describe, it, expect } from 'vitest';
import { resolveEmployee, STUB_EMPLOYEES } from '../services/employeeResolver.js';
import type { Employee } from '../types.js';

// ---------------------------------------------------------------------------
// Extended directory for ambiguity tests (adds a second "Alex")
// ---------------------------------------------------------------------------

const EXTENDED_DIRECTORY: Employee[] = [
  ...STUB_EMPLOYEES,
  {
    id: 'emp_004',
    firstName: 'Alex',
    lastName: 'Rivera',
    email: 'alex.rivera@demo.com',
    managerId: 'mgr_002',
    managerEmail: 'manager2@demo.com',
    managerFirstName: 'David',
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveEmployee()', () => {
  it('"John Kim" → resolved to emp_001', () => {
    const result = resolveEmployee('John Kim', STUB_EMPLOYEES);

    expect(result.result).toBe('resolved');
    if (result.result === 'resolved') {
      expect(result.employee.id).toBe('emp_001');
      expect(result.employee.firstName).toBe('John');
      expect(result.employee.lastName).toBe('Kim');
    }
  });

  it('"John" (first name only) → resolved to emp_001', () => {
    const result = resolveEmployee('John', STUB_EMPLOYEES);

    expect(result.result).toBe('resolved');
    if (result.result === 'resolved') {
      expect(result.employee.id).toBe('emp_001');
    }
  });

  it('"Maria Santos" → resolved to emp_002', () => {
    const result = resolveEmployee('Maria Santos', STUB_EMPLOYEES);

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

  it('"Alex" with two Alex employees → ambiguous', () => {
    const result = resolveEmployee('Alex', EXTENDED_DIRECTORY);

    expect(result.result).toBe('ambiguous');
    if (result.result === 'ambiguous') {
      expect(result.candidates.length).toBe(2);
      const ids = result.candidates.map((c) => c.id);
      expect(ids).toContain('emp_003'); // Alex Chen
      expect(ids).toContain('emp_004'); // Alex Rivera
    }
  });

  it('match is case-insensitive — "john kim" → resolved', () => {
    const result = resolveEmployee('john kim', STUB_EMPLOYEES);

    expect(result.result).toBe('resolved');
    if (result.result === 'resolved') {
      expect(result.employee.id).toBe('emp_001');
    }
  });

  it('match is case-insensitive — "MARIA" → resolved', () => {
    const result = resolveEmployee('MARIA', STUB_EMPLOYEES);

    expect(result.result).toBe('resolved');
    if (result.result === 'resolved') {
      expect(result.employee.id).toBe('emp_002');
    }
  });

  it('name with punctuation is normalized — "John Kim!" → resolved', () => {
    const result = resolveEmployee('John Kim!', STUB_EMPLOYEES);

    expect(result.result).toBe('resolved');
    if (result.result === 'resolved') {
      expect(result.employee.id).toBe('emp_001');
    }
  });

  it('wrong last name → not_found (threshold boundary: "John Lee" does not match "John Kim")', () => {
    // "John Lee" has tokens ["john", "lee"] — "lee" is not in "john kim"
    // so it should NOT match, even though "john" matches
    const result = resolveEmployee('John Lee', STUB_EMPLOYEES);
    expect(result.result).toBe('not_found');
  });

  it('resolved result has all required fields', () => {
    const result = resolveEmployee('Alex Chen', STUB_EMPLOYEES);

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
    const result = resolveEmployee('Alex', EXTENDED_DIRECTORY);

    if (result.result === 'ambiguous') {
      for (const candidate of result.candidates) {
        expect(candidate.id).toBeTruthy();
        expect(candidate.email).toBeTruthy();
        expect(candidate.managerId).toBeTruthy();
      }
    }
  });
});
