# Pacifica Python SDK — Local Reference

Cloned at `vendor/python-sdk/`. This is an **example repo**, not a pip package — you import from the local path or copy the helper files.

## Layout

```
vendor/python-sdk/
├── common/
│   ├── constants.py    # REST_URL, WS_URL (mainnet/testnet)
│   └── utils.py        # sign_message, sign_with_hardware_wallet, sort_json_keys
├── rest/               # 20+ REST examples
│   ├── create_market_order.py
│   ├── create_limit_order.py
│   ├── create_twap_order.py
│   ├── create_position_tpsl.py
│   ├── batch_orders.py
│   ├── cancel_order.py
│   ├── cancel_all_orders.py
│   ├── cancel_twap_order.py
│   ├── update_leverage.py
│   ├── deposit.py
│   ├── create_lake.py
│   ├── lake_deposit.py
│   ├── lake_withdraw.py
│   ├── create_subaccount.py
│   ├── create_subaccount_hardware.py
│   ├── list_subaccounts.py
│   ├── transfer_subaccount_fund.py
│   ├── transfer_subaccount_fund_hardware.py
│   ├── api_agent_keys.py
│   ├── api_agent_keys_detailed.py
│   ├── api_config_keys.py
│   ├── get_twap_order_history.py
│   ├── get_twap_order_history_by_id.py
│   └── get_open_twap_order.py
├── ws/                 # WebSocket examples
│   ├── subscribe_prices.py
│   ├── subscribe_twap.py
│   ├── create_market_order.py
│   ├── create_market_order_agent_wallet.py
│   ├── create_limit_order.py
│   ├── cancel_order.py
│   └── cancel_all_orders.py
├── requirements.txt
└── README.md
```

## Installing

```bash
cd vendor/python-sdk
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Key deps: `requests`, `websockets`, `solders`, `base58`.

## Running an example

Examples are run as **modules** (not scripts) so imports resolve:

```bash
# From vendor/python-sdk/
python3 -m rest.create_market_order
python3 -m ws.subscribe_prices
```

Each example has a `PRIVATE_KEY = ""` constant you must fill in — **or** better, replace with `os.environ["PRIVATE_KEY"]` so you can `.env`-load it.

## Key helpers (`common/utils.py`)

```python
sign_message(header, payload, keypair) -> (message, signature_b58)
sign_with_hardware_wallet(header, payload, ledger_path) -> (message, signature_b58)
sort_json_keys(value) -> recursively_sorted_value
prepare_message(header, payload) -> canonical_compact_json_str
```

`prepare_message` does the sort + compact-serialize; `sign_message` calls it then signs with ed25519 and base58-encodes.

## Constants (`common/constants.py`)

```python
# Mainnet
REST_URL = "https://api.pacifica.fi/api/v1"
WS_URL = "wss://ws.pacifica.fi/ws"

# Testnet (commented out in repo — swap in for dev)
# REST_URL = "https://test-api.pacifica.fi/api/v1"
# WS_URL = "wss://test-ws.pacifica.fi/ws"
```

## Patterns worth copying

1. **Signature header builder:**
   ```python
   signature_header = {
       "timestamp": int(time.time() * 1000),
       "expiry_window": 5000,
       "type": "create_market_order",
   }
   ```

2. **Request assembly** — note that after signing, the body is flattened (no `data` wrapper):
   ```python
   request = {
       "account": public_key,
       "signature": signature,
       "timestamp": signature_header["timestamp"],
       "expiry_window": signature_header["expiry_window"],
       **signature_payload,
   }
   ```

3. **TWAP order with sub-order count:**
   ```python
   planned_sub_order_count = 7
   "duration_in_seconds": 30 * (planned_sub_order_count - 1)  # 30s gaps between slices
   ```

4. **Agent wallet pattern** (`ws/create_market_order_agent_wallet.py`) — sign with an agent key instead of the root wallet key, so you can keep the master offline.

## Gotchas

- `requirements.txt` pins older `solders` versions; if you hit incompatibility, upgrade and use `Keypair.from_base58_string`.
- The SDK does **not** handle rate limiting, reconnects, or retries — add your own.
- No built-in order reconciliation — always set `client_order_id` to a UUID.
- Testnet URLs are commented out in `constants.py`; we'll need a small wrapper to toggle envs.

## Wrapping it for our project

Recommended: write a thin `pacifica_client.py` in our project that:
- Reads `PRIVATE_KEY` / `ADDRESS` / `ENV` from env vars
- Imports helpers from `vendor/python-sdk/common/utils.py`
- Exposes typed methods: `create_market_order(...)`, `cancel_all(...)`, `subscribe(...)`
- Handles 429 backoff + WS reconnect
- Injects `builder_code` automatically on every order
