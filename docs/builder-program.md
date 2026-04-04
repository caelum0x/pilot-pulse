# Pacifica Builder Program

Source: https://pacifica.gitbook.io/docs/programs/builder-program

## What it is

**Builder codes** let third-party developers earn fees when users place orders through their app. A builder registers a code, users explicitly approve it (with a max fee rate), and from then on any order that includes `"builder_code": "<code>"` pays an extra fee to the builder.

This is the mechanism the hackathon rules reference when they say *"Teams MUST use Pacifica API and/or Builder Code."*

Rewards budget: **up to 10,000,000 points** reserved for Volume Two (March 12 – June 12, 2026), distributed based on each team's contribution to Pacifica's growth.

## End-to-end flow

```
Builder (us)                     Pacifica                     User
-----------                      --------                     ----
register code w/ fee_rate   -->  stores code
                                                              approves code
                                                              w/ max_fee_rate >= fee_rate
                                 <-- POST /account/builder_codes/approve
                                 stores approval
sends order w/ builder_code -->  validates approval,
                                 takes fee,
                                 credits builder
                                                              (can revoke any time)
                                 <-- POST /account/builder_codes/revoke
```

Key invariants:
- User's `max_fee_rate` must be ≥ builder's `fee_rate`, else the order is **rejected**.
- Approvals are revocable at any time, enforced server-side.
- A code that doesn't exist → order rejected.
- A code that exists but isn't approved by that user → order rejected.

## Registration

No self-serve signup documented — contact Pacifica:
- Email: ops@pacifica.fi
- Discord ticket
- Telegram: @PacificaTGPortalBot

## Endpoints

### User-facing (signed by user)

| Method | Path | Op type |
|--------|------|---------|
| POST | `/account/builder_codes/approve` | `approve_builder_code` |
| POST | `/account/builder_codes/revoke` | `revoke_builder_code` |
| GET | `/account/builder_codes` | list user's approvals |

Approve payload (signed data):
```json
{
  "builder_code": "OURCODE",
  "max_fee_rate": "0.0005"
}
```

### Order attachment

Every order endpoint that supports builder codes accepts a top-level `builder_code` field **inside the signed payload**:

| REST | WS command |
|------|------------|
| `POST /orders/create_market` | `create_market_order` |
| `POST /orders/create` | `create_limit_order` |
| `POST /orders/stop/create` | `create_stop_order` |
| `POST /positions/tpsl` | `set_position_tpsl` |

Example signed payload (market order):
```json
{
  "symbol": "BTC",
  "reduce_only": false,
  "amount": "0.1",
  "side": "bid",
  "slippage_percent": "0.5",
  "client_order_id": "uuid...",
  "builder_code": "OURCODE"
}
```

### Builder-side (read-only analytics)

- Builder specifications overview
- Builder-specific trade history
- Builder code user leaderboard
- User trade history filtered by builder code

(Exact paths not in scraped docs — check gitbook or ask in Discord.)

## Implementation checklist for our hackathon project

- [ ] Request a builder code from ops@pacifica.fi (via Discord ticket)
- [ ] Wire `builder_code` into every signed order payload our app generates
- [ ] In UI: show the user our fee rate and ask for approval signature with `max_fee_rate`
- [ ] Persist approval state locally + read back from `GET /account/builder_codes` to verify
- [ ] Expose a "revoke" button that signs `revoke_builder_code`
- [ ] Track fee revenue via builder-side analytics endpoints

## Why this matters for judging

Using a builder code:
1. Satisfies the **"MUST use Pacifica API and/or Builder Code"** rule
2. Shows **potential impact** (real revenue model) — a judging criterion
3. Demonstrates **technical execution** (correct signing + approval flow)
4. Unlocks **rewards points** from the 10M pool independent of hackathon prizes
