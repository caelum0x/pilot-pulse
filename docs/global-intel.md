# Global Intel — Local Reference

Cloned at `vendor/global-intel/`. Pacifica's own real-time geopolitical intelligence dashboard. MIT licensed. Built on [World Monitor](https://github.com/koala73/worldmonitor) by Elie Habib.

## What it is

A **pure browser** situational-awareness dashboard aggregating ~60 public data sources into a deck.gl 3D map plus dozens of side panels. Runs entirely in the client — no desktop install — with Vercel serverless functions as thin CORS proxies for APIs that require keys.

> **For the hackathon**: This is an **existing Pacifica project**, not something we build on directly (hackathon rules require work created during the event). We can **integrate with it**, **fork ideas from it**, or use it as a reference for how to structure panel-based dashboards. Any reused code must be acknowledged.

## Stack

```
Frontend:  TypeScript + Vite + deck.gl + maplibre-gl + d3 + i18next
Edge:      Vercel serverless functions (api/*.js)
State:     Persistent cache (IndexedDB) + Upstash Redis (cross-user cache)
AI:        Groq (primary) + OpenRouter (fallback) for summarization
ML:        onnxruntime-web + @xenova/transformers (browser-side classification)
Testing:   Playwright E2E + node:test
```

## Top-level layout

```
vendor/global-intel/
├── index.html              # Vite entry
├── src/
│   ├── main.ts             # Bootstrap
│   ├── App.ts              # Main app controller (huge — imports everything)
│   ├── components/         # 50+ panel UI components
│   ├── services/           # 100+ data fetchers & analyzers
│   ├── workers/            # analysis.worker.ts, ml.worker.ts
│   ├── config/             # Geo data, feeds, entities, markets, etc.
│   ├── utils/              # Sanitize, theme, URL state, circuit-breaker
│   ├── locales/            # 15 languages
│   └── types/
├── api/                    # ~60 Vercel serverless functions
├── public/                 # geojson country boundaries, favicons
├── scripts/
│   └── ais-relay.cjs       # Railway relay for AIS vessel tracking
├── e2e/                    # Playwright tests
├── tests/                  # Data integrity tests
├── vercel.json             # CORS + CSP headers
└── .env.example            # All API keys needed
```

## Data sources (what it pulls in)

From `.env.example` and `api/` folder:

| Category | Sources |
|----------|---------|
| News | GDELT, RSS feeds, HackerNews, ArXiv |
| Conflict | ACLED, UCDP, UNHCR displacement |
| Markets | Finnhub (stocks), Coingecko, Yahoo Finance, Polymarket (predictions), ETF flows |
| Macro | FRED (Fed data), EIA (energy), World Bank |
| Geo / infra | USGS earthquakes, NASA FIRMS fires, GDACS disasters, EONET, Cloudflare Radar (internet outages) |
| Aviation | OpenSky, FAA status, Wingbits |
| Maritime | AISStream (vessels) |
| Cyber | Cyber threats feed |
| AI infra | AI datacenters, AI research labs, tech hubs |
| Summarization | Groq, OpenRouter |
| Cache | Upstash Redis |

## Pacifica integration (current)

**Minimal** — `vendor/global-intel/vercel.json` CSP allows iframes from `app.pacifica.fi`, `mainnet-staging.pacifica.team`, `test-app.pacifica.fi`. The README says "a direct entry to Pacifica trading surfaces" — in practice this means a link/iframe to Pacifica trading from inside the dashboard.

**There is no live trading or API integration in global-intel today.** This is the interesting hackathon angle.

## Architecture patterns we can learn from

1. **Panel registry pattern** — `src/config/panels.ts` defines every dashboard panel declaratively. Each `Panel` component subscribes to a service, renders data, and handles lifecycle uniformly.

2. **Service layer** — `src/services/*.ts` — each service is a single responsibility fetcher + normalizer. Dozens of them. Great example of how to scale to many data sources.

3. **Circuit breaker** — `src/utils/circuit-breaker.ts` — stops hammering dead endpoints. We should copy this pattern for Pacifica API calls when rate limited.

4. **Worker offloading** — heavy analysis runs in `src/workers/analysis.worker.ts` and `ml.worker.ts`. Keeps the main thread at 60fps while doing ML classification.

5. **Cross-module integration** — `src/services/cross-module-integration.ts`, `correlation.ts`, `signal-aggregator.ts` — combine signals from multiple sources into higher-level "events". Great pattern for an analytics dashboard.

6. **Country instability index (CII)** — `src/services/country-instability.ts` aggregates many signals into a 0–100 score per country. This is an **instructive pattern for a Pacifica risk dashboard** — same math, different signals (liquidation cascades, funding-rate extremes, whale positions, open interest anomalies).

7. **URL state** — `src/utils/urlState.ts` serializes dashboard state into the URL so users can share specific views. Good UX pattern to copy.

8. **Edge proxy pattern** — `api/` wraps third-party APIs to add auth, CORS, and caching. We can use the same for any Pacifica API wrapping we need.

## How we can leverage it for the hackathon

### Option A — Integration (light touch)
Build a standalone Pacifica app; contribute a *new* "Pacifica Markets" panel to global-intel as a side deliverable that shows perps open interest, funding, liquidations alongside geopolitical events. Cross-correlate news with price moves.

### Option B — Inspiration (heavy)
Fork the architecture patterns (panel registry, service layer, circuit breaker, worker offloading, signal aggregator) and build a **Pacifica-native intelligence dashboard**: instead of GDELT + ACLED + earthquakes, ingest Pacifica order books + funding + positions + liquidations + whale trades, and build the equivalent "country instability" but for perps markets ("market instability index"). **This would be original work for Track 2: Analytics & Data.**

### Option C — Reference only
Just use it as a pattern library and build something much smaller and more focused.

Recommended: **Option B** — it's the highest-impact use of the existing Pacifica work without violating the "created during hackathon" rule (we write new code; we just borrow architectural patterns, which we acknowledge).

## Build / dev (if we want to run it locally)

```bash
cd vendor/global-intel
npm install
cp .env.example .env.local   # optional — works without keys
npm run dev                  # Vite dev server
npm run test:data            # data integrity tests
npm run test:e2e             # Playwright
```

## License

MIT — we can freely copy patterns/code with attribution.
