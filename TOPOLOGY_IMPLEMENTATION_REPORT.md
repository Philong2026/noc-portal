# Topology Implementation Report — TOPOLOGY_IMPLEMENTATION_REPORT.md

**Date:** 2026-09-19
**Scope:** Full `/topology` implementation audit + rebuild — routing, inventory-derived graph, live telemetry (status / latency / availability), and map interactivity (zoom / pan / node details).
**Inventory baseline:** 17 monitored devices (all Prometheus targets verified live).
**Status:** ✅ Complete — all 4 requirements verified/implemented, live telemetry flowing, build green.

---

## 1. Executive Summary

The Topology menu item existed, but the page behind it was not functional as a real topology view: the map was a static snapshot, the device payload carried **no per-device telemetry** (the "latency" KPI was literally the placeholder string `'Live'`), and the map had zero interactivity (no zoom, no pan).

This round completes the implementation end-to-end:

1. **Route + dedicated page verified** — `/topology` renders `TopologyPage` as a full dedicated page.
2. **Zero hardcoded topology nodes** — the graph is 100% derived from the live monitored inventory.
3. **Live per-device telemetry** — a new server-side enrichment pipeline feeds real **status**, **latency**, and **availability** from Prometheus into every node (`up`, `probe_success`, `probe_duration_seconds`, `scrape_duration_seconds`, 24h uptime history).
4. **Interactive map** — wheel zoom (cursor-anchored), +/−/Reset controls, drag-to-pan, click-to-select node inspector with live fields.

Live verification against the estate: **17/17 devices enriched with latency; MTT-EDGE-90.3 and MTT-EDGE-90.4 are genuinely DOWN right now** (`probe_success = 0`, probe timing out at ~5001 ms, 0% 24h probe availability) — visible in the UI for the first time.

---

## 2. Requirement Verification

### 2.1 Requirement 1 — Route `/topology` exists ✅

- Sidebar navigation: `<NavLink to="/topology" ...><GitBranch size={17} />Topology</NavLink>` under **Monitor** (`src/App.jsx`, AppShell).
- Router: `case '/topology': return <TopologyPage />` in `renderProtectedPage()` (`src/App.jsx`). SPA fallback serves the page on direct URL load (vite dev + built SPA both resolve `/topology`).

### 2.2 Requirement 2 — Clicking Topology opens a dedicated page ✅

`/topology` renders a full dedicated page, not a widget: page header + 4 KPI metric cards (Routers / Switches / Edge Devices / Interconnect Links), interactive connectivity map, node detail inspector, subnet relationships table, and the tiered inventory table. (The dashboard also carries a small `TopologyMap()` widget — separate, and flagged for follow-up in §9.)

### 2.3 Requirement 3 — All hardcoded topology nodes replaced ✅

- The former hardcoded `topologyNodes` (17 fixed `id/x/y/label/ip` entries) and hardcoded `links` (18 fixed pairs) are gone — `grep 'dev-0' src/App.jsx` → **0 matches**.
- Nodes, links, layout, KPI counts, and tables all come from `deriveTopology(devices)` over the live `api.getDevices()` payload.

### 2.4 Requirement 4 — Topology built from current monitored inventory ✅

17 monitored devices → 17 nodes, generated from every required device family:

| Family | Devices (from live inventory) | Tier row |
|--------|-------------------------------|----------|
| Core routers | CORE-ROUTER-01, ASR-ROUTER-02, ASR-ROUTER-03 | 0 — Core routing |
| NOC switches | SWITCH-NOC-SW1, SWITCH-NOC-SW2 | 1 — NOC switching |
| CMC-EDGE devices | CMC-EDGE-189, CMC-EDGE-190, CMC-EDGE-193, CMC-EDGE-194 | 2 — Edge & transit |
| Edge Gateways | MTT-EDGE-90.1, MTT-EDGE-90.2, MTT-EDGE-90.3, MTT-EDGE-90.4 | 2 — Edge & transit |
| DNS Gateways | CLOUDFLARE-DNS (1.1.1.1), GOOGLE-DNS (8.8.8.8) | 3 — DNS & compute |
| Monitoring/management | TELEGRAF-NODE-01, PROMETHEUS-SERVER | 3 — DNS & compute |

