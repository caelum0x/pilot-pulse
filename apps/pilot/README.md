# PacificaPilot

TradingView webhook executor + Smart TP/SL manager for the Pacifica perp exchange.
Part of the Pacifica Hackathon Track 1 submission (Trading Applications & Bots).

---

## What it does

PacificaPilot sits between your TradingView strategy alerts and Pacifica. It:

1. **Receives signed webhook alerts** from TradingView (HMAC-SHA256 per-user secret)
2. **Executes market orders** on Pacifica with your builder code auto-attached
3. **Manages the position afterwards** via a layered Smart TP/SL engine:
   - Trailing stops (ratchet-only, never reverse)
   - Hard take-profits
   - Partial take-profits (scale-out ladders)
   - Breakeven locks (move stop to entry once in profit)
   - Time exits (close after N minutes)

### Architecture

```
  TradingView
       |  POST /api/webhooks/tv  (HMAC signed)
       v
  +------------------+       +----------------+
  | webhook route    |------>|  executor      |
  |  - verify HMAC   |       |  - intent calc |
  |  - parse alert   |       |  - order send  |
  +------------------+       +-------+--------+
                                     |
                         +-----------+-----------+
                         |                       |
                   (USE_LIVE_PACIFICA?)          |
                         |                       |
                  false  v      true  v          |
                  +-----------+  +-----------+   |
                  | mock      |  | Pacifica  |   |
                  | backend   |  | SDK client|   |
                  +-----------+  +-----------+   |
                                                 v
                                          +-------------+
                                          | TP/SL loop  |
                                          | every 3s    |
                                          +-------------+
                                                 |
                                            decisions
                                                 v
                                        close / partial
```

All state is in-memory for v1. Positions, managers, and webhook history live
in a process-local store. Restarting the server wipes state — deliberate for
the hackathon demo.

---

## Quickstart

```bash
# From monorepo root
pnpm install
pnpm -F @pacifica-hack/pilot dev
# dashboard: http://localhost:3001
```

Environment (copy `.env.example` to `.env.local`):

```
PILOT_WEBHOOK_SECRET=dev-secret-change-me
BUILDER_CODE=HACKATHON_TEST
USE_LIVE_PACIFICA=false
NEXT_PUBLIC_PACIFICA_ENV=testnet
ADDRESS=
PRIVATE_KEY=
```

`USE_LIVE_PACIFICA=false` (the default) routes every order through the mock
backend — safe to run without mainnet funds. See **Running modes** below
for live mode setup.

---

## Testing the webhook

```bash
BODY='{"action":"buy","symbol":"BTC","amount_usd":100,"strategy_id":"test","tp_pct":2.5,"sl_pct":1,"trail_pct":0.8,"timestamp":1742243160000}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$PILOT_WEBHOOK_SECRET" -hex | awk '{print $2}')

curl -X POST http://localhost:3001/api/webhooks/tv \
  -H "Content-Type: application/json" \
  -H "x-pilot-signature: $SIG" \
  -d "$BODY"
```

A successful response looks like:

```json
{
  "status": "success",
  "orderId": 1001,
  "managerId": "mgr_...",
  "filledPrice": 93512.45,
  "execTimeMs": 12
}
```

---

## TradingView alert setup

1. In TradingView: **Create Alert → Notifications → Webhook URL** →
   `https://<your-host>/api/webhooks/tv`
2. In the **Message** field, paste a JSON body matching the schema:

   ```json
   {
     "action": "{{strategy.order.action}}",
     "symbol": "BTC",
     "amount_usd": 500,
     "strategy_id": "my_macd_v1",
     "tp_pct": 2.5,
     "sl_pct": 1.0,
     "trail_pct": 0.8,
     "breakeven_pct": 0.75,
     "time_exit_minutes": 240,
     "timestamp": {{time}}
   }
   ```

3. Compute the HMAC-SHA256 of the body using your `PILOT_WEBHOOK_SECRET` and
   pass it in the `x-pilot-signature` header. (TradingView does not natively
   sign webhook bodies — the recommended pattern is to front the webhook with
   a tiny signer proxy, or rotate the webhook path as a shared secret.)

---

## Alert schema

