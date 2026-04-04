# Rate Limits

Pacifica uses a **credit-based quota system** on a rolling 60-second window.

## Tiers (credits per 60s)

| Tier | Credits / 60s |
|------|---------------|
| Unidentified IP (no API key) | 125 |
| Valid API Config Key | 300 |
| Fee Tier 1–5 | 300 – 6,000 |
| VIP1 | 20,000 |
| VIP2 | 30,000 |
| VIP3 | 40,000 |

Credits are **shared across a main account and all its subaccounts**.

## Credit costs

| Action | Cost |
|--------|------|
| Standard request / order action | 1 credit |
| Order cancellation | 0.5 credit |
| Heavy GET (e.g. portfolio history, large ranges) | 1–12 credits |

> Internal note: all credit values are multiplied by 10 server-side to support fractional costs. So "1 credit" is actually stored as 10. This only matters if you parse quota fields.

## WebSocket limits

- Max **300** concurrent connections per IP
- Max **20** subscriptions per channel per connection

## When you blow the budget

- REST: HTTP `429 Too Many Requests`
- WebSocket: error frame with rate-limit code

## Quota feedback

Both REST headers and WS responses include:

| Field | Meaning |
|-------|---------|
| `r` | Remaining credits |
| `t` | Seconds until window refresh |
| `q` | Total quota for the window |
| `w` | Window size (seconds) |

## Practical budgeting

- **Polling a dashboard** at 1s → ~60 credits/min → fine on default tier
- **High-freq bot** doing 10 orders + 10 cancels + 30 reads per second → ~1,500 credits/min → need Tier 3+ or VIP
- **Arbitrage bot** → always use WebSocket for market data (no credit cost on pushes) and only burn credits on order actions

## Getting a higher tier

Create an API config key (gives 300/60s default), bump further by trading volume or applying to the VIP program.