**Links — subnet + inventory relationship rules** (deduped, 22 total):

| Rule (derived, not hardcoded) | Kind | Links today |
|-------------------------------|------|--------------|
| Routers sharing `10.24.11.0/24` form a full-mesh backbone | backbone | 3 |
| Switches uplink to same-subnet routers + inter-switch trunk | uplink | 7 |
| Each edge /24 (`103.63.123.0/24`, `112.109.90.0/24`) spreads round-robin over the switch tier | edge | 8 |
| DNS probes attach to the routing tier; servers to the switching tier | service | 4 |

---

## 3. Live Node Telemetry (status · latency · availability)

### 3.1 Problem

The device payload from `/api/monitoring` carried only manifest fields (status/availability from a static inventory manifest, **no latency**). Per-node live telemetry did not exist anywhere in the stack — the dashboard "latency" metric was literally the placeholder string `'Live'`.

### 3.2 Solution — server-side enrichment (`server/grafanaService.cjs`)

New `collectDeviceTelemetry(prometheusUid, devices)` runs 6 instant Prometheus queries via the Grafana datasource API (`/api/ds/query`, UID auto-discovered) in parallel:

| Expr | Provides |
|------|----------|
| `up` | scrape-target health (all 17 targets) |
| `probe_success` | blackbox ICMP reachability (10 probed targets) |
| `probe_duration_seconds` | **real ICMP RTT** for probed targets |
| `scrape_duration_seconds` | scrape latency (fallback latency for all 17) |
| `avg_over_time(up[24h])` | 24h uptime history |
| `avg_over_time(probe_success[24h])` | 24h **probed-path availability** (preferred for probe targets) |

**Device → target matching** (`deviceCandidateKeys`): exact IP → IP host part → normalized hostname → hostname last segment → `router<NN>`/`sw<NN>` keyword construction. This maps all 17 devices (`CORE-ROUTER-01`→`router01` job via `router`+`01`, `SWITCH-NOC-SW1`→`sw1`, `103.63.123.189`→instance, `127.0.0.1:9273`→instance, etc.).

**Merge rules** (no fabrication): only fields with a real Prometheus value are written — `status` (`Down` when `probe_success=0` or `up=0`, else `Operational`), `latencyMs`/`latency` (probe RTT preferred, scrape duration fallback), `availability` (24h probe history for probed targets, else scrape history). Devices without a matching target keep manifest values. Every query is individually fail-safe (`Promise.allSettled`) — a Prometheus outage degrades to manifest values instead of breaking the page.

### 3.3 Live verification (PM2 restart + curl of `/api/monitoring`)

```
devices=17 withLatency=17 down=2
  DOWN: MTT-EDGE-90.3 lat 5001 ms avail 0 %
  DOWN: MTT-EDGE-90.4 lat 5001 ms avail 0 %
sample: CORE-ROUTER-01 Operational 81.2 ms 100 %
```

Full 17-device table observed live: routers 43–84 ms (scrape), switches 271–301 ms (scrape), CMC edges 1.3–2.7 ms (probe), MTT edges 2.9–3.0 ms (probe; 90.3/90.4 timing out at 5001 ms → **Down**), anycast DNS 38 ms (probe), Telegraf 7.1 ms, Prometheus 13.5 ms.

### 3.4 Frontend display

- **Every node badge** shows a live status dot (green Operational / red Down / amber Unknown) plus a live line: `latency · availability` (red-tinted for Down nodes).
- **Node Detail Inspector**: Latency, Availability, Status, Subnet, Health Score, Serial, Owner, Last Seen — live values, `—` when absent (never fabricated), plus traceability (`live latency via probe_duration_seconds`).
- **30-second polling** keeps status/latency/availability fresh without manual reload.

