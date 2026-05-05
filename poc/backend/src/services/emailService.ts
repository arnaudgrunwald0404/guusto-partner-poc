/**
 * services/emailService.ts — Transactional email via Resend.
 *
 * Builds HTML email inline — no template engine required.
 * Layout follows HANDOFF-RR-H4-RR-H6.md Spec 1A exactly.
 * All styles are inline for Outlook compatibility.
 */

import { Resend } from 'resend';
import type { Employee } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendApprovalEmailParams {
  employeeFirstName: string;
  employeeLastName: string;
  managerEmail: string;
  evidenceQuote: string;
  recognitionDraft: string;
  /** Direct link to the Gong call recording */
  callUrl?: string;
  /** Human-readable call title (e.g. "Call with Acme — Jane Smith") */
  callTitle?: string;
  approveUrl: string;
  editUrl: string;
  dismissUrl: string;
}

export interface SendIdentifyEmailParams {
  managerEmail: string;
  /** Name extracted by Claude (may be partial or fuzzy) */
  detectedName: string;
  evidenceQuote: string;
  callTitle?: string;
  callUrl?: string;
  /** Employee choices to render as one-click links */
  candidates: Employee[];
  baseUrl: string;
  /** Raw identify token for building ?token= URLs */
  token: string;
}

export interface SendFailureEmailParams {
  managerEmail: string;
  employeeFirstName: string;
  employeeLastName: string;
}

export interface SendRecognitionNotificationParams {
  recipientFirstName: string;
  recipientEmail: string;
  senderName: string;
  message: string;
  valueLabels: string[];
  /** Deep link to the recipient's recognition tab, e.g. http://localhost:5173/employee/:id */
  profileUrl: string;
  hasGift: boolean;
  giftAmountCents?: number;
}

// ---------------------------------------------------------------------------
// Resend client (lazy-initialised so tests can mock before instantiation)
// ---------------------------------------------------------------------------

function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY ?? '';
  return new Resend(apiKey);
}

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

