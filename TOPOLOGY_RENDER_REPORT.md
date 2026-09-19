# Topology Render Report — TOPOLOGY_RENDER_REPORT.md

**Date:** 2026-09-19
**Scope:** Audit of `TopologyPage` rendering (nodes + links visibility), replacement of the remaining placeholder topology widget, and DOM-level render proof with live telemetry.
**Source of truth:** `deriveTopology(devices)` fed by the live monitored inventory (17 devices) via `api.getDevices()` → `/api/monitoring`.
**Status:** ✅ Complete — 16/16 DOM render checks passed, placeholder replaced, build green.

---

## 1. Executive Summary

`TopologyPage` already derived its graph from the live inventory, but two things remained unproven/unfixed:

1. **Render proof** — "does the graph actually appear in a real DOM?" was never tested. This round adds a jsdom + React 18 `createRoot` harness that mounts the real component and asserts every requirement in a live DOM.
2. **A placeholder topology widget still existed on the Dashboard** — `TopologyMap()` rendered a hardcoded fake graph (`Core Switch / Firewall / Servers / Cloud` + 5 fixed SVG `<path>` curves). Requirement 3 ("if links and nodes exist but no graph is visible, replace placeholder topology widget") targeted exactly this. It is now replaced with the **same `deriveTopology(devices)`-driven graph** as the Topology page, showing live status/latency/availability, with node clicks routing to the full interactive map.

Result: **16/16 DOM checks passed** — 17 nodes + 22 styled links visible on both the page and the widget, live latency (`84.3 ms`… `5001 ms` Down), availability, Down states, zoom controls, and click-to-details all verified in-DOM.

---

## 2. Audit Findings & Actions

| # | Requirement | Finding | Action / Result |
|---|-------------|---------|-----------------|
| 1 | Verify `TopologyPage` renders `topologyNodes` | Code renders `{topologyNodes.map(...)}` from `deriveTopology(devices)` — but visibility was unproven | ✅ **Proven in-DOM**: 17 `.topology-node` elements present, all 17 device labels visible |
| 2 | Verify links are rendered visually | 22 links render as styled SVG `<line>` (per-kind stroke/dash) inside the zoom/pan canvas | ✅ **Proven in-DOM**: 22 `<line>` elements in `.topology-svg`, every one carries a stroke |
| 3 | Replace placeholder widget if graph not visible | **Dashboard `TopologyMap()` was a placeholder**: hardcoded nodes + 5 fixed `<path>` curves, unrelated to inventory | ✅ **Replaced** with `deriveTopology(devices)`-driven live mini-map (see §4) |
| 4 | Interactive graph (drag / zoom / pan / node details) | Already implemented in the prior round (cursor-anchored wheel zoom, +/−/Reset buttons, pointer-drag pan, click inspector) | ✅ **Proven in-DOM**: zoom controls present; node click opens the inspector with live fields + derived links |
| 5 | Display status / availability / latency | Live telemetry from Prometheus (server-side enrichment) shown on every node | ✅ **Proven in-DOM**: latency text on nodes (`84.3 ms`, `5001 ms`), availability (`100 %`, `0 %`), `Down` status visible |
| 6 | `deriveTopology(devices)` as source of truth | Both page and widget now derive from the same pure function over the live device list | ✅ Verified — zero per-device hardcoding remains (`grep 'dev-0' src/App.jsx` → 0) |

---

## 3. DOM Render Proof (jsdom + React 18 `createRoot`)

A standalone harness (`/tmp/topo-test/`) bundles `TopologyPage` + `TopologyMap` with esbuild (mocking only the API transport — the device payload mirrors the **live** `/api/monitoring` output, including the two currently-Down MobiFone gateways), mounts them in jsdom, waits for effects/data, and asserts against the real DOM:

```
PASS — R1: topologyNodes rendered (17) | count=17
PASS — R2: links rendered visually (22 svg <line> in .topology-svg) | count=22
PASS — R2: every link has a stroke (visible)
PASS — R4: zoom controls present (+ / − / Reset)
PASS — R4: all 17 device labels visible (routers/switches/edges/DNS/servers) | all present
PASS — R3: live latency shown on nodes
PASS — R3: availability shown on nodes
PASS — R3: Down status visible
PASS — R4: node click opens details panel
PASS — R4: inspector shows selected device + live fields
PASS — R4: inspector lists derived links
PASS — R5: dashboard widget renders 17 derived nodes (placeholder replaced) | count=17
PASS — R5: dashboard widget renders 22 derived links | count=22
PASS — R5: placeholder labels gone (Core Switch / Firewall / Servers / Cloud)
PASS — R5: widget shows live latency text
PASS — R5: widget links to full topology page

RESULT: 16/16 checks passed
```

