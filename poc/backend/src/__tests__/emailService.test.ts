/**
 * __tests__/emailService.test.ts — Unit tests for emailService.ts
 *
 * Mocks the Resend SDK so no real HTTP calls are made.
 *
 * Tests cover:
 * - sendApprovalEmail calls Resend with correct from/to
 * - HTML contains the evidence quote
 * - HTML contains approve and dismiss URLs
 * - HTML contains "$25 reward" text
 * - sendFailureEmail sends to the correct address
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Resend SDK before importing the service
// ---------------------------------------------------------------------------

const mockSendFn = vi.fn();

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: mockSendFn,
    },
  })),
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import {
  sendApprovalEmail,
  sendFailureEmail,
  sendIdentifyEmail,
  sendRecognitionNotificationEmail,
} from '../services/emailService.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockSendFn.mockReset();
  // Default: simulate a successful Resend response
  mockSendFn.mockResolvedValue({ data: { id: 'email-001' }, error: null });

  // Set env vars for predictable from/to in tests
  process.env.RESEND_FROM_EMAIL = 'rewards@info.tacticalsync.com';
  process.env.RESEND_API_KEY = 'test-key';
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const BASE_PARAMS = {
  employeeFirstName: 'John',
  employeeLastName: 'Johnson',
  managerEmail: 'manager@example.com',
  evidenceQuote: "He's the best support engineer we've ever worked with.",
  recognitionDraft: "John — a customer told us today: \"He's the best support engineer we've ever worked with.\" Thank you.",
  approveUrl: 'http://localhost:3001/api/rr/approve?token=abc123',
  editUrl: 'http://localhost:3001/api/rr/approve?token=abc123&edit=1',
  dismissUrl: 'http://localhost:3001/api/rr/dismiss?token=abc123',
};

describe('sendApprovalEmail', () => {
  it('calls Resend with the correct from address', async () => {
    await sendApprovalEmail(BASE_PARAMS);

    expect(mockSendFn).toHaveBeenCalledOnce();
    const arg = mockSendFn.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.from).toBe('rewards@info.tacticalsync.com');
  });

  it('calls Resend with the correct to address', async () => {
    await sendApprovalEmail(BASE_PARAMS);

    const arg = mockSendFn.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.to).toBe('manager@example.com');
  });

  it('includes the evidence quote in the HTML body', async () => {
    await sendApprovalEmail(BASE_PARAMS);

    const arg = mockSendFn.mock.calls[0][0] as Record<string, string>;
    // Single quotes are not HTML-escaped (only &, <, >, " are); check for the literal text
    expect(arg.html).toContain("He's the best support engineer we've ever worked with.");
  });

  it('includes the approve URL as an href in the HTML body', async () => {
    await sendApprovalEmail(BASE_PARAMS);

    const arg = mockSendFn.mock.calls[0][0] as Record<string, string>;
    expect(arg.html).toContain('http://localhost:3001/api/rr/approve?token=abc123');
  });

  it('includes the dismiss URL as an href in the HTML body', async () => {
    await sendApprovalEmail(BASE_PARAMS);

    const arg = mockSendFn.mock.calls[0][0] as Record<string, string>;
    expect(arg.html).toContain('http://localhost:3001/api/rr/dismiss?token=abc123');
  });

  it('includes "$25 reward" text in the HTML body', async () => {
    await sendApprovalEmail(BASE_PARAMS);

    const arg = mockSendFn.mock.calls[0][0] as Record<string, string>;
    expect(arg.html).toContain('$25 reward');
  });

  it('throws when Resend returns an error', async () => {
    mockSendFn.mockResolvedValue({ data: null, error: { message: 'rate limited' } });

    await expect(sendApprovalEmail(BASE_PARAMS)).rejects.toThrow(
      'Failed to send approval email'
    );
  });
});

describe('sendFailureEmail', () => {
  it('sends to the correct manager address', async () => {
    await sendFailureEmail({ managerEmail: 'manager@example.com', employeeFirstName: 'John', employeeLastName: 'Johnson' });

    expect(mockSendFn).toHaveBeenCalledOnce();
    const arg = mockSendFn.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.to).toBe('manager@example.com');
  });

  it('includes the employee first name in the subject', async () => {
    await sendFailureEmail({ managerEmail: 'manager@example.com', employeeFirstName: 'John', employeeLastName: 'Johnson' });

    const arg = mockSendFn.mock.calls[0][0] as Record<string, string>;
    expect(arg.subject).toContain('John');
  });

  it('sends from the configured RESEND_FROM_EMAIL address', async () => {
    await sendFailureEmail({ managerEmail: 'manager@example.com', employeeFirstName: 'John', employeeLastName: 'Johnson' });

    const arg = mockSendFn.mock.calls[0][0] as Record<string, string>;
    expect(arg.from).toBe('rewards@info.tacticalsync.com');
  });

  it('throws when Resend returns an error', async () => {
    mockSendFn.mockResolvedValue({ data: null, error: { message: 'quota exceeded' } });

    await expect(
      sendFailureEmail({ managerEmail: 'manager@example.com', employeeFirstName: 'John', employeeLastName: 'Johnson' })
    ).rejects.toThrow('Failed to send failure email');
  });
});

describe('sendIdentifyEmail', () => {
  const IDENTIFY_PARAMS = {
    managerEmail: 'manager@example.com',
    detectedName: 'Johnny',
    evidenceQuote: 'This person was incredible.',
    candidates: [
      { id: 'emp-001', firstName: 'John', lastName: 'Smith', email: 'john@demo.com', managerId: 'mgr-001', managerEmail: 'manager@example.com', managerFirstName: 'Bob', isFrontline: false, hireDate: '2020-01-01' },
    ],
    baseUrl: 'http://localhost:3001',
    token: 'identify-token-abc',
  };

  it('sends to the manager email', async () => {
    await sendIdentifyEmail(IDENTIFY_PARAMS);

    const arg = mockSendFn.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.to).toBe('manager@example.com');
  });

  it('HTML contains the evidence quote', async () => {
    await sendIdentifyEmail(IDENTIFY_PARAMS);

    const arg = mockSendFn.mock.calls[0][0] as Record<string, string>;
    expect(arg.html).toContain('This person was incredible.');
  });

  it('HTML contains candidate employee name with identify link', async () => {
    await sendIdentifyEmail(IDENTIFY_PARAMS);

    const arg = mockSendFn.mock.calls[0][0] as Record<string, string>;
    expect(arg.html).toContain('John');
    expect(arg.html).toContain('identify-token-abc');
  });

  it('HTML contains detected name', async () => {
    await sendIdentifyEmail(IDENTIFY_PARAMS);

    const arg = mockSendFn.mock.calls[0][0] as Record<string, string>;
    expect(arg.html).toContain('Johnny');
  });

  it('throws when Resend returns an error', async () => {
    mockSendFn.mockResolvedValue({ data: null, error: { message: 'rate limit' } });

    await expect(sendIdentifyEmail(IDENTIFY_PARAMS)).rejects.toThrow('Failed to send identify email');
  });

  it('includes callTitle when provided', async () => {
    await sendIdentifyEmail({ ...IDENTIFY_PARAMS, callTitle: 'Call with Acme Corp' });

    const arg = mockSendFn.mock.calls[0][0] as Record<string, string>;
    expect(arg.html).toContain('Acme Corp');
  });
});

describe('sendRecognitionNotificationEmail', () => {
  const NOTIFICATION_PARAMS = {
    recipientFirstName: 'Jane',
    recipientEmail: 'jane@demo.com',
    senderName: 'Bob Manager',
    message: 'You did fantastic work this sprint!',
    valueLabels: ['Innovation', 'Customer Focus'],
    profileUrl: 'http://localhost:5173/employee/jane',
    hasGift: true,
    giftAmountCents: 2500,
  };

  it('sends to the recipient email', async () => {
    await sendRecognitionNotificationEmail(NOTIFICATION_PARAMS);

    const arg = mockSendFn.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.to).toBe('jane@demo.com');
  });

  it('subject mentions sender name', async () => {
    await sendRecognitionNotificationEmail(NOTIFICATION_PARAMS);

    const arg = mockSendFn.mock.calls[0][0] as Record<string, string>;
    expect(arg.subject).toContain('Bob Manager');
  });

  it('HTML contains the recognition message', async () => {
    await sendRecognitionNotificationEmail(NOTIFICATION_PARAMS);

    const arg = mockSendFn.mock.calls[0][0] as Record<string, string>;
    expect(arg.html).toContain('fantastic work');
  });

  it('HTML includes gift badge when hasGift is true', async () => {
    await sendRecognitionNotificationEmail(NOTIFICATION_PARAMS);

    const arg = mockSendFn.mock.calls[0][0] as Record<string, string>;
    expect(arg.html).toContain('$25');
  });

  it('HTML does not include gift badge when hasGift is false', async () => {
    await sendRecognitionNotificationEmail({ ...NOTIFICATION_PARAMS, hasGift: false });

    const arg = mockSendFn.mock.calls[0][0] as Record<string, string>;
    expect(arg.html).not.toContain('gift card is on its way');
  });

  it('swallows Resend error (non-fatal) without throwing', async () => {
    mockSendFn.mockResolvedValue({ data: null, error: { message: 'quota' } });

    await expect(sendRecognitionNotificationEmail(NOTIFICATION_PARAMS)).resolves.not.toThrow();
  });

  it('HTML contains profile URL', async () => {
    await sendRecognitionNotificationEmail(NOTIFICATION_PARAMS);

    const arg = mockSendFn.mock.calls[0][0] as Record<string, string>;
    expect(arg.html).toContain('http://localhost:5173/employee/jane');
  });
});
