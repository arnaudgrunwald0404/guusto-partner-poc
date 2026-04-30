export type RecognitionStatusValue = 'pending' | 'delivered' | 'failed' | null;

export interface RecognitionStatus {
  status: RecognitionStatusValue;
  employee_first_name: string;
  manager_first_name: string;
  evidence_quote: string;
  recognition_message?: string;
  amount_cents: number;
  currency: string;
}

export interface UseRecognitionStatusResult {
  data: RecognitionStatus | null;
  isLoading: boolean;
  error: Error | null;
}

export type ConfirmationState = 'approved' | 'dismissed' | 'expired' | 'already-decided';
export type PriorDecision = 'approved' | 'dismissed';
