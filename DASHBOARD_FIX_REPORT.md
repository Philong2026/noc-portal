# Dashboard Fix Report — "Data unavailable" → Live Grafana Values

**Date:** 2026-09-17
**Symptom:** Grafana connection worked, but every dashboard widget rendered `Data unavailable` (or fabricated stand-ins).
**Root cause:** `server/grafanaService.cjs` never queried metric data. It substituted **counts** for metrics (`cpu = dashboardCount = 9`, `ram = datasourceCount`, `disk = panelCount`, `traffic = "9 dashboards"`, `availability = "ok"` — the health status string) and the old dashboard-detail loop fetched only the first 5 dashboards. Panel IDs and datasource UIDs were never used to execute real queries.
**Status:** ✅ Fixed — live values verified end-to-end, build passing.

---

## 1. Every Grafana API Request (inventory of the estate)

### Endpoints used by the portal now

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | Grafana reachability (`grafanaStatus`) |
| GET | `/api/search?type=dash-db` | Dashboard inventory + count |
| GET | `/api/datasources` | **Auto-discovers the Prometheus datasource UID** (no hardcoding) |
| GET | `/api/dashboards/uid/:uid` | Panel catalog — every dashboard UID + panel ID + title (45 panels across 9 dashboards) |
| POST | `/api/ds/query` | **Real metric queries** (instant + range) against Prometheus |
| GET | `/api/alertmanager/grafana/api/v2/alerts` | Currently firing Grafana alerts |

### Discovered dashboards (UID · title)

| UID | Title | Panels | Datasource |
|-----|-------|--------|------------|
| `svt4zzj` | MPLS_MINHTU_MOBIFONE | 2 | prometheus `af9c8o995k1z4d` |
| `svngmdg` | NETFLOW_TOP IP_UTILIZATION | 8 | influxdb `dfq5s35b2hkhsb` |
| `adqg774` | NETWORK_DIAGRAM_SVTELECOM | 8 | prometheus / zabbix |
| `advvbzl` | New dashboard | 4 | zabbix `bf9ccc7zhfqbke` |
| `svd9rkg` | SAOVANG_MONITORING_ASR-ROUTER02 TX | 4 | zabbix |
| `svsc55t` | SAOVANG_MONITORING_ASR-ROUTER03 TX | 5 | zabbix |
| `93903d4a-e1ea-4636-a449-9b88a9fa36a3` | SWITCH_NOC_SVTELECOM | 6 | prometheus |
| `sv565s6` | SYSLOG_ROUTER_SVTELECOM | 6 | loki `bf9wqbilee4g0b` |
| `svrlcrt` | SYSLOG_SERVER_SEVICE_SVTELECOM | 3 | loki |

Key panels: `93903d4a…/panelId 1` "Total Traffic" (`sum(irate(ifHCInOctets{job="$switch"}[2m]) * 8)`), `advvbzl/panelId 1` gauge "CPU_CORE_ROUTER01_02_03" (Zabbix `#7: CPU utilization`, host `CORE-ROUTER-01/02/03`), `svsc55t/panelId 7` "DEVICE HEALTH", `adqg774/panelId 3` per-device Mbps (`rate(ifHCOutOctets)*8/1e6`).

### Discovered Prometheus metrics (via `/api/datasources/proxy/uid/af9c8o995k1z4d/api/v1/label/__name__/values`)

`cpu_usage_idle/system/user/…`, `mem_available_percent`, `mem_available`, `mem_total`, `disk_used_percent`, `disk_free`, `disk_total`, `system_load*`, `swap_*`, `up`, SNMP: `ifHCInOctets`, `ifHCOutOctets`, `ifOperStatus`, `ifSpeed`, … (Telegraf node agents + SNMP exporter).

---

## 2. API Response Logging

`server/grafanaService.cjs` now logs everything to the server console:

```
[Grafana] GET /api/health -> 200 (13ms)
[Grafana] GET /api/dashboards/uid/93903d4a-e1ea-4636-a449-9b88a9fa36a3 -> 200 (70ms)
[Grafana] POST /api/ds/query -> 200 (66ms)
[Grafana] response /api/ds/query {"results":{"A":{...}}}          (truncated to 2 000 chars)
[Grafana][mapping] CPU Usage {"expr":"100 - avg(cpu_usage_idle)","rawValue":3.05}
[Grafana][mapping] Network Traffic history {"points":12,"from":"now-1h"}
[Grafana][mapping] dashboard payload {"cpu":3.6,"ram":26.2,"disk":23.9,"traffic":"19.84 Gbps","availability":64.7,"alerts":0,"devices":17,"servers":17}
```

