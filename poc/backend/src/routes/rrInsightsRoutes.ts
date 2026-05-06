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
import { sqlAll, sqlGet } from '../db/pg.js';
import { getShoutoutFeed } from '../services/shoutoutService.js';

interface EmployeeRow {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  title: string | null;
  department: string | null;
  office: string | null;
  manager_email: string | null;
  manager_name: string | null;
}

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

rrInsightsRouter.get('/nudges/people-to-recognize', async (req: Request, res: Response): Promise<void> => {
  try {
    const managerId = (req.query['managerId'] as string | undefined) ?? 'adefazio@clearcompany.com';
    const limit = Math.min(20, Math.max(1, parseInt((req.query['limit'] as string) ?? '5', 10)));

    // Resolve direct reports for the given manager
    const directReports = await sqlAll<EmployeeRow>(
      'SELECT * FROM rr_employees WHERE manager_email = ?',
      [managerId]
    );

    if (directReports.length === 0) {
      res.json({ nudges: [] });
      return;
    }

    // For each direct report, find the most recent shoutout where they were
    // the recipient (company or team visibility only — private doesn't count
    // as a meaningful public recognition for nudge purposes).
    const nudges = await Promise.all(directReports.map(async emp => {
      const lastRow = await sqlGet<{ last_at: string | null }>(`
        SELECT MAX(created_at) AS last_at
        FROM rr_shoutouts
        WHERE recipient_id = ?
          AND visibility IN ('company', 'team')
          AND deleted_at IS NULL
      `, [emp.id]);

      const lastRecognizedAt = lastRow?.last_at ?? null;

      const daysSinceRecognized = lastRecognizedAt
        ? Math.floor(
            (Date.now() - new Date(lastRecognizedAt).getTime()) / 86_400_000,
          )
        : null;

      return {
        employeeId: emp.id,
        firstName: emp.first_name,
        lastName: emp.last_name,
        title: emp.title ?? null,
        department: emp.department ?? null,
        avatarColor: avatarColorForId(emp.id),
        lastRecognizedAt,
        daysSinceRecognized,
      };
    }));

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

rrInsightsRouter.get('/leaderboard', async (req: Request, res: Response): Promise<void> => {
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

    let rows: Array<{ person_id: string; count: number }>;

    if (metric === 'sent') {
      // Count shoutouts sent per sender
      rows = await sqlAll<{ person_id: string; count: number }>(`
        SELECT sender_id AS person_id, COUNT(*) AS count
        FROM rr_shoutouts
        WHERE visibility IN ('company', 'team')
          AND created_at >= ?
          AND deleted_at IS NULL
        GROUP BY sender_id
        ORDER BY count DESC
        LIMIT ?
      `, [periodStart, limit]);
    } else {
      // Count shoutouts received per recipient
      rows = await sqlAll<{ person_id: string; count: number }>(`
        SELECT recipient_id AS person_id, COUNT(*) AS count
        FROM rr_shoutouts
        WHERE visibility IN ('company', 'team')
          AND created_at >= ?
          AND deleted_at IS NULL
        GROUP BY recipient_id
        ORDER BY count DESC
        LIMIT ?
      `, [periodStart, limit]);
    }

    // Build employee lookup map from DB
    const ids = rows.map(r => r.person_id);
    const empRows = ids.length > 0
      ? await sqlAll<EmployeeRow>(`SELECT * FROM rr_employees WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
      : [];
    const empMap = new Map(empRows.map(e => [e.id, e]));

    const leaderboard = rows.map((row, idx) => {
      const emp = empMap.get(row.person_id);
      return {
        employeeId: row.person_id,
        firstName: emp?.first_name ?? row.person_id,
        lastName: emp?.last_name ?? '',
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

rrInsightsRouter.get('/feed/home', async (req: Request, res: Response): Promise<void> => {
  try {
    const rawScope = (req.query['scope'] as string | undefined) ?? 'company';
    const scope: 'company' | 'team' = rawScope === 'team' ? 'team' : 'company';
    const userId = (req.query['userId'] as string | undefined) ?? 'mgr_001';
    const page = Math.max(1, parseInt((req.query['page'] as string) ?? '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt((req.query['limit'] as string) ?? '10', 10)));

    if (scope === 'company') {
      // Re-use the existing getShoutoutFeed helper — no filters = company feed
      const { items, total } = await getShoutoutFeed({ page, limit });
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

    // scope === 'team': find all teammates (people who share the same manager_email,
    // plus the manager themselves) and return shoutouts where sender or recipient
    // is in that set.
    const requestingUser = await sqlGet<EmployeeRow>(
      'SELECT * FROM rr_employees WHERE id = ?',
      [userId]
    );
    let teammateIds: Set<string>;

    if (requestingUser) {
      // Teammates = anyone managed by the same manager + the manager themselves
      const sameTeam = requestingUser.manager_email
        ? await sqlAll<{ id: string }>(
            'SELECT id FROM rr_employees WHERE manager_email = ? OR id = ?',
            [requestingUser.manager_email, requestingUser.manager_email]
          )
        : [{ id: userId }];

      teammateIds = new Set(sameTeam.map(e => e.id));
      // Always include the requesting user themselves
      teammateIds.add(userId);
    } else {
      // Unknown userId — fall back to just the user themselves
      teammateIds = new Set([userId]);
    }

    const idList = Array.from(teammateIds);
    const placeholders = idList.map(() => '?').join(', ');

    const offset = (page - 1) * limit;

    const rows = await sqlAll<Record<string, unknown>>(`
      SELECT s.*
      FROM rr_shoutouts s
      WHERE (s.sender_id IN (${placeholders}) OR s.recipient_id IN (${placeholders}))
        AND s.deleted_at IS NULL
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `, [...idList, ...idList, limit, offset]);

    const countRow = await sqlGet<{ n: number }>(`
      SELECT COUNT(*) AS n
      FROM rr_shoutouts s
      WHERE (s.sender_id IN (${placeholders}) OR s.recipient_id IN (${placeholders}))
        AND s.deleted_at IS NULL
    `, [...idList, ...idList]);

    // Enrich each row with values and reactions — mirrors getShoutoutFeed shape
    const items = await Promise.all(rows.map(async (s) => {
      const values = await sqlAll<{ id: string; label: string }>(
        'SELECT value_id AS id, value_label AS label FROM rr_shoutout_values WHERE shoutout_id = ?',
        [s['id']]
      );

      const reactions = await sqlAll<{ emoji: string; count: number }>(`
        SELECT emoji, COUNT(*) AS count
        FROM rr_shoutout_reactions WHERE shoutout_id = ?
        GROUP BY emoji ORDER BY count DESC
      `, [s['id']]);

      return {
        id: s['id'],
        senderId: s['sender_id'],
        senderName: s['sender_name'],
        recipientId: s['recipient_id'],
        recipientName: s['recipient_name'],
        message: s['message'],
        visibility: s['visibility'],
        source: s['source'],
        giftAmountCents: s['gift_amount_cents'],
        giftStatus: s['gift_status'],
        values,
        reactions,
        createdAt: s['created_at'],
      };
    }));

    const total = countRow?.n ?? 0;

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
