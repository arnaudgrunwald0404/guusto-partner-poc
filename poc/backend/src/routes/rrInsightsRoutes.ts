/**
 * routes/rrInsightsRoutes.ts — R&R insights endpoints
 *
 * GET /api/rr/nudges/people-to-recognize
 *   Returns employees who haven't been recognized recently, sorted by longest
 *   gap first (null = never recognized, listed first).
 *
 * GET /api/rr/leaderboard
 *   Returns top employees by recognition count for a given period/metric.
 *
 * GET /api/rr/feed/home
 *   Company or team-scoped recognition feed with pagination.
 */

import { Router, Request, Response } from 'express';
import { getDb } from '../db/schema.js';
import { STUB_EMPLOYEES } from '../services/employeeResolver.js';
import { getShoutoutFeed } from '../services/shoutoutService.js';

export const rrInsightsRouter = Router();

// ---------------------------------------------------------------------------
// Static avatar color palette — assigned deterministically by employee index
// so colours are stable across requests.
// ---------------------------------------------------------------------------

const AVATAR_COLORS = [
  'blue', 'violet', 'green', 'orange', 'pink',
  'teal', 'red', 'amber', 'indigo', 'cyan',
];

/** Map an employee ID to a stable avatar color string. */
function avatarColorForId(employeeId: string): string {
  // Sum the char codes of the id for a simple stable hash
  const hash = employeeId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? 'blue';
}

// ---------------------------------------------------------------------------
// GET /api/rr/nudges/people-to-recognize
//
// Query params:
//   managerId  — defaults to 'mgr_001' (the demo manager)
//   limit      — defaults to 5, max 20
// ---------------------------------------------------------------------------

