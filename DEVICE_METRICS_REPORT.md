# Device Metrics Report

## Result

The dashboard now obtains telemetry independently for each monitored network device. It no longer ranks devices from the aggregate CPU or network-traffic dashboard metrics.

| Device | IP queried by Prometheus |
| --- | --- |
| CORE-ROUTER-01 | 103.122.160.129 |
| ASR-ROUTER-02 | 103.122.160.120 |
| ASR-ROUTER-03 | 103.122.160.119 |
| SWITCH-NOC-SW1 | 171.244.204.90 |
| SWITCH-NOC-SW2 | 171.244.204.91 |

## Implementation

`server/grafanaService.cjs` builds a strict IP-scoped PromQL selector for each device:

```promql
instance=~"^<device-ip>(:[0-9]+)?$"
```

For every listed IP, Grafana's Prometheus datasource is queried for CPU, memory, inbound traffic, outbound traffic, aggregate interface utilization, scrape/probe status, latency, availability, and packet loss. The resulting values are attached only to that device's inventory record. A cache remains in place for 15 seconds.

The dashboard's **Top CPU Devices** and **Top Network Traffic** lists sort these five per-device values. Network totals are calculated only when at least one live directional rate was returned; missing rates are not converted to zero.

Topology node details now expose:

- CPU
- Memory
- In Traffic
- Out Traffic
- Interface Utilization

For each of those values, absent Prometheus data renders as `Metric Not Collected`. The affected leader and topology displays no longer use `Unavailable` or a fabricated `0 bps` value for missing telemetry. A genuine measured zero remains `0 bps`.

## Validation

- `node --check server/grafanaService.cjs` passed.
- `npm run build` passed with Vite production output generated successfully.
- Vite emitted its existing advisory that the minified JavaScript chunk exceeds 500 kB; this does not fail the build.

Live values depend on the configured Grafana/Prometheus target labels using the device IP as the `instance` label (with an optional exporter port). When a target does not expose a requested metric, the UI reports `Metric Not Collected` as designed.
