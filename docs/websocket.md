# WebSocket API

## Endpoints

| Env | URL |
|-----|-----|
| Mainnet | `wss://ws.pacifica.fi/ws` |
| Testnet | `wss://test-ws.pacifica.fi/ws` |

## Connection lifecycle

- Idle timeout: **60 seconds** with no messages → server closes
- Hard max: **24 hours** per connection → server closes, you must reconnect

Keepalive:
```json
{ "method": "ping" }
```
Server responds with `{ "channel": "pong" }`.

## Subscribe / unsubscribe message shape

```json
{ "method": "subscribe",   "params": { "source": "<channel>", ...opts } }
{ "method": "unsubscribe", "params": { "source": "<channel>", ...opts } }
```

## Public channels

| Channel source | Purpose |
|----------------|---------|
| `prices` | All symbols' mark/last price as it updates |
| `orderbook` | Book snapshots/diffs for a symbol at given aggregation |
| `bbo` | Best bid/offer (top of book) per symbol |
| `trades` | Taker-side trades per symbol |
| `candle` | Candlestick updates for symbol + interval |
| `mark_price_candle` | Mark-price candles for symbol + interval |

## Private / account channels

Require signing when subscribing (or using an authenticated connection — check docs):

| Channel source | Purpose |
|----------------|---------|
| `account_info` | Equity, balance, order count |
| `account_positions` | Position changes |
| `account_order_updates` | Order fill / cancel / placement events |
| `account_trades` | Trades on this account |
| `account_margin` | Margin mode changes |
| `account_leverage` | Leverage changes |

## Trading via WebSocket

Reduces latency vs REST for high-freq bots. Same signed payload format as REST, wrapped in a WS command:

| Command | Equivalent REST |
|---------|-----------------|
| `create_market_order` | `POST /orders/create_market` |
| `create_limit_order` | `POST /orders/create` |
| `create_stop_order` | `POST /orders/stop/create` |
| `set_position_tpsl` | `POST /positions/tpsl` |
| `edit_order` | `POST /orders/edit` |
| `batch_order` | `POST /orders/batch` |
| `cancel_order` | `POST /orders/cancel` |
| `cancel_all_orders` | `POST /orders/cancel_all` |

All support attaching a builder code in the signed payload (see [builder-program.md](./builder-program.md)).

## Minimal Python example (from vendor/python-sdk/ws/subscribe_prices.py)

```python
import asyncio, json, websockets

WS_URL = "wss://ws.pacifica.fi/ws"

async def main():
    async with websockets.connect(WS_URL, ping_interval=30) as ws:
        await ws.send(json.dumps({"method": "subscribe", "params": {"source": "prices"}}))
        async for msg in ws:
            print(json.loads(msg))

asyncio.run(main())
```

## Reconnect strategy

- Detect close (either 60s idle or 24h hard cap)
- Exponential backoff with jitter (100ms → 30s cap)
- Re-subscribe to all channels after reconnect
- Use `client_order_id` (UUIDs) on every order so you can dedupe on reconnect
