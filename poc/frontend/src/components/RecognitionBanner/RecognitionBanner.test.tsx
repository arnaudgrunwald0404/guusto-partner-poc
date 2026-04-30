import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecognitionBanner } from './RecognitionBanner';
import type { RecognitionStatus } from '../../types';

// Mock the polling hook — we use demoData prop to bypass it in tests
vi.mock('../../hooks/useRecognitionStatus', () => ({
  useRecognitionStatus: vi.fn(() => ({ data: null, isLoading: false, error: null })),
}));

const BASE_DATA: RecognitionStatus = {
  status: 'pending',
  employee_first_name: 'John',
  manager_first_name: 'Sarah',
  evidence_quote: 'He is the best support engineer we have ever worked with.',
  amount_cents: 2500,
  currency: 'USD',
};

describe('RecognitionBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when featureFlag=false', () => {
    const { container } = render(
      <RecognitionBanner
        employeeId="emp-1"
        featureFlag={false}
        demoData={{ ...BASE_DATA }}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when status is null', () => {
    const { container } = render(
      <RecognitionBanner
        employeeId="emp-1"
        featureFlag={true}
        demoData={{ ...BASE_DATA, status: null }}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  describe('pending state', () => {
    const pendingData: RecognitionStatus = { ...BASE_DATA, status: 'pending' };

    it('renders pending headline with employee name', () => {
      render(<RecognitionBanner employeeId="emp-1" demoData={pendingData} />);
      expect(
        screen.getByText('Recognition in progress — reward sending to John')
      ).toBeInTheDocument();
    });

    it('renders pending body with employee name', () => {
      render(<RecognitionBanner employeeId="emp-1" demoData={pendingData} />);
      expect(
        screen.getByText(
          "A $25 reward is on its way to John's inbox. This usually takes under 2 minutes."
        )
      ).toBeInTheDocument();
    });

    it('renders spinner with correct aria-label', () => {
      render(<RecognitionBanner employeeId="emp-1" demoData={pendingData} />);
      expect(screen.getByRole('img', { name: 'Recognition sending' })).toBeInTheDocument();
    });
  });

  describe('delivered state', () => {
    it('renders delivered headline with employee name', () => {
      const deliveredData: RecognitionStatus = { ...BASE_DATA, status: 'delivered' };
      render(<RecognitionBanner employeeId="emp-1" demoData={deliveredData} />);
      expect(
        screen.getByText('John was recognized for exceptional customer feedback')
      ).toBeInTheDocument();
    });

    it('renders sub-body with manager name', () => {
      const deliveredData: RecognitionStatus = { ...BASE_DATA, status: 'delivered' };
      render(<RecognitionBanner employeeId="emp-1" demoData={deliveredData} />);
      expect(
        screen.getByText('$25 reward sent · Recognized by Sarah')
      ).toBeInTheDocument();
    });

    it('truncates evidence_quote longer than 120 chars with ellipsis', () => {
      const longQuote = 'A'.repeat(130);
      const deliveredData: RecognitionStatus = {
        ...BASE_DATA,
        status: 'delivered',
        evidence_quote: longQuote,
      };
      render(<RecognitionBanner employeeId="emp-1" demoData={deliveredData} />);
      const blockquote = document.querySelector('blockquote');
      expect(blockquote).not.toBeNull();
      // Should be truncated: 1 (") + 120 chars + … + 1 (") = 123 chars in the string displayed
      expect(blockquote!.textContent).toContain('…');
      // The displayed quote body (without surrounding quotes) should be 120 chars
      const inner = blockquote!.textContent!.slice(1, -2); // strip leading " and trailing …"
      expect(inner.length).toBeLessThanOrEqual(120);
    });

    it('does not truncate evidence_quote of exactly 120 chars', () => {
      const exactQuote = 'B'.repeat(120);
      const deliveredData: RecognitionStatus = {
        ...BASE_DATA,
        status: 'delivered',
        evidence_quote: exactQuote,
      };
      render(<RecognitionBanner employeeId="emp-1" demoData={deliveredData} />);
      const blockquote = document.querySelector('blockquote');
      expect(blockquote!.textContent).not.toContain('…');
    });

    it('wraps quote in a blockquote element', () => {
      const deliveredData: RecognitionStatus = { ...BASE_DATA, status: 'delivered' };
      render(<RecognitionBanner employeeId="emp-1" demoData={deliveredData} />);
      expect(document.querySelector('blockquote')).not.toBeNull();
    });
  });

  describe('failed state', () => {
    const failedData: RecognitionStatus = { ...BASE_DATA, status: 'failed' };

    it('renders failed headline', () => {
      render(<RecognitionBanner employeeId="emp-1" demoData={failedData} />);
      expect(
        screen.getByText('Recognition reward failed to deliver')
      ).toBeInTheDocument();
    });

    it('renders failed body with employee name twice', () => {
      render(<RecognitionBanner employeeId="emp-1" demoData={failedData} />);
      expect(
        screen.getByText(
          "Something went wrong sending John's $25 reward. No funds were charged. Please contact support or try recognizing John manually."
        )
      ).toBeInTheDocument();
    });
  });

  describe('AI-detected tag', () => {
    it('is present in pending state', () => {
      render(<RecognitionBanner employeeId="emp-1" demoData={{ ...BASE_DATA, status: 'pending' }} />);
      expect(screen.getByText('AI-detected')).toBeInTheDocument();
    });

    it('is present in delivered state', () => {
      render(<RecognitionBanner employeeId="emp-1" demoData={{ ...BASE_DATA, status: 'delivered' }} />);
      expect(screen.getByText('AI-detected')).toBeInTheDocument();
    });

    it('is present in failed state', () => {
      render(<RecognitionBanner employeeId="emp-1" demoData={{ ...BASE_DATA, status: 'failed' }} />);
      expect(screen.getByText('AI-detected')).toBeInTheDocument();
    });

    it('has correct title tooltip mentioning manager name', () => {
      render(<RecognitionBanner employeeId="emp-1" demoData={{ ...BASE_DATA, status: 'pending' }} />);
      const tag = screen.getByText('AI-detected');
      expect(tag.getAttribute('title')).toContain('Sarah');
      expect(tag.getAttribute('title')).toContain('ClearCompany AI');
    });
  });

  describe('accessibility', () => {
    it('has role="status" on banner wrapper', () => {
      render(<RecognitionBanner employeeId="emp-1" demoData={{ ...BASE_DATA, status: 'pending' }} />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('has aria-live="polite" on banner wrapper', () => {
      render(<RecognitionBanner employeeId="emp-1" demoData={{ ...BASE_DATA, status: 'pending' }} />);
      const banner = screen.getByRole('status');
      expect(banner.getAttribute('aria-live')).toBe('polite');
    });
  });
});
