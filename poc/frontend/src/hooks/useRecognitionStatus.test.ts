import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRecognitionStatus } from './useRecognitionStatus';
import type { RecognitionStatus } from '../types';

const PENDING_RESPONSE: RecognitionStatus = {
  status: 'pending',
  employee_first_name: 'John',
  manager_first_name: 'Sarah',
  evidence_quote: 'Great support engineer.',
  amount_cents: 2500,
  currency: 'USD',
};

const DELIVERED_RESPONSE: RecognitionStatus = {
  ...PENDING_RESPONSE,
  status: 'delivered',
};

const FAILED_RESPONSE: RecognitionStatus = {
  ...PENDING_RESPONSE,
  status: 'failed',
};

describe('useRecognitionStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns isLoading=true and data=null initially (before first fetch resolves)', () => {
    // Never resolve so we can observe the initial state
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useRecognitionStatus('emp-1'));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it('polls endpoint and updates data on status change', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(PENDING_RESPONSE), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(DELIVERED_RESPONSE), { status: 200 })
      );

    const { result } = renderHook(() => useRecognitionStatus('emp-1'));

    // Flush the initial fetch microtask
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.data?.status).toBe('pending');

    // Advance the interval timer and flush microtasks for the second poll
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });

    expect(result.current.data?.status).toBe('delivered');
  });

  it('stops polling when status becomes "delivered"', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(DELIVERED_RESPONSE), { status: 200 })
    );

    const { result } = renderHook(() => useRecognitionStatus('emp-1'));

    // Flush initial fetch
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.data?.status).toBe('delivered');

    const callCountAfterTerminal = vi.mocked(fetch).mock.calls.length;

    // Advance several poll intervals
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    // No additional fetches should have happened
    expect(vi.mocked(fetch).mock.calls.length).toBe(callCountAfterTerminal);
  });

  it('stops polling when status becomes "failed"', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(FAILED_RESPONSE), { status: 200 })
    );

    const { result } = renderHook(() => useRecognitionStatus('emp-1'));

    // Flush initial fetch
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.data?.status).toBe('failed');

    const callCountAfterTerminal = vi.mocked(fetch).mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(vi.mocked(fetch).mock.calls.length).toBe(callCountAfterTerminal);
  });

  it('stops polling and sets data=null after 5 consecutive errors', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useRecognitionStatus('emp-1'));

    // Flush error #1 (initial fetch)
    await act(async () => {
      await Promise.resolve();
    });

    // Advance 4 more intervals and flush each one = errors #2–5
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        vi.advanceTimersByTime(10_000);
        await Promise.resolve();
      });
    }

    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);

    const callCountAfterStop = vi.mocked(fetch).mock.calls.length;

    // Further polling should not happen
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(vi.mocked(fetch).mock.calls.length).toBe(callCountAfterStop);
  });

  it('cleans up interval on unmount', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(PENDING_RESPONSE), { status: 200 })
    );

    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const { unmount } = renderHook(() => useRecognitionStatus('emp-1'));

    // Flush initial fetch
    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
