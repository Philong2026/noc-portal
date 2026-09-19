# Topology Page Audit Report — TOPOLOGY_AUDIT_REPORT.md

**Date:** 2026-09-19
**Scope:** `/topology` page (`TopologyPage`, `src/App.jsx`) — functionality, node rendering, link rendering, live-inventory integration.
**Inventory baseline:** 17 monitored devices (Prometheus / Zabbix / SNMP / ICMP / Telegraf / self-monitor targets).
**Status:** ✅ Audit complete — issues found, all resolved. Topology page rebuilt as a **derived, live-inventory-driven graph**.

---

## 1. Executive Summary

The Topology page **was functional but fake**: it rendered a network map from two **hardcoded frontend arrays** (17 nodes with fixed coordinates + 18 hardcoded links) instead of deriving the graph from the live monitored inventory. The live `devices` state fetched from `/api/monitoring` was only used for KPI counts and the device table; the map itself was a static snapshot that would silently diverge from the real inventory. The Node Detail Inspector additionally displayed **fabricated telemetry fallbacks** (`42%` CPU, `58%` memory, `12 ms` latency) that violated the portal's no-fabricated-data rule.

The page has been rebuilt: nodes, links, layout, and relationship tables are now **computed from the live device list** (`api.getDevices()` → `/api/monitoring`) by a pure `deriveTopology()` function. Adding, removing, renaming, or re-IPing a device in the monitored inventory automatically updates the map — no code changes required.

---

## 2. Audit Findings (answers to the 4 questions)

| # | Question | Pre-change answer | Verdict | Evidence |
|---|----------|-------------------|---------|----------|
| 1 | Is Topology page functional? | Route, sidebar nav, KPIs, map, detail panel, and device table all rendered without runtime errors | ⚠️ Yes (shell) / No (graph) | `App.jsx` route `case '/topology'`, `NavLink to="/topology"` |
| 2 | Does it render nodes? | 17 nodes rendered — but from a **hardcoded array**, not live data | ❌ Not live | `topologyNodes` array with fixed `id/x/y/label/ip` (was lines 940–958) |
| 3 | Does it render links? | 18 links rendered — but from a **hardcoded array**, not derived from subnets/inventory | ❌ Not derived | `links` array of fixed `{from,to}` pairs (was lines 960–979) |
| 4 | Does it use live inventory data? | **No.** Live devices only fed KPI counts + table. The map joined live data via `devices.find((d) => d.id === node.id) \|\| node` — a fragile ID match that silently fell back to stale hardcoded data. If inventory changed (device added/removed/renamed/re-IPed), the map kept rendering the stale 17-node snapshot. | ❌ **FAIL** | Node-detail join with `\|\| node` fallback |

**Additional finding (fabricated data):** the Node Detail Inspector rendered fabricated fallback values when live fields were missing — `CPU 42%`, `Memory 58%`, `Latency 12 ms`, `Availability 100 %`, `Monitoring Source 'Prometheus / Grafana Live Target'`, `Health 98%`. The device payload from `/api/monitoring` has no per-device `cpu`/`ram`/`ping` fields, so three of those numbers were *always* fabricated.

**Related (out of scope, noted):** the dashboard widget `TopologyMap()` (`src/App.jsx`) still renders a generic hardcoded mini-map (`Core Switch / Firewall / Servers / Cloud`) unrelated to the real inventory. See §6 Recommendations.

---

## 3. What Was Rebuilt

### 3.1 Architecture

```
/api/monitoring (Grafana-backed snapshot, 17 devices)
        │
        ▼
api.getDevices()                (src/mockApi.js — live fetch, inventory fallback)
        │
        ▼
deriveTopology(devices)         (src/App.jsx — pure, data-driven, no per-device hardcoding)
  ├─ nodes        : tier classification + subnet key + computed layout position
  ├─ links        : subnet & tier relationship rules (deduped)
  ├─ subnetGroups : live subnet roll-up table
  └─ view         : canvas geometry (520×340, 4 tier rows)
        │
        ▼
TopologyPage (useMemo)  →  KPI cards · SVG link layer · node layer ·
                           Node Detail Inspector (live fields + derived links) ·
                           Subnet Relationships table · Inventory by Tier table
```

### 3.2 Tier classification (from inventory `type`)

| Tier | Row (y) | Match | Devices (current inventory) |
|------|---------|-------|------------------------------|
| 0 — Core routing | 46 | type includes `router` | CORE-ROUTER-01, ASR-ROUTER-02, ASR-ROUTER-03 |
| 1 — NOC switching | 124 | type includes `switch` | SWITCH-NOC-SW1, SWITCH-NOC-SW2 |
| 2 — Edge & transit | 202 | type includes `edge`/`gateway` | CMC-EDGE-189/190/193/194, MTT-EDGE-90.1–90.4 |
| 3 — DNS & compute | 280 | type includes `dns` → external; else compute/monitoring | CLOUDFLARE-DNS, GOOGLE-DNS, TELEGRAF-NODE-01, PROMETHEUS-SERVER |

### 3.3 Link derivation rules (subnet + inventory based)

