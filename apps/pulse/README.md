# PacificaPulse

Real-time analytics dashboard for Pacifica perpetuals — fuses **whale watching**
with **orderbook imbalance detection** to surface high-conviction directional signals.

Built for **Track 2 (Analytics & Data)** of the Pacifica Hackathon.

## What it shows

- **Markets Overview** — top pairs with mark price, 24h change, funding, open interest
- **Orderbook Imbalance** — live depth histogram, imbalance ratio, spread, 60s sparkline
- **Whale Watcher** — timeline of large position events (OPEN / ADD / REDUCE / CLOSE)
- **Fusion Signals** — cross-correlated signals like _"BTC: High-conviction LONG — whale opened $2.4M + bid imbalance 0.31 sustained 6m"_

## Run it

```bash
# From the monorepo root
pnpm install
pnpm -F @pacifica-hack/pulse dev
# open http://localhost:3000
```

Build:

```bash
pnpm -F @pacifica-hack/pulse build
```

## Mock data mode

By default the dashboard runs on a mock data stream so it demos beautifully
without needing live Pacifica API access. Control it via:

```
NEXT_PUBLIC_USE_MOCK_DATA=true     # (default) use mock generators
NEXT_PUBLIC_USE_MOCK_DATA=false    # use real @pacifica-hack/sdk websocket
NEXT_PUBLIC_PACIFICA_ENV=testnet   # or mainnet
```

See `.env.example` and `src/hooks/usePulseStream.ts`. The real-SDK code path
is stubbed and scheduled for Week 2.

## Stack

- Next.js 14 App Router + TypeScript strict
- Tailwind CSS v3 + shadcn-style primitives (Card, Badge, Tabs, Switch, …)
- Recharts for sparklines
- Zustand for client state
- Lucide icons
- Dark-mode-only cyberpunk trading-terminal aesthetic

## Architecture notes

- `src/lib/mock-data.ts` — deterministic-ish mock generators for all panels
- `src/hooks/usePulseStream.ts` — single entry point for live data; swap mock → real here
- `src/lib/store.ts` — Zustand store for env, focused symbol, websocket status
- `src/types/sdk.d.ts` — fallback SDK type declarations (removed once the SDK ships)
