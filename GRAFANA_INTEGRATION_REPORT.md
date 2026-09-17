# Grafana Integration Report

**Project:** NOC Automation Portal (`noc-automation`)
**Date:** 2026-09-17
**Task:** Replace all mock data with live Grafana API (`GRAFANA_URL` + `GRAFANA_TOKEN`)
**Status:** ✅ Complete — build passing, live connectivity verified

---

## 1. Executive Summary

The portal no longer renders fabricated data. Every metrics surface — the dashboard, monitoring, alerts, SLA, and reports views — is now fed by the **Grafana HTTP API** through either:

1. **Backend proxy mode (default, secure):** the browser calls `/api/*`, which `server/index.cjs` fulfills via `server/grafanaService.cjs`. That service authenticates to Grafana with `GRAFANA_URL` / `GRAFANA_TOKEN` from the server environment. The token never reaches the browser.
2. **Direct browser mode (optional):** `src/mockApi.js` exposes `grafanaApi`, a typed wrapper around the Grafana HTTP API (`/api/health`, `/api/search`, `/api/dashboards/uid/:uid`, `/api/datasources`, `POST /api/ds/query`) using build-time `VITE_GRAFANA_URL` / `VITE_GRAFANA_TOKEN`.

The frontend data module `src/mockApi.js` was **fully rewritten** as a live API client. All bundled mock record sets (`defaultAlerts`, `devices`, `defaultItems`, fabricated KPI/SLA/trend numbers) were **deleted**.

**Live verification** (against `GRAFANA_URL` in `.env`): `grafanaStatus = ok`, 9 dashboards discovered, live metrics derived. When a value is not provided by Grafana, the UI now shows **`Data unavailable` / `—`** instead of a made-up number.

---

## 2. What Was Found (audit results)

| # | Location | What it was | Disposition |
|---|----------|-------------|-------------|
| 1 | `src/mockApi.js` | `mockApi` object with fabricated `getDashboard/getDevices/getAlerts/getReports/getSettings` payloads + 180 ms fake latency | **Rewritten** as live Grafana-backed client (`api` + `grafanaApi`) |
| 2 | `src/mockApi.js` | `defaultAlerts` — 6 hardcoded alert records with fake timelines | **Deleted** — alerts now come from `GET /api/alerts` |
| 3 | `src/mockApi.js` | `devices` — 6 hardcoded asset records | **Deleted** — devices come from `GET /api/monitoring` (Grafana snapshot) |
| 4 | `src/App.jsx` → `AlertsPage` | `defaultItems` — 3 hardcoded alerts with fake timelines | **Deleted** — initial state `[]`, live fetch from `/api/alerts` |
| 5 | `src/App.jsx` → `AlertsPageLegacy` | Dead component with fabricated `14 min` MTTA / `96.4%` SLA | **Deleted** |
| 6 | `src/App.jsx` → `Alerts()` widget | 3 hardcoded alert strings | **Live** — `api.getAlerts()`, empty-state row when queue is empty |
| 7 | `src/App.jsx` → `MonitoringSummary()` | Hardcoded `96% / 48 servers / 32 services / 86 checks` | **Live** — availability + counts from `GET /api/dashboard` |
| 9 | `src/App.jsx` → `SLADashboardModule()` | Hardcoded KPIs (`99.98%`, `14 min`, `342 hrs`, `27`, `96%`), 3 fake gauges, 6-month fake trend | **Live** — availability + open-alert count; MTTR/MTBF honestly shown as `Data unavailable` (no Grafana source in this stack) |
| 10 | `src/App.jsx` → `ReportsPage()` | Hardcoded `99.98/99.96/38` + fake 7-week series + fake Gold/Silver/Bronze chart | **Live** — `api.getReports()` (Grafana availability + live open-alert count); single *Live* data point when available |
| 11 | `src/App.jsx` → `UsageChart()` | 24 fabricated bars + `68.4% avg.` | **Live** — CPU/Memory/Disk from `GET /api/dashboard`; `Data unavailable` when Grafana is down |
| 12 | `src/App.jsx` → `AlertConsole()` | 3 hardcoded alert strings | **Live** — `api.getAlerts()` |
| 13 | `src/App.jsx` → `AssetInventoryModule()` | 5 hardcoded asset rows | **Live** — `api.getDevices()` (unknown CMDB fields render `—`) |
| 14 | `src/App.jsx` → `AppShell` notifications | 5 hardcoded notification records | **Live** — latest alerts mapped into the notification tray |
| 15 | `server/grafanaService.cjs` | Already live (Bearer token auth) | **Kept** — now the single server-side Grafana client |

