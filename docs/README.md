# Pacifica Hackathon — Docs

Local reference material for the Pacifica Hackathon (Mar 16 – Apr 16, 2026). All files here are distilled from Pacifica's public docs, SDKs, and example repos so we don't need to hit the network during development.

## Index

| File | What's in it |
|------|--------------|
| [hackathon.md](./hackathon.md) | Rules, dates, tracks, judging, prizes |
| [pacifica-api.md](./pacifica-api.md) | REST endpoint map, base URLs, request shape |
| [signing.md](./signing.md) | Ed25519 signing scheme — step-by-step + code |
| [rate-limits.md](./rate-limits.md) | Credit system, 429 behavior, quota headers |
| [websocket.md](./websocket.md) | WSS URLs, subscription channels, trading ops |
| [builder-program.md](./builder-program.md) | Builder codes, fee share, approval flow |
| [python-sdk.md](./python-sdk.md) | How to use `vendor/python-sdk` |
| [mcp-server.md](./mcp-server.md) | How to use `vendor/pacifica-mcp` with Claude Desktop |
| [global-intel.md](./global-intel.md) | Architecture of `vendor/global-intel` and Pacifica integration surface |
| [official-project-ideas.md](./official-project-ideas.md) | Pacifica's official idea list per track |
| [project-ideas.md](./project-ideas.md) | Scored evaluation + primary recommendation |

## Vendored repos

Cloned under `/Users/arhansubasi/pacifica/vendor/`:

- `vendor/global-intel` — Pacifica's real-time geopolitical intelligence dashboard ([github](https://github.com/pacifica-fi/global-intel))
- `vendor/pacifica-mcp` — MCP server exposing Pacifica trading as Claude tools ([github](https://github.com/pacifica-fi/pacifica-mcp))
- `vendor/python-sdk` — Official Python examples for REST and WS APIs ([github](https://github.com/pacifica-fi/python-sdk))

## Canonical URLs

- Docs hub: https://pacifica.gitbook.io/docs/
- API docs: https://pacifica.gitbook.io/docs/api-documentation/api
- Builder program: https://pacifica.gitbook.io/docs/programs/builder-program
- Testnet app: https://test-app.pacifica.fi/ (invite code: `Pacifica`)
- Mainnet app: https://app.pacifica.fi/

## Environment hint

The MCP server and Python SDK both read credentials from env vars:

```
PRIVATE_KEY=<base58 solana secret>
ADDRESS=<solana public key>
```

Never commit these. Use a `.env` file (gitignored) or shell exports.
