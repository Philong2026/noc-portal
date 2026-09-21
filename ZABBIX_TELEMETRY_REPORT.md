# Zabbix telemetry integration — CPU, traffic, utilization

## Verified datasource contract

All network-device telemetry flows through the Grafana
**alexanderzobnin-zabbix-datasource** (`uid=bf9ccc7zhfqbke`, backend
`zabbix.saovangtelecom.vn`, host group **CORE NETWORK**). Prometheus holds no
router/switch CPU or interface metrics, so it is never used for them.

Live-verified facts the implementation relies on:

- An **empty host-group filter returns zero frames** — every query sends
  `group.filter: "CORE NETWORK"` plus the Zabbix visible host name.
- Slash-wrapped item filters (`/…/`) are regexes.
- Frames are labeled per item: `labels.host` (Zabbix host) and `labels.item`
  (full item name).

| Inventory device | Zabbix host | CPU item | Verified value |
|---|---|---|---|
| CORE-ROUTER-01 | `CORE-ROUTER-01-Viettel Internet` | `#7: CPU utilization` | 15 % |
| ASR-ROUTER-02 | `CORE-ROUTER-02 - Viettel IPtx` | `#2: CPU utilization` | 4 % |
| ASR-ROUTER-03 | `CORE-ROUTER-03 - CMC IPtx` | `#7: CPU utilization` | 5 % |
| SWITCH-NOC-SW1/2 | `CORE-SWITCH-01` (Catalyst 9300 stack) | `#19: CPU utilization` | 2 % |

- Memory item: `Processor: Memory utilization` (router01 36.6 %, router02
  32.7 %, router03 10.6 %, switch 18.2 %). Routers 02/03 also expose
  `lsmpi_io: Memory utilization` ≈ 100 % (packet-IO buffer pool) — excluded by
  the `Processor:` item filter.
- Interface traffic items: `Interface <port>(<description>): Bits received|sent`
  (tagged `component: network`).
- Interface speed items: `Interface <port>(<description>): Speed` — **not
  tagged**, and they only report on change, so a 15 m window misses them
  (verified: 15 m returned the switch only, 1 h returned every host). The
  speed query therefore uses `now-1h`.

## What the server now populates

`fetchZabbixDeviceTelemetry()` runs five group-wide queries (CPU, memory,
Bits received, Bits sent, Speed) and aggregates the labeled frames:

- **Top CPU Devices** — per-device CPU utilization (+ memory).
- **Top Network Traffic** — per-device In/Out traffic summed over **physical**
  interfaces only; subinterfaces (`Te0/2/0.1201`), VLANs (`Vl99`, `VLAN-*`) and
  virtual ports (`Vo0`, `Cr0/0/6`, `StackPort1`) are excluded so parent +
  subinterface octets are never double-counted.
- **Topology Details** — CPU, Memory, In/Out Traffic and Interface Utilization
  (busiest physical port = (in+out)/speed, capped at 100 %, aggregate-capacity
  fallback). Packet loss stays Prometheus-probe based with an em-dash fallback.
- Dashboard **CPU Usage** tile — average of the three router CPU items
  (matches the `CPU_CORE_ROUTER01_02_03` panel), with a 1 h history series.

Live smoke result (`node server/zabbixSmoke.cjs`): every featured device
reports `telemetrySource=zabbix` with numeric CPU/RAM/In/Out/Utilization;
`dashboard.cpu = 8` (avg of 15/4/5).

## Metric Not Collected removal

The frontend placeholder (`src/App.jsx`) now renders an em dash (`—`) for an
absent metric; with Zabbix feeding all five featured devices, the leaderboard
panels and topology details display live values instead of placeholders.

## Validation

- `node server/zabbixSmoke.cjs` — all five devices return live Zabbix values.
- `node --check server/grafanaService.cjs` — syntax clean.
- `npm run build` — Vite production build succeeds.
