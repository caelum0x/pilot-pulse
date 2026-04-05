'use client';

/**
 * Null-rendering component that syncs URL search params with the Zustand
 * store.  Extracted into its own component so the parent page can wrap it
 * in a `<Suspense>` boundary — required by Next.js 14 for `useSearchParams`.
 */
import { useUrlState } from '@/hooks/useUrlState';

export function UrlStateSync(): null {
  useUrlState();
  return null;
}
