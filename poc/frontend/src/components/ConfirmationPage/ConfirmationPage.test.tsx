import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfirmationPage } from './ConfirmationPage';

afterEach(() => {
  document.title = '';
});

describe('ConfirmationPage', () => {
  describe('approved state', () => {
    it('renders correct headline', () => {
      render(<ConfirmationPage state="approved" employeeFirstName="John" />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Recognition sent to John'
      );
    });

    it('renders correct body copy', () => {
      render(<ConfirmationPage state="approved" employeeFirstName="John" />);
      expect(screen.getByText(/John will receive a \$25 reward/)).toBeInTheDocument();
      expect(screen.getByText(/The recognition has been added to their ClearCompany profile/)).toBeInTheDocument();
    });

    it('renders "You can close this tab."', () => {
      render(<ConfirmationPage state="approved" employeeFirstName="John" />);
      expect(screen.getByText('You can close this tab.')).toBeInTheDocument();
    });

    it('sets correct document.title', () => {
      render(<ConfirmationPage state="approved" employeeFirstName="John" />);
      expect(document.title).toBe('Recognition sent — ClearCompany');
    });
  });

  describe('dismissed state', () => {
    it('renders correct headline', () => {
      render(<ConfirmationPage state="dismissed" employeeFirstName="John" />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Got it — no recognition sent'
      );
    });

    it('renders correct body copy', () => {
      render(<ConfirmationPage state="dismissed" employeeFirstName="John" />);
      expect(
        screen.getByText('No reward was sent to John. Nothing has been recorded.')
      ).toBeInTheDocument();
    });

    it('sets correct document.title', () => {
      render(<ConfirmationPage state="dismissed" employeeFirstName="John" />);
      expect(document.title).toBe('Recognition dismissed — ClearCompany');
    });
  });

  describe('expired state', () => {
    it('renders correct headline', () => {
      render(<ConfirmationPage state="expired" employeeFirstName="John" />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'This link has expired'
      );
    });

    it('renders link with employeeProfileUrl', () => {
      render(
        <ConfirmationPage
          state="expired"
          employeeFirstName="John"
          employeeProfileUrl="/employees/123"
        />
      );
      const link = screen.getByRole('link', { name: 'employee profile' });
      expect(link).toHaveAttribute('href', '/employees/123');
    });

    it('link has descriptive text (not "click here")', () => {
      render(
        <ConfirmationPage
          state="expired"
          employeeFirstName="John"
          employeeProfileUrl="/employees/123"
        />
      );
      const link = screen.getByRole('link');
      expect(link.textContent).toBe('employee profile');
    });

    it('sets correct document.title', () => {
      render(<ConfirmationPage state="expired" employeeFirstName="John" />);
      expect(document.title).toBe('Link expired — ClearCompany');
    });
  });

  describe('already-decided state', () => {
    it('renders correct headline', () => {
      render(
        <ConfirmationPage
          state="already-decided"
          employeeFirstName="John"
          priorDecision="approved"
        />
      );
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Already handled');
    });

    it('renders correct body for approved prior decision', () => {
      render(
        <ConfirmationPage
          state="already-decided"
          employeeFirstName="John"
          priorDecision="approved"
        />
      );
      expect(
        screen.getByText(/You already approved this recognition\. John's reward is on its way\./)
      ).toBeInTheDocument();
    });

    it('renders different body for dismissed prior decision', () => {
      render(
        <ConfirmationPage
          state="already-decided"
          employeeFirstName="John"
          priorDecision="dismissed"
        />
      );
      expect(
        screen.getByText('You already dismissed this recognition. No reward was sent.')
      ).toBeInTheDocument();
    });

    it('sets correct document.title', () => {
      render(
        <ConfirmationPage
          state="already-decided"
          employeeFirstName="John"
          priorDecision="approved"
        />
      );
      expect(document.title).toBe('Already handled — ClearCompany');
    });
  });

  describe('accessibility', () => {
    it('has a single h1 in approved state', () => {
      render(<ConfirmationPage state="approved" employeeFirstName="John" />);
      const headings = document.querySelectorAll('h1');
      expect(headings).toHaveLength(1);
    });

    it('has a single h1 in dismissed state', () => {
      render(<ConfirmationPage state="dismissed" employeeFirstName="John" />);
      const headings = document.querySelectorAll('h1');
      expect(headings).toHaveLength(1);
    });

    it('icon span has aria-hidden in non-dismissed states', () => {
      render(<ConfirmationPage state="approved" employeeFirstName="John" />);
      const icon = document.querySelector('.confirmation-page__icon');
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
    });
  });
});
