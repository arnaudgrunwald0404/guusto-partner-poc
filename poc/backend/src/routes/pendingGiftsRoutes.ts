/**
 * routes/pendingGiftsRoutes.ts — Employee gift redemption inbox (RR-108)
 *
 * GET /api/rr/recipient/pending-gifts?userId=<id>&page=<n>&limit=<n>
 *
 * Returns mock gift data for the employee redemption inbox. Static stub —
 * no DB needed for this POC demo. Always returns data for demo-emp-001
 * regardless of userId (single-persona demo).
 */

import { Router, Request, Response } from 'express';

export const pendingGiftsRouter = Router();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RedeemedAmount {
  merchant: string;
  amountCents: number;
  redeemedAt: string;
}

interface Gift {
  id: string;
  status: 'unclaimed' | 'available' | 'redeemed' | 'expired';
  senderName: string;
  senderOrg: string;
  senderId: string;
  recognitionMessage: string;
  valueTag: string;
  valueEmoji: string;
  totalAmountCents: number;
  remainingAmountCents: number;
  currency: string;
  expiryDate: string;
  redeemedAmounts: RedeemedAmount[];
  guustoRedeemUrl: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Stub data — all 5 gifts, sorted: unclaimed/available first (expiry ASC),
// then redeemed, then expired.
// ---------------------------------------------------------------------------

const STUB_GIFTS: Gift[] = [
  // --- Active gifts (available/unclaimed), sorted by expiry date ASC ---

  // Gift 2: Available, $25, expires in 8 days (2026-05-08) — soonest expiry → first
  {
    id: 'gift-002',
    status: 'available',
    senderName: 'Marcus Webb',
    senderOrg: 'ClearCo Q1 Recognition',
    senderId: 'emp-marcus-webb',
    recognitionMessage:
      'The way you handled that difficult customer call on March 3rd was exactly the kind of calm, empathetic approach we want more of on this team.',
    valueTag: 'Customer at the Core',
    valueEmoji: '🤝',
    totalAmountCents: 2500,
    remainingAmountCents: 2500,
    currency: 'USD',
    expiryDate: '2026-05-08',
    redeemedAmounts: [],
    guustoRedeemUrl: '#',
    createdAt: '2026-04-01T09:00:00.000Z',
  },

  // Gift 3: Unclaimed, $100, expires in 30 days (2026-05-30)
  {
    id: 'gift-003',
    status: 'unclaimed',
    senderName: 'Jennifer Park',
    senderOrg: 'ClearCo Annual Award',
    senderId: 'emp-jennifer-park',
    recognitionMessage:
      "You've been a consistent top performer this quarter. This is a small thank-you for everything you do.",
    valueTag: 'Accountable to Outcomes',
    valueEmoji: '🎯',
    totalAmountCents: 10000,
    remainingAmountCents: 10000,
    currency: 'USD',
    expiryDate: '2026-05-30',
    redeemedAmounts: [],
    guustoRedeemUrl: '#',
    createdAt: '2026-04-10T14:30:00.000Z',
  },

  // Gift 1: Available, $2,500, expires in 45 days (2026-06-14)
  {
    id: 'gift-001',
    status: 'available',
    senderName: 'Rachael Alpert',
    senderOrg: 'ClearCo Hackathon',
    senderId: 'mgr_001',
    recognitionMessage:
      'Your outstanding work on the AI-driven recognition pipeline was a standout moment for the whole team. You shipped something genuinely new and handled every pivot with grace.',
    valueTag: 'Raise the Bar',
    valueEmoji: '📈',
    totalAmountCents: 2500,
    remainingAmountCents: 1500,
    currency: 'USD',
    expiryDate: '2026-06-14',
    redeemedAmounts: [
      {
        merchant: 'Baskin Robbins',
        amountCents: 1000,
        redeemedAt: '2026-04-20T16:45:00.000Z',
      },
    ],
    guustoRedeemUrl: 'https://demo.guusto.io/redemption/external/claim?state=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..nXgtrKAH1OjkmJbd.cZqD1s71xuOjM8TGjN5w1NgNgiOW8naSNGDuuUhd8qbg9ub9-YDkWwnRVa7GYsG90pwh6Qb74RcL7817WvIkVN6I8eQj99l917mblg8SU7yAcnrDoXkfDZDTjAXeNxMzJX_vtJJHb7SX7PBBajDNc7ybHaCzE1c.Hf9O1PHU3gNkEtmeZsqjTQ',
    createdAt: '2026-04-15T10:00:00.000Z',
  },

  // --- Redeemed ---

  // Gift 4: Redeemed, $50 — Amazon $50 fully redeemed
  {
    id: 'gift-004',
    status: 'redeemed',
    senderName: 'Rachael Alpert',
    senderOrg: 'ClearCo Spot Award',
    senderId: 'mgr_001',
    recognitionMessage: 'Quick shoutout for staying late to help with the demo prep.',
    valueTag: 'Listen to Many, Execute as One',
    valueEmoji: '💬',
    totalAmountCents: 5000,
    remainingAmountCents: 0,
    currency: 'USD',
    expiryDate: '2026-03-01',
    redeemedAmounts: [
      {
        merchant: 'Amazon',
        amountCents: 5000,
        redeemedAt: '2026-02-15T11:20:00.000Z',
      },
    ],
    guustoRedeemUrl: '#',
    createdAt: '2026-02-10T08:00:00.000Z',
  },

  // --- Expired ---

  // Gift 5: Expired, $75 — expired 2 months ago
  {
    id: 'gift-005',
    status: 'expired',
    senderName: 'HR Team',
    senderOrg: 'ClearCo Referral Bonus',
    senderId: 'emp-hr-team',
    recognitionMessage:
      'Thank you for referring a new team member who passed probation.',
    valueTag: 'Embrace Change',
    valueEmoji: '🌱',
    totalAmountCents: 7500,
    remainingAmountCents: 0,
    currency: 'USD',
    expiryDate: '2026-02-28',
    redeemedAmounts: [],
    guustoRedeemUrl: '#',
    createdAt: '2025-11-01T09:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// GET /pending-gifts
// ---------------------------------------------------------------------------

pendingGiftsRouter.get('/pending-gifts', (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(String(req.query['limit'] ?? '20'), 10) || 20));

  const total = STUB_GIFTS.length;
  const pendingCount = STUB_GIFTS.filter(
    (g) => g.status === 'unclaimed' || g.status === 'available',
  ).length;

  const start = (page - 1) * limit;
  const gifts = STUB_GIFTS.slice(start, start + limit);

  res.json({
    pendingCount,
    gifts,
    page,
    limit,
    total,
  });
});
