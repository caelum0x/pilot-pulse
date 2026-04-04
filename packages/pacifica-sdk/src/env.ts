/**
 * Pacifica environment and endpoint URLs.
 *
 * Pacifica runs a mainnet and a testnet, each with separate REST and WebSocket
 * base URLs. Consumers select the env once when constructing a client; all
 * requests are then routed through the URLs defined here.
 */

export type PacificaEnv = 'mainnet' | 'testnet';

export interface PacificaUrls {
  readonly rest: string;
  readonly ws: string;
}

export const PACIFICA_URLS: Record<PacificaEnv, PacificaUrls> = {
  mainnet: {
    rest: 'https://api.pacifica.fi/api/v1',
    ws: 'wss://ws.pacifica.fi/ws',
  },
  testnet: {
    rest: 'https://test-api.pacifica.fi/api/v1',
    ws: 'wss://test-ws.pacifica.fi/ws',
  },
};
