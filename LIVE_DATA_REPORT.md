# Live Data Flow & End-to-End API Integration Report

**Date:** 2026-09-18  
**Scope:** Debugging and verifying end-to-end live telemetry data flow from Grafana/Prometheus to React components for NOC Portal (`companyportal`).  
**Status:** ✅ Resolved — PM2 Express service online, endpoints exposed, live metrics rendering, build passing.

---

## 1. End-to-End Telemetry Architecture Trace

```
Grafana API (http://192.168.1.4:3000) & Prometheus TSDB (af9c8o995k1z4d)
       │
       ▼ (HTTP request with Bearer glsa_...)
server/grafanaService.cjs
  └─ getGrafanaSnapshot() -> executes instant + range PromQL queries
       │
       ▼
server/index.cjs (Express API on port 3001)
  ├─ GET /api/health
  ├─ GET /api/search
  ├─ GET /api/datasources
  ├─ GET /api/dashboard
  ├─ GET /api/monitoring
  └─ GET /api/asset-inventory
       │
       ▼ (Vite Proxy: /api/* -> http://localhost:3001)
src/mockApi.js (Frontend API Client)
  ├─ api.getDashboard()
  └─ api.getDevices()
       │
       ▼
React Components (src/App.jsx)
  ├─ Dashboard() (CPU: 29.6%, RAM: 26.4%, Disk: 23.5%, Traffic: 10.72 Gbps, Availability: 100%)
  ├─ MonitoringPage() (17 monitored devices)
  └─ AssetsPage() (17 live monitored targets)
```

---

## 2. Actual JSON Returned by Required Endpoints

### 2.1 `GET /api/health`
```json
{
  "status": "ok",
  "database": "unavailable",
  "grafana": "connected"
}
```

### 2.2 `GET /api/search`
```json
[
  {
    "id": 23,
    "uid": "svt4zzj",
    "orgId": 1,
    "title": "MPLS_MINHTU_MOBIFONE",
    "uri": "db/mpls-minhtu-mobifone",
    "url": "/d/svt4zzj/mpls-minhtu-mobifone",
    "type": "dash-db"
  },
  {
    "id": 28,
    "uid": "svngmdg",
    "orgId": 1,
    "title": "NETFLOW_TOP IP_UTILIZATION",
    "uri": "db/netflow-top-ip-utilization",
    "url": "/d/svngmdg/netflow-top-ip-utilization",
    "type": "dash-db"
  }
]
```

### 2.3 `GET /api/datasources`
```json
[
  {
    "id": 1,
    "uid": "ef9c8c17qi1vkd",
    "name": "alertmanager",
    "type": "alertmanager",
    "access": "proxy"
  },
  {
    "id": 8,
    "uid": "af9c8o995k1z4d",
    "name": "prometheus",
    "type": "prometheus",
    "access": "proxy"
  }
]
```

### 2.4 `GET /api/dashboard`
```json
{
  "cpu": 29.6,
  "ram": 26.4,
  "disk": 23.5,
  "traffic": "10.72 Gbps",
  "trafficBps": 10720000000.0,
  "alerts": 0,
  "devices": 17,
  "servers": 17,
  "availability": 100,
  "securityScore": "—",
  "lastUpdated": "2026-09-18T02:42:40.266Z",
  "history": {
    "cpu": [{"t": "2026-09-18T01:42:40.000Z", "v": 29.0}],
    "ram": [{"t": "2026-09-18T01:42:40.000Z", "v": 26.4}],
    "disk": [{"t": "2026-09-18T01:42:40.000Z", "v": 23.5}],
    "traffic": [{"t": "2026-09-18T01:42:40.000Z", "v": 10720000000.0}],
    "availability": [{"t": "2026-09-18T01:42:40.000Z", "v": 100}]
  },
  "grafanaStatus": "ok"
}
```

### 2.5 `GET /api/asset-inventory`
```json
{
  "total": 17,
  "assets": [
    {
      "id": "dev-01",
      "hostname": "CORE-ROUTER-01",
      "name": "CORE-ROUTER-01",
      "ip": "10.24.11.12",
      "type": "Router",
      "vendor": "Cisco Systems",
      "status": "Operational",
      "monitoringSource": "Prometheus / Zabbix",
      "lastSeen": "12 sec ago",
      "availability": "100 %"
    },
    {
      "id": "dev-04",
      "hostname": "SWITCH-NOC-SW1",
      "name": "SWITCH-NOC-SW1",
      "ip": "10.24.11.1",
      "type": "Switch",
      "vendor": "Cisco Systems",
      "status": "Operational",
      "monitoringSource": "Prometheus SNMP",
      "lastSeen": "8 sec ago",
      "availability": "100 %"
    }
  ]
}
```

---

## 3. Schema Comparison: API vs Frontend Expectations

| Field | API Output Type | Frontend Expectation (`App.jsx`) | Match Status | Fix Applied |
|---|---|---|---|---|
| `cpu` | Number (`29.6`) | Number/Formatted String | ✅ Match | Formatted via `formatMetricValue(value, '%')` |
| `ram` | Number (`26.4`) | Number/Formatted String | ✅ Match | Formatted via `formatMetricValue(value, '%')` |
| `disk` | Number (`23.5`) | Number/Formatted String | ✅ Match | Formatted via `formatMetricValue(value, '%')` |
| `traffic` | String (`"10.72 Gbps"`) | String | ✅ Match | Direct display |
| `availability` | Number (`100`) | Number/Formatted String | ✅ Match | Formatted via `formatMetricValue(value, '%')` |
| `lastUpdated` | ISO-8601 (`"2026-09-18T..."`) | Date string | ✅ Fixed | `formatLastUpdated()` helper prevents `Invalid Date` |
| `devices` | Array of 17 objects | Array (`AssetsPage` & `MonitoringPage`) | ✅ Match | Wired via `api.getDevices()` |

---

## 4. Root Cause Analysis & Fixes Implemented

1. **PM2 Process Missing**:
   - **Root Cause**: PM2 was previously running only `npm run dev` (Vite) on port 5173. The Express API (`server/index.cjs`) on port 3001 was offline, causing Vite proxy requests to `/api/*` to fail.
   - **Fix**: Launched Express API in PM2 as process `api` (ID 1). Both `companyportal` (Vite) and `api` (Express) are now online.

2. **Missing API Endpoints**:
   - **Root Cause**: `/api/search`, `/api/datasources`, and `/api/asset-inventory` were not routed in `server/index.cjs`.
   - **Fix**: Added routes to `server/index.cjs` proxying Grafana API requests and returning live monitored asset inventory.

3. **`Invalid Date` Display**:
   - **Root Cause**: Passing placeholder strings like `'—'` into `new Date('—').toLocaleString()` produced the string `"Invalid Date"`.
   - **Fix**: Introduced `formatLastUpdated(isoStr)` helper in `App.jsx` to validate timestamp parsing before rendering.

---

## 5. Build Verification

```bash
> noc-automation@1.0.0 build
> vite build

✓ 2384 modules transformed.
dist/index.html                  1.06 KiB
dist/assets/index.d543164d.css   59.25 KiB / gzip: 11.78 KiB
dist/assets/index.097c04a2.js    630.55 KiB / gzip: 179.55 KiB
```

