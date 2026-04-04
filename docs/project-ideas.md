# Project Selection — Hackathon Recommendation

> Official Pacifica-provided list is in [official-project-ideas.md](./official-project-ideas.md). This doc evaluates them against our constraints (solo/small team, one month, maximize judging score) and picks a winner.

## Scoring rubric

Each idea scored 1–10 on the judging criteria, plus a "Ship" column for realistic delivery risk.

| # | Idea | Track | Complexity | Innov | Tech | UX | Impact | Present | Ship | **Total** |
|---|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | **Whale Watcher + Orderbook Imbalance** (combined) | 2 | Med | 9 | 8 | 9 | 9 | 10 | 8 | **53** |
| 2 | TradingView Webhook + Smart TP/SL | 1 | Low-Med | 7 | 8 | 8 | 9 | 8 | 10 | 50 |
| 3 | Funding Rate Arbitrage Bot | 1 | Med | 8 | 9 | 6 | 8 | 7 | 6 | 44 |
| 4 | Grid Trading Bot | 1 | Med | 5 | 8 | 8 | 7 | 7 | 8 | 43 |
| 5 | Margin Efficiency Tool | 4 | Med | 8 | 8 | 7 | 8 | 7 | 6 | 44 |
| 6 | Basis Trade Vault | 4 | High | 9 | 9 | 6 | 9 | 7 | 3 | 43 |
| 7 | Options-like Payoffs | 4 | High | 10 | 9 | 6 | 8 | 8 | 3 | 44 |
| 8 | Whale Watcher (alone) | 2 | Med | 7 | 7 | 8 | 8 | 9 | 9 | 48 |
| 9 | Orderbook Imbalance (alone) | 2 | Med | 6 | 7 | 8 | 7 | 8 | 9 | 45 |

## Primary recommendation: **PacificaPulse** — Whale Watcher + Orderbook Imbalance (Track 2)

Combined product. One dashboard, two signals, **high synergy**:

- **Whale module:** polls `/positions/history` across a tracked list of large addresses + subscribes to `account_positions` WS (via rotating pubkey reads) → emits events when a whale opens, adds to, or closes a position above a $ threshold.
- **Orderbook module:** subscribes to the `orderbook` WS channel for top N markets → computes real-time **bid/ask pressure** (weighted depth delta), **imbalance ratio**, and **book-slope** → renders a heatmap + time-series.
- **Fusion layer:** the killer feature — **correlate whale moves with orderbook pressure shifts**. When a whale opens a long AND the orderbook shows sustained bid imbalance → high-conviction signal. This is analysis no off-the-shelf tool does.

### Why this wins

| Judging criterion | How we score |
|---|---|
| **Innovation** | Fusion of two listed ideas into a hybrid signal product is genuinely novel. Nobody correlates whale flow with microstructure in real time on Pacifica today. |
| **Technical Execution** | Requires correct WS reconnect, multi-stream state management, efficient delta computation. Shows rigor without being unshippable. |
| **User Experience** | Dashboard UX is demo gold. One screen, color-coded alerts, big number readouts, a heatmap. |
| **Potential Impact** | Every Pacifica trader wants to know "are whales moving + is the book ready to run?" Direct adoption path. |
| **Presentation** | Perfect for a 3-minute demo video — show a live whale event + an orderbook spike at the same time. |

### Scope (monthly breakdown)

**Week 1 — Foundations**
- [ ] Project scaffold (Next.js 14 + TypeScript + Tailwind + shadcn/ui)
- [ ] Pacifica TS client library in `src/lib/pacifica/`:
  - [ ] Signing wrapper (port from `vendor/python-sdk/common/utils.py`)
  - [ ] REST client with 429 backoff
  - [ ] WS client with reconnect + resubscribe + heartbeat
  - [ ] Typed response models for markets, positions, orderbook
- [ ] Local `.env` with `PRIVATE_KEY`, `ADDRESS`, `PACIFICA_ENV=testnet|mainnet`
- [ ] One happy-path demo: subscribe to `prices`, render a ticker

