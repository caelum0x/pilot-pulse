# PacificaPulse + PacificaPilot

Pacifica Hackathon submission (Mar 16 – Apr 16, 2026) — two production-ready apps sharing one TypeScript SDK.

---

## Apps

| App | Track | What it does |
|-----|-------|-------------|
| **PacificaPulse** | Track 2 · Analytics & Data | Real-time dashboard: whale watching × orderbook imbalance fusion |
| **PacificaPilot** | Track 1 · Trading Apps | TradingView webhook executor + Smart TP/SL manager |

---

## PacificaPulse

Fuses two signals that no off-the-shelf tool combines today: **whale position flow** and **live orderbook microstructure**. When a whale opens a large LONG *and* the book shows sustained bid-side pressure → the Fusion engine surfaces a high-conviction directional signal in real time.

### Dashboard panels

- **Markets Overview** — all pairs, mark price, 24h Δ, funding, OI. Click a row to focus the orderbook panel.
- **Orderbook Imbalance** — live depth bars, imbalance ratio, spread (bps), 60-second sparkline
- **Whale Watcher** — event feed of OPEN / ADD / REDUCE / CLOSE moves above a configurable USD floor
- **Fusion Signals** — cross-referenced signals with HIGH / MED / LOW confidence tier and narrative

### Quickstart

```bash
pnpm install
pnpm -F @pacifica-hack/pulse dev
# → http://localhost:3000
```

```bash
# apps/pulse/.env.local
NEXT_PUBLIC_PACIFICA_ENV=testnet
NEXT_PUBLIC_USE_MOCK_DATA=false          # true = fully offline demo mode
NEXT_PUBLIC_WHALE_ADDRESSES=Addr1,Addr2  # override tracked addresses
```

### Shareable links

Every dashboard state is encoded in the URL:

```
http://localhost:3000/?symbol=ETH&env=mainnet
```

---

## PacificaPilot

Sits between TradingView alerts and Pacifica. Receives HMAC-signed webhook alerts, places market orders with the builder code auto-attached, then manages the position with a layered TP/SL engine that survives server restarts.

### Smart TP/SL features

- Trailing stops (ratchet-only, never reverse)
- Hard take-profits
- Partial take-profits (scale-out ladders at configurable levels)
- Breakeven locks (move stop to entry once in profit by X%)
- Time exits (auto-close after N minutes)

### Quickstart

```bash
pnpm -F @pacifica-hack/pilot dev
# → http://localhost:3001
```

```bash
# apps/pilot/.env.local
PILOT_WEBHOOK_SECRET=change-me
BUILDER_CODE=HACKATHON_TEST       # replace with approved builder code
USE_LIVE_PACIFICA=false           # true + credentials = real orders
NEXT_PUBLIC_PACIFICA_ENV=testnet
ADDRESS=<solana pubkey>
PRIVATE_KEY=<base58 secret>
```

### Test the webhook

```bash
BODY='{"action":"buy","symbol":"BTC","amount_usd":500,"strategy_id":"macd_v1","tp_pct":2.5,"sl_pct":1,"trail_pct":0.8,"timestamp":1742243160000}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "change-me" -hex | awk '{print $2}')
curl -X POST http://localhost:3001/api/webhooks/tv \
  -H "Content-Type: application/json" \
  -H "x-pilot-signature: $SIG" \
  -d "$BODY"
```

---

## Shared SDK (`packages/pacifica-sdk`)

```typescript
import { PacificaClient, PacificaWsClient } from '@pacifica-hack/sdk';

// REST — fully typed, 429 backoff, auto-signed POSTs with builder code
const client = new PacificaClient({
  env: 'testnet',
  address: '<pubkey>',
  privateKey: '<base58 secret>',
  builderCode: 'HACKATHON_TEST',
});

// WebSocket — reconnect, resubscribe, heartbeat
const ws = new PacificaWsClient({ env: 'testnet' });
ws.on('open', () => {
  ws.subscribePrices();
  ws.subscribeOrderbook('BTC');
});
ws.on('orderbook', (symbol, snapshot) => { /* ... */ });
```

### SDK features

- Ed25519 signing (software + hardware Ledger)
- REST: all market data, account, orders, TWAP, subaccounts, agent wallets, batch ops
- WS: prices, orderbook, BBO, account positions
- On-chain USDC deposit (Solana SPL)
- Builder code auto-injected into every order payload
- Typed error hierarchy (`PacificaError`, `PacificaSigningError`, `PacificaApiError`)

---

## Builder code

Both apps attach the registered builder code to every signed order via
`PacificaClient({ builderCode })`. The code is read from `BUILDER_CODE`
env var (default `HACKATHON_TEST`). Replace with the approved code once
ops@pacifica.fi issues it.

---

## Monorepo structure

```
pilot-pulse/
├── apps/
│   ├── pulse/          # PacificaPulse dashboard (Next.js 14 + Tailwind + Recharts)
│   └── pilot/          # PacificaPilot bot UI + webhook API (Next.js 14)
├── packages/
│   └── pacifica-sdk/   # Shared TS SDK (signing, REST, WebSocket)
├── docs/               # Local reference: API, signing, WS, rate limits, builder program
└── pnpm-workspace.yaml
```

## Stack

- **Framework**: Next.js 14 App Router, TypeScript strict
- **Styling**: Tailwind CSS v3, dark-mode cyberpunk terminal aesthetic
- **Charts**: Recharts (orderbook sparklines)
- **State**: Zustand (per-app client stores)
- **Signing**: `@noble/ed25519` (browser-safe, zero native deps)
- **Tests**: Vitest (SDK unit + integration tests)
