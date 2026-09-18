# Network Topology Module Integration Report — TOPOLOGY_REPORT.md

## 1. Executive Summary

This report documents the design, implementation, and deployment of the **Network Topology Module** within the NOC Automation Portal (`companyportal`).

The Network Topology module dynamically synthesizes monitored infrastructure inventory discovered across Prometheus and Grafana targets into a live, interactive **Connectivity Map**. Operators can visualize the full network path across core routers, NOC switches, BGP edge gateways, MPLS transit nodes, external DNS endpoints, and compute servers.

---

## 2. Monitored Inventory & Discovered Subnets

The topology module maps all 17 monitored inventory devices across their respective subnet tiers:

### 2.1 Core Routers (`10.24.11.0/24`)
- **`CORE-ROUTER-01`**: `10.24.11.12` | Cisco Systems ASR-1002-X | Prometheus / Zabbix
- **`ASR-ROUTER-02`**: `10.24.11.13` | Cisco Systems ASR-1001-X | Prometheus / Zabbix
- **`ASR-ROUTER-03`**: `10.24.11.14` | Cisco Systems ASR-1001-X | Prometheus / Zabbix

### 2.2 NOC Core & Access Switches (`10.24.11.0/24`)
- **`SWITCH-NOC-SW1`**: `10.24.11.1` | Cisco Systems Catalyst 9300 | Prometheus SNMP
- **`SWITCH-NOC-SW2`**: `10.24.11.2` | Cisco Systems Catalyst 9300 | Prometheus SNMP

### 2.3 CMC Telecom Edge BGP Nodes (`103.63.123.0/24`)
- **`CMC-EDGE-189`**: `103.63.123.189` | CMC Telecom BGP Edge GW | Prometheus ICMP
- **`CMC-EDGE-190`**: `103.63.123.190` | CMC Telecom BGP Edge GW | Prometheus ICMP
- **`CMC-EDGE-193`**: `103.63.123.193` | CMC Telecom BGP Edge GW | Prometheus ICMP
- **`CMC-EDGE-194`**: `103.63.123.194` | CMC Telecom BGP Edge GW | Prometheus ICMP

### 2.4 MobiFone Transit Gateways (`112.109.90.0/24`)
- **`MTT-EDGE-90.1`**: `112.109.90.1` | MobiFone MPLS Transit GW | Prometheus ICMP
- **`MTT-EDGE-90.2`**: `112.109.90.2` | MobiFone MPLS Transit GW | Prometheus ICMP
- **`MTT-EDGE-90.3`**: `112.109.90.3` | MobiFone MPLS Transit GW | Prometheus ICMP
- **`MTT-EDGE-90.4`**: `112.109.90.4` | MobiFone MPLS Transit GW | Prometheus ICMP

### 2.5 External DNS & Transit Gateways
- **`CLOUDFLARE-DNS`**: `1.1.1.1` | Cloudflare Anycast DNS | Prometheus ICMP
- **`GOOGLE-DNS`**: `8.8.8.8` | Google Public DNS | Prometheus ICMP

### 2.6 Compute & Management Nodes
- **`TELEGRAF-NODE-01`**: `127.0.0.1:9273` | InfluxData Telegraf Agent | Telegraf Exporter
- **`PROMETHEUS-SERVER`**: `localhost:9090` | Prometheus TSDB v2.45 | Self-Monitor

---

## 3. Connectivity Graph Architecture

The connectivity graph visualizes active network paths using an interactive SVG map canvas:

```
[ CLOUDFLARE-DNS ] <--- BGP ---> [ ASR-ROUTER-02 ] <--- 10G ---> [ CORE-ROUTER-01 ] <--- 10G ---> [ ASR-ROUTER-03 ] <--- BGP ---> [ GOOGLE-DNS ]
                                        |                                |                                 |
                                   10G Link                         10G Uplink                         10G Link
                                        v                                v                                 v
                                 [ SWITCH-NOC-SW1 ] <-----------------------------------------> [ SWITCH-NOC-SW2 ]
                                    /     |     \                                                 /     |     \
                                   /      |      \                                               /      |      \
                         CMC-EDGE-189 .190 .193                                      CMC-EDGE-194  MTT-EDGE-90.1 - .4
                                   \      |      /                                               \      |      /
                              [ TELEGRAF-NODE-01 ]                                          [ PROMETHEUS-SERVER ]
```

- **Core Interconnects**: 10 Gbps trunk lines between `CORE-ROUTER-01`, `ASR-ROUTER-02`, and `ASR-ROUTER-03`.
- **Uplink Layer**: High-capacity links connecting Core Routers to `SWITCH-NOC-SW1` and `SWITCH-NOC-SW2`.
- **Edge Peering**: Transit links to CMC BGP Edge Gateways (`103.63.123.x`) and MobiFone MPLS Gateways (`112.109.90.x`).
- **Anycast DNS Links**: Direct latency-monitored probes to `1.1.1.1` and `8.8.8.8`.

---

## 4. UI & Page Implementation

1. **Topology Navigation Item**:
   - Added `<NavLink to="/topology"><GitBranch size={17} />Topology</NavLink>` to `AppShell` sidebar under **Monitor**.
2. **Page Header & KPI Metric Grid**:
   - Displays real-time counts for Routers, Switches, Edge Devices, and Active Interconnect Links.
3. **Interactive Visualizer Canvas**:
   - SVG map rendering device nodes positioned by tier (Core, Aggregation, Edge, Compute).
   - Clicking any node opens the **Node Detail Inspector** card showing IP address, vendor, model, CPU %, Memory %, Latency ms, Availability %, and monitoring source.
4. **Inventory Tier Tables**:
   - Filterable tables allowing operators to view all devices or filter by tier (`Routers`, `Switches`, `Edge Devices`).

---

## 5. Verification Results

1. **Production Build**: Executed `npm run build` — `vite build` completed cleanly with `0` compilation errors.
2. **Process Restart**: Executed `npx pm2 restart all` — both PM2 processes `companyportal` (id 0) and `api` (id 1) are online.

