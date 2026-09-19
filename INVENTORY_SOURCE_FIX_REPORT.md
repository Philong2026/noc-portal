# Inventory Source Fix Report

Date: 2026-09-19

## Source traced

Topology, Monitoring, Assets, and device-detail views all call `api.getDevices()` from `src/mockApi.js`. That client requests `/api/monitoring` first. Previously, a successful response was returned directly, allowing a stale IP value from an endpoint response to reach every view.

## Frontend-only fix

`src/mockApi.js` now has one frontend canonical mapping and applies it through `normalizeInventory()` to both:

1. devices received from `/api/monitoring`; and
2. the frontend fallback device list.

| Device | Canonical frontend IP |
|---|---|
| `CORE-ROUTER-01` | `103.122.160.129` |
| `ASR-ROUTER-02` | `103.122.160.120` |
| `ASR-ROUTER-03` | `103.122.160.119` |
| `SWITCH-NOC-SW1` | `171.244.204.90` |
| `SWITCH-NOC-SW2` | `171.244.204.91` |

No backend inventory files or topology visualization code were modified for this fix.

## Validation

- All four views consume the same `api.getDevices()` result.
- The client canonicalizes the five named devices regardless of whether data arrives from the API or fallback list.
- `npm run build` completed successfully.
