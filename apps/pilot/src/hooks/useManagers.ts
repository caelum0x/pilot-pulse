'use client';

import { useSwrJson } from './useSwrJson';
import type { ManagerSnapshot } from '@/lib/types';

export interface ManagersResponse {
  managers: ManagerSnapshot[];
}

export function useManagers() {
  return useSwrJson<ManagersResponse>('/api/managers');
}
