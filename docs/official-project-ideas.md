# Official Pacifica Project Ideas (by track)

Source: Pacifica Hackathon official idea list. These are the "expected" directions — building one of these signals alignment with what judges were thinking, while leaving room to execute better than a baseline implementation.

## Track 1 — Trading Applications & Bots

| Project | Description | Complexity |
|---------|-------------|:---:|
| **Grid Trading Bot** | Automated grid strategy with configurable ranges, rebalancing via Pacifica API | Medium |
| **Funding Rate Arbitrage Bot** | Monitor funding rates across exchanges, execute delta-neutral positions when Pacifica rates diverge | Medium |
| **Smart TP/SL Manager** | Trailing stops, partial take-profits, breakeven automation beyond native order types | Low-Medium |
| **TradingView Webhook Executor** | Bridge PineScript alerts → Pacifica orders via builder code | Low |
| **Cross-Exchange Spread Bot** | Market make by quoting on Pacifica while hedging on Binance/Bybit | High |
| **Hummingbot strategy** | Develop trading strategies using Hummingbot | High |

## Track 2 — Analytics & Data

| Project | Description | Complexity |
|---------|-------------|:---:|
| **Whale Watcher** | Track large position changes, alert when big players enter/exit | Medium |
| **Orderbook Imbalance Indicator** | Real-time bid/ask pressure visualization from WebSocket orderbook data | Medium |

## Track 3 — Social & Gamification

| Project | Description | Complexity |
|---------|-------------|:---:|
| **Prediction Market Overlay** | Binary yes/no markets on price movements, settled against Pacifica mark price | High |
| **Funded Challenges Platform** | Build funded challenge platform | High |

## Track 4 — DeFi Composability

| Project | Description | Complexity |
|---------|-------------|:---:|
| **Vault Strategy Manager** | Pooled capital executing strategies via builder code, with depositor shares | High |
| **Basis Trade Vault** | Automated long spot + short perp to harvest funding | High |
| **Options-like Payoffs** | Construct synthetic calls/puts using perp positions + stop orders | High |
| **Cross-Chain Bridge Interface** | Streamlined deposit flow from other chains into Pacifica | High |
| **Margin Efficiency Tool** | Optimize collateral allocation across unified margin account | Medium |

## Observations

- **Track 2 is sparse** (only 2 ideas). Judge field will be smaller → better chance of winning.
- **Low-complexity ideas:** only TradingView Webhook Executor. Everything else needs Medium+ effort.
- **Low-Medium:** Smart TP/SL Manager is the sweet spot for guaranteed ship.
- **Medium and demo-friendly:** Whale Watcher, Orderbook Imbalance, Grid Bot, Funding Arbitrage.
- **High complexity** (skip unless you have a team of 3+): Cross-Exchange Spread Bot, Hummingbot, all of Track 3 and most of Track 4.

## Complexity × Impact grid

```
High impact │  [Basis Trade]       [Whale Watcher]    [Funded Challenges]
            │  [Vault Manager]     [Orderbook Imb.]   [Prediction Market]
            │  [Options Payoffs]   [Grid Bot]
            │                      [Funding Arb]
            │
            │                      [TP/SL Manager]
 Low impact │                      [TV Webhook Exec]
            └─────────────────────────────────────────────────────
               High complexity    Medium complexity   Low complexity
```

The "sweet spot" for a solo/small team in one month: **Medium complexity, high impact**. That's the upper-middle column — **Whale Watcher, Orderbook Imbalance, Grid Bot, Funding Arbitrage**.