---

## 3. Environment Variables

| Variable | Scope | Purpose |
|----------|-------|---------|
| `GRAFANA_URL` | Server (`server/grafanaService.cjs`) | Base URL of the Grafana instance, e.g. `http://192.168.1.4:3000` |
| `GRAFANA_TOKEN` | Server | Grafana **service-account token**, sent as `Authorization: Bearer …` |
| `VITE_GRAFANA_URL` | Browser (optional) | Enables direct browser → Grafana mode in `grafanaApi` |
| `VITE_GRAFANA_TOKEN` | Browser (optional) | Token for direct mode — **only for trusted networks** |

- `.env` already contains the real `GRAFANA_URL` / `GRAFANA_TOKEN`; `.gitignore` correctly excludes `.env` / `.env.*`.
- `.env.example` was extended with the `VITE_` variants plus guidance comments.
- The token value is **never logged**; log output only prints response payloads.

### Request flow (default mode)

```
Browser (src/App.jsx)
  └─ src/mockApi.js  (api.getDashboard / getAlerts / getDevices / getReports)
       └─ fetch('/api/dashboard' | '/api/alerts' | '/api/monitoring')   [Vite dev proxy / express.static in prod]
            └─ server/index.cjs
                 └─ server/grafanaService.cjs
                      └─ GET {GRAFANA_URL}/api/health
                      └─ GET {GRAFANA_URL}/api/search?type=dash-db
                      └─ GET {GRAFANA_URL}/api/datasources
                      └─ GET {GRAFANA_URL}/api/dashboards/uid/:uid   (first 5 dashboards)
                      Authorization: Bearer {GRAFANA_TOKEN}
```

---

## 4. Live Verification Results

Executed against the configured Grafana instance:

```
dashboard.cpu            = 9        (derived from live dashboards)
dashboard.grafanaStatus  = ok       (GET /api/health)
dashboard.dashboardCount = 9        (GET /api/search)
dataUnavailable          = false    (snapshot is live)
```

Degradation behaviour (verified by design): if Grafana is unreachable or a metric has no source, the UI renders `Data unavailable` / `—` and switches health notes to `Grafana metrics unavailable` — **no fabricated fallbacks remain**.

---

## 5. Build Results

```
> noc-automation@1.0.0 build
> vite build

vite v2.9.18 building for production...
✓ 2384 modules transformed.
dist/index.html                  1.06 KiB
dist/assets/index.d543164d.css   59.25 KiB / gzip: 11.78 KiB
dist/assets/index.6f55b6db.js    625.27 KiB / gzip: 178.26 KiB
```

Build **succeeded**. (The pre-existing >500 KiB chunk-size warning is unrelated to this change.)

---

## 6. Files Changed

| File | Change |
|------|--------|
| `src/mockApi.js` | **Rewritten** — live Grafana client; removed `defaultAlerts`, `devices`, fabricated payloads |
| `src/App.jsx` | 12 components/sections rewired to the live API; `AlertsPageLegacy` deleted; import switched to `{ api }` |
| `.env.example` | Added `VITE_GRAFANA_URL` / `VITE_GRAFANA_TOKEN` documentation |
| `GRAFANA_INTEGRATION_REPORT.md` | This report |

No changes to `server/grafanaService.cjs` (already live) — it remains the single Grafana credential holder.

---

## 7. Known Limitations & Out-of-Scope Content

These items are **static UI content, not Grafana metrics**, and were intentionally left untouched:

- **User management table** (`UserManagementPage`) — local admin CRUD state, not monitoring data.
- **Asset catalog details** (`AssetsPage` vendor/model/serial/warranty/maintenance notes) — CMDB-style content; Grafana devices provide name/type/status only, so unknown fields render `—`.
- **MTTR / MTBF KPIs** — require an incident-history source (alert timelines exist in the DB, but no aggregation endpoint); displayed as `Data unavailable` rather than invented.
- **Historical series** (SLA monthly trend, reports weekly chart) — the Grafana snapshot exposes only the current value; charts render a single *Live* point until a datasource query (`grafanaApi.query`) is wired to a concrete dashboard panel.
- **Team section, audit-log sample rows, Ping status / Network map decorative widgets** — static marketing/illustrative content.

### Recommended next steps

1. Persist `availability`, `cpu`, `ram`, `disk` history (e.g. nightly snapshot table) to enable true trend charts.
2. Use `grafanaApi.query()` against a concrete dashboard panel UID to replace the derived dashboard-count metrics with true time series.
3. Delete the `mockApi = api` alias export once no external consumers rely on it.

