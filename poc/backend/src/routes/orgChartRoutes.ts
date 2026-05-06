/**
 * routes/orgChartRoutes.ts — Org chart analysis endpoints.
 *
 * All queries are read-only against rr_employees.
 *
 * Routes:
 *   GET /api/rr/org/employee/:email       — single employee card
 *   GET /api/rr/org/team/:email           — direct reports for a manager
 *   GET /api/rr/org/peers/:email          — peers (same manager)
 *   GET /api/rr/org/chain/:email          — reporting chain up to root
 *   GET /api/rr/org/subtree/:email        — recursive subtree (all reports)
 *   GET /api/rr/org/stats                 — org-wide analytics
 *   GET /api/rr/org/search?q=             — name / title / dept search
 */

import { Router, Request, Response } from 'express';
import { sqlAll, sqlGet } from '../db/pg.js';

export const orgChartRouter = Router();

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

// ---------------------------------------------------------------------------
// GET /api/rr/org/employee/:email
// ---------------------------------------------------------------------------

orgChartRouter.get('/employee/:email', async (req: Request, res: Response) => {
  const email = decodeURIComponent(String(req.params['email'])).toLowerCase();

  const emp = await sqlGet<EmployeeRow>('SELECT * FROM rr_employees WHERE id = ?', [email]);
  if (!emp) { res.status(404).json({ error: 'Employee not found' }); return; }

  const directReports = await sqlAll<Pick<EmployeeRow, 'id' | 'full_name' | 'title' | 'department' | 'email'>>(
    'SELECT id, full_name, title, department, email FROM rr_employees WHERE manager_email = ?',
    [email]
  );

  res.json({ employee: emp, directReportCount: directReports.length, directReports });
});

// ---------------------------------------------------------------------------
// GET /api/rr/org/team/:email  — direct reports for a manager
// ---------------------------------------------------------------------------

orgChartRouter.get('/team/:email', async (req: Request, res: Response) => {
  const email = decodeURIComponent(String(req.params['email'])).toLowerCase();

  const manager = await sqlGet<Pick<EmployeeRow, 'id' | 'full_name' | 'title' | 'department'>>(
    'SELECT id, full_name, title, department FROM rr_employees WHERE id = ?',
    [email]
  );

  const reports = await sqlAll<EmployeeRow>(
    'SELECT * FROM rr_employees WHERE manager_email = ? ORDER BY last_name, first_name',
    [email]
  );

  res.json({ manager: manager ?? null, directReports: reports, count: reports.length });
});

// ---------------------------------------------------------------------------
// GET /api/rr/org/peers/:email  — employees who share the same manager
// ---------------------------------------------------------------------------

orgChartRouter.get('/peers/:email', async (req: Request, res: Response) => {
  const email = decodeURIComponent(String(req.params['email'])).toLowerCase();

  const emp = await sqlGet<{ manager_email: string | null }>(
    'SELECT manager_email FROM rr_employees WHERE id = ?',
    [email]
  );
  if (!emp) { res.status(404).json({ error: 'Employee not found' }); return; }
  if (!emp.manager_email) { res.json({ peers: [], count: 0, note: 'No manager — top of org' }); return; }

  const peers = await sqlAll<EmployeeRow>(
    'SELECT * FROM rr_employees WHERE manager_email = ? AND id != ? ORDER BY last_name, first_name',
    [emp.manager_email, email]
  );

  res.json({ peers, count: peers.length, sharedManagerEmail: emp.manager_email });
});

// ---------------------------------------------------------------------------
// GET /api/rr/org/chain/:email  — reporting chain from employee up to root
// ---------------------------------------------------------------------------

orgChartRouter.get('/chain/:email', async (req: Request, res: Response) => {
  const email = decodeURIComponent(String(req.params['email'])).toLowerCase();

  const chain: EmployeeRow[] = [];
  let current = await sqlGet<EmployeeRow>('SELECT * FROM rr_employees WHERE id = ?', [email]);
  if (!current) { res.status(404).json({ error: 'Employee not found' }); return; }

  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    chain.push(current);
    visited.add(current.id);
    current = current.manager_email
      ? await sqlGet<EmployeeRow>('SELECT * FROM rr_employees WHERE id = ?', [current.manager_email])
      : undefined;
  }

  res.json({ chain, depth: chain.length - 1 }); // depth = hops from employee to root
});

// ---------------------------------------------------------------------------
// GET /api/rr/org/subtree/:email  — all reports recursively (BFS)
// ---------------------------------------------------------------------------

