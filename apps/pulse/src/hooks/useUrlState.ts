'use client';

/**
 * Bidirectional URL state sync for PacificaPulse.
 *
 * Reads ?symbol= and ?env= from the URL on first mount to bootstrap the
 * Zustand store (so shared links land on the correct view), then writes
 * store changes back to the URL so the address bar always reflects the
 * current dashboard state.
 *
 * Usage: call `useUrlState()` inside a component wrapped in <Suspense>
 * because `useSearchParams()` requires a Suspense boundary in Next.js 14.
 */

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { usePulseStore } from '@/lib/store';
import type { PacificaEnv } from '@pacifica-hack/sdk';

const VALID_ENVS: ReadonlySet<string> = new Set<string>(['testnet', 'mainnet']);

export function useUrlState(): void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setFocusedSymbol = usePulseStore((s) => s.setFocusedSymbol);
  const setEnv = usePulseStore((s) => s.setEnv);
  const focusedSymbol = usePulseStore((s) => s.focusedSymbol);
  const env = usePulseStore((s) => s.env);

  // Bootstrap from URL on first mount — reads params before we ever write.
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    const sym = searchParams.get('symbol');
    if (sym && sym.trim().length > 0) {
      setFocusedSymbol(sym.toUpperCase().trim());
    }

    const envParam = searchParams.get('env');
    if (envParam && VALID_ENVS.has(envParam)) {
      setEnv(envParam as PacificaEnv);
    }
    // Intentionally empty deps — this is a one-time read on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Write store state into the URL on every change *after* the first render.
  // Skipping the first fire avoids overwriting the URL before the bootstrap
  // effect has had a chance to read it.
  const writeEnabled = useRef(false);
  useEffect(() => {
    if (!writeEnabled.current) {
      writeEnabled.current = true;
      return;
    }
    const next = new URLSearchParams();
    next.set('symbol', focusedSymbol);
    next.set('env', env);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [focusedSymbol, env, pathname, router]);
}