18 mapping entries per snapshot cycle (5 instant + 5 range + devices/servers + alerts + payload). Tokens are never logged; snapshot responses are cached 15 s (`[Grafana] snapshot served from cache`).

---

## 3. Missing Dashboard UID / Panel IDs — Resolved

The old service **never resolved or used any UID/panel ID** (it fetched 5 dashboard JSON blobs only to read panel *titles*). Now:

- The Prometheus datasource UID is **auto-discovered** from `/api/datasources` (`type === 'prometheus'`) → `af9c8o995k1z4d` (no hardcoded UID).
- Every dashboard is fetched by UID and a full **panel catalog** is built (`dashboardUid`, `panelId`, `panelTitle`, `panelType`) — 45 panels, logged per panel, exposed in `snapshot.panelCatalog` and echoed in the `/api/dashboard` payload as `metricSources.*.relatedPanel` for traceability.
- `dashboardCount` / `datasourceCount` / `panelCount` in the payload are derived from this live inventory.

---

## 4. Grafana Metric → Widget Mapping (all queries validated live)

| Widget | PromQL (primary) | Fallback query | Datasource | Related panel (UID / panelId) | Format |
|--------|------------------|----------------|------------|-------------------------------|--------|
| **CPU Usage** | `100 - avg(cpu_usage_idle)` | `100 - avg(cpu_usage_idle{mode!~"idle\|iowait\|guest"})` | prometheus | `advvbzl` / 1 | `x.x %` |
| **Memory Usage** | `100 - avg(mem_available_percent)` | `100 * (1 - sum(mem_available)/sum(mem_total))` | prometheus | `svsc55t` / 7 | `x.x %` |
| **Disk Usage** | `avg(disk_used_percent)` | `100 * (1 - sum(disk_free)/sum(disk_total))` | prometheus | — | `x.x %` |
| **Network Traffic** | `sum(irate(ifHCInOctets[2m]) * 8) + sum(irate(ifHCOutOctets[2m]) * 8)` | `sum(irate(ifHCInOctets[2m]) * 8)` | prometheus | `93903d4a…` / 1 "Total Traffic" | auto-scaled bps |
| **Availability** | `100 * sum(ifOperStatus == bool 1) / (sum(== 1) + sum(== 2) + sum(== 7))` | `count(up == 1) / count(up) * 100` | prometheus | `93903d4a…` / 6 "Port Status" | `x.x %` |
| **Active Alerts** | `GET /api/alertmanager/grafana/api/v2/alerts` (firing count) | overridden by the alerts table: `Active + Acknowledged` (authoritative open queue) | grafana + PostgreSQL | — | integer |
| Device Count | `count(up)` | — | prometheus | — | integer |
| Security | alerts-table `critical`/`warning` counts + latest open alerts | — | PostgreSQL | — | integer / rows |

Each mapping is a **query chain**: the primary expr runs first; if it errors or returns no numeric sample the fallback runs; only if every query fails does the widget show `Data unavailable`.

---

## 5. Grafana Response → Dashboard Format Conversion

`/api/ds/query` returns Arrow-style JSON frames. The service converts:

1. **`extractInstantValue`** — walks `results.<refId>.frames[].data.values[1]`, returns the last non-null finite number → instant widget value.
2. **`extractSeries`** — zips `values[0]` (epoch ms) with `values[1]`, drops nulls, converts to `[{ t: ISO-8601, v: number }]`, down-samples to ≤ 12 points over the last hour → `dashboard.history`.
3. **Formatters** — `percent` (1 decimal), `bps` (auto-scaled bps → Tbps), plus raw `trafficBps` for charts.
4. Dashboard payload shape: `{ cpu, ram, disk, traffic, availability, alerts, devices, servers, trafficBps, history, metricSources, grafanaStatus, lastUpdated, … }`.
5. Frontend (`src/App.jsx`): `formatMetricValue(value, '%')` renders numbers with units; `seriesFromHistory()` converts `history` to `{ name: 'HH:MM', value }` for the trend charts (traffic ÷ 1e9 → Gbps); `TrendChart` renders an honest `No live series…` placeholder instead of crashing on empty data.

