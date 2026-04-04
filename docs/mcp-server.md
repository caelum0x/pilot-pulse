# Pacifica MCP Server — Local Reference

Cloned at `vendor/pacifica-mcp/`. This is a Model Context Protocol server that exposes Pacifica trading as tools a Claude (or any MCP client) can call.

> **Stale paths warning:** The MCP source uses older endpoint paths (`/api/v1/info`, `/api/v1/kline`, `/api/v1/orders/create`) that differ from the current docs (`/markets/info`, `/markets/candles`, `/orders/create_market`). If you use the MCP as-is, some tools may fail against the current API. Either patch the paths in `src/index.ts` or wait for an upstream update.

## Package

- npm: `@pacifica-fi/mcp-server` (v0.0.1)
- Hardcoded to **testnet**: `https://test-api.pacifica.fi`
- Binary: `mcp-server-pacifica`
- Stack: `@modelcontextprotocol/sdk`, `axios`, `zod`, `bs58`, `tweetnacl`

## Install via Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "pacifica": {
      "command": "npx",
      "args": ["-y", "@pacifica-fi/mcp-server"],
      "env": {
        "PRIVATE_KEY": "<base58 solana secret>",
        "ADDRESS": "<solana pubkey>"
      }
    }
  }
}
```

Then restart Claude Desktop. The tools appear under the "pacifica" MCP.

## Tools exposed

From `src/index.ts`:

### Read-only

| Tool | Path called |
|------|-------------|
| `getAccountInfo` | `GET /api/v1/account` |
| `getAccountSettings` | `GET /api/v1/account/settings` |
| `getInfo` | `GET /api/v1/info` (stale — current is `/markets/info`) |
| `getKline` | `GET /api/v1/kline` (stale — current is `/markets/candles`) |
| `getRecentTrades` | `GET /api/v1/trades` |
| `getOpenOrders` | `GET /api/v1/orders` |
| `getOrderHistoryById` | `GET /api/v1/orders/history` |
| `getPortfolioHistory` | `GET /api/v1/portfolio` |
| `getCurrentPositions` | `GET /api/v1/positions` |
| `getPositionHistory` | `GET /api/v1/positions/history` |
| `getFundingHistory` | `GET /api/v1/funding/history` |
| `getCurrentTime` | local `Date.now()` |

### Mutating (signed)

| Tool | Path called |
|------|-------------|
| `updateLeverage` | `POST /api/v1/account/leverage` |
| `updateMarginMode` | `POST /api/v1/account/margin` |
| `withdraw` | `POST /api/v1/account/withdraw` |
| `bindAgentWallet` | `POST /api/v1/agent/bind` |
| `openOrder` | `POST /api/v1/orders/create` |
| `cancelOrder` | `POST /api/v1/orders/cancel` |
| `cancelAllOrders` | `POST /api/v1/orders/cancel_all` |
| `createStopOrder` | `POST /api/v1/order/stop/create` |
| `cancelStopOrder` | `POST /api/v1/orders/stop/cancel` |

## Signing in the MCP

MCP uses a **simplified, CSV-style signing** — NOT the canonical JSON-sorted signing the docs describe:

```ts
// From src/index.ts – updateLeverage example
const messageToSign = `${symbol.toUpperCase()},${leverage}`;
const signature = signMessage(messageToSign);
```

This is another sign the MCP repo is out of date relative to the current docs, which require `json.dumps(sort_json_keys({...header, "data": payload}))`. **Do NOT copy the MCP signing style into a new project.** Use the python-sdk / docs method.

## Build from source (if patching)

```bash
cd vendor/pacifica-mcp
npm install
npm run build         # compiles to dist/
npm run dev           # tsx watch src/index.ts
```

Then point Claude Desktop at `./dist/index.js` directly (or `npm link`).

## When to use the MCP vs rolling your own

**Use MCP** when you want Claude to issue trades conversationally for demo or research purposes.

**Roll your own** (using python-sdk or a TS port) when you need:
- Correct canonical-JSON signing (MCP's CSV signing may break on newer endpoints)
- Mainnet support (MCP is hardcoded to testnet)
- WebSocket trading for lower latency
- Builder code support
- TWAP, batch orders, edit order, position tpsl — **none of these are in the MCP**
- Rate-limit handling, retries, reconnects

For the hackathon we're building a standalone app, so the MCP is mostly useful as a **reference for tool naming and Zod schemas**, not as runtime infra.
