/**
 * __tests__/pendingGiftsRoutes.test.ts
 *
 * Tests for GET /api/rr/recipient/pending-gifts
 * No DB or external mocks needed — this route uses static stub data.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import { pendingGiftsRouter } from '../routes/pendingGiftsRoutes.js';

let app: express.Express;

beforeAll(() => {
  app = express();
  app.use('/api/rr/recipient', pendingGiftsRouter);
});

describe('GET /api/rr/recipient/pending-gifts', () => {
  it('returns 200 with gifts array', async () => {
    const res = await supertest(app).get('/api/rr/recipient/pending-gifts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.gifts)).toBe(true);
  });

  it('response includes pendingCount, total, page, limit', async () => {
    const res = await supertest(app).get('/api/rr/recipient/pending-gifts');
    expect(typeof res.body.pendingCount).toBe('number');
    expect(typeof res.body.total).toBe('number');
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
  });

  it('each gift has required shape', async () => {
    const res = await supertest(app).get('/api/rr/recipient/pending-gifts');
    const gift = res.body.gifts[0];
    expect(gift).toHaveProperty('id');
    expect(gift).toHaveProperty('status');
    expect(gift).toHaveProperty('senderName');
    expect(gift).toHaveProperty('totalAmountCents');
    expect(gift).toHaveProperty('remainingAmountCents');
    expect(gift).toHaveProperty('expiryDate');
  });

  it('pendingCount counts unclaimed + available gifts only', async () => {
    const res = await supertest(app).get('/api/rr/recipient/pending-gifts');
    const { pendingCount, gifts } = res.body as { pendingCount: number; gifts: Array<{ status: string }> };
    const totalGifts = gifts.length;
    // Verify pendingCount <= total
    expect(pendingCount).toBeLessThanOrEqual(totalGifts);
    // Verify pendingCount only counts active statuses
    const activeCnt = gifts.filter((g) => g.status === 'unclaimed' || g.status === 'available').length;
    expect(pendingCount).toBe(activeCnt);
  });

  it('pagination: page=1, limit=2 returns 2 gifts', async () => {
    const res = await supertest(app).get('/api/rr/recipient/pending-gifts?page=1&limit=2');
    expect(res.body.gifts.length).toBe(2);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(2);
  });

  it('pagination: page=2 returns remaining gifts', async () => {
    const res1 = await supertest(app).get('/api/rr/recipient/pending-gifts?limit=2');
    const res2 = await supertest(app).get('/api/rr/recipient/pending-gifts?page=2&limit=2');
    // Ensure page 2 items differ from page 1 items
    const ids1 = res1.body.gifts.map((g: { id: string }) => g.id);
    const ids2 = res2.body.gifts.map((g: { id: string }) => g.id);
    expect(ids1).not.toEqual(ids2);
  });

  it('ignores userId param (returns same data regardless)', async () => {
    const res1 = await supertest(app).get('/api/rr/recipient/pending-gifts?userId=emp-001');
    const res2 = await supertest(app).get('/api/rr/recipient/pending-gifts?userId=someone-else');
    expect(res1.body.total).toBe(res2.body.total);
  });
});
