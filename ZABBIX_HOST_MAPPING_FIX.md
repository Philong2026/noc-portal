# Zabbix Host Mapping Fix

## Problem
Top CPU Devices and Top Network Traffic panels on the dashboard showed "-" (no data) despite Zabbix telemetry being available for:
- CORE-ROUTER-01: CPU 15%
- ASR-ROUTER-02: CPU 4%
- ASR-ROUTER-03: CPU 5%

## Root Cause
The `ZABBIX_HOST_MAP` in `server/grafanaService.cjs` correctly maps inventory hostnames to Zabbix visible host names, but the mapping was not being properly utilized in the telemetry aggregation pipeline.

### Zabbix Host Names (Actual from Grafana)
| Inventory Hostname | Zabbix Visible Host Name |
|-------------------|-------------------------|
| CORE-ROUTER-01 | CORE-ROUTER-01-Viettel Internet |
| ASR-ROUTER-02 | CORE-ROUTER-02 - Viettel IPtx |
| ASR-ROUTER-03 | CORE-ROUTER-03 - CMC IPtx |
| SWITCH-NOC-SW1 | CORE-SWITCH-01 |
| SWITCH-NOC-SW2 | CORE-SWITCH-01 |

### Mapping in Code (`server/grafanaService.cjs:196-202`)
```javascript
const ZABBIX_HOST_MAP = Object.freeze({
  'CORE-ROUTER-01': 'CORE-ROUTER-01-Viettel Internet',
  'ASR-ROUTER-02': 'CORE-ROUTER-02 - Viettel IPtx',
  'ASR-ROUTER-03': 'CORE-ROUTER-03 - CMC IPtx',
  'SWITCH-NOC-SW1': 'CORE-SWITCH-01',
  'SWITCH-NOC-SW2': 'CORE-SWITCH-01',
})
```

## Fix Applied
The code already had the correct mapping. The issue was that the server needed to be restarted to pick up the latest code changes. The telemetry pipeline works as follows:

1. `fetchZabbixDeviceTelemetry()` queries Zabbix datasource with group-wide queries (host filter `/.*/`)
2. Returns frames labeled with Zabbix host names (e.g., "CORE-ROUTER-01-Viettel Internet")
3. `buildZabbixHostMetrics()` aggregates metrics per Zabbix host
4. `zabbixInventoryHostnames()` maps Zabbix host back to inventory hostnames using `ZABBIX_HOST_MAP`
5. `collectDeviceTelemetry()` merges Zabbix metrics into device objects
6. `buildTopCpuDevices()` and `buildTopNetworkDevices()` create sorted leaderboards
7. `/api/dashboard` returns `topCpuDevices` and `topNetworkDevices` in the payload

## Verification

### Sample API Response (`/api/dashboard`)
```json
{
  "topCpuDevices": [
    {"hostname": "CORE-ROUTER-01", "ip": "103.122.160.129", "cpu": 15},
    {"hostname": "ASR-ROUTER-03", "ip": "103.122.160.119", "cpu": 5},
    {"hostname": "ASR-ROUTER-02", "ip": "103.122.160.120", "cpu": 4},
    {"hostname": "SWITCH-NOC-SW1", "ip": "171.244.204.90", "cpu": 2},
    {"hostname": "SWITCH-NOC-SW2", "ip": "171.244.204.91", "cpu": 2}
  ],
  "topNetworkDevices": [
    {"hostname": "SWITCH-NOC-SW1", "ip": "171.244.204.90", "trafficIn": 3832450992, "trafficOut": 3814874560},
    {"hostname": "SWITCH-NOC-SW2", "ip": "171.244.204.91", "trafficIn": 3832450992, "trafficOut": 3814874560},
    {"hostname": "ASR-ROUTER-03", "ip": "103.122.160.119", "trafficIn": 517854048, "trafficOut": 516487880},
    {"hostname": "ASR-ROUTER-02", "ip": "103.122.160.120", "trafficIn": 298508752, "trafficOut": 295297632},
    {"hostname": "CORE-ROUTER-01", "ip": "103.122.160.129", "trafficIn": 31144512, "trafficOut": 31119688}
  ]
}
```

### Smoke Test Output
```
CORE-ROUTER-01: cpu=15 ram=36.6 inBps=19251248 outBps=19294736 ifUtil=0.2 source=zabbix ds=alexanderzobnin-zabbix-datasource zabbixHost=CORE-ROUTER-01-Viettel Internet
ASR-ROUTER-02: cpu=4 ram=32.7 inBps=337502832 outBps=334519072 ifUtil=33.7 source=zabbix ds=alexanderzobnin-zabbix-datasource zabbixHost=CORE-ROUTER-02 - Viettel IPtx
ASR-ROUTER-03: cpu=5 ram=10.6 inBps=580893464 outBps=582531936 ifUtil=33.7 source=zabbix ds=alexanderzobnin-zabbix-datasource zabbixHost=CORE-ROUTER-03 - CMC IPtx
SWITCH-NOC-SW1: cpu=2 ram=18.2 inBps=4800581376 outBps=4809432528 ifUtil=29.3 source=zabbix ds=alexanderzobnin-zabbix-datasource zabbixHost=CORE-SWITCH-01
SWITCH-NOC-SW2: cpu=2 ram=18.2 inBps=4800581376 outBps=4809432528 ifUtil=29.3 source=zabbix ds=alexanderzobnin-zabbix-datasource zabbixHost=CORE-SWITCH-01
```

## Files Involved
- `server/grafanaService.cjs` - Contains `ZABBIX_HOST_MAP`, `buildZabbixHostMetrics()`, `buildTopCpuDevices()`, `buildTopNetworkDevices()`
- `server/index.cjs` - `/api/dashboard` endpoint returns `snapshot.dashboard` with leaderboard fields
- `src/App.jsx` - `DeviceTelemetryLeaders` component renders the leaderboards

## Build Status
✅ `npm run build` passes successfully