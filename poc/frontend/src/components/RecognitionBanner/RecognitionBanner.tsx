import './RecognitionBanner.css';
import { useRecognitionStatus } from '../../hooks/useRecognitionStatus';
import type { RecognitionStatus } from '../../types';

interface RecognitionBannerProps {
  employeeId: string;
  featureFlag?: boolean;
  /** Override data for demo/testing — bypasses real polling */
  demoData?: RecognitionStatus;
}

const STATE_STYLES = {
  pending: {
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    color: '#1e40af',
  },
  delivered: {
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    color: '#15803d',
  },
  failed: {
    background: '#fffbeb',
    border: '1px solid #fde68a',
    color: '#92400e',
  },
} as const;

const QUOTE_MAX_CHARS = 120;

function truncateQuote(quote: string): string {
  if (quote.length <= QUOTE_MAX_CHARS) return quote;
  return quote.slice(0, QUOTE_MAX_CHARS) + '…';
}

interface BannerIconProps {
  status: 'pending' | 'delivered' | 'failed';
}

function BannerIcon({ status }: BannerIconProps) {
  if (status === 'pending') {
    return (
      <div
        className="recognition-banner__spinner"
        aria-label="Recognition sending"
        role="img"
      />
    );
  }
  if (status === 'delivered') {
    return (
      <div
        className="recognition-banner__checkmark"
        aria-hidden="true"
      />
    );
  }
  // failed
  return (
    <span
      className="recognition-banner__warning-icon"
      aria-hidden="true"
    >
      ⚠️
    </span>
  );
}

interface BannerContentProps {
  data: RecognitionStatus;
}

function BannerContent({ data }: BannerContentProps) {
  const { status, employee_first_name, manager_first_name, evidence_quote } = data;
  const firstName = employee_first_name;
  const managerFirstName = manager_first_name;

  if (status === 'pending') {
    return (
      <>
        <p className="recognition-banner__headline">
          {`Recognition in progress — reward sending to ${firstName}`}
        </p>
        <p className="recognition-banner__body">
          {`A $25 reward is on its way to ${firstName}'s inbox. This usually takes under 2 minutes.`}
        </p>
      </>
    );
  }

  if (status === 'delivered') {
    return (
      <>
        <p className="recognition-banner__headline">
          {`${firstName} was recognized for exceptional customer feedback`}
        </p>
        <blockquote className="recognition-banner__blockquote">
          {`"${truncateQuote(evidence_quote)}"`}
        </blockquote>
        <p className="recognition-banner__sub-body">
          {`$25 reward sent · Recognized by ${managerFirstName}`}
        </p>
      </>
    );
  }

  // failed
  return (
    <>
      <p className="recognition-banner__headline">
        Recognition reward failed to deliver
      </p>
      <p className="recognition-banner__body">
        {`Something went wrong sending ${firstName}'s $25 reward. No funds were charged. Please contact support or try recognizing ${firstName} manually.`}
      </p>
    </>
  );
}

export function RecognitionBanner({
  employeeId,
  featureFlag = true,
  demoData,
}: RecognitionBannerProps) {
  const polled = useRecognitionStatus(demoData ? '' : employeeId);

  // Use demoData override if provided, otherwise use polled result
  const data = demoData ?? polled.data;

  // Gates: feature flag off or no active recognition
  if (!featureFlag) return null;
  if (!data || data.status === null) return null;

  const { status, manager_first_name } = data;
  // status is known non-null at this point
  const activeStatus = status as 'pending' | 'delivered' | 'failed';
  const styles = STATE_STYLES[activeStatus];

  return (
    <div
      className="recognition-banner"
      role="status"
      aria-live="polite"
      style={{
        background: styles.background,
        border: styles.border,
        color: styles.color,
      }}
    >
      <div className="recognition-banner__content" key={activeStatus}>
        <div className="recognition-banner__icon">
          <BannerIcon status={activeStatus} />
        </div>
        <div className="recognition-banner__text">
          <BannerContent data={data} />
        </div>
      </div>
      <span
        className="recognition-banner__tag"
        title={`This recognition was suggested by ClearCompany AI based on a Gong call. Approved by ${manager_first_name}.`}
      >
        AI-detected
      </span>
    </div>
  );
}