| field                | type    | required | notes                                    |
|----------------------|---------|----------|------------------------------------------|
| `action`             | string  | yes      | `"buy"` \| `"sell"` \| `"close"`         |
| `symbol`             | string  | yes      | e.g. `"BTC"`                             |
| `amount_usd`         | number  | yes      | notional USD size                        |
| `strategy_id`        | string  | yes      | free-form tag used for filtering         |
| `timestamp`          | number  | yes      | epoch millis                             |
| `tp_pct`             | number  | no       | hard take-profit, % from entry           |
| `sl_pct`             | number  | no       | hard stop-loss, % from entry             |
| `trail_pct`          | number  | no       | trailing stop distance, %                |
| `breakeven_pct`      | number  | no       | move stop to entry once +X% in favor     |
| `time_exit_minutes`  | number  | no       | auto-close after N minutes               |

If any manager-related fields are present, a Smart TP/SL manager is installed
for the resulting position and becomes visible in the dashboard.

---

## Dashboard

- **Webhook Activity** — last 50 alerts with timings and status
- **Active Positions** — live positions with PnL and manager badges
- **TP/SL Managers** — rule chips, current stop level, delete action
- **Setup Guide** — copy-ready webhook URL, alert body, and signed curl

The mode pill in the header turns **amber** in mock mode and **red** in live
mode — both pulse to make the current mode impossible to miss.

---

## Running modes

PacificaPilot has two fully wired backends behind the same `PacificaBroker`
interface (`src/lib/pacifica-broker.ts`). The executor, manager loop, and
API routes never branch on mode — they all call `getBroker()` and let the
factory return the right implementation.

### Mock mode (default)

Runs against an in-process random-walk exchange. No credentials required,
nothing hits the real API. Perfect for local demos and CI.

```bash
# .env.local
USE_LIVE_PACIFICA=false
```

### Live mode

Flip one env var, provide your Pacifica credentials, and every market order
goes through the real REST API via `@pacifica-hack/sdk`. Builder code is
auto-attached to every signed payload by the SDK client.

```bash
# .env.local
USE_LIVE_PACIFICA=true
NEXT_PUBLIC_PACIFICA_ENV=testnet     # or mainnet — at your own risk
BUILDER_CODE=HACKATHON_TEST
ADDRESS=<your base58 Solana pubkey>
PRIVATE_KEY=<your base58 Solana secret>
```

If `USE_LIVE_PACIFICA=true` but `ADDRESS`/`PRIVATE_KEY` are missing, the
broker factory logs the failure and falls back to mock mode. The UI mode
pill surfaces this as **LIVE MODE UNAVAILABLE** via `/api/config` so you
never get silently degraded without noticing.

---

## Signed webhook flow

The `/api/webhooks/tv` endpoint verifies every request with HMAC-SHA256 over
the raw body using `PILOT_WEBHOOK_SECRET`. The hex digest goes in the
`x-pilot-signature` header. Unsigned requests are rejected with 401.

```bash
SECRET='dev-secret-change-me'
BODY='{"action":"buy","symbol":"BTC","amount_usd":100,"strategy_id":"macd_v1","tp_pct":2.5,"sl_pct":1,"trail_pct":0.8,"timestamp":1742243160000}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')

curl -X POST http://localhost:3001/api/webhooks/tv \
  -H "Content-Type: application/json" \
  -H "x-pilot-signature: $SIG" \
  -d "$BODY"
```

TradingView itself cannot sign bodies natively — the recommended pattern is
a tiny signer proxy (or rotate the webhook path as a shared secret).

---

## State persistence

Webhook history, active managers, and fee accounting are mirrored to
`.pilot-state.json` (in the working directory, gitignored) on every
mutation via a 500ms debounced write. The file is reloaded on module
boot, so Next.js dev hot-reload and brief server restarts preserve state.

- First run: file doesn't exist — not an error.
- Parse errors / version mismatch: fall back to empty state, log once.
- `SIGKILL` mid-write is safe: writes are atomic via tmp-file + rename.

---

## Notes & limitations

- **Fee estimate is a placeholder.** `LivePacificaBroker` estimates a 5 bps
  taker fee on every fill for accounting purposes. Replace with the
  actual fee from the API response once available.
- **Mark-price fills.** The Pacifica REST API does not return a fill price
  for market orders, so the broker reports the mark price at submit time
  as the approximate fill. The manager loop always uses live marks anyway.
- **Single-account.** One pilot per deployment. Multi-tenant is out of scope.
- **HMAC only.** No cookie/session auth on the dashboard — run behind a
  private network / tunnel during the hackathon.