orgChartRouter.get('/subtree/:email', async (req: Request, res: Response) => {
  const email = decodeURIComponent(String(req.params['email'])).toLowerCase();

  interface TreeNode extends EmployeeRow { reports: TreeNode[] }

  async function buildSubtree(managerEmail: string, visited = new Set<string>()): Promise<TreeNode[]> {
    if (visited.has(managerEmail)) return [];
    visited.add(managerEmail);
    const reports = await sqlAll<EmployeeRow>(
      'SELECT * FROM rr_employees WHERE manager_email = ? ORDER BY last_name, first_name',
      [managerEmail]
    );
    return Promise.all(reports.map(async r => ({ ...r, reports: await buildSubtree(r.email, visited) })));
  }

  const root = await sqlGet<EmployeeRow>('SELECT * FROM rr_employees WHERE id = ?', [email]);
  if (!root) { res.status(404).json({ error: 'Employee not found' }); return; }

  const subtree = await buildSubtree(email);

  function countNodes(nodes: TreeNode[]): number {
    return nodes.reduce((sum, n) => sum + 1 + countNodes(n.reports), 0);
  }

  res.json({ root, subtree, totalReports: countNodes(subtree) });
});

// ---------------------------------------------------------------------------
// GET /api/rr/org/stats  — org-wide analytics
// ---------------------------------------------------------------------------

orgChartRouter.get('/stats', async (_req: Request, res: Response) => {
  const totalRow = await sqlGet<{ n: number }>('SELECT COUNT(*) as n FROM rr_employees');
  const total = totalRow?.n ?? 0;

  const byDept = await sqlAll<{ department: string; count: number }>(`
    SELECT department, COUNT(*) as count
    FROM rr_employees
    GROUP BY department
    ORDER BY count DESC
  `);

  const byOffice = await sqlAll<{ office: string; count: number }>(`
    SELECT office, COUNT(*) as count
    FROM rr_employees
    GROUP BY office
    ORDER BY count DESC
  `);

  // Managers = employees who appear in at least one manager_email reference
  const managers = await sqlAll<{ id: string; full_name: string; title: string | null; department: string | null; direct_reports: number }>(`
    SELECT e.id, e.full_name, e.title, e.department, COUNT(r.id) as direct_reports
    FROM rr_employees e
    JOIN rr_employees r ON r.manager_email = e.email
    GROUP BY e.id, e.full_name, e.title, e.department
    ORDER BY direct_reports DESC
  `);

  // Span distribution buckets
  const spanBuckets = { '1': 0, '2-3': 0, '4-6': 0, '7-10': 0, '11+': 0 };
  for (const m of managers) {
    const n = m.direct_reports;
    if (n === 1) spanBuckets['1']++;
    else if (n <= 3) spanBuckets['2-3']++;
    else if (n <= 6) spanBuckets['4-6']++;
    else if (n <= 10) spanBuckets['7-10']++;
    else spanBuckets['11+']++;
  }

  // Individual contributors (no one reports to them)
  const icCount = total - managers.length;

  // Top-level employees (no manager_email set)
  const topLevel = await sqlAll<EmployeeRow>(
    'SELECT * FROM rr_employees WHERE manager_email IS NULL ORDER BY last_name'
  );

  res.json({
    total,
    managerCount: managers.length,
    icCount,
    topLevelCount: topLevel.length,
    topLevel: topLevel.map(e => ({ id: e.id, full_name: e.full_name, title: e.title })),
    byDepartment: byDept,
    byOffice,
    topManagers: managers.slice(0, 10),
    spanDistribution: spanBuckets,
  });
});

// ---------------------------------------------------------------------------
// GET /api/rr/org/search?q=   — name / title / dept full-text search
// ---------------------------------------------------------------------------

orgChartRouter.get('/search', async (req: Request, res: Response) => {
  const q = String(req.query['q'] ?? '').trim();
  if (q.length < 2) { res.status(400).json({ error: 'q must be at least 2 characters' }); return; }

  const pattern = `%${q}%`;

  const results = await sqlAll<EmployeeRow>(`
    SELECT * FROM rr_employees
    WHERE full_name LIKE ? OR title LIKE ? OR department LIKE ? OR email LIKE ?
    ORDER BY last_name, first_name
    LIMIT 50
  `, [pattern, pattern, pattern, pattern]);

  res.json({ results, count: results.length, query: q });
});