function buildApprovalEmailHtml(params: SendApprovalEmailParams): string {
  const { employeeFirstName, employeeLastName, evidenceQuote, recognitionDraft, callUrl, callTitle, approveUrl, editUrl, dismissUrl } = params;

  // Escape HTML entities to prevent injection
  const esc = (s: string): string =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const name = esc(employeeLastName ? `${employeeFirstName} ${employeeLastName}` : employeeFirstName);
  const quote = esc(evidenceQuote);
  const draft = esc(recognitionDraft);
  const gongLinkHtml = callUrl
    ? `<p style="margin:10px 0 0 0;font-size:12px;color:#6b7280;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
        From a recent Gong call${callTitle ? `: <em>${esc(callTitle)}</em>` : ''} &mdash;
        <a href="${esc(callUrl)}" style="color:#1a56db;text-decoration:underline;">Listen in Gong &#8599;</a>
       </p>`
    : `<p style="margin:10px 0 0 0;font-size:12px;color:#6b7280;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">From a recent Gong call${callTitle ? `: <em>${esc(callTitle)}</em>` : ''}</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Recognition opportunity: ${name} praised by a customer</title>
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f9fafb;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">

          <!-- HEADER BAR -->
          <tr>
            <td style="background-color:#1a56db;padding:0 24px;height:56px;line-height:56px;">
              <span style="color:#ffffff;font-weight:bold;font-size:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">ClearCompany</span>
            </td>
          </tr>

          <!-- SECTION 1 — What happened -->
          <tr>
            <td style="padding:32px 32px 0 32px;">
              <p style="margin:0;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:0.08em;text-transform:uppercase;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">A CUSTOMER SAID SOMETHING EXCEPTIONAL</p>
              <h1 style="margin:8px 0 0 0;font-size:22px;font-weight:600;color:#1a1a2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">${name} just got a rave review</h1>
              <!-- Blockquote -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:16px;">
                <tr>
                  <td style="background-color:#f3f4f6;border-left:3px solid #1a56db;padding:16px 20px;">
                    <p style="margin:0;font-size:16px;font-style:italic;color:#1a1a2e;line-height:1.5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">&ldquo;${quote}&rdquo;</p>
                    ${gongLinkHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- SECTION 2 — Proposed recognition -->
          <tr>
            <td style="padding:32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:0.08em;text-transform:uppercase;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">PROPOSED RECOGNITION</p>
              <!-- Message box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:12px;">
                <tr>
                  <td style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;">
                    <p style="margin:0;font-size:15px;color:#1a1a2e;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">${draft}</p>
                  </td>
                </tr>
              </table>
              <!-- Reward badge -->
              <p style="margin:16px 0 0 0;">
                <span style="display:inline-block;background-color:#ecfdf5;border:1px solid #6ee7b7;border-radius:20px;padding:6px 14px;font-size:13px;font-weight:600;color:#065f46;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">&#127873;&nbsp; $25 reward &mdash; sent to ${name}&rsquo;s email</span>
              </p>
            </td>
          </tr>

          <!-- SECTION 3 — CTAs -->
          <tr>
            <td style="padding:32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 20px 0;font-size:15px;color:#6b7280;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">This takes 10 seconds. One click and ${name} gets recognized.</p>

              <!-- Approve & Send -->
              <a href="${approveUrl}" style="display:block;background-color:#059669;color:#ffffff;font-size:16px;font-weight:600;padding:14px 24px;border-radius:6px;text-align:center;text-decoration:none;margin-bottom:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">Approve &amp; Send &mdash; $25 reward</a>

              <!-- Edit first -->
              <a href="${editUrl}" style="display:block;background-color:#ffffff;border:2px solid #e5e7eb;color:#1a1a2e;font-size:15px;font-weight:500;padding:12px 24px;border-radius:6px;text-align:center;text-decoration:none;margin-bottom:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">Edit the message first</a>

              <!-- Dismiss -->
              <a href="${dismissUrl}" style="display:block;color:#6b7280;font-size:14px;text-align:center;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">Dismiss &mdash; no recognition needed</a>

              <!-- Expiry note -->
              <p style="margin:16px 0 0 0;font-size:12px;color:#6b7280;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">These links expire in 48 hours. After that, no reward will be sent.</p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color:#f9fafb;padding:24px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
                You&rsquo;re receiving this because you manage ${name} in ClearCompany.<br />
                This recognition was suggested by ClearCompany&rsquo;s AI based on a Gong call transcript.<br />
                You are in control &mdash; no reward fires without your approval.<br /><br />
                ClearCompany &middot; 101 Main Street, Anytown, USA &middot;
                <a href="mailto:unsubscribe@clearcompany.com?subject=Unsubscribe%20from%20R%26R%20manager%20alerts" style="color:#6b7280;">Unsubscribe from R&amp;R manager alerts</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildApprovalEmailText(params: SendApprovalEmailParams): string {
  const { employeeFirstName, employeeLastName, evidenceQuote, recognitionDraft, approveUrl, editUrl, dismissUrl } = params;
  const fullName = employeeLastName ? `${employeeFirstName} ${employeeLastName}` : employeeFirstName;
  return `
A CUSTOMER SAID SOMETHING EXCEPTIONAL

${fullName} just got a rave review

"${evidenceQuote}"
From a recent Gong call

---

PROPOSED RECOGNITION

${recognitionDraft}

$25 reward — sent to ${fullName}'s email

---

This takes 10 seconds. One click and ${fullName} gets recognized.

Approve & Send — $25 reward:
${approveUrl}

Edit the message first:
${editUrl}

Dismiss — no recognition needed:
${dismissUrl}

These links expire in 48 hours. After that, no reward will be sent.

---

You're receiving this because you manage ${fullName} in ClearCompany.
This recognition was suggested by ClearCompany's AI based on a Gong call transcript.
You are in control — no reward fires without your approval.

ClearCompany · 101 Main Street, Anytown, USA · Unsubscribe from R&R manager alerts: mailto:unsubscribe@clearcompany.com
`.trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sends the manager approval email with three one-click CTAs.
 */
export async function sendApprovalEmail(params: SendApprovalEmailParams): Promise<void> {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL ?? 'rewards@info.tacticalsync.com';
  const fullName = params.employeeLastName ? `${params.employeeFirstName} ${params.employeeLastName}` : params.employeeFirstName;
  const subject = `Recognition opportunity: ${fullName} praised by a customer`;

  const { error } = await resend.emails.send({
    from,
    to: params.managerEmail,
    subject,
    html: buildApprovalEmailHtml(params),
    text: buildApprovalEmailText(params),
  });

  if (error) {
    console.error('[emailService] Resend error sending approval email:', error);
    throw new Error(`Failed to send approval email: ${JSON.stringify(error)}`);
  }

  console.log(`[emailService] Approval email sent to ${params.managerEmail} for employee ${params.employeeFirstName}`);
}

/**
 * Sends a "help us identify the employee" email to the manager.
 * Includes one-click links for each candidate employee.
 * When manager clicks, the identify route creates the recognition and sends the approval email.
 */
export async function sendIdentifyEmail(params: SendIdentifyEmailParams): Promise<void> {
  const { managerEmail, detectedName, evidenceQuote, callTitle, callUrl, candidates, baseUrl, token } = params;
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL ?? 'rewards@info.tacticalsync.com';

  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const callInfo = callTitle ? esc(callTitle) : 'a recent call';
  const gongLinkHtml = callUrl
    ? `<a href="${esc(callUrl)}" style="color:#1a56db;text-decoration:underline;">Listen in Gong &#8599;</a>`
    : '';

  const candidateLinksHtml = candidates.map(emp => {
    const url = `${baseUrl}/api/rr/identify?token=${token}&emp_id=${emp.id}`;
    return `<a href="${esc(url)}" style="display:block;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:14px 20px;margin-bottom:10px;text-decoration:none;font-size:15px;font-weight:500;color:#1a1a2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
      &#128100;&nbsp; ${esc(emp.firstName)} ${esc(emp.lastName)}
    </a>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" />
<title>Help identify: a customer praised someone on your team</title></head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f9fafb;">
    <tr><td align="center" style="padding:24px 16px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">

        <!-- HEADER -->
        <tr><td style="background-color:#1a56db;padding:0 24px;height:56px;line-height:56px;">
          <span style="color:#ffffff;font-weight:bold;font-size:20px;">ClearCompany</span>
        </td></tr>

        <!-- SECTION 1: what we heard -->
        <tr><td style="padding:32px 32px 0 32px;">
          <p style="margin:0;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:0.08em;text-transform:uppercase;">A CUSTOMER SAID SOMETHING EXCEPTIONAL</p>
          <h1 style="margin:8px 0 0 0;font-size:22px;font-weight:600;color:#1a1a2e;">We heard great things about someone on your team</h1>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:16px;">
            <tr><td style="background-color:#f3f4f6;border-left:3px solid #1a56db;padding:16px 20px;">
              <p style="margin:0;font-size:16px;font-style:italic;color:#1a1a2e;line-height:1.5;">&ldquo;${esc(evidenceQuote)}&rdquo;</p>
              <p style="margin:10px 0 0 0;font-size:12px;color:#6b7280;">
                From ${callInfo}${gongLinkHtml ? ` &mdash; ${gongLinkHtml}` : ''}
              </p>
            </td></tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:14px;color:#6b7280;">Our AI detected the name <strong>&ldquo;${esc(detectedName)}&rdquo;</strong> but couldn&rsquo;t match it to your employee directory. Who is this about?</p>
        </td></tr>

        <!-- SECTION 2: pick the employee -->
        <tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #e5e7eb;margin-top:24px;">
          <p style="margin:0 0 16px 0;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:0.08em;text-transform:uppercase;">WHO IS THIS ABOUT?</p>
          ${candidateLinksHtml}
          <p style="margin:20px 0 0 0;font-size:13px;color:#9ca3af;text-align:center;">These links expire in 48 hours. Clicking one will send you a recognition approval email for that employee.</p>
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="background-color:#f9fafb;padding:24px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;">
            You&rsquo;re receiving this because ClearCompany&rsquo;s AI detected exceptional praise on a Gong call.<br />
            No reward will be sent without your explicit approval.<br /><br />
            ClearCompany &middot; 101 Main Street, Anytown, USA &middot;
            <a href="mailto:unsubscribe@clearcompany.com?subject=Unsubscribe" style="color:#6b7280;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `A CUSTOMER SAID SOMETHING EXCEPTIONAL

We heard great things about someone on your team.

"${evidenceQuote}"
From ${callInfo}${callUrl ? `\nListen in Gong: ${callUrl}` : ''}

Our AI detected the name "${detectedName}" but couldn't match it to your employee directory.

WHO IS THIS ABOUT?
${candidates.map(emp => `→ ${emp.firstName} ${emp.lastName}: ${baseUrl}/api/rr/identify?token=${token}&emp_id=${emp.id}`).join('\n')}

These links expire in 48 hours. Clicking one will send you a recognition approval email.

ClearCompany`;

  const { error } = await resend.emails.send({
    from,
    to: managerEmail,
    subject: `Help identify: a customer praised someone on your team`,
    html,
    text,
  });

  if (error) throw new Error(`Failed to send identify email: ${JSON.stringify(error)}`);
  console.log(`[emailService] Identify email sent to ${managerEmail}`);
}

/**
 * Sends a recognition notification to the recipient (RR-030).
 * Fired async after the shoutout is written — does not block the 201 response.
 */
export async function sendRecognitionNotificationEmail(
  params: SendRecognitionNotificationParams,
): Promise<void> {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL ?? 'rewards@info.tacticalsync.com';

  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const sender = esc(params.senderName);
  const msg    = esc(params.message);
  const chips  = params.valueLabels
    .map(v => `<span style="display:inline-block;background:#eff6ff;border:1px solid #bfdbfe;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600;color:#1e40af;margin:0 4px 4px 0;">${esc(v)}</span>`)
    .join('');
  const giftBadge = params.hasGift && params.giftAmountCents
    ? `<p style="margin:16px 0 0 0;">
         <span style="display:inline-block;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:20px;padding:6px 14px;font-size:13px;font-weight:600;color:#065f46;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
           &#127873;&nbsp; A $${(params.giftAmountCents / 100).toFixed(0)} Guusto gift card is on its way to your inbox
         </span>
       </p>`
    : '';

  const subject = `${params.senderName} recognized you in ClearCompany`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f9fafb;">
    <tr><td align="center" style="padding:24px 16px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"
             style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">

        <!-- HEADER -->
        <tr><td style="background-color:#1a56db;padding:0 24px;height:56px;line-height:56px;">
          <span style="color:#ffffff;font-weight:bold;font-size:20px;">ClearCompany</span>
        </td></tr>

        <!-- HERO -->
        <tr><td style="padding:36px 32px 24px 32px;">
          <p style="margin:0;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:0.08em;text-transform:uppercase;">
            YOU'VE BEEN RECOGNIZED
          </p>
          <h1 style="margin:8px 0 0 0;font-size:22px;font-weight:700;color:#1a1a2e;">
            ${sender} recognized you
          </h1>
          ${chips ? `<p style="margin:14px 0 0 0;">${chips}</p>` : ''}
        </td></tr>

        <!-- MESSAGE CARD -->
        <tr><td style="padding:0 32px 24px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr><td style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px 24px;">
              <p style="margin:0;font-size:15px;line-height:1.7;color:#1e293b;">${msg}</p>
            </td></tr>
          </table>
          ${giftBadge}
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:0 32px 36px 32px;border-top:1px solid #e5e7eb;padding-top:24px;">
          <p style="margin:0 0 16px 0;font-size:14px;color:#6b7280;">
            Your recognition has been added to your ClearCompany profile.
          </p>
          <a href="${esc(params.profileUrl)}"
             style="display:inline-block;background-color:#1a56db;color:#ffffff;font-size:15px;font-weight:600;padding:12px 24px;border-radius:6px;text-decoration:none;">
            See your recognition →
          </a>
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="background-color:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;">
            You received this because you were recognized in ClearCompany.<br/>
            ClearCompany &middot; 101 Main Street, Anytown, USA &middot;
            <a href="mailto:unsubscribe@clearcompany.com?subject=Unsubscribe" style="color:#6b7280;">Manage notifications</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${params.senderName} recognized you in ClearCompany

${params.valueLabels.length ? `Values: ${params.valueLabels.join(', ')}\n\n` : ''}${params.message}

${params.hasGift && params.giftAmountCents ? `A $${(params.giftAmountCents / 100).toFixed(0)} Guusto gift card is on its way to your inbox.\n\n` : ''}See your recognition: ${params.profileUrl}

ClearCompany`;

  const { error } = await resend.emails.send({
    from,
    to: params.recipientEmail,
    subject,
    html,
    text,
  });

  if (error) {
    console.error('[emailService] Failed to send recognition notification:', error);
    // Non-fatal — log and continue. The recognition is already persisted.
    return;
  }

  console.log(`[emailService] Recognition notification sent to ${params.recipientEmail}`);
}

/**
 * Sends a simple failure notification email to the manager.
 * Used by RR-H5 when the Guusto reward delivery fails.
 */
export async function sendFailureEmail(params: SendFailureEmailParams): Promise<void> {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL ?? 'rewards@info.tacticalsync.com';

  const fullName = params.employeeLastName ? `${params.employeeFirstName} ${params.employeeLastName}` : params.employeeFirstName;
  const { error } = await resend.emails.send({
    from,
    to: params.managerEmail,
    subject: `Action needed: ${fullName}'s recognition reward failed to deliver`,
    text: `Hi,

We were unable to deliver the $25 reward to ${fullName}'s inbox after you approved their recognition.

No funds were charged. Please try recognizing ${fullName} manually from their ClearCompany employee profile, or contact support if the problem persists.

— ClearCompany Recognition System`,
    html: `<p>Hi,</p>
<p>We were unable to deliver the $25 reward to <strong>${fullName}</strong>'s inbox after you approved their recognition.</p>
<p>No funds were charged. Please try recognizing ${fullName} manually from their ClearCompany employee profile, or contact support if the problem persists.</p>
<p>— ClearCompany Recognition System</p>`,
  });

  if (error) {
    console.error('[emailService] Resend error sending failure email:', error);
    throw new Error(`Failed to send failure email: ${JSON.stringify(error)}`);
  }

  console.log(`[emailService] Failure email sent to ${params.managerEmail} for employee ${params.employeeFirstName}`);
}
