/**
 * routes/dashboard.ts — GET /dashboard
 *
 * Live status page for the R&R POC. Shows:
 * - Recent Gong events + pipeline status
 * - Pending approvals with one-click approve/dismiss
 * - Fired recognitions
 *
 * Pure server-rendered HTML — no framework, no build step.
 * Auto-refreshes every 8 seconds via <meta http-equiv="refresh">.
 */

import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema.js';
import { placeGuustoOrder, pollOrderStatus } from '../services/guustoService.js';

export const dashboardRouter = Router();

// ---------------------------------------------------------------------------
// Status badge styles
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending:                { bg: '#dbeafe', color: '#1e40af', label: 'Pending' },
  classified:             { bg: '#d1fae5', color: '#065f46', label: '✓ Classified' },
  below_threshold:        { bg: '#f3f4f6', color: '#6b7280', label: 'Below threshold' },
  no_employee_identified: { bg: '#f3f4f6', color: '#6b7280', label: 'No employee found' },
  employee_not_found:     { bg: '#f3f4f6', color: '#6b7280', label: 'Employee not found' },
  employee_ambiguous:     { bg: '#fef3c7', color: '#92400e', label: 'Ambiguous name' },
  needs_employee_review:  { bg: '#fef3c7', color: '#92400e', label: '⚠ Needs ID' },
  no_transcript:          { bg: '#fef3c7', color: '#92400e', label: 'No transcript' },
  failed:                 { bg: '#fee2e2', color: '#991b1b', label: '✗ Failed' },
  approved:               { bg: '#d1fae5', color: '#065f46', label: '✓ Approved' },
  reward_sending:         { bg: '#dbeafe', color: '#1e40af', label: '⏳ Sending…' },
  reward_sent:            { bg: '#d1fae5', color: '#065f46', label: '🎁 Reward sent' },
  reward_failed:          { bg: '#fee2e2', color: '#991b1b', label: '✗ Reward failed' },
  poll_timeout:           { bg: '#fef3c7', color: '#92400e', label: '⚠ Poll timeout' },
  dismissed:              { bg: '#f3f4f6', color: '#6b7280', label: 'Dismissed' },
  expired:                { bg: '#f3f4f6', color: '#6b7280', label: 'Expired' },
};

