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
import { getDb } from '../db/schema.js';

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

orgChartRouter.get('/employee/:email', (req: Request, res: Response) => {
  const db = getDb();
  const email = decodeURIComponent(String(req.params['email'])).toLowerCase();

  const emp = db.prepare('SELECT * FROM rr_employees WHERE id = ?').get(email) as EmployeeRow | undefined;
  if (!emp) { res.status(404).json({ error: 'Employee not found' }); return; }

  const directReports = db.prepare(
    'SELECT id, full_name, title, department, email FROM rr_employees WHERE manager_email = ?'
  ).all(email) as Pick<EmployeeRow, 'id' | 'full_name' | 'title' | 'department' | 'email'>[];

  res.json({ employee: emp, directReportCount: directReports.length, directReports });
});

// ---------------------------------------------------------------------------
// GET /api/rr/org/team/:email  — direct reports for a manager
// ---------------------------------------------------------------------------

orgChartRouter.get('/team/:email', (req: Request, res: Response) => {
  const db = getDb();
  const email = decodeURIComponent(String(req.params['email'])).toLowerCase();

  const manager = db.prepare(
    'SELECT id, full_name, title, department FROM rr_employees WHERE id = ?'
  ).get(email) as Pick<EmployeeRow, 'id' | 'full_name' | 'title' | 'department'> | undefined;

  const reports = db.prepare(
    'SELECT * FROM rr_employees WHERE manager_email = ? ORDER BY last_name, first_name'
  ).all(email) as EmployeeRow[];

  res.json({ manager: manager ?? null, directReports: reports, count: reports.length });
});

// ---------------------------------------------------------------------------
// GET /api/rr/org/peers/:email  — employees who share the same manager
// ---------------------------------------------------------------------------

orgChartRouter.get('/peers/:email', (req: Request, res: Response) => {
  const db = getDb();
  const email = decodeURIComponent(String(req.params['email'])).toLowerCase();

  const emp = db.prepare('SELECT manager_email FROM rr_employees WHERE id = ?').get(email) as { manager_email: string | null } | undefined;
  if (!emp) { res.status(404).json({ error: 'Employee not found' }); return; }
  if (!emp.manager_email) { res.json({ peers: [], count: 0, note: 'No manager — top of org' }); return; }

  const peers = db.prepare(
    'SELECT * FROM rr_employees WHERE manager_email = ? AND id != ? ORDER BY last_name, first_name'
  ).all(emp.manager_email, email) as EmployeeRow[];

  res.json({ peers, count: peers.length, sharedManagerEmail: emp.manager_email });
});

// ---------------------------------------------------------------------------
// GET /api/rr/org/chain/:email  — reporting chain from employee up to root
// ---------------------------------------------------------------------------

orgChartRouter.get('/chain/:email', (req: Request, res: Response) => {
  const db = getDb();
  const email = decodeURIComponent(String(req.params['email'])).toLowerCase();
  const getEmp = db.prepare('SELECT * FROM rr_employees WHERE id = ?');

  const chain: EmployeeRow[] = [];
  let current = getEmp.get(email) as EmployeeRow | undefined;
  if (!current) { res.status(404).json({ error: 'Employee not found' }); return; }

  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    chain.push(current);
    visited.add(current.id);
    current = current.manager_email
      ? getEmp.get(current.manager_email) as EmployeeRow | undefined
      : undefined;
  }

  res.json({ chain, depth: chain.length - 1 }); // depth = hops from employee to root
});

// ---------------------------------------------------------------------------
// GET /api/rr/org/subtree/:email  — all reports recursively (BFS)
// ---------------------------------------------------------------------------

orgChartRouter.get('/subtree/:email', (req: Request, res: Response) => {
  const db = getDb();
  const email = decodeURIComponent(String(req.params['email'])).toLowerCase();

  const getReports = db.prepare(
    'SELECT * FROM rr_employees WHERE manager_email = ? ORDER BY last_name, first_name'
  );

  interface TreeNode extends EmployeeRow { reports: TreeNode[] }

  function buildSubtree(managerEmail: string, visited = new Set<string>()): TreeNode[] {
    if (visited.has(managerEmail)) return [];
    visited.add(managerEmail);
    const reports = getReports.all(managerEmail) as EmployeeRow[];
    return reports.map((r) => ({ ...r, reports: buildSubtree(r.email, visited) }));
  }

  const root = db.prepare('SELECT * FROM rr_employees WHERE id = ?').get(email) as EmployeeRow | undefined;
  if (!root) { res.status(404).json({ error: 'Employee not found' }); return; }

  const subtree = buildSubtree(email);

  function countNodes(nodes: TreeNode[]): number {
    return nodes.reduce((sum, n) => sum + 1 + countNodes(n.reports), 0);
  }

  res.json({ root, subtree, totalReports: countNodes(subtree) });
});

// ---------------------------------------------------------------------------
// GET /api/rr/org/stats  — org-wide analytics
// ---------------------------------------------------------------------------

orgChartRouter.get('/stats', (_req: Request, res: Response) => {
  const db = getDb();

  const total = (db.prepare('SELECT COUNT(*) as n FROM rr_employees').get() as { n: number }).n;

  const byDept = db.prepare(`
    SELECT department, COUNT(*) as count
    FROM rr_employees
    GROUP BY department
    ORDER BY count DESC
  `).all() as { department: string; count: number }[];

  const byOffice = db.prepare(`
    SELECT office, COUNT(*) as count
    FROM rr_employees
    GROUP BY office
    ORDER BY count DESC
  `).all() as { office: string; count: number }[];

  // Managers = employees who appear in at least one manager_email reference
  const managers = db.prepare(`
    SELECT e.id, e.full_name, e.title, e.department, COUNT(r.id) as direct_reports
    FROM rr_employees e
    JOIN rr_employees r ON r.manager_email = e.email
    GROUP BY e.id
    ORDER BY direct_reports DESC
  `).all() as { id: string; full_name: string; title: string | null; department: string | null; direct_reports: number }[];

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
  const topLevel = db.prepare(
    'SELECT * FROM rr_employees WHERE manager_email IS NULL ORDER BY last_name'
  ).all() as EmployeeRow[];

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

orgChartRouter.get('/search', (req: Request, res: Response) => {
  const q = String(req.query['q'] ?? '').trim();
  if (q.length < 2) { res.status(400).json({ error: 'q must be at least 2 characters' }); return; }

  const db = getDb();
  const pattern = `%${q}%`;

  const results = db.prepare(`
    SELECT * FROM rr_employees
    WHERE full_name LIKE ? OR title LIKE ? OR department LIKE ? OR email LIKE ?
    ORDER BY last_name, first_name
    LIMIT 50
  `).all(pattern, pattern, pattern, pattern) as EmployeeRow[];

  res.json({ results, count: results.length, query: q });
});
