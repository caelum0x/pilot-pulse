# Pacifica Signing Scheme

All POST endpoints must be signed. GETs and WS subscribes are unsigned.

## Algorithm

- **Curve:** ed25519 (Solana keypair)
- **Encoding:** base58 for private key, signature, and address
- **Canonical form:** JSON with recursively sorted keys, compact serialization (no spaces)

## Step-by-step

1. **Build the signature header:**
   ```json
   {
     "timestamp": 1742243160000,
     "expiry_window": 5000,
     "type": "create_market_order"
   }
   ```
   `timestamp` is milliseconds since epoch. `expiry_window` defaults to 30000 (30s); shorter is fine. `type` is the operation identifier (see operation types below).

2. **Merge with the operation payload under a `data` key:**
   ```json
   {
     "timestamp": 1742243160000,
     "expiry_window": 5000,
     "type": "create_market_order",
     "data": {
       "symbol": "BTC",
       "reduce_only": false,
       "amount": "0.1",
       "side": "bid",
       "slippage_percent": "0.5",
       "client_order_id": "..."
     }
   }
   ```

3. **Recursively sort all keys alphabetically** at every nesting level.

4. **Compact-serialize** — no spaces, `separators=(",", ":")`.

5. **Sign the UTF-8 bytes with ed25519.**

6. **Base58-encode the signature.**

7. **Build the HTTP request body by flattening** — `account`, `signature`, `timestamp`, `expiry_window` at top level plus the **original operation fields** (not the wrapped `data` object):
   ```json
   {
     "account": "<pubkey>",
     "signature": "<base58>",
     "timestamp": 1742243160000,
     "expiry_window": 5000,
     "symbol": "BTC",
     "reduce_only": false,
     "amount": "0.1",
     "side": "bid",
     "slippage_percent": "0.5",
     "client_order_id": "..."
   }
   ```

## Python reference (from vendor/python-sdk)

```python
import json, time, uuid, requests, base58
from solders.keypair import Keypair

REST_URL = "https://api.pacifica.fi/api/v1"
PRIVATE_KEY = "<base58 secret>"  # from env var in real code

def sort_json_keys(v):
    if isinstance(v, dict):
        return {k: sort_json_keys(v[k]) for k in sorted(v.keys())}
    if isinstance(v, list):
        return [sort_json_keys(x) for x in v]
    return v

def sign(header, payload, keypair):
    merged = {**header, "data": payload}
    msg = json.dumps(sort_json_keys(merged), separators=(",", ":"))
    sig = keypair.sign_message(msg.encode("utf-8"))
    return msg, base58.b58encode(bytes(sig)).decode("ascii")

keypair = Keypair.from_base58_string(PRIVATE_KEY)
pubkey = str(keypair.pubkey())

header = {
    "timestamp": int(time.time() * 1000),
    "expiry_window": 5000,
    "type": "create_market_order",
}
payload = {
    "symbol": "BTC",
    "reduce_only": False,
    "amount": "0.1",
    "side": "bid",
    "slippage_percent": "0.5",
    "client_order_id": str(uuid.uuid4()),
}

_, signature = sign(header, payload, keypair)
body = {
    "account": pubkey,
    "signature": signature,
    "timestamp": header["timestamp"],
    "expiry_window": header["expiry_window"],
    **payload,
}
r = requests.post(f"{REST_URL}/orders/create_market", json=body)
print(r.status_code, r.text)
```

## TypeScript reference (from vendor/pacifica-mcp, simplified)

```ts
import bs58 from "bs58";
import nacl from "tweetnacl";

function sortKeys(v: any): any {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.keys(v).sort().reduce<Record<string, any>>((acc, k) => {
      acc[k] = sortKeys(v[k]);
      return acc;
    }, {});
  }
  return v;
}

function sign(header: object, data: object, privateKeyB58: string) {
  const merged = { ...header, data };
  const msg = JSON.stringify(sortKeys(merged));
  const secret = bs58.decode(privateKeyB58);
  const sig = nacl.sign.detached(new TextEncoder().encode(msg), secret);
  return bs58.encode(sig);
}
```

## Operation Types

These are the `type` strings used in the signature header. Each maps 1:1 to an endpoint.

| Type | Endpoint |
|------|----------|
| `create_order` | `POST /orders/create` |
| `create_market_order` | `POST /orders/create_market` |
| `create_stop_order` | `POST /orders/stop/create` |
| `create_twap_order` | `POST /orders/twap/create` |
| `cancel_order` | `POST /orders/cancel` |
| `cancel_all_orders` | `POST /orders/cancel_all` |
| `cancel_stop_order` | `POST /orders/stop/cancel` |
| `cancel_twap_order` | `POST /orders/twap/cancel` |
| `set_position_tpsl` | `POST /positions/tpsl` |
| `update_leverage` | `POST /account/leverage` |
| `update_margin_mode` | `POST /account/margin` |
| `withdraw` | `POST /account/withdraw` |
| `subaccount_initiate` | `POST /account/subaccount/create` (step 1) |
| `subaccount_confirm` | `POST /account/subaccount/create` (step 2) |
| `subaccount_transfer` | `POST /account/subaccount/transfer` |
| `bind_agent_wallet` | `POST /agent/bind` |
| `create_api_key` | `POST /account/api_keys/create` |
| `revoke_api_key` | `POST /account/api_keys/revoke` |
| `list_api_keys` | `POST /account/api_keys` |
| `approve_builder_code` | `POST /account/builder_codes/approve` |
| `revoke_builder_code` | `POST /account/builder_codes/revoke` |

## Hardware wallet support

The Python SDK includes `sign_with_hardware_wallet()` which shells out to `solana sign-offchain-message -k <ledger-path>` — useful if you're trading from a real wallet, not a hot key.

## Common pitfalls

- Don't include whitespace in the canonical JSON — `json.dumps` default has spaces; must pass `separators=(",", ":")`.
- Sort keys **recursively** — nested objects also need sorting.
- Don't wrap `data` in the HTTP body — it's only in the signing message. The body has fields flattened.
- `timestamp` must be in milliseconds.
- Clock skew > `expiry_window` → request rejected. Use NTP if running long-lived bots.