rrInsightsRouter.get('/nudges/people-to-recognize', (req: Request, res: Response): void => {
  try {
    const managerId = (req.query['managerId'] as string | undefined) ?? 'mgr_001';
    const limit = Math.min(20, Math.max(1, parseInt((req.query['limit'] as string) ?? '5', 10)));

    const db = getDb();

    // Resolve direct reports for the given manager
    const directReports = STUB_EMPLOYEES.filter(e => e.managerId === managerId);

    if (directReports.length === 0) {
      res.json({ nudges: [] });
      return;
    }

    // For each direct report, find the most recent shoutout where they were
    // the recipient (company or team visibility only — private doesn't count
    // as a meaningful public recognition for nudge purposes).
    const nudges = directReports.map(emp => {
      const lastRow = db.prepare(`
        SELECT MAX(created_at) AS last_at
        FROM rr_shoutouts
        WHERE recipient_id = ?
          AND visibility IN ('company', 'team')
          AND deleted_at IS NULL
      `).get(emp.id) as { last_at: string | null };

      const lastRecognizedAt = lastRow.last_at ?? null;

      const daysSinceRecognized = lastRecognizedAt
        ? Math.floor(
            (Date.now() - new Date(lastRecognizedAt).getTime()) / 86_400_000,
          )
        : null;

      return {
        employeeId: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        title: emp.title ?? null,
        department: emp.department ?? null,
        avatarColor: avatarColorForId(emp.id),
        lastRecognizedAt,
        daysSinceRecognized,
      };
    });

    // Sort: null (never recognized) first, then oldest recognized first
    nudges.sort((a, b) => {
      if (a.lastRecognizedAt === null && b.lastRecognizedAt === null) return 0;
      if (a.lastRecognizedAt === null) return -1;
      if (b.lastRecognizedAt === null) return 1;
      // Both non-null: oldest last-recognized date comes first
      return a.lastRecognizedAt < b.lastRecognizedAt ? -1 : 1;
    });

    res.json({ nudges: nudges.slice(0, limit) });
  } catch (err) {
    console.error('[rrInsights] nudges error:', err);
    res.status(500).json({ error: 'Failed to load recognition nudges' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/rr/leaderboard
//
// Query params:
//   period  — 'month' | 'quarter'  (default: 'month')
//   metric  — 'received' | 'sent'  (default: 'received')
//   limit   — defaults to 5, max 25
// ---------------------------------------------------------------------------

rrInsightsRouter.get('/leaderboard', (req: Request, res: Response): void => {
  try {
    const rawPeriod = (req.query['period'] as string | undefined) ?? 'month';
    const period: 'month' | 'quarter' = rawPeriod === 'quarter' ? 'quarter' : 'month';

    const rawMetric = (req.query['metric'] as string | undefined) ?? 'received';
    const metric: 'received' | 'sent' = rawMetric === 'sent' ? 'sent' : 'received';

    const limit = Math.min(25, Math.max(1, parseInt((req.query['limit'] as string) ?? '5', 10)));

    // Calculate period start in ISO string
    const now = new Date();
    let periodStart: string;

    if (period === 'quarter') {
      // Start of current quarter (Jan 1, Apr 1, Jul 1, Oct 1)
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      periodStart = new Date(now.getFullYear(), quarterStartMonth, 1).toISOString();
    } else {
      // Start of current calendar month
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    }

    const db = getDb();

    let rows: Array<{ person_id: string; count: number }>;

    if (metric === 'sent') {
      // Count shoutouts sent per sender
      rows = db.prepare(`
        SELECT sender_id AS person_id, COUNT(*) AS count
        FROM rr_shoutouts
        WHERE visibility IN ('company', 'team')
          AND created_at >= ?
          AND deleted_at IS NULL
        GROUP BY sender_id
        ORDER BY count DESC
        LIMIT ?
      `).all(periodStart, limit) as Array<{ person_id: string; count: number }>;
    } else {
      // Count shoutouts received per recipient
      rows = db.prepare(`
        SELECT recipient_id AS person_id, COUNT(*) AS count
        FROM rr_shoutouts
        WHERE visibility IN ('company', 'team')
          AND created_at >= ?
          AND deleted_at IS NULL
        GROUP BY recipient_id
        ORDER BY count DESC
        LIMIT ?
      `).all(periodStart, limit) as Array<{ person_id: string; count: number }>;
    }

    // Build employee lookup map
    const empMap = new Map(STUB_EMPLOYEES.map(e => [e.id, e]));

    const leaderboard = rows.map((row, idx) => {
      const emp = empMap.get(row.person_id);
      return {
        employeeId: row.person_id,
        firstName: emp?.firstName ?? row.person_id,
        lastName: emp?.lastName ?? '',
        title: emp?.title ?? null,
        avatarColor: avatarColorForId(row.person_id),
        count: row.count,
        rank: idx + 1,
      };
    });

    res.json({ leaderboard, period, metric });
  } catch (err) {
    console.error('[rrInsights] leaderboard error:', err);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/rr/feed/home
//
// Query params:
//   scope   — 'company' | 'team'  (default: 'company')
//   userId  — used for team scope to find teammates (default: 'mgr_001')
//   page    — default 1
//   limit   — default 10, max 50
// ---------------------------------------------------------------------------

rrInsightsRouter.get('/feed/home', (req: Request, res: Response): void => {
  try {
    const rawScope = (req.query['scope'] as string | undefined) ?? 'company';
    const scope: 'company' | 'team' = rawScope === 'team' ? 'team' : 'company';
    const userId = (req.query['userId'] as string | undefined) ?? 'mgr_001';
    const page = Math.max(1, parseInt((req.query['page'] as string) ?? '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt((req.query['limit'] as string) ?? '10', 10)));

    if (scope === 'company') {
      // Re-use the existing getShoutoutFeed helper — no filters = company feed
      const { items, total } = getShoutoutFeed({ page, limit });
      res.json({
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        scope: 'company',
      });
      return;
    }

    // scope === 'team': find all teammates (people who share the same managerId,
    // plus the manager themselves) and return shoutouts where sender or recipient
    // is in that set.
    const requestingUser = STUB_EMPLOYEES.find(e => e.id === userId);
    let teammateIds: Set<string>;

    if (requestingUser) {
      // Teammates = anyone managed by the same manager + the manager themselves
      const myManagerId = requestingUser.managerId;
      const sameTeam = myManagerId
        ? STUB_EMPLOYEES.filter(
            e => e.managerId === myManagerId || e.id === myManagerId,
          )
        : [requestingUser];

      teammateIds = new Set(sameTeam.map(e => e.id));
      // Always include the requesting user themselves
      teammateIds.add(userId);
    } else {
      // Unknown userId — fall back to just the user themselves
      teammateIds = new Set([userId]);
    }

    const db = getDb();
    const idList = Array.from(teammateIds);
    const placeholders = idList.map(() => '?').join(', ');

    const offset = (page - 1) * limit;

    const rows = db.prepare(`
      SELECT s.*
      FROM rr_shoutouts s
      WHERE (s.sender_id IN (${placeholders}) OR s.recipient_id IN (${placeholders}))
        AND s.deleted_at IS NULL
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...idList, ...idList, limit, offset) as any[];

    const countRow = db.prepare(`
      SELECT COUNT(*) AS n
      FROM rr_shoutouts s
      WHERE (s.sender_id IN (${placeholders}) OR s.recipient_id IN (${placeholders}))
        AND s.deleted_at IS NULL
    `).get(...idList, ...idList) as { n: number };

    // Enrich each row with values and reactions — mirrors getShoutoutFeed shape
    const items = rows.map((s: any) => {
      const values = db.prepare(
        'SELECT value_id AS id, value_label AS label FROM rr_shoutout_values WHERE shoutout_id = ?',
      ).all(s.id) as Array<{ id: string; label: string }>;

      const reactions = db.prepare(`
        SELECT emoji, COUNT(*) AS count
        FROM rr_shoutout_reactions WHERE shoutout_id = ?
        GROUP BY emoji ORDER BY count DESC
      `).all(s.id) as Array<{ emoji: string; count: number }>;

      return {
        id: s.id,
        senderId: s.sender_id,
        senderName: s.sender_name,
        recipientId: s.recipient_id,
        recipientName: s.recipient_name,
        message: s.message,
        visibility: s.visibility,
        source: s.source,
        giftAmountCents: s.gift_amount_cents,
        giftStatus: s.gift_status,
        values,
        reactions,
        createdAt: s.created_at,
      };
    });

    const total = countRow.n;

    res.json({
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      scope: 'team',
    });
  } catch (err) {
    console.error('[rrInsights] feed/home error:', err);
    res.status(500).json({ error: 'Failed to load home feed' });
  }
});