function badge(status: string): string {
  const s = STATUS_STYLES[status] ?? { bg: '#f3f4f6', color: '#374151', label: status };
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;background:${s.bg};color:${s.color}">${s.label}</span>`;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function truncate(s: string | null | undefined, n = 80): string {
  if (!s) return '<em style="color:#9ca3af">—</em>';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

dashboardRouter.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3001';

  // Recent Gong events (last 20)
  const events = db.prepare(`
    SELECT id, call_id, status, received_at, call_url, call_title FROM gong_events
    ORDER BY received_at DESC LIMIT 20
  `).all() as Array<{ id: string; call_id: string; status: string; received_at: string; call_url: string | null; call_title: string | null }>;

  // Events needing employee identification
  const needsIdEvents = db.prepare(`
    SELECT ge.id as event_id, ge.call_id, ge.call_url, ge.call_title,
           cl.id as classification_id, cl.employee_name_mentioned, cl.evidence_quote
    FROM gong_events ge
    JOIN rr_classifications cl ON cl.gong_event_id = ge.id
    WHERE ge.status = 'needs_employee_review' AND cl.status = 'needs_employee_review'
    ORDER BY ge.received_at DESC
  `).all() as Array<{
    event_id: string; call_id: string; call_url: string | null; call_title: string | null;
    classification_id: string; employee_name_mentioned: string | null; evidence_quote: string | null;
  }>;

  // Pending approvals (with recognition + classification data)
  const pendingApprovals = db.prepare(`
    SELECT
      a.id as approval_id,
      a.recognition_id,
      a.expires_at,
      r.employee_first_name,
      r.evidence_quote,
      r.recognition_message,
      r.reward_amount_cents,
      c.confidence
    FROM rr_approvals a
    JOIN rr_recognitions r ON r.id = a.recognition_id
    LEFT JOIN rr_classifications c ON c.id = r.classification_id
    WHERE a.decision IS NULL AND a.expires_at > datetime('now')
    ORDER BY a.rowid DESC
  `).all() as Array<{
    approval_id: string; recognition_id: string; expires_at: string;
    employee_first_name: string; evidence_quote: string;
    recognition_message: string; reward_amount_cents: number; confidence: number;
  }>;

  // Recent recognitions (with Guusto order status if available)
  const recognitions = db.prepare(`
    SELECT
      r.id, r.employee_first_name, r.evidence_quote,
      r.recognition_message, r.reward_status, r.reward_amount_cents, r.created_at,
      c.confidence,
      o.guusto_request_id, o.status as guusto_status, o.external_ref_verified
    FROM rr_recognitions r
    LEFT JOIN rr_classifications c ON c.id = r.classification_id
    LEFT JOIN rr_orders o ON o.recognition_id = r.id
    ORDER BY r.created_at DESC LIMIT 10
  `).all() as Array<{
    id: string; employee_first_name: string; evidence_quote: string;
    recognition_message: string; reward_status: string;
    reward_amount_cents: number; created_at: string; confidence: number;
    guusto_request_id: string | null; guusto_status: string | null;
    external_ref_verified: number | null;
  }>;

  // Counts for summary bar
  const totalEvents = (db.prepare('SELECT COUNT(*) as n FROM gong_events').get() as { n: number }).n;
  const classifiedCount = (db.prepare("SELECT COUNT(*) as n FROM gong_events WHERE status='classified'").get() as { n: number }).n;
  const pendingCount = pendingApprovals.length;
  const needsIdCount = needsIdEvents.length;
  const rewardCount = (db.prepare("SELECT COUNT(*) as n FROM rr_recognitions WHERE reward_status='reward_sent'").get() as { n: number }).n;

  // ---------------------------------------------------------------------------
  // HTML
  // ---------------------------------------------------------------------------

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="8">
  <title>R&R POC — Live Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; color: #111827; font-size: 14px; }
    .header { background: #1e293b; color: white; padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; }
    .header h1 { font-size: 18px; font-weight: 700; }
    .header .sub { font-size: 12px; color: #94a3b8; margin-top: 2px; }
    .pulse { display: inline-block; width: 8px; height: 8px; background: #22c55e; border-radius: 50%; margin-right: 8px; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
    .summary { display: flex; gap: 16px; padding: 16px 32px; background: white; border-bottom: 1px solid #e5e7eb; }
    .stat { text-align: center; padding: 8px 24px; }
    .stat .n { font-size: 28px; font-weight: 700; color: #1e293b; }
    .stat .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
    .stat-divider { width: 1px; background: #e5e7eb; }
    main { padding: 24px 32px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; max-width: 1400px; }
    .card { background: white; border-radius: 10px; border: 1px solid #e5e7eb; overflow: hidden; }
    .card-header { padding: 14px 20px; border-bottom: 1px solid #e5e7eb; font-weight: 700; font-size: 13px; color: #374151; display: flex; justify-content: space-between; align-items: center; }
    .card-header .count { background: #f3f4f6; color: #6b7280; font-size: 11px; padding: 2px 8px; border-radius: 10px; }
    .empty { padding: 32px; text-align: center; color: #9ca3af; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #f3f4f6; background: #f9fafb; }
    td { padding: 10px 16px; border-bottom: 1px solid #f9fafb; vertical-align: top; line-height: 1.5; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #fafafa; }
    .quote { font-style: italic; color: #374151; }
    .meta { font-size: 11px; color: #9ca3af; margin-top: 2px; }
    .approval-card { border: 1px solid #bfdbfe; border-radius: 10px; padding: 16px; margin: 12px 16px; background: #eff6ff; }
    .approval-card .name { font-size: 16px; font-weight: 700; color: #1e40af; margin-bottom: 6px; }
    .approval-card .quote-box { background: white; border-left: 3px solid #3b82f6; padding: 10px 14px; border-radius: 4px; margin: 10px 0; font-style: italic; color: #374151; font-size: 13px; }
    .approval-card .draft { color: #374151; font-size: 13px; margin: 8px 0; }
    .approval-card .actions { display: flex; gap: 10px; margin-top: 14px; }
    .btn-approve { background: #059669; color: white; padding: 8px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 13px; }
    .btn-dismiss { background: white; color: #6b7280; padding: 8px 20px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 13px; border: 1px solid #d1d5db; }
    .btn-approve:hover { background: #047857; }
    .confidence { font-size: 11px; color: #6b7280; margin-top: 6px; }
    .full-width { grid-column: 1 / -1; }
    .call-id { font-family: monospace; font-size: 11px; color: #6b7280; }
    .refresh-note { font-size: 11px; color: #94a3b8; }
  </style>
</head>
<body>

<div class="header">
  <div>
    <h1><span class="pulse"></span>R&R POC — Live Dashboard</h1>
    <div class="sub">Gong → Claude → Guusto recognition pipeline</div>
  </div>
  <div class="refresh-note">Auto-refreshes every 8s</div>
</div>

<div class="summary">
  <div class="stat"><div class="n">${totalEvents}</div><div class="label">Gong calls received</div></div>
  <div class="stat-divider"></div>
  <div class="stat"><div class="n">${classifiedCount}</div><div class="label">Exceptional praise detected</div></div>
  <div class="stat-divider"></div>
  <div class="stat"><div class="n" style="color:${pendingCount > 0 ? '#2563eb' : '#1e293b'}">${pendingCount}</div><div class="label">Awaiting approval</div></div>
  <div class="stat-divider"></div>
  <div class="stat"><div class="n" style="color:${needsIdCount > 0 ? '#d97706' : '#1e293b'}">${needsIdCount}</div><div class="label">Need identification</div></div>
  <div class="stat-divider"></div>
  <div class="stat"><div class="n" style="color:#059669">${rewardCount}</div><div class="label">Rewards sent</div></div>
</div>

<main>

  ${pendingApprovals.length > 0 ? `
  <div class="card full-width">
    <div class="card-header">
      🔔 Pending Approvals
      <span class="count">${pendingApprovals.length}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:0">
      ${pendingApprovals.map(a => {
        // We don't store the raw token (only hash) — link to approve by recognition_id via a special endpoint
        const approveLink = `${baseUrl}/api/rr/approve-by-id?recognition_id=${a.recognition_id}`;
        const dismissLink = `${baseUrl}/api/rr/dismiss-by-id?recognition_id=${a.recognition_id}`;
        const confidence = a.confidence ? Math.round(a.confidence * 100) : '?';
        return `
        <div class="approval-card">
          <div class="name">🎉 ${a.employee_first_name}</div>
          <div class="quote-box">"${a.evidence_quote ?? 'No quote extracted'}"</div>
          <div class="draft">${a.recognition_message ?? ''}</div>
          <div class="confidence">AI confidence: ${confidence}% · $${(a.reward_amount_cents / 100).toFixed(0)} reward · expires ${timeAgo(a.expires_at).replace(' ago', ' left')}</div>
          <div class="actions">
            <a href="${approveLink}" class="btn-approve">✓ Approve & Send $${(a.reward_amount_cents / 100).toFixed(0)}</a>
            <a href="${dismissLink}" class="btn-dismiss">Dismiss</a>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>
  ` : ''}

  ${needsIdEvents.length > 0 ? `
  <div class="card full-width">
    <div class="card-header">
      ⚠️ Needs Employee Identification
      <span class="count">${needsIdEvents.length}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:0">
      ${needsIdEvents.map(e => `
      <div class="approval-card" style="border-color:#fcd34d;background:#fffbeb;">
        <div class="name" style="color:#92400e;">🔍 Name detected: "${e.employee_name_mentioned ?? 'unknown'}"</div>
        ${e.call_title ? `<div class="meta" style="margin-bottom:8px;font-size:12px;color:#6b7280;">${e.call_url ? `<a href="${e.call_url}" target="_blank" style="color:#1a56db;text-decoration:none;">🎧 ${e.call_title} ↗</a>` : e.call_title}</div>` : ''}
        <div class="quote-box" style="border-color:#f59e0b;">"${e.evidence_quote ?? 'No quote extracted'}"</div>
        <div class="meta">An identify email was sent to the manager. Waiting for them to click who this is about.</div>
      </div>`).join('')}
    </div>
  </div>
  ` : ''}

  <div class="card full-width">
    <div class="card-header">
      📞 Recent Gong Events
      <span class="count">${events.length}</span>
    </div>
    ${events.length === 0 ? '<div class="empty">No Gong webhooks received yet. Waiting for calls…</div>' : `
    <table>
      <thead><tr>
        <th>Call</th>
        <th>Status</th>
        <th>Received</th>
      </tr></thead>
      <tbody>
        ${events.map(e => `
        <tr>
          <td>
            ${e.call_title
              ? (e.call_url
                  ? `<a href="${e.call_url}" target="_blank" style="color:#1a56db;text-decoration:none;font-weight:500;">🎧 ${e.call_title}</a>`
                  : `<span style="font-weight:500;">${e.call_title}</span>`)
              : `<span class="call-id">${e.call_id}</span>`}
            <div class="meta">${e.call_id}</div>
          </td>
          <td>${badge(e.status)}</td>
          <td><span style="color:#6b7280">${timeAgo(e.received_at)}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>`}
  </div>

  <div class="card full-width">
    <div class="card-header">
      🏆 Recognitions
      <span class="count">${recognitions.length}</span>
    </div>
    ${recognitions.length === 0 ? '<div class="empty">No recognitions yet. Approvals will appear here once a call triggers exceptional praise.</div>' : `
    <table>
      <thead><tr>
        <th>Employee</th>
        <th>Customer quote</th>
        <th>Reward status</th>
        <th>Guusto order</th>
        <th>When</th>
      </tr></thead>
      <tbody>
        ${recognitions.map(r => {
          const guustoCell = r.guusto_request_id
            ? `<span style="font-family:monospace;font-size:11px;color:#6b7280">${r.guusto_request_id.slice(0,12)}…</span>
               <div class="meta">${r.guusto_status ?? '—'}${r.external_ref_verified === 1 ? ' · <span style="color:#059669">ref ✓</span>' : r.external_ref_verified === 0 ? ' · <span style="color:#dc2626">ref ✗</span>' : ''}</div>`
            : '<span style="color:#9ca3af;font-size:12px">—</span>';
          return `
        <tr>
          <td><strong>${r.employee_first_name}</strong></td>
          <td>
            <span class="quote">${truncate(r.evidence_quote, 90)}</span>
            <div class="meta">${truncate(r.recognition_message, 70)}</div>
          </td>
          <td>${badge(r.reward_status)}</td>
          <td>${guustoCell}</td>
          <td><span style="color:#6b7280">${timeAgo(r.created_at)}</span></td>
        </tr>`;
        }).join('')}
      </tbody>
    </table>`}
  </div>

</main>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// ---------------------------------------------------------------------------
// Quick-approve / quick-dismiss by recognition_id (dashboard shortcut)
// These bypass the token system for dashboard use only — fine for POC.
// ---------------------------------------------------------------------------

dashboardRouter.get('/approve-by-id', (req: Request, res: Response) => {
  const { recognition_id } = req.query as { recognition_id?: string };
  if (!recognition_id) { res.status(400).send('Missing recognition_id'); return; }

  const db = getDb();
  const approval = db.prepare(`
    SELECT id FROM rr_approvals
    WHERE recognition_id = ? AND decision IS NULL
    LIMIT 1
  `).get(recognition_id) as { id: string } | undefined;

  if (!approval) {
    res.send('<p style="font-family:sans-serif;padding:32px">Already decided or not found. <a href="/dashboard">Back to dashboard</a></p>');
    return;
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE rr_approvals SET decision='approved', decided_at=? WHERE id=?").run(now, approval.id);
  db.prepare("UPDATE rr_recognitions SET reward_status='approved' WHERE id=?").run(recognition_id);

  // Fire Guusto reward (fire-and-forget — gracefully skips if creds missing)
  const recRow = db.prepare(`
    SELECT r.employee_first_name, r.recognition_message, r.reward_amount_cents,
           c.employee_email, c.manager_email
    FROM rr_recognitions r LEFT JOIN rr_classifications c ON c.id = r.classification_id
    WHERE r.id = ?
  `).get(recognition_id) as { employee_first_name: string; recognition_message: string; reward_amount_cents: number; employee_email: string | null; manager_email: string | null } | undefined;

  if (recRow) {
    void (async () => {
      try {
        const { requestId } = await placeGuustoOrder({
          recognitionId: recognition_id,
          employeeEmail: recRow.employee_email ?? 'employee@demo.com',
          employeeFirstName: recRow.employee_first_name ?? 'the employee',
          managerEmail: process.env.MANAGER_EMAIL ?? recRow.manager_email ?? 'manager@demo.com',
          recognitionMessage: recRow.recognition_message ?? '',
          amountCents: recRow.reward_amount_cents,
        });
        void pollOrderStatus(requestId, recognition_id, recRow.employee_first_name ?? 'the employee', process.env.MANAGER_EMAIL ?? recRow.manager_email ?? 'manager@demo.com');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('not set')) console.error('[dashboard] Guusto order failed:', err);
        else console.warn('[dashboard] Guusto creds not configured — skipping reward delivery');
      }
    })();
  }

  res.redirect('/dashboard');
});

dashboardRouter.get('/dismiss-by-id', (req: Request, res: Response) => {
  const { recognition_id } = req.query as { recognition_id?: string };
  if (!recognition_id) { res.status(400).send('Missing recognition_id'); return; }

  const db = getDb();
  const approval = db.prepare(`
    SELECT id FROM rr_approvals
    WHERE recognition_id = ? AND decision IS NULL
    LIMIT 1
  `).get(recognition_id) as { id: string } | undefined;

  if (!approval) {
    res.send('<p style="font-family:sans-serif;padding:32px">Already decided or not found. <a href="/dashboard">Back to dashboard</a></p>');
    return;
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE rr_approvals SET decision='dismissed', decided_at=? WHERE id=?").run(now, approval.id);
  db.prepare("UPDATE rr_recognitions SET reward_status='dismissed' WHERE id=?").run(recognition_id);

  res.redirect('/dashboard');
});