The click check selects `CORE-ROUTER-01` and asserts the Node Detail Inspector opens showing the device, its `Latency` (`84.3 ms`), `Availability`, and its **derived links** (`Core 10G trunk`, `10G uplink`).

---

## 4. Placeholder Widget Replacement (Dashboard `TopologyMap`)

| Before (placeholder) | After (real) |
|----------------------|--------------|
| 4 hardcoded nodes: `Core Switch`, `Firewall`, `Servers`, `Cloud` | All inventory devices derived live: 3 routers, 2 switches, 4 CMC edges, 4 MTT edges, 2 DNS, 2 monitoring servers |
| 5 fixed `<path>` curves | 22 `deriveTopology()` links (backbone/uplink/edge/service, per-kind styling) |
| No telemetry, no status | Live status dot + `latency · availability` on every node; `X/Y live targets` footer |
| Dead decoration | Node click → routes to `/topology` (full interactive map); header action → `/topology` |

The widget shares `deriveTopology`, `TIER_META`, `deviceStatusTone`, and `deviceLatencyText` with the page — one source of truth for the graph and its live telemetry.

---

## 5. Files Changed (this round)

| File | Change |
|------|--------|
| `src/App.jsx` | `TopologyMap()` placeholder → real `deriveTopology(devices)` mini-map (live nodes, derived links, click → `/topology`); added named exports (`deriveTopology`, `TopologyPage`, `TopologyMap`) for testability |
| `TOPOLOGY_RENDER_REPORT.md` | This report |
| `package.json` | **Unchanged** — jsdom was installed `--no-save` for the render harness only |

Note: `deriveTopology()`, the zoom/pan/inspector, and Prometheus telemetry enrichment from previous rounds are untouched and re-verified here.

---

## 6. Build Results

```
$ npm run build
vite v2.9.18 building for production...
✓ transformed successfully
dist/index.html                  1.06 KiB
dist/assets/index.4282726d.css   59.40 KiB / gzip: 11.82 KiB
dist/assets/index.6034b322.js    649.36 KiB / gzip: 184.68 KiB
```

Build completed with **0 errors** (pre-existing >500 KiB chunk-size warning only). `grep 'Core Switch' src/App.jsx` → **0 matches** (placeholder fully removed).

---

## 7. Verification Summary

| Layer | Evidence |
|-------|----------|
| Derivation | `deriveTopology(inv)` → 17 nodes / 22 links (standalone Node test, previous round) |
| Server telemetry | `/api/monitoring` → 17/17 devices with live latency, 2 Down (PM2-restarted, previous round) |
| **DOM render (new)** | **16/16 jsdom + React 18 checks** — page and dashboard widget both render the full derived graph with live values |
| Production build | `npm run build` → 0 errors |

## 8. Notes & Limitations

1. The render harness lives in `/tmp/topo-test/` (scratch space, not committed); `jsdom` was installed `--no-save` so `package.json`/`package-lock.json` are untouched. Re-run with: `node /tmp/topo-test/build.cjs && NODE_PATH=<project>/node_modules node /tmp/topo-test/runner.cjs` (requires a modern Node — the system Node is v12; the harness used the VS Code server's Node 24 binary).
2. jsdom does not implement layout/paint, so assertions are DOM-structural (element counts, attributes, text) — the production build plus the existing CSS (`.topology-svg{position:absolute;inset:0}`, `.topology-node{position:absolute}`) governs pixel rendering; no CSS conflicts were found during the audit.
3. Pan/zoom gestures (pointer events) are implemented but not simulated in jsdom (no real layout); zoom controls' presence and node click selection are proven, and drag suppression logic is unit-similar logic (`panMovedRef` threshold).

## 9. Recommendations (follow-ups)

| Priority | Item |
|----------|------|
| 🟢 Low | Add the render harness to CI (commit a slimmed `test/` folder + `jsdom` devDependency) so node/link regressions fail builds automatically. |
| 🟢 Low | Add a resize observer to re-fit pan/zoom offsets when the dashboard card resizes. |