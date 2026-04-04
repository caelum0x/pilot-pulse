'use client';

import { create } from 'zustand';
import type { PublicPilotConfig } from './config';

interface PilotUiState {
  config: PublicPilotConfig | null;
  setConfig: (c: PublicPilotConfig) => void;
}

/** Client-only Zustand store for UI-local state (e.g. fetched public config). */
export const usePilotUi = create<PilotUiState>((set) => ({
  config: null,
  setConfig: (c) => set({ config: c }),
}));