| Rule | Kind | Style | Derived links (current inventory) |
|------|------|-------|-----------------------------------|
| Routers sharing a /24 form a full-mesh backbone | `backbone` | solid teal | CORE-01↔ASR-02, CORE-01↔ASR-03, ASR-02↔ASR-03 (3) |
| Switches uplink to same-subnet routers; co-located switches interconnect | `uplink` | dashed blue | SW1↔SW2 + SW1/SW2↔each router (7) |
| Each edge /24 subnet spreads round-robin over the switch tier | `edge` | thin dashed teal | CMC-189/193→SW1, CMC-190/194→SW2, MTT-90.1/90.3→SW1, MTT-90.2/90.4→SW2 (8) |
| DNS probes hang off the routing tier; servers off the switching tier | `service` | dotted amber | CF-DNS→CORE-01, GOOG-DNS→ASR-02, TELEGRAF→SW1, PROMETHEUS→SW2 (4) |

**Total: 17 nodes · 22 derived links.** All pairs are deduplicated and layout rows are computed per populated tier, so the graph adapts automatically to any inventory change.

### 3.4 Required device checklist

| Required device | Rendered | Node IP | Derived uplinks |
|-----------------|----------|---------|------------------|
| CORE-ROUTER-01 | ✅ | 10.24.11.12 | ↔ ASR-02, ↔ ASR-03, ↔ SW1, ↔ SW2, ← CF-DNS |
| ASR-ROUTER-02 | ✅ | 10.24.11.13 | ↔ CORE-01, ↔ ASR-03, ↔ SW1, ↔ SW2, ← GOOG-DNS |
| SWITCH-NOC-SW1 | ✅ | 10.24.11.1 | ↔ all 3 routers, ↔ SW2, ← CMC-189/193, ← MTT-90.1/90.3, ← TELEGRAF |
| SWITCH-NOC-SW2 | ✅ | 10.24.11.2 | ↔ all 3 routers, ↔ SW1, ← CMC-190/194, ← MTT-90.2/90.4, ← PROMETHEUS |
| CMC-EDGE-189/190/193/194 | ✅ (4/4) | 103.63.123.x | → SW1 / SW2 per subnet round-robin |

(MTT-EDGE-90.1–90.4, both DNS anycast probes, and both monitoring servers are also rendered — the map always reflects the full 17-device inventory.)

### 3.5 Data-integrity fixes

- ❌ Removed fabricated `42%` CPU / `58%` memory / `12 ms` latency / `98%` health / `'Cisco / Edge'` vendor fallbacks from the Node Detail Inspector.
- ✅ Detail panel now shows only live inventory fields (`—` when absent): type, IP, vendor·model, **subnet**, health score, availability, serial, owner, last seen, monitoring source.
- ✅ New **"Derived links"** section lists each node's computed neighbors with the relationship note.
- ✅ "Live refresh" now **re-fetches `/api/monitoring`** instead of `window.location.reload()`.
- ✅ New **"Subnet Relationships"** table derived from live inventory: `10.24.11.0/24` (5 devices), `103.63.123.0/24` (4), `112.109.90.0/24` (4), `1.1.1.0/24`, `8.8.8.0/24`, plus vendor-bucketed non-IPv4 service targets.

---

## 4. Verification Results

### 4.1 Derivation logic (standalone Node test against the 17-device inventory)

```
nodes: 17 | links: 22
link kinds: {"backbone":3,"uplink":7,"edge":8,"service":4}
rows: tier0 y=46 (3 routers) · tier1 y=124 (2 switches) · tier2 y=202 (8 edges) · tier3 y=280 (4 services)
required devices present: YES (all)
partial inventory (2 devices) -> 2 nodes, 1 links: OK
empty inventory -> 0 nodes, 0 links: OK
```

### 4.2 Production build

```
$ npm run build
vite v2.9.18 building for production...
✓ 2384 modules transformed.
dist/index.html                  1.06 KiB
dist/assets/index.9a86a428.css   59.36 KiB / gzip: 11.81 KiB
dist/assets/index.b2d73d76.js    645.27 KiB / gzip: 183.23 KiB
```

Build completed with **0 errors** (pre-existing >500 KiB chunk-size warning only).

---

## 5. Assumptions & Limitations

1. The 17-device inventory manifest is maintained server-side in `server/grafanaService.cjs` (`realMonitoredAssets`); per-device live telemetry is Grafana/Prometheus-backed. The frontend topology is now guaranteed consistent with whatever that manifest returns.
2. Edge devices are ICMP/SNMP probes without LLDP/CDP neighbor data in the current telemetry stack — parent selection is therefore a deterministic subnet round-robin (documented above), not an L2-discovered adjacency. When LLDP data becomes available, `deriveTopology()` is the single place to upgrade.
3. Non-IPv4 targets (loopback exporters, anycast probes) are bucketed by vendor for subnet grouping.

---

## 6. Recommendations (follow-ups)

| Priority | Item |
|----------|------|
| 🟡 Medium | Dashboard widget `TopologyMap()` still renders a generic hardcoded mini-map — reuse `deriveTopology()` there or replace it with a link into `/topology`. |
| 🟡 Medium | Move relationship derivation server-side (e.g. `GET /api/topology`) once LLDP/CDP neighbor data exists, so path data is authoritative. |
| 🟢 Low | Add polling (e.g. 30 s) to keep the map fresh without manual refresh. |