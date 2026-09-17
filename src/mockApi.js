const devices = [
  { id: 'PRD-WEB-01', name: 'Production Web 01', type: 'Server', location: 'Chicago', ip: '10.24.1.18', status: 'Operational', uptime: '99.99%', cpu: 38, ram: 61, disk: 54, ping: 18, lastCheck: '12 sec ago' },
  { id: 'SQL-CORE-02', name: 'SQL Core 02', type: 'Server', location: 'Chicago', ip: '10.24.1.21', status: 'Operational', uptime: '99.97%', cpu: 56, ram: 74, disk: 68, ping: 21, lastCheck: '14 sec ago' },
  { id: 'RTR-EDGE-12', name: 'Edge Router 12', type: 'Network', location: 'Frankfurt', ip: '10.24.8.12', status: 'Operational', uptime: '99.95%', cpu: 22, ram: 43, disk: 31, ping: 92, lastCheck: '10 sec ago' },
  { id: 'FILE-OPS-04', name: 'Operations File 04', type: 'Server', location: 'New York', ip: '10.24.3.44', status: 'Degraded', uptime: '98.82%', cpu: 81, ram: 79, disk: 73, ping: 44, lastCheck: '18 sec ago' },
  { id: 'VPN-GW-03', name: 'VPN Gateway 03', type: 'Security', location: 'New York', ip: '10.24.3.90', status: 'Warning', uptime: '99.41%', cpu: 47, ram: 52, disk: 39, ping: 36, lastCheck: '21 sec ago' },
  { id: 'APP-API-07', name: 'Application API 07', type: 'Server', location: 'Singapore', ip: '10.24.12.7', status: 'Operational', uptime: '99.98%', cpu: 42, ram: 66, disk: 48, ping: 184, lastCheck: '16 sec ago' },
]

const alerts = [
  { id: 'ALT-1048', title: 'Storage capacity above 70%', device: 'FILE-OPS-04', severity: 'Critical', time: '12 min ago', status: 'Open', detail: 'The operations file volume has crossed its critical capacity threshold.' },
  { id: 'ALT-1047', title: 'SQL replication latency', device: 'SQL-CORE-02', severity: 'Warning', time: '38 min ago', status: 'Acknowledged', detail: 'Replication latency is above the 250ms warning threshold.' },
  { id: 'ALT-1046', title: 'TLS certificate expires in 14 days', device: 'PRD-WEB-01', severity: 'Information', time: '2 hrs ago', status: 'Scheduled', detail: 'Certificate renewal has been added to the next maintenance window.' },
  { id: 'ALT-1045', title: 'VPN gateway connection restored', device: 'VPN-GW-03', severity: 'Information', time: '4 hrs ago', status: 'Resolved', detail: 'The gateway returned to normal connectivity after a transient interruption.' },
]

const wait = value => new Promise(resolve => setTimeout(() => resolve(value), 180))
export const mockApi = {
  getDashboard: () => wait({ cpu: 42.8, ram: 68.4, disk: 71.2, traffic: '1.84 GB/s', alerts: 7, devices: 126, servers: 48 }),
  getDevices: () => wait([...devices]),
  getAlerts: () => wait([...alerts]),
  getReports: () => wait({ daily: 99.98, weekly: 99.96, monthly: 99.98, incidents: 38 }),
  getSettings: () => wait({ profile: { name: 'NOC SAO VÀNG', username: 'svtelecom', role: 'Administrator' }, notifications: { critical: true, digest: true, maintenance: false }, roles: ['Administrator'] }),
}
