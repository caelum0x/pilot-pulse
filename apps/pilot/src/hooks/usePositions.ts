'use client';

import { useSwrJson } from './useSwrJson';
import type { PositionRow } from '@/app/api/positions/route';

export interface PositionsResponse {
  positions: PositionRow[];
  warning?: string;
}

export function usePositions() {
  return useSwrJson<PositionsResponse>('/api/positions');
}
