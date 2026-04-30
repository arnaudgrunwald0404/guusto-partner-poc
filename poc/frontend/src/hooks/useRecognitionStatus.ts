import { useState, useEffect, useRef } from 'react';
import type { RecognitionStatus, UseRecognitionStatusResult } from '../types';

const POLL_INTERVAL_MS = 10_000;
const TERMINAL_STATES = new Set(['delivered', 'failed']);
const MAX_CONSECUTIVE_ERRORS = 5;

export function useRecognitionStatus(employeeId: string): UseRecognitionStatusResult {
  const [data, setData] = useState<RecognitionStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const consecutiveErrors = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!employeeId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const res = await fetch(
          `/api/rr/demo/recognition-status?employee_id=${encodeURIComponent(employeeId)}`
        );

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json: RecognitionStatus = await res.json();

        if (cancelled) return;

        consecutiveErrors.current = 0;
        setData(json);
        setError(null);
        setIsLoading(false);

        // Stop polling on terminal states
        if (json.status !== null && TERMINAL_STATES.has(json.status)) {
          if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch (err) {
        if (cancelled) return;

        consecutiveErrors.current += 1;

        if (consecutiveErrors.current >= MAX_CONSECUTIVE_ERRORS) {
          // Silent fail — stop polling, show nothing
          if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setData(null);
          setIsLoading(false);
          return;
        }

        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      }
    };

    // Initial fetch
    void fetchStatus();

    // Start polling
    intervalRef.current = setInterval(() => {
      void fetchStatus();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [employeeId]);

  return { data, isLoading, error };
}
