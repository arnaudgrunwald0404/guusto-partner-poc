import { useEffect } from 'react';
import './ConfirmationPage.css';
import type { ConfirmationState, PriorDecision } from '../../types';

interface ConfirmationPageProps {
  state: ConfirmationState;
  employeeFirstName?: string;
  managerFirstName?: string;
  priorDecision?: PriorDecision;
  employeeProfileUrl?: string;
}

const PAGE_TITLES: Record<ConfirmationState, string> = {
  approved: 'Recognition sent — ClearCompany',
  dismissed: 'Recognition dismissed — ClearCompany',
  expired: 'Link expired — ClearCompany',
  'already-decided': 'Already handled — ClearCompany',
};

function DismissIcon() {
  return (
    <div className="confirmation-page__dismiss-icon" aria-hidden="true">
      <div className="confirmation-page__dismiss-x" />
    </div>
  );
}

function IconDisplay({ state }: { state: ConfirmationState }) {
  if (state === 'dismissed') {
    return <DismissIcon />;
  }

  const emojis: Record<Exclude<ConfirmationState, 'dismissed'>, string> = {
    approved: '✅',
    expired: '⏰',
    'already-decided': 'ℹ️',
  };

  return (
    <span
      className="confirmation-page__icon"
      aria-hidden="true"
    >
      {emojis[state]}
    </span>
  );
}

function ApprovedContent({ firstName }: { firstName: string }) {
  return (
    <>
      <h1 className="confirmation-page__headline">{`Recognition sent to ${firstName}`}</h1>
      <p className="confirmation-page__body">
        {`${firstName} will receive a $25 reward in their inbox shortly. The recognition has been added to their ClearCompany profile.`}
      </p>
      <p className="confirmation-page__sub">You can close this tab.</p>
    </>
  );
}

function DismissedContent({ firstName }: { firstName: string }) {
  return (
    <>
      <h1 className="confirmation-page__headline">Got it — no recognition sent</h1>
      <p className="confirmation-page__body">
        {`No reward was sent to ${firstName}. Nothing has been recorded.`}
      </p>
      <p className="confirmation-page__sub">You can close this tab.</p>
    </>
  );
}

function ExpiredContent({
  firstName,
  employeeProfileUrl,
}: {
  firstName: string;
  employeeProfileUrl?: string;
}) {
  return (
    <>
      <h1 className="confirmation-page__headline">This link has expired</h1>
      <p className="confirmation-page__body">
        {`Recognition links expire after 48 hours to keep approvals timely. No reward was sent to ${firstName}.`}
      </p>
      <p className="confirmation-page__sub">
        {`If you'd still like to recognize ${firstName}, you can do so from their `}
        <a
          href={employeeProfileUrl ?? '#'}
          className="confirmation-page__link"
        >
          employee profile
        </a>
        {` in ClearCompany.`}
      </p>
    </>
  );
}

function AlreadyDecidedContent({
  firstName,
  priorDecision,
}: {
  firstName: string;
  priorDecision?: PriorDecision;
}) {
  const body =
    priorDecision === 'dismissed'
      ? `You already dismissed this recognition. No reward was sent.`
      : `You already approved this recognition. ${firstName}'s reward is on its way.`;

  return (
    <>
      <h1 className="confirmation-page__headline">Already handled</h1>
      <p className="confirmation-page__body">{body}</p>
      <p className="confirmation-page__sub">You can close this tab.</p>
    </>
  );
}

export function ConfirmationPage({
  state,
  employeeFirstName = 'the employee',
  managerFirstName: _managerFirstName,
  priorDecision,
  employeeProfileUrl,
}: ConfirmationPageProps) {
  useEffect(() => {
    document.title = PAGE_TITLES[state];
  }, [state]);

  return (
    <div className="confirmation-page">
      <div className="confirmation-page__card">
        <span className="confirmation-page__logo">ClearCompany</span>

        <IconDisplay state={state} />

        {state === 'approved' && (
          <ApprovedContent firstName={employeeFirstName} />
        )}
        {state === 'dismissed' && (
          <DismissedContent firstName={employeeFirstName} />
        )}
        {state === 'expired' && (
          <ExpiredContent
            firstName={employeeFirstName}
            employeeProfileUrl={employeeProfileUrl}
          />
        )}
        {state === 'already-decided' && (
          <AlreadyDecidedContent
            firstName={employeeFirstName}
            priorDecision={priorDecision}
          />
        )}
      </div>
      <div className="confirmation-page__footer">
        via ClearCompany
      </div>
    </div>
  );
}