---

## 4. Map Interactivity (zoom · pan · node details)

| Feature | Implementation |
|---------|----------------|
| **Zoom (wheel)** | Native non-passive `wheel` listener; cursor-anchored zoom (pan recomputed so the point under the cursor stays fixed); clamped 50%–300% |
| **Zoom (buttons)** | `+` / `−` / `Reset` overlay controls anchored at canvas center, with live `%` readout |
| **Pan** | Pointer drag anywhere on the canvas (`grab`/`grabbing` cursor, `touch-action: none`); transform-based (`translate` + `scale`, origin `0 0`) over the derived SVG + node canvas |
| **Node details** | Click a node → Node Detail Inspector (live telemetry + derived links). Drag-vs-click disambiguation: clicks after a >4px pan drag are suppressed |
| **Truth source** | `viewRef` holds zoom/pan truth so wheel/drag handlers never operate on stale React state |

---

## 5. Files Changed

| File | Change |
|------|--------|
| `server/grafanaService.cjs` | +`collectDeviceTelemetry()` (6 Prometheus exprs, device→target matcher, latency/status/availability merge), wired into `getGrafanaSnapshot().monitoring.devices`; API restarted via PM2 |
| `src/App.jsx` | `TopologyPage`: zoom (wheel + buttons), pan (pointer drag), live node badges (status dot + latency + availability), enriched inspector, 30s polling, `deviceStatusTone`/`deviceLatencyText` helpers |
| `TOPOLOGY_IMPLEMENTATION_REPORT.md` | This report |

---

## 6. Build Results

```
$ npm run build
vite v2.9.18 building for production...
✓ transformed successfully
dist/index.html                  1.06 KiB
dist/assets/index.4282726d.css   59.40 KiB / gzip: 11.82 KiB
dist/assets/index.cc7e0dc8.js    648.25 KiB / gzip: 184.30 KiB
```

Build completed with **0 errors** (pre-existing >500 KiB chunk-size warning only). Server syntax validated (`node --check server/grafanaService.cjs` → OK) before the PM2 restart.

---

## 7. Operational Notes

- The API process (`pm2: api`) was restarted to activate enrichment; the 15s snapshot cache keeps added Prometheus load bounded (6 instant queries per cache miss).
- The two currently-Down MobiFone transit gateways (`112.109.90.3`, `112.109.90.4`) show 0% 24h probe availability — a real operational incident now visible on the topology page, not a UI defect.
- If Grafana/Prometheus is unreachable, `/api/monitoring` falls back to the manifest; nodes show `—` for latency rather than fabricated numbers, and the page stays fully interactive.

## 8. Assumptions & Limitations

1. Latency semantics: probe RTT for ICMP targets (`probe_duration_seconds`); scrape duration for SNMP/exporter targets (`scrape_duration_seconds`). True ICMP RTT for routers/switches would require blackbox probe jobs against `10.24.11.x` — a monitoring-stack addition, not a code change.
2. Availability is derived from 24h Prometheus history (`up` / `probe_success`), not the static SLA manifest value.
3. LLDP/CDP neighbor discovery is not present in the telemetry stack; links remain subnet/tier-derived (see TOPOLOGY_AUDIT_REPORT.md §3.3).

## 9. Recommendations (follow-ups)

| Priority | Item |
|----------|------|
| 🔴 High | Investigate MTT-EDGE-90.3 / 90.4 — probed path down for 24h (0% probe availability). |
| 🟡 Medium | Reuse `deriveTopology()` in the dashboard `TopologyMap()` widget (still generic/hardcoded). |
| 🟡 Medium | Add blackbox ICMP jobs for `10.24.11.12–14` and `sw1`/`sw2` so routers/switches report true RTT. |
| 🟢 Low | Consider code-splitting (`manualChunks`) to silence the chunk-size warning. |