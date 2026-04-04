# Pacifica REST API Reference

Distilled from https://pacifica.gitbook.io/docs/api-documentation/api and cross-referenced with `vendor/python-sdk` and `vendor/pacifica-mcp`.

## Base URLs

| Env | REST base | WebSocket |
|-----|-----------|-----------|
| Mainnet | `https://api.pacifica.fi/api/v1` | `wss://ws.pacifica.fi/ws` |
| Testnet | `https://test-api.pacifica.fi/api/v1` | `wss://test-ws.pacifica.fi/ws` |

Format: JSON in, JSON out. All POST requests must be signed (see [signing.md](./signing.md)). GETs and WS subscribes are unsigned.

> **Path note:** The older `pacifica-mcp` repo uses paths like `/api/v1/info`, `/api/v1/kline`, `/api/v1/orders/create`. The current docs and python-sdk use the newer paths below (`/markets/info`, `/orders/create_market`, etc.). **Trust the python-sdk paths** — the MCP may be stale.

---

## Market Data (public, no signing)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/markets/info` | Exchange info — all tradable pairs, tick size, leverage limits |
| GET | `/markets/prices` | Mark prices, funding rates, market stats for all symbols |
| GET | `/markets/candles` | Historical price candles (`symbol`, `interval`, `start_time`, `end_time`) |
| GET | `/markets/mark-price-candles` | Historical mark-price candles |
| GET | `/markets/orderbook` | Current bid/ask levels for a symbol |
| GET | `/markets/trades` | Recent trades for a symbol |
| GET | `/markets/historical-funding` | Historical funding for a symbol |

Candle intervals (from MCP server): `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`.

---

## Account (mostly GET — no signing unless noted)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/account` | Balance + fee level. Query: `account=<pubkey>` |
| GET | `/account/settings` | Leverage + margin mode per symbol |
| POST | `/account/leverage` | **Signed.** Update leverage for a symbol |
| POST | `/account/margin` | **Signed.** Switch isolated/cross margin |
| GET | `/positions` | Current open positions |
| GET | `/positions/history` | Historical position changes |
| GET | `/funding/history` | Funding payments received/paid |
| GET | `/portfolio` | Portfolio equity history (for charts) |
| POST | `/account/withdraw` | **Signed.** Withdraw funds |
| GET | `/trades` | Account trade history |
| GET | `/account/equity-history` | Equity time series |
| GET | `/account/balance-history` | Balance time series |

## Subaccounts

| Method | Path | Op type |
|--------|------|---------|
| POST | `/account/subaccount/create` | `subaccount_initiate` + `subaccount_confirm` |
| GET | `/account/subaccount/list` | — |
| POST | `/account/subaccount/transfer` | `subaccount_transfer` |

## Agent Keys / API Keys

| Method | Path | Op type |
|--------|------|---------|
| POST | `/agent/bind` | `bind_agent_wallet` |
| POST | `/account/api_keys/create` | `create_api_key` |
| POST | `/account/api_keys/revoke` | `revoke_api_key` |
| GET | `/account/api_keys` | `list_api_keys` (list of existing keys) |

---

## Orders (all POSTs signed)

| Method | Path | Op type |
|--------|------|---------|
| POST | `/orders/create_market` | `create_market_order` |
| POST | `/orders/create` | `create_order` (limit) |
| POST | `/orders/stop/create` | `create_stop_order` |
| POST | `/positions/tpsl` | `set_position_tpsl` |
| POST | `/orders/cancel` | `cancel_order` |
| POST | `/orders/cancel_all` | `cancel_all_orders` |
| POST | `/orders/stop/cancel` | `cancel_stop_order` |
| POST | `/orders/edit` | edit limit order |
| POST | `/orders/batch` | multi-op in one request |
| GET | `/orders` | Open orders |
| GET | `/orders/history` | Order history summary |
| GET | `/orders/history/{order_id}` | History by ID |

### Market order body (example)

```json
{
  "account": "<pubkey>",
  "signature": "<base58 ed25519>",
  "timestamp": 1742243160000,
  "expiry_window": 5000,

  "symbol": "BTC",
  "reduce_only": false,
  "amount": "0.1",
  "side": "bid",
  "slippage_percent": "0.5",
  "client_order_id": "<uuid>"
}
```

Sides: `bid` (buy) / `ask` (sell). TIF (limit orders): `GTC`, `IOC`, `ALO`.

## TWAP

| Method | Path | Op type |
|--------|------|---------|
| POST | `/orders/twap/create` | `create_twap_order` |
| POST | `/orders/twap/cancel` | `cancel_twap_order` |
| GET | `/orders/twap` | Open TWAP orders |
| GET | `/orders/twap/history` | TWAP history |
| GET | `/orders/twap/history/{order_id}` | TWAP history by ID |

TWAP signed payload includes `duration_in_seconds` and `slippage_percent`. See `vendor/python-sdk/rest/create_twap_order.py`.

---

## Auxiliary

- `GET /markets/symbols` — list of supported trading symbols
- `GET /markets/tick-lot-sizes` — tick and lot size per symbol
- `GET /orders/last-id` — last order id (useful for pagination / reconciliation)
- Error codes: https://pacifica.gitbook.io/docs/api-documentation/api/error-codes

## Quick sanity checks (curl)

```bash
curl https://api.pacifica.fi/api/v1/markets/info | jq '.[] | {symbol, maxLeverage, tickSize}'
curl "https://api.pacifica.fi/api/v1/account?account=HEQ3kHCavWvgFtmBLNaFbDyBrVn9bU4CKctnRhxfrRVS"
```

## See also

- [signing.md](./signing.md) — how to sign POSTs
- [websocket.md](./websocket.md) — realtime streams
- [rate-limits.md](./rate-limits.md) — quotas and 429 handling
- [builder-program.md](./builder-program.md) — attach builder codes to orders for fee share
