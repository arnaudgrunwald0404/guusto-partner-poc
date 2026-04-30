import { useState } from 'react';
import { RecognitionBanner } from '../components/RecognitionBanner/RecognitionBanner';
import { ConfirmationPage } from '../components/ConfirmationPage/ConfirmationPage';
import type { RecognitionStatus, ConfirmationState, PriorDecision } from '../types';

const DEMO_EMPLOYEE_NAMES: Record<string, string> = {
  'emp-1': 'John',
  'emp-2': 'Maria',
  'emp-3': 'Alex',
};

const DEMO_STATUS_OPTIONS = ['pending', 'delivered', 'failed'] as const;
type DemoStatusOption = (typeof DEMO_STATUS_OPTIONS)[number];

const CONFIRMATION_STATES: ConfirmationState[] = [
  'approved',
  'dismissed',
  'expired',
  'already-decided',
];

function buildDemoData(
  employeeId: string,
  status: DemoStatusOption
): RecognitionStatus {
  const firstName = DEMO_EMPLOYEE_NAMES[employeeId] ?? 'John';
  return {
    status,
    employee_first_name: firstName,
    manager_first_name: 'Sarah',
    evidence_quote:
      "He's the best support engineer we've ever worked with. Honestly, every interaction has been exceptional — patient, knowledgeable, and genuinely cares about outcomes.",
    amount_cents: 2500,
    currency: 'USD',
  };
}

const sectionStyle: React.CSSProperties = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
  maxWidth: 860,
  margin: '0 auto',
  padding: '24px 16px',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#6b7280',
  marginBottom: 8,
  display: 'block',
};

const controlRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  alignItems: 'center',
  flexWrap: 'wrap',
  marginBottom: 20,
};

const selectStyle: React.CSSProperties = {
  fontSize: 14,
  padding: '6px 10px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  background: '#fff',
  cursor: 'pointer',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: '#1a1a2e',
  marginBottom: 4,
};

const sectionDescStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#9ca3af',
  marginBottom: 16,
};

const dividerStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid #e5e7eb',
  margin: '40px 0',
};

const previewCardStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  overflow: 'hidden',
};

const previewLabelStyle: React.CSSProperties = {
  background: '#f9fafb',
  borderBottom: '1px solid #e5e7eb',
  padding: '8px 12px',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#9ca3af',
};

const previewBodyStyle: React.CSSProperties = {
  padding: 16,
  background: '#fff',
};

