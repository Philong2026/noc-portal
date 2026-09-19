# Inventory Normalization Report

Date: 2026-09-19

## Verified production IP mappings

| Device | Previous inventory IP | Verified production IP |
|---|---|---|
| `CORE-ROUTER-01` | `10.24.11.12` | `103.122.160.129` |
| `ASR-ROUTER-02` | `10.24.11.13` | `103.122.160.120` |
| `ASR-ROUTER-03` | `10.24.11.14` | `103.122.160.119` |
| `SWITCH-NOC-SW1` | `10.24.11.1` | `171.244.204.90` |
| `SWITCH-NOC-SW2` | `10.24.11.2` | `171.244.204.91` |

## Scope and relationship preservation

The frontend fallback inventory (`src/mockApi.js`) and backend inventory manifest (`server/grafanaService.cjs`) now use the verified production addresses. Monitoring, Assets, Topology, and device-detail views all consume these shared inventory records and therefore display the normalized IPs.

The existing topology relationship group is stored as `topologySubnet: 10.24.11.0/24` for these five devices. The topology derivation uses this relationship-only metadata before deriving a subnet from the display IP. This preserves the existing router mesh, switch uplinks, and inter-switch link while displaying the verified production IP addresses. No node types, layout, or link derivation rules were changed.

## Validation

- Confirmed all five records are normalized in both inventory sources.
- Confirmed the old five IP mappings no longer occur in `src/` or `server/` inventory records.
- `npm run build` completed successfully.
