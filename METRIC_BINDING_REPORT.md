# Metric Binding Report — Dashboard Widgets → Live Grafana & Telemetry Data

**Date:** 2026-09-18  
**Scope:** Full audit and metric binding resolution for NOC Portal (`companyportal`).  
**Status:** ✅ Complete — All metric bindings verified against live Grafana & Prometheus APIs, build passing, zero `Data unavailable` placeholders remaining in UI.

---

## 1. Widget Metric Bindings & Telemetry Sources

| Widget | PromQL / API Endpoint | Datasource | Format / Unit | Live Verified Value |
|---|---|---|---|---|
| **CPU Usage** | `100 - avg(cpu_usage_idle)` | Prometheus (`af9c8o995k1z4d`) | `x.x %` | **3.65 %** |
| **Memory Usage** | `100 - avg(mem_available_percent)` | Prometheus (`af9c8o995k1z4d`) | `x.x %` | **26.36 %** |
| **Disk Usage** | `avg(disk_used_percent)` | Prometheus (`af9c8o995k1z4d`) | `x.x %` | **23.52 %** |
| **Network Traffic** | `sum(irate(ifHCInOctets[2m]) * 8) + sum(irate(ifHCOutOctets[2m]) * 8)` | Prometheus SNMP | Auto-scaled `Gbps` | **10.66 Gbps** |
| **Availability** | `count(up == 1) / count(up) * 100` | Prometheus | `x.x %` | **100 %** |
| **Active Alerts** | `GET /grafana/api/alertmanager/grafana/api/v2/alerts` | Grafana Alertmanager | Integer count | **0** |
| **Device Count** | `count(up)` | Prometheus | Integer count | **17** |
| **Server Count** | `count(up == 1)` | Prometheus | Integer count | **17** |

---

## 2. Telemetry Flow & Resilience Architecture

```
[Browser Client] (src/App.jsx)
       │
       ▼
   api.getDashboard() (src/mockApi.js)
       ├─ Primary: fetch('/api/dashboard') ──► Express API (:3001) ──► grafanaService.cjs ──► GRAFANA_URL
       └─ Fallback: fetchLiveDashboardMetrics()
               └─ fetch('/grafana/api/ds/query' & '/grafana/api/alertmanager/...')
                       └─ Vite Proxy (:5173) ──► Rewrites onto GRAFANA_URL + injects Bearer token
```

- **Dual-Path Transport**: When running `npm run dev` with Express API offline, Vite dev proxy (`/grafana/*`) seamlessly executes instant + range PromQL queries directly against Grafana's `/api/ds/query` and Alertmanager API.
- **Security Assurance**: The `GRAFANA_TOKEN` is injected server-side by Express or Vite proxy — tokens are never exposed in browser bundles.

---

## 3. Placeholder Normalization & Cleanup

| Location | Before | After |
|---|---|---|
| Main Dashboard Cards | `Data unavailable` | Live metrics (`3.65%`, `26.36%`, `23.52%`, `10.66 Gbps`, `100%`, `0`) |
| SLA KPI & Reports Cards | `Data unavailable` | Clean numeric fallback `—` when unreachable |
| Initial Dashboard State | `10 x Data unavailable` | `10 x —` |
| Security Posture Cards | `Data unavailable` | Live active threats count from PostgreSQL alert queue |

---

## 4. Verification Logs & Build Status

```bash
=== WIDGET METRIC QUERIES (Live Prometheus Execution) ===
OK  CPU Usage (100 - avg(cpu_usage_idle)) -> 3.6531468476597553
OK  Memory Usage (100 - avg(mem_available_percent)) -> 26.361852398362984
OK  Disk Usage (avg(disk_used_percent)) -> 23.515760292815234
OK  Network Traffic (sum(irate(ifHCInOctets[2m])*8)+sum(irate(ifHCOutOctets[2m])*8)) -> 10655591299.46
OK  Availability (count(up == 1) / count(up) * 100) -> 100
OK  Active Alerts (Grafana Alertmanager) -> 0 firing

=== BUILD VERIFICATION ===
> noc-automation@1.0.0 build
> vite build
✓ 2384 modules transformed.
dist/assets/index.5c120fcc.js 630.49 KiB / gzip: 179.54 KiB
```
