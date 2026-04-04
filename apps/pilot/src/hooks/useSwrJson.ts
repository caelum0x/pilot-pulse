'use client';

import useSWR, { type SWRConfiguration, type SWRResponse } from 'swr';

async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/** Shared SWR wrapper with a 3s refresh interval — matches the server poll cadence. */
export function useSwrJson<T>(
  key: string | null,
  config: SWRConfiguration<T> = {},
): SWRResponse<T> {
  return useSWR<T>(key, jsonFetcher, {
    refreshInterval: 3000,
    revalidateOnFocus: false,
    ...config,
  });
}
