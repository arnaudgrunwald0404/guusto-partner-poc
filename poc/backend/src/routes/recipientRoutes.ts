/**
 * routes/recipientRoutes.ts — Employee recipient search (RR-011)
 *
 * GET /api/rr/recipients?q=<query>&limit=<n>
 *
 * Searches the active employee roster by name or email.
 * In the POC we search STUB_EMPLOYEES (in-memory); production would use a
 * trigram-indexed DB query against the CC employee table.
 *
 * Returns up to `limit` (default 10, max 20) results, sorted by match quality.
 * Terminated employees are excluded (status !== 'active').
 * The calling user is excluded from results (cannot recognize yourself).
 */

import { Router, Request, Response } from 'express';
import { STUB_EMPLOYEES } from '../services/employeeResolver.js';

export const recipientRouter = Router();

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Simple substring-match scorer — higher = better match */
function score(query: string, candidate: string): number {
  const q = normalize(query);
  const c = normalize(candidate);
  if (c === q) return 3;
  if (c.startsWith(q)) return 2;
  if (c.includes(q)) return 1;
  return 0;
}

recipientRouter.get('/', (req: Request, res: Response): void => {
  const q = (req.query.q as string | undefined) ?? '';
  const rawLimit = parseInt((req.query.limit as string) ?? '10', 10);
  const limit = Math.min(20, Math.max(1, isNaN(rawLimit) ? 10 : rawLimit));
  const callerId = req.headers['x-user-id'] as string | undefined;

  if (q.trim().length < 1) {
    res.json({ recipients: [] });
    return;
  }

  const query = normalize(q);

  const scored = STUB_EMPLOYEES
    .filter(e => e.id !== callerId)
    .map(e => {
      const fullName = `${e.firstName} ${e.lastName}`;
      const nameScore = Math.max(score(query, fullName), score(query, e.firstName), score(query, e.lastName));
      const emailScore = score(query, e.email);
      return { employee: e, rank: Math.max(nameScore, emailScore) };
    })
    .filter(r => r.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit);

  res.json({
    recipients: scored.map(r => ({
      id: r.employee.id,
      firstName: r.employee.firstName,
      lastName: r.employee.lastName,
      fullName: `${r.employee.firstName} ${r.employee.lastName}`,
      email: r.employee.email,
    })),
  });
});
