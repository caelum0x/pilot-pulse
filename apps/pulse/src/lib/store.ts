import { create } from 'zustand';
import type { PacificaEnv } from '@pacifica-hack/sdk';

export type WsStatus = 'connecting' | 'open' | 'closed' | 'error';

export interface PulseStore {
  env: PacificaEnv;
  setEnv: (e: PacificaEnv) => void;

  focusedSymbol: string;
  setFocusedSymbol: (s: string) => void;

  wsStatus: WsStatus;
  setWsStatus: (s: WsStatus) => void;

  lastUpdate: number;
  touchLastUpdate: () => void;

  /** Minimum USD notional before a whale position change becomes an event. */
  minWhaleSizeUsd: number;
  setMinWhaleSizeUsd: (n: number) => void;
}

const initialEnv: PacificaEnv =
  (process.env.NEXT_PUBLIC_PACIFICA_ENV as PacificaEnv) || 'testnet';

export const usePulseStore = create<PulseStore>((set) => ({
  env: initialEnv,
  setEnv: (env) => set({ env }),

  focusedSymbol: 'BTC',
  setFocusedSymbol: (focusedSymbol) => set({ focusedSymbol }),

  wsStatus: 'connecting',
  setWsStatus: (wsStatus) => set({ wsStatus }),

  lastUpdate: Date.now(),
  touchLastUpdate: () => set({ lastUpdate: Date.now() }),

  minWhaleSizeUsd: 50_000,
  setMinWhaleSizeUsd: (minWhaleSizeUsd) => set({ minWhaleSizeUsd }),
}));
