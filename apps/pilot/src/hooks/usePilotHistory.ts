'use client';

import { useSwrJson } from './useSwrJson';
import type { WebhookEvent } from '@/lib/types';

export interface HistoryResponse {
  events: WebhookEvent[];
  feeRevenueUsd: number;
}

export function usePilotHistory() {
  return useSwrJson<HistoryResponse>('/api/webhooks/history');
}
