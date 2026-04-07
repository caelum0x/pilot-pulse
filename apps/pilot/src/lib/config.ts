import type { PacificaEnv } from '@pacifica-hack/sdk';

/**
 * Runtime configuration for PacificaPilot.
 *
 * All values are sourced from environment variables. Defaults are safe for
 * local development in mock mode — NEVER rely on these defaults in production.
 */
export interface PilotConfig {
  env: PacificaEnv;
  live: boolean;
  builderCode: string;
  webhookSecret: string;
  address: string | undefined;
  privateKey: string | undefined;
}

function parseEnv(value: string | undefined): PacificaEnv {
  return value === 'mainnet' ? 'mainnet' : 'testnet';
}

export const config: PilotConfig = {
  env: parseEnv(process.env.NEXT_PUBLIC_PACIFICA_ENV),
  live: process.env.USE_LIVE_PACIFICA === 'true',
  builderCode: process.env.BUILDER_CODE ?? 'HACKATHON_TEST',
  webhookSecret: process.env.PILOT_WEBHOOK_SECRET ?? 'change-me-dev-only',
  address: process.env.ADDRESS,
  privateKey: process.env.PRIVATE_KEY,
};

/** Public (client-safe) slice of config used by the UI. */
export interface PublicPilotConfig {
  env: PacificaEnv;
  live: boolean;
  builderCode: string;
  /**
   * Current broker status. Populated by the `/api/config` route handler
   * (kept optional here so unit tests that call `getPublicConfig()` don't
   * need the broker layer).
   */
  broker?: {
    mode: 'live' | 'mock';
    requestedLive: boolean;
    degraded: boolean;
    degradeReason?: string;
  };
  /** Account balance in USD. Populated by `/api/config` route handler. */
  balance?: number;
}

export function getPublicConfig(): PublicPilotConfig {
  return {
    env: config.env,
    live: config.live,
    builderCode: config.builderCode,
  };
}
