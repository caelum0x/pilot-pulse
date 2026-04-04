# @pacifica-hack/sdk

Shared Pacifica TypeScript SDK for the hackathon monorepo. Used by both
`apps/pulse` (analytics) and `apps/pilot` (trading bot).

## What's in the box

- `PacificaClient` — REST client for market data, account reads, and signed
  order actions
- `PacificaWsClient` — WebSocket client with auto-reconnect, keepalive, and
  subscription replay
- `signMessage` / `prepareMessage` / `sortJsonKeys` — canonical JSON signing
  primitives that match the Python SDK byte-for-byte
- Error classes: `PacificaError`, `PacificaRateLimitError`, `PacificaSigningError`

## Quick start

```ts
import { PacificaClient, PacificaWsClient } from '@pacifica-hack/sdk';

const client = new PacificaClient({
  env: 'testnet',
  address: process.env.ADDRESS!,
  privateKey: process.env.PRIVATE_KEY!,
  builderCode: process.env.BUILDER_CODE, // optional
});

// Public market data (unsigned)
const markets = await client.getMarketInfo();
const book = await client.getOrderbook('BTC');

// Account reads (require `address`)
const positions = await client.getPositions();
const account = await client.getAccountInfo();

// Signed trading actions (require `privateKey`)
await client.createMarketOrder({
  symbol: 'BTC',
  side: 'bid',
  amount: '0.01',
  slippage_percent: '0.5',
});

await client.createLimitOrder({
  symbol: 'ETH',
  side: 'ask',
  amount: '0.1',
  price: '3500',
  tif: 'GTC',
});

// WebSocket streams
const ws = new PacificaWsClient({ env: 'testnet' });
ws.on('open', () => console.log('ws open'));
ws.on('prices', (data) => console.log('prices', data));
ws.on('orderbook', (symbol, snapshot) => console.log('book', symbol, snapshot));
ws.subscribePrices();
ws.subscribeOrderbook('BTC');
```

## Signing scheme

All POST endpoints are signed with ed25519 over a canonical JSON form:

1. Merge the header with `{ data: payload }`
2. Recursively sort all object keys alphabetically
3. Serialize with compact JSON (no spaces)
4. Sign the UTF-8 bytes with the Solana secret key
5. Base58-encode the signature

The on-wire HTTP body then contains `account`, `signature`, `timestamp`,
`expiry_window` at the top level plus the *flattened* payload fields — the
`data` wrapper is only used during signing. See `src/signing.ts` and
`docs/signing.md` at the repo root.

## On-chain deposit (USDC -> Pacifica)

Pacifica deposits are Solana transactions, not REST calls. The `deposit`
helper builds and sends an Anchor-style instruction that moves USDC from
the depositor's Associated Token Account into the Pacifica vault. This
module is Node-only (it uses `node:crypto`).

```ts
import { deposit } from '@pacifica-hack/sdk';

const result = await deposit({
  privateKey: process.env.PRIVATE_KEY!,
  amount: 100,                         // USDC, min 10
  rpcUrl: 'https://api.mainnet-beta.solana.com',
});
console.log('tx signature:', result.signature);
```

Advanced callers that want to compose the instruction into their own
transaction (e.g. add compute budget ixs, bundle with other actions) can
use `buildDepositInstruction(depositor, amount, usdcMint?)` directly — it
returns a `@solana/web3.js` `TransactionInstruction`.

## Scripts

```bash
pnpm build       # tsc -> dist/
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest run
pnpm test:watch  # vitest
pnpm clean       # rm -rf dist
```

## Environments

| Env       | REST                                   | WS                             |
| --------- | -------------------------------------- | ------------------------------ |
| `mainnet` | `https://api.pacifica.fi/api/v1`       | `wss://ws.pacifica.fi/ws`      |
| `testnet` | `https://test-api.pacifica.fi/api/v1`  | `wss://test-ws.pacifica.fi/ws` |
