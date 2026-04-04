'use client';

import { useEffect } from 'react';
import type { PublicPilotConfig } from '@/lib/config';
import { usePilotUi } from '@/lib/client-store';
import { useSwrJson } from './useSwrJson';

export function usePilotConfig() {
  const setConfig = usePilotUi((s) => s.setConfig);
  const config = usePilotUi((s) => s.config);
  const swr = useSwrJson<PublicPilotConfig>('/api/config', { refreshInterval: 0 });

  useEffect(() => {
    if (swr.data) setConfig(swr.data);
  }, [swr.data, setConfig]);

  return { config, isLoading: swr.isLoading };
}
