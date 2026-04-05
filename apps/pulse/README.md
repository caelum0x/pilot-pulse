# PacificaPulse

Real-time analytics dashboard for Pacifica perpetuals — fuses **whale watching**
with **orderbook imbalance detection** to surface high-conviction directional signals.

Built for **Track 2 (Analytics & Data)** of the Pacifica Hackathon.

## What it shows

- **Markets Overview** — all pairs with mark price, 24h change, funding rate, open interest; click any row to focus the orderbook panel on that symbol
- **Orderbook Imbalance** — live depth histogram for the focused symbol, bid/ask pressure bars, imbalance ratio, spread (bps), and a 60-second sparkline
- **Whale Watcher** — real-time event timeline of large position changes (OPEN / ADD / REDUCE / CLOSE) across a curated address list, with address, symbol, direction, and USD size
- **Fusion Signals** — the killer feature: whale events cross-referenced with live orderbook imbalance. When a whale opens a LONG *and* the book shows sustained bid-side pressure → HIGH/MED/LOW conviction signal with narrative description

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

## Environment variables

Create `apps/pulse/.env.local`:

```bash
# "testnet" (default) or "mainnet"
NEXT_PUBLIC_PACIFICA_ENV=testnet

# Set to "true" to force the mock data stream (no API needed)
NEXT_PUBLIC_USE_MOCK_DATA=false

# Optional: override the whale address list (comma-separated Solana pubkeys)
NEXT_PUBLIC_WHALE_ADDRESSES=Addr1,Addr2,Addr3
```

By default the dashboard connects live to `@pacifica-hack/sdk` — no API key
needed for public endpoints (prices, markets, orderbook). Set
`NEXT_PUBLIC_USE_MOCK_DATA=true` for a fully offline demo.

## Shareable URLs

The dashboard syncs its state to URL search params so you can share a specific
view:

```
/?symbol=ETH&env=mainnet
```

Both `symbol` and `env` are kept in sync as you interact with the dashboard.

## Stack

- Next.js 14 App Router + TypeScript strict
- Tailwind CSS v3 + shadcn-style primitives (Card, Badge, Tabs, Switch, …)
- Recharts for sparklines
- Zustand for client state
- Lucide icons
- Dark-mode-only cyberpunk trading-terminal aesthetic

## Architecture

```
apps/pulse/src/
├── app/
│   ├── layout.tsx          – root layout, sets dark class + metadata
│   └── page.tsx            – dashboard composition (4-panel grid)
├── components/
│   ├── Header.tsx          – env toggle, WS status pill, UTC clock
│   ├── UrlStateSync.tsx    – URL ↔ store bidirectional sync (Suspense wrapper)
│   └── panels/
│       ├── MarketsOverviewPanel.tsx
│       ├── OrderbookImbalancePanel.tsx
│       ├── WhaleWatcherPanel.tsx
│       └── FusionSignalsPanel.tsx
├── hooks/
│   ├── usePulseStream.ts   – top-level data hook; live or mock path
│   └── useUrlState.ts      – search-params ↔ Zustand sync
└── lib/
    ├── pacifica-bridge.ts  – wraps @pacifica-hack/sdk into domain callbacks
    ├── pacifica-bridge-types.ts – MarketRow, WhaleEvent, FusionSignal types
    ├── fusion.ts           – pure signal engine (whale × imbalance)
    ├── whale-diff.ts       – pure position diff → WhaleEvent
    ├── whale-addresses.ts  – curated address list, overridable via env
    ├── mock-data.ts        – deterministic generators + live mock stream
    ├── store.ts            – Zustand: env, focusedSymbol, wsStatus
    └── format.ts           – number/time formatters
```

The live data path:

```
PacificaWsClient  ──prices/orderbook──►  PacificaBridge  ──callbacks──►  usePulseStream  ──state──►  panels
PacificaClient    ──REST poll (whales)──►  whale-diff  ──WhaleEvent──►  fusion.ts  ──FusionSignal──►  FusionSignalsPanel
```
