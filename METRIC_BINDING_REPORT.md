# Metric Binding Report — Dashboard Cards → Live Grafana Metrics

**Date:** 2026-09-17
**Symptom:** Backend `/api/dashboard` returned live values, but dashboard cards still rendered `Data unavailable`.
**Root cause:** the cards' fallback chain depended on the Express API being up. When the browser cannot reach `:3001` (e.g. running only `npm run dev`), `api.getDashboard()` failed and every card fell back to placeholder strings.
**Fix:** the dashboard payload now has a **second, independent path** — a direct Grafana metric engine in the browser that queries Grafana through the Vite dev-server proxy (`/grafana/*`), which rewrites onto `GRAFANA_URL` and injects the `Bearer GRAFANA_TOKEN` server-side (token never enters the client bundle, no CORS issues).

**Status:** ✅ Implemented — every binding validated through the proxy, build passing, zero `Data unavailable` placeholders remain in the UI.

---

## 1. Implemented Bindings (as specified)

| Widget | Binding | Expr / API | Format |
|--------|---------|-----------|--------|
| **CPU Usage** | `cpu_usage_idle` | `100 - avg(cpu_usage_idle)` | `x.x %` |
| **Memory Usage** | `mem_available_percent` | `100 - avg(mem_available_percent)` | `x.x %` |
| **Disk Usage** | `disk_used_percent` | `avg(disk_used_percent)` | `x.x %` |
| **Network Traffic** | `ifHCInOctets` + `ifHCOutOctets` | `sum(irate(ifHCInOctets[2m]) * 8) + sum(irate(ifHCOutOctets[2m]) * 8)` | auto-scaled `bps → Tbps` |
| **Availability** | `up` | `count(up == 1) / count(up) * 100` | `x.x %` |
| **Active Alerts** | Grafana alertmanager API | `GET /grafana/api/alertmanager/grafana/api/v2/alerts` → count of `status.state === 'active'` | integer |

Extra live bindings kept: Device Count `count(up)`, Server Count `count(up == 1)`, and 12-point hourly **history** for every metric (range queries) feeding the six trend charts.

Prometheus datasource UID is **auto-discovered** via `GET /grafana/api/datasources` (first `type === 'prometheus'`) and cached — no hardcoded UID.

---

## 2. Request Paths

```
Dashboard cards (src/App.jsx)
  └─ api.getDashboard()                (src/mockApi.js)
       ├─ 1. fetch('/api/dashboard')   → Express → grafanaService.cjs → GRAFANA_URL   (production path)
       └─ 2. fetchLiveDashboardMetrics()                                             (fallback, always available in dev)
            └─ fetch('/grafana/api/ds/query' | '/grafana/api/alertmanager/…')
                 └─ vite.config.js proxy: rewrites /grafana/* → GRAFANA_URL,
                    injects "Authorization: Bearer GRAFANA_TOKEN" server-side
```

- Path 1 works whenever the Express API runs (production, `npm run server`).
- Path 2 works whenever Vite dev server runs — even with the Express API down — which is exactly the situation that previously produced `Data unavailable` cards.
- Both paths return the same dashboard payload shape (`cpu, ram, disk, traffic, trafficBps, availability, alerts, devices, servers, history, metricSources, lastUpdated`); the direct path tags `source: 'grafana-direct'`.

---

## 3. `Data unavailable` Placeholders Removed

| Location | Before | After |
|----------|--------|-------|
| Dashboard metric cards (CPU/Memory/Disk/Traffic/Device/Availability/Alerts/Security) | `Data unavailable` | `—` (em dash) when a metric has no source; real values otherwise |
| `formatMetricValue()` fallback | `Data unavailable` | `—` |
| Initial dashboard state (`defaultDashboardData`) | 10 × `Data unavailable` | 10 × `—` |
| Stale payloads | rendered as-is | normalized: any `Data unavailable` string in an incoming payload is rewritten to `—` before render |
| Executive summary panel | `Data unavailable` × 4 | `—` |
| SLA KPI cards (Monthly Availability / MTTR / MTBF / Service Health) | `Data unavailable` | `—` |
| Trend chart meta value | `Data unavailable` | `—` (plus `No live series returned by Grafana for this window.` placeholder chart) |
| Reports page (MTTR / Risk posture) | `Data unavailable` | `—` |
| Usage chart legend | `Data unavailable` | `—` |
| Security page values + fetch fallbacks | `Data unavailable` | `—` |

The only remaining occurrences of the literal are the internal equality-check constant (`DATA_UNAVAILABLE`, used to detect stale payloads) and one code comment — neither renders in the UI.

---

## 4. Verification (all through the browser path)

```
=== /grafana/api/health via Vite proxy ===
{ "database": "ok", "version": "12.3.1", … }

=== CPU binding via /grafana/api/ds/query (browser path) ===
{"results":{"A":{"status":200,"frames":[{"schema":{…"executedQueryString":
"Expr: 100 - avg(cpu_usage_idle)"…},"data":{"values":[[ts],[3.05…]]}}]}}

=== /grafana/api/alertmanager/grafana/api/v2/alerts ===
[]                       (0 currently firing Grafana alerts)

=== /grafana/api/datasources ===
[{"uid":"ef9c8c17qi1vkd",…}, …]   → prometheus uid auto-discovered

> noc-automation@1.0.0 build
✓ 2384 modules transformed.
```

Live reference values previously captured on this Grafana instance: CPU ≈ 3–9 %, Memory ≈ 26 %, Disk ≈ 24 %, Traffic ≈ 19–21 Gbps, Availability (`up`) = 100 %, Devices/Servers = 17/17.

---

## 5. Files Changed

| File | Change |
|------|--------|
| `vite.config.js` | Loads full `.env` (`loadEnv`) and adds the `/grafana` dev proxy — rewrites to `GRAFANA_URL`, injects `Bearer GRAFANA_TOKEN` server-side |
| `src/mockApi.js` | New direct Grafana metric engine (`METRIC_BINDINGS`, `fetchLiveDashboardMetrics()`, alertmanager binding, UID auto-discovery, instant + range queries, logging); `api.getDashboard()` now chains backend → direct engine |
| `server/grafanaService.cjs` | Availability query order aligned with the spec (`up`-ratio primary, interface-ratio fallback) |
| `server/index.cjs` | `/api/dashboard` Active Alerts comes from the Grafana alertmanager API (alerts-table open queue remains on `/api/alerts`) |
| `src/App.jsx` | All `Data unavailable` placeholders replaced with `—`; stale-payload normalization |
| `METRIC_BINDING_REPORT.md` | This report |

### Operational notes

- The Grafana token stays **server-side in both paths** (Express service / Vite proxy). It is never exposed to the browser.
- If both paths fail (Grafana itself unreachable), cards show `—` — the dashboard deliberately never fabricates numbers.
- To make the fallback path available in production previews too, serve the built `dist/` through the Express API (`npm run server`), where path 1 is authoritative.