**Week 2 — Whale module**
- [ ] Tracked-address list (hardcoded top 50 traders for v1)
- [ ] Position poller + diff engine → events: `OPEN`, `ADD`, `REDUCE`, `CLOSE`
- [ ] Whale event UI (timeline component)
- [ ] Alert thresholds (configurable per-user in localStorage)

**Week 3 — Orderbook module + fusion**
- [ ] WS subscribe to `orderbook` for top 5 markets
- [ ] Compute: imbalance ratio, weighted depth, slope, spread volatility
- [ ] Heatmap + time-series chart (recharts or visx)
- [ ] Fusion logic: whale event + orderbook direction match → flag as "high conviction"
- [ ] Builder-code wired into any optional "Execute Hedge" button

**Week 4 — Polish + submission**
- [ ] URL-state so users can share their configured dashboard
- [ ] Dark mode + mobile layout
- [ ] Demo video (3 min, OBS, screencap + narration)
- [ ] README with architecture diagram + screenshots
- [ ] Docs + submission form

### Risks & mitigations

| Risk | Mitigation |
|---|---|
| Pacifica API doesn't expose cross-account position queries | Use `/positions/history` polling for a curated address list; WS `account_positions` only for the current user |
| WS rate limits on 20 subs per channel | Aggregate top markets only; use `bbo` (lighter) where full orderbook not needed |
| Demo video footage is boring without a real whale event | Pre-record during a volatile session; fall back to a deterministic simulation |
| Builder-code requires Pacifica ops sign-off which might take days | Start the email thread on day 1; build without it, wire it in when approved |

---

## Secondary recommendation (lower risk, lower ceiling): **TradingView Webhook + Smart TP/SL Manager** (Track 1)

Combines the two lowest-complexity Track 1 ideas into a cohesive product:

1. User creates a TradingView alert with a webhook URL pointing to our service.
2. Our service receives the alert, validates signature, places the order on Pacifica with our builder code.
3. Our Smart TP/SL Manager layers above native orders: trailing stops, partial take-profits at multiple levels, breakeven move, time-based exit.
4. User dashboard shows active positions, active managers, and fee revenue (ours + theirs).

**Why this is attractive as a backup:**
- **Low-Medium complexity** → highest confidence we ship with polish
- Immediate and automatic **builder code revenue** on every trade that flows through
- Clear target user (TradingView traders wanting Pacifica execution)
- Ships in ~2 weeks, leaving time for polish and stretch features

**Why it's not the primary:**
- Lower innovation ceiling — TradingView webhook executors exist for other exchanges
- Demo is less visually compelling (form + log, not a live heatmap)
- Smaller "wow" factor for judges

---

## Do-not-pick list (for this team size / timeline)

| Idea | Why not |
|---|---|
| Cross-Exchange Spread Bot | Requires integration with Binance/Bybit on top of Pacifica — double work |
| Hummingbot strategy | Hummingbot learning curve is a month on its own |
| Prediction Market Overlay | Needs settlement contract infra + UX for binary markets — too much |
| Funded Challenges Platform | KYC, custody, rules engine → startup-grade not hackathon-grade |
| Basis Trade Vault / Vault Strategy Manager | Smart contracts + keeper infra + depositor shares = not shippable solo in 4 weeks |
| Cross-Chain Bridge Interface | Multi-chain deposit UX is non-trivial and low-differentiation |

---

## Decision point

**My call: Go with PacificaPulse (option 1).** Best judge-criteria fit, most demo-friendly, and the fusion layer is a defensible moat vs generic implementations of either whale watcher or orderbook tool alone.

**If we want to minimize risk,** option 2 (TradingView + TP/SL) is the safer bet and still puts us in contention.

**If the user disagrees and wants something else entirely,** we can score any other idea against the rubric in 5 min.

## Next action (once picked)

1. Request builder code from `ops@pacifica.fi` on day 1 (can take days)
2. Fund testnet wallet
3. Scaffold `src/` + `package.json` + Vercel config
4. Start Week 1 foundations