---

## 6. Widgets Now Display Live Values (verified)

Live `/api/dashboard` response against the configured Grafana instance:

| Widget | Before (fake) | After (live) |
|--------|---------------|--------------|
| CPU Usage | `9` (dashboard count) | **`3.6 %`** |
| Memory Usage | `2` (datasource count) | **`26.2 %`** |
| Disk Usage | `45` (panel count) | **`23.9 %`** |
| Network Traffic | `"9 dashboards"` | **`19.84 Gbps`** |
| Availability | `"ok"` (health string) | **`64.7 %`** (interface operational ratio) |
| Active Alerts | `9` (dashboard count) | **Grafana Alertmanager firing count; overridden by the alerts-table open queue when the DB is reachable** |
| Device / Server Count | `9` / `2` | **`17` / `17`** (`count(up)`, `count(up == 1)`) |
| Trend charts | 10 fabricated monthly points each | **12 real hourly points per metric** from range queries |
| Security page | dashboard counts as "threats", panel titles as "events" | **real alerts-table severity counts + latest open alerts as events** |

Graceful degradation: if Grafana is down → every widget shows `Data unavailable` (no fabricated fallbacks anywhere). If only the alerts DB is down → alerts fall back to the Grafana Alertmanager count and the source is reported in `alertsSource`.

---

## 7. Build & Runtime Verification

```
> noc-automation@1.0.0 build
✓ 2384 modules transformed.        (dist 625 KiB / gzip 178 KiB)

Server smoke test (node server/index.cjs, port 3001):
[Grafana] GET  /api/health -> 200 (13ms)
[Grafana] GET  /api/search?type=dash-db -> 200 (46ms)
[Grafana] GET  /api/datasources -> 200 (16ms)
[Grafana] GET  /api/dashboards/uid/{9 uids} -> 200 (37–80ms)
[Grafana] POST /api/ds/query -> 200 (12–86ms)   × 12 (instant + range)
[Grafana] GET  /api/alertmanager/grafana/api/v2/alerts -> 200 (11ms)
=== /api/dashboard LIVE RESPONSE ===
cpu: 3.6 | ram: 26.2 | disk: 23.9
traffic: 19.84 Gbps | trafficBps: 19840048164.5
availability: 64.7 | alerts: 0 (grafana-alertmanager)
devices: 17 | servers: 17 | grafanaStatus: ok
history: cpu=12 ram=12 disk=12 traffic=12 availability=12
```

---

## 8. Files Changed

| File | Change |
|------|--------|
| `server/grafanaService.cjs` | **Rewritten** — GET+POST transport with timeouts, response logging, datasource auto-discovery, full panel catalog, `/api/ds/query` metric chains (instant + range), formatters, 15 s cache, honest `Data unavailable` fallbacks |
| `server/index.cjs` | `/api/dashboard` merges the alerts-table open count into the "Active Alerts" widget; `/api/security` returns real severity counts + latest open-alert events |
| `src/App.jsx` | Availability widget formatted with `%`; all six trend charts fed by live `history` series; traffic history converted to Gbps; `TrendChart` guards empty series |
| `DASHBOARD_FIX_REPORT.md` | This report |

### Notes & recommendations

- `alerts` uses the Grafana Alertmanager API (currently `0` firing — the provisioned rule group is a latency alert). When the PostgreSQL alerts table is reachable, the open-queue count (`Active + Acknowledged`) takes precedence — that is the queue the Alerts page acts on.
- CPU/Memory/Disk come from Telegraf agents scraped by Prometheus. The Zabbix gauge panels cover the same core routers; its targets are passthrough-compatible with `/api/ds/query` (verified) and can be swapped into `METRIC_QUERIES` if Zabbix is preferred as the CPU source.
- Availability is the live interface operational ratio (64.7%, includes down links). Swap to the `count(up==1)/count(up)*100` chain (already the fallback) for "monitoring availability" semantics.
- `Security Score` remains `Data unavailable` — no security-posture metric exists in the current datasources; inventing one was deliberately avoided.