export function StorybookPage() {
  // RecognitionBanner demo state
  const [bannerEmployeeId, setBannerEmployeeId] = useState<string>('emp-1');
  const [bannerStatus, setBannerStatus] = useState<DemoStatusOption>('pending');
  const [bannerFeatureFlag, setBannerFeatureFlag] = useState<boolean>(true);

  // ConfirmationPage demo state
  const [confirmationState, setConfirmationState] = useState<ConfirmationState>('approved');
  const [confirmationEmployee, setConfirmationEmployee] = useState<string>('John');
  const [priorDecision, setPriorDecision] = useState<PriorDecision>('approved');

  const demoData = buildDemoData(bannerEmployeeId, bannerStatus);

  return (
    <div
      style={{
        background: '#f3f4f6',
        minHeight: '100vh',
        paddingBottom: 60,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
      }}
    >
      {/* Page header */}
      <div
        style={{
          background: '#1a1a2e',
          color: '#fff',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 16 }}>
          R&amp;R POC — Hackathon Demo
        </span>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>
          RR-H4 &amp; RR-H6 · ClearCompany
        </span>
      </div>

      <div style={sectionStyle}>
        {/* ============================
            SECTION: RecognitionBanner
        ============================= */}
        <h2 style={{ ...sectionTitleStyle, marginTop: 32 }}>
          RR-H6 — Recognition Banner
        </h2>
        <p style={sectionDescStyle}>
          Appears on the employee profile page beneath the profile header.
          Polls /api/rr/demo/recognition-status every 10s. Three states:
          pending → delivered | failed.
        </p>

        {/* Controls */}
        <div style={controlRowStyle}>
          <div>
            <label style={labelStyle} htmlFor="banner-employee">
              Employee
            </label>
            <select
              id="banner-employee"
              style={selectStyle}
              value={bannerEmployeeId}
              onChange={(e) => setBannerEmployeeId(e.target.value)}
            >
              <option value="emp-1">emp-1 — John</option>
              <option value="emp-2">emp-2 — Maria</option>
              <option value="emp-3">emp-3 — Alex</option>
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="banner-status">
              Simulated status
            </label>
            <select
              id="banner-status"
              style={selectStyle}
              value={bannerStatus}
              onChange={(e) => setBannerStatus(e.target.value as DemoStatusOption)}
            >
              {DEMO_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="banner-flag">
              Feature flag
            </label>
            <select
              id="banner-flag"
              style={selectStyle}
              value={bannerFeatureFlag ? 'on' : 'off'}
              onChange={(e) => setBannerFeatureFlag(e.target.value === 'on')}
            >
              <option value="on">on (renders)</option>
              <option value="off">off (hidden)</option>
            </select>
          </div>
        </div>

        {/* Preview */}
        <div style={previewCardStyle}>
          <div style={previewLabelStyle}>
            Employee Profile — above tabs
          </div>
          <div style={previewBodyStyle}>
            {/* Simulated profile header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 16,
                paddingBottom: 16,
                borderBottom: '1px solid #f3f4f6',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: '#dbeafe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  fontWeight: 700,
                  color: '#2563eb',
                }}
              >
                {demoData.employee_first_name[0]}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#1a1a2e' }}>
                  {demoData.employee_first_name} Kim
                </div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  Senior Support Engineer · Customer Success
                </div>
              </div>
            </div>

            {/* The actual banner component */}
            <RecognitionBanner
              employeeId={bannerEmployeeId}
              featureFlag={bannerFeatureFlag}
              demoData={demoData}
            />
          </div>
        </div>

        <hr style={dividerStyle} />

        {/* ============================
            SECTION: ConfirmationPage
        ============================= */}
        <h2 style={sectionTitleStyle}>RR-H4 — Manager Approval Confirmation Page</h2>
        <p style={sectionDescStyle}>
          Static page shown after a manager clicks Approve, Dismiss, or an
          expired / already-clicked link. Four states.
        </p>

        {/* Controls */}
        <div style={controlRowStyle}>
          <div>
            <label style={labelStyle} htmlFor="confirm-state">
              Page state
            </label>
            <select
              id="confirm-state"
              style={selectStyle}
              value={confirmationState}
              onChange={(e) => setConfirmationState(e.target.value as ConfirmationState)}
            >
              {CONFIRMATION_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="confirm-employee">
              Employee first name
            </label>
            <input
              id="confirm-employee"
              style={{ ...selectStyle, width: 120 }}
              value={confirmationEmployee}
              onChange={(e) => setConfirmationEmployee(e.target.value)}
            />
          </div>
          {confirmationState === 'already-decided' && (
            <div>
              <label style={labelStyle} htmlFor="prior-decision">
                Prior decision
              </label>
              <select
                id="prior-decision"
                style={selectStyle}
                value={priorDecision}
                onChange={(e) => setPriorDecision(e.target.value as PriorDecision)}
              >
                <option value="approved">approved</option>
                <option value="dismissed">dismissed</option>
              </select>
            </div>
          )}
        </div>

        {/* Preview */}
        <div style={previewCardStyle}>
          <div style={previewLabelStyle}>
            Confirmation page preview (inline — actual page is full-screen)
          </div>
          <div style={{ background: '#f9fafb', padding: 0 }}>
            <ConfirmationPage
              state={confirmationState}
              employeeFirstName={confirmationEmployee}
              priorDecision={priorDecision}
              employeeProfileUrl={`/employees/demo-123`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
