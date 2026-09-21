# Latency and Network Utilization Breakdown Report

## Summary
Successfully implemented ICMP-based latency telemetry and Top Network Utilization leaderboard using existing Grafana API integration with Zabbix datasource.

## API Endpoints

### `/api/dashboard`
Returns dashboard snapshot with Top Network Utilization leaderboard.

**Key Fields:**
- `topNetworkUtilizationDevices`: Array of 5 target devices sorted by throughput (descending)
- `topCpuDevices`: Top CPU consumers
- `topNetworkDevices`: Top network traffic devices (legacy)

### `/api/monitoring`
Returns enriched device inventory with per-device ICMP latency.

**Key Fields per Device:**
- `latencyMs`: ICMP response time in milliseconds (primary latency metric)
- `icmpResponseTimeMs`: Raw ICMP response time from Zabbix (seconds → ms)
- `icmpLoss`: ICMP packet loss percentage
- `ping`: Frontend-mapped field from `latencyMs` for backward compatibility

## API Response Samples

### `/api/dashboard` - Top Network Utilization Devices
```json
{
  "topNetworkUtilizationDevices": [
    {
      "hostname": "SWITCH-NOC-SW1",
      "ip": "171.244.204.90",
      "trafficIn": 4082764152,
      "trafficOut": 4074322272,
      "throughput": 8157086424,
      "throughputFormatted": "8.16 Gbps"
    },
    {
      "hostname": "SWITCH-NOC-SW2",
      "ip": "171.244.204.91",
      "trafficIn": 4082764152,
      "trafficOut": 4074322272,
      "throughput": 8157086424,
      "throughputFormatted": "8.16 Gbps"
    },
    {
      "hostname": "ASR-ROUTER-03",
      "ip": "103.122.160.119",
      "trafficIn": 568017544,
      "trafficOut": 572261440,
      "throughput": 1140278984,
      "throughputFormatted": "1.14 Gbps"
    },
    {
      "hostname": "ASR-ROUTER-02",
      "ip": "103.122.160.120",
      "trafficIn": 336071312,
      "trafficOut": 332255536,
      "throughput": 668326848,
      "throughputFormatted": "668.33 Mbps"
    },
    {
      "hostname": "CORE-ROUTER-01",
      "ip": "103.122.160.129",
      "trafficIn": 34101008,
      "trafficOut": 33686680,
      "throughput": 67787688,
      "throughputFormatted": "67.79 Mbps"
    }
  ]
}
```

### `/api/monitoring` - Device Latency (5 Target Devices)
```json
{
  "devices": [
    {
      "hostname": "CORE-ROUTER-01",
      "ip": "103.122.160.129",
      "latencyMs": 1.46,
      "icmpResponseTimeMs": 1.46,
      "icmpLoss": 0,
      "cpu": 16,
      "ram": 36.6
    },
    {
      "hostname": "ASR-ROUTER-02",
      "ip": "103.122.160.120",
      "latencyMs": 0.51,
      "icmpResponseTimeMs": 0.51,
      "icmpLoss": 0,
      "cpu": 4,
      "ram": 32.7
    },
    {
      "hostname": "ASR-ROUTER-03",
      "ip": "103.122.160.119",
      "latencyMs": 0.52,
      "icmpResponseTimeMs": 0.52,
      "icmpLoss": 0,
      "cpu": 5,
      "ram": 10.6
    },
    {
      "hostname": "SWITCH-NOC-SW1",
      "ip": "171.244.204.90",
      "latencyMs": 0.6,
      "icmpResponseTimeMs": 0.6,
      "icmpLoss": 0,
      "cpu": 2,
      "ram": 45.2
    },
    {
      "hostname": "SWITCH-NOC-SW2",
      "ip": "171.244.204.91",
      "latencyMs": 0.6,
      "icmpResponseTimeMs": 0.6,
      "icmpLoss": 0,
      "cpu": 2,
      "ram": 44.8
    }
  ]
}
```

## Implementation Details

### Backend Changes (`server/grafanaService.cjs`)
1. **Added ZABBIX_ITEM_FILTERS** for ICMP metrics:
   - `icmpPing`: "Cisco IOS: ICMP ping" (icmpping)
   - `icmpLoss`: "Cisco IOS: ICMP loss" (icmppingloss)
   - `icmpResponseTime`: "Cisco IOS: ICMP response time" (icmppingsec)

2. **Updated `fetchZabbixDeviceTelemetry()`** to query ICMP items via Grafana Zabbix datasource

3. **Updated `buildZabbixHostMetrics()`** to aggregate `icmpResponseTimeMs` (converted from seconds to ms) and `icmpLoss`

4. **Updated `collectDeviceTelemetry()`** to use Zabbix ICMP response time as primary latency source with fallback to "Metric Not Collected"

5. **Added `buildTopNetworkUtilizationDevices()`** function:
   - Calculates throughput = trafficIn + trafficOut per device
   - Returns sorted array (descending by throughput)
   - Includes formatted throughput string (Gbps/Mbps)

6. **Added `topNetworkUtilizationDevices`** to dashboard snapshot output

### Frontend Changes
1. **`src/mockApi.js`**: Updated `normalizeInventory()` to map `latencyMs` → `ping` field for backward compatibility with existing UI components

2. **`src/App.jsx`**: Updated `DeviceTelemetryLeaders` component to display "Top Network Utilization" leaderboard alongside existing "Top CPU Devices" and "Top Network Traffic"

## Verification
- ✅ Build successful (`npm run build`)
- ✅ `/api/dashboard` returns `topNetworkUtilizationDevices` with 5 target devices sorted by throughput descending
- ✅ `/api/monitoring` returns 17 devices with `latencyMs`, `icmpResponseTimeMs`, `icmpLoss`
- ✅ All 5 target devices (CORE-ROUTER-01, ASR-ROUTER-02, ASR-ROUTER-03, SWITCH-NOC-SW1, SWITCH-NOC-SW2) have valid latency data
- ✅ Latency fallback to "Metric Not Collected" when Zabbix ICMP items unavailable
- ✅ Existing total Network Traffic KPI preserved (`traffic` / `trafficBps`)
- ✅ All telemetry flows through existing Grafana API integration (no direct Prometheus queries)