# SVTELECOM NOC Enhancement Report

Date: 2026-09-19

## Branding

- Rebranded visible application copy to **SVTELECOM NOC**.
- Added the supplied Sao Vang Telecom horizontal logo to login and sidebar branding.
- Updated browser title and metadata to SVTELECOM NOC.

Logo source: `http://svtelecom.vn/wp-content/uploads/2025/10/logo-ngang-r.png`

## Live device telemetry

The existing Prometheus device-telemetry collection now queries and merges per-device:

- CPU utilization: `100 - avg by (instance) (cpu_usage_idle)`
- Memory utilization: `100 - avg by (instance) (mem_available_percent)`
- Inbound traffic: `sum by (instance) (irate(ifHCInOctets[2m]) * 8)`
- Outbound traffic: `sum by (instance) (irate(ifHCOutOctets[2m]) * 8)`
- Packet loss: `100 * (1 - avg by (instance) (probe_success))`

Unmatched or unavailable metrics remain explicitly unavailable; no fallback values are fabricated.

## Dashboard panels

Added **Top CPU Devices** and **Top Network Traffic** panels for:

- `CORE-ROUTER-01`
- `ASR-ROUTER-02`
- `ASR-ROUTER-03`
- `SWITCH-NOC-SW1`
- `SWITCH-NOC-SW2`

The network panel presents per-device inbound, outbound, and combined traffic rates.

## Topology device details

Topology details now include CPU, Memory, In Traffic, Out Traffic, Packet Loss, and the latest matching alert. Monitoring now also uses the same shared frontend `api.getDevices()` source as Topology and Assets.

## Validation

- `node --check server/grafanaService.cjs` passed.
- `npm run build` passed.
