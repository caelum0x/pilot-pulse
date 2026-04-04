/**
 * Broker factory + hot-reload-safe singleton.
 *
 * Next.js dev server re-evaluates modules on every file change, which would
 * otherwise spawn a fresh `PacificaClient` per request. We pin the broker
 * onto `globalThis` under a private symbol so hot reloads keep reusing the
 * same instance (same price cache, same auth).
 *
 * Graceful degradation: if `USE_LIVE_PACIFICA=true` but credentials are
 * missing, we log the failure and fall back to the mock broker. The status
 * is exposed via {@link getBrokerStatus} so the UI mode pill can show
 * "LIVE MODE UNAVAILABLE".
 */

import { PacificaClient } from '@pacifica-hack/sdk';
import { config } from './config';
import {
  LivePacificaBroker,
  MockPacificaBroker,
  type PacificaBroker,
} from './pacifica-broker';

export type BrokerMode = 'live' | 'mock';

export interface BrokerStatus {
  mode: BrokerMode;
  requestedLive: boolean;
  degraded: boolean;
  degradeReason?: string;
}

interface BrokerGlobal {
  broker: PacificaBroker;
  status: BrokerStatus;
}

const BROKER_KEY: unique symbol = Symbol.for('@pacifica-hack/pilot/broker');

type BrokerGlobalCarrier = {
  [BROKER_KEY]?: BrokerGlobal;
};

function carrier(): BrokerGlobalCarrier {
  return globalThis as unknown as BrokerGlobalCarrier;
}

function buildBroker(): BrokerGlobal {
  if (!config.live) {
    return {
      broker: new MockPacificaBroker(),
      status: { mode: 'mock', requestedLive: false, degraded: false },
    };
  }

  if (!config.address || !config.privateKey) {
    const reason =
      'USE_LIVE_PACIFICA=true but ADDRESS and/or PRIVATE_KEY are not set — falling back to mock broker';
    // eslint-disable-next-line no-console
    console.error(`[broker-factory] ${reason}`);
    return {
      broker: new MockPacificaBroker(),
      status: {
        mode: 'mock',
        requestedLive: true,
        degraded: true,
        degradeReason: reason,
      },
    };
  }

  try {
    const client = new PacificaClient({
      env: config.env,
      address: config.address,
      privateKey: config.privateKey,
      builderCode: config.builderCode,
    });
    return {
      broker: new LivePacificaBroker(client),
      status: { mode: 'live', requestedLive: true, degraded: false },
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(
      `[broker-factory] failed to construct live client, falling back to mock: ${reason}`,
    );
    return {
      broker: new MockPacificaBroker(),
      status: {
        mode: 'mock',
        requestedLive: true,
        degraded: true,
        degradeReason: reason,
      },
    };
  }
}

function ensureBroker(): BrokerGlobal {
  const c = carrier();
  const existing = c[BROKER_KEY];
  if (existing) return existing;
  const next = buildBroker();
  c[BROKER_KEY] = next;
  return next;
}

/** Returns the singleton broker (live or mock). */
export function getBroker(): PacificaBroker {
  return ensureBroker().broker;
}

/** Exposes the current broker mode for the UI and health checks. */
export function getBrokerStatus(): BrokerStatus {
  return { ...ensureBroker().status };
}

/** Test-only: drop the cached broker so the next call rebuilds it. */
export function __resetBroker(): void {
  delete carrier()[BROKER_KEY];
}
