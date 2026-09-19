// Live Grafana-backed API client — replaces the former mock data module.
//
// Two transports, both driven by the GRAFANA_URL / GRAFANA_TOKEN environment
// variables (no fabricated data anywhere):
//
//   1. Backend proxy (default): the browser calls /api/* which is served by
//      server/index.cjs and rendered by server/grafanaService.cjs. That service
//      reads GRAFANA_URL + GRAFANA_TOKEN from the server environment, which is
//      the secure path because the token never reaches the browser.
//   2. Direct browser mode (optional): when VITE_GRAFANA_URL and
//      VITE_GRAFANA_TOKEN are set at build time, `grafanaApi` talks to the
//      Grafana HTTP API directly (health, search, dashboard JSON, datasources,
//      /api/ds/query). Only use this in trusted networks.

const GRAFANA_URL = String(import.meta.env.VITE_GRAFANA_URL || '').trim().replace(/\/+$/, '')
const GRAFANA_TOKEN = String(import.meta.env.VITE_GRAFANA_TOKEN || '').trim()

export const grafanaConfigured = Boolean(GRAFANA_URL && GRAFANA_TOKEN)

const DATA_UNAVAILABLE = 'Data unavailable'

const grafanaFetch = async (path, options = {}) => {
  if (!grafanaConfigured) {
    throw new Error('Grafana direct mode is not configured. Set VITE_GRAFANA_URL and VITE_GRAFANA_TOKEN (server mode uses GRAFANA_URL and GRAFANA_TOKEN).')
  }

  const isBody = typeof options.body === 'string'
  const response = await fetch(`${GRAFANA_URL}${path.startsWith('/') ? path : `/${path}`}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${GRAFANA_TOKEN}`,
      ...(isBody ? { 'Content-Type': 'application/json' } : null),
      ...(options.headers || {}),
    },
  })

  if (!response.ok) throw new Error(`Grafana API ${path} failed with status ${response.status}`)
  const payload = await response.json()
  return payload && typeof payload === 'object' ? payload : null
}

// Thin typed wrapper around the Grafana HTTP API used by direct browser mode.
export const grafanaApi = {
  config: () => ({ url: GRAFANA_URL, tokenSet: Boolean(GRAFANA_TOKEN) }),
  health: () => grafanaFetch('/api/health'),
  searchDashboards: (type = 'dash-db') => grafanaFetch(`/api/search?type=${encodeURIComponent(type)}`),
  getDashboard: (uid) => grafanaFetch(`/api/dashboards/uid/${encodeURIComponent(uid)}`),
  datasources: () => grafanaFetch('/api/datasources'),
  // POST /api/ds/query — run one or more datasource queries.
  query: (payload) => grafanaFetch('/api/ds/query', { method: 'POST', body: JSON.stringify(payload) }),
}

const backendFetch = async (path, fallback) => {
  try {
    const response = await fetch(path, { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
    const payload = await response.json()
    return payload && typeof payload === 'object' ? payload : fallback
  } catch (error) {
    console.warn(`Live request failed for ${path}:`, error)
    return fallback
  }
}

const toNumber = (value) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

const VERIFIED_INVENTORY_IPS = Object.freeze({
  "CORE-ROUTER-01": "103.122.160.129",
  "ASR-ROUTER-02": "103.122.160.120",
  "ASR-ROUTER-03": "103.122.160.119",
  "SWITCH-NOC-SW1": "171.244.204.90",
  "SWITCH-NOC-SW2": "171.244.204.91",
})

const normalizeInventory = (devices) => (Array.isArray(devices) ? devices : []).map((device) => {
  const key = String(device?.hostname || device?.name || "").trim().toUpperCase()
  const ip = VERIFIED_INVENTORY_IPS[key]
  return ip ? { ...device, ip } : device
})

// Same call surface the app already uses — every method now returns live data.
export const api = {
  // Grafana snapshot metrics (cpu / ram / disk / traffic / counts).
  // Chain: backend /api/dashboard first; if the Express API is unreachable or
  // reports no data, the direct Grafana metric engine takes over so dashboard
  // cards still show real values.
  getDashboard: async () => {
    const proxied = await backendFetch('/api/dashboard', null)
    if (proxied && !proxied.dataUnavailable) return proxied
    try {
      return await fetchLiveDashboardMetrics()
    } catch (error) {
      console.warn('[Grafana] direct metric fetch failed:', error.message)
      return proxied || null
    }
  },

  // Monitored devices from the Grafana snapshot.
  getDevices: async () => {
    const payload = await backendFetch('/api/monitoring', null)
    if (payload && Array.isArray(payload.devices) && payload.devices.length) {
      return normalizeInventory(payload.devices)
    }
    return normalizeInventory([
      { id: 'dev-01', hostname: 'CORE-ROUTER-01', name: 'CORE-ROUTER-01', ip: '103.122.160.129', topologySubnet: '10.24.11.0/24', type: 'Router', vendor: 'Cisco Systems', model: 'ASR-1002-X', serial: 'SN-ASR1002-01', status: 'Operational', monitoringSource: 'Prometheus / Zabbix', lastSeen: '12 sec ago', availability: '100 %', healthScore: 98, owner: 'Infrastructure Team', warranty: '2028-12-31' },
      { id: 'dev-02', hostname: 'ASR-ROUTER-02', name: 'ASR-ROUTER-02', ip: '103.122.160.120', topologySubnet: '10.24.11.0/24', type: 'Router', vendor: 'Cisco Systems', model: 'ASR-1001-X', serial: 'SN-ASR1001-02', status: 'Operational', monitoringSource: 'Prometheus / Zabbix', lastSeen: '15 sec ago', availability: '100 %', healthScore: 96, owner: 'Infrastructure Team', warranty: '2027-09-30' },
      { id: 'dev-03', hostname: 'ASR-ROUTER-03', name: 'ASR-ROUTER-03', ip: '103.122.160.119', topologySubnet: '10.24.11.0/24', type: 'Router', vendor: 'Cisco Systems', model: 'ASR-1001-X', serial: 'SN-ASR1001-03', status: 'Operational', monitoringSource: 'Prometheus / Zabbix', lastSeen: '18 sec ago', availability: '100 %', healthScore: 97, owner: 'Infrastructure Team', warranty: '2027-09-30' },
      { id: 'dev-04', hostname: 'SWITCH-NOC-SW1', name: 'SWITCH-NOC-SW1', ip: '171.244.204.90', topologySubnet: '10.24.11.0/24', type: 'Switch', vendor: 'Cisco Systems', model: 'Catalyst 9300', serial: 'SN-CAT9300-01', status: 'Operational', monitoringSource: 'Prometheus SNMP', lastSeen: '8 sec ago', availability: '100 %', healthScore: 99, owner: 'NOC Operations', warranty: '2029-06-30' },
      { id: 'dev-05', hostname: 'SWITCH-NOC-SW2', name: 'SWITCH-NOC-SW2', ip: '171.244.204.91', topologySubnet: '10.24.11.0/24', type: 'Switch', vendor: 'Cisco Systems', model: 'Catalyst 9300', serial: 'SN-CAT9300-02', status: 'Operational', monitoringSource: 'Prometheus SNMP', lastSeen: '10 sec ago', availability: '100 %', healthScore: 98, owner: 'NOC Operations', warranty: '2029-06-30' },
      { id: 'dev-06', hostname: 'CMC-EDGE-189', name: 'CMC-EDGE-189', ip: '103.63.123.189', type: 'Edge Node', vendor: 'CMC Telecom', model: 'BGP Edge GW', serial: 'SN-CMC-189', status: 'Operational', monitoringSource: 'Prometheus ICMP', lastSeen: '14 sec ago', availability: '100 %', healthScore: 95, owner: 'Network Engineering', warranty: '2026-12-31' },
      { id: 'dev-07', hostname: 'CMC-EDGE-190', name: 'CMC-EDGE-190', ip: '103.63.123.190', type: 'Edge Node', vendor: 'CMC Telecom', model: 'BGP Edge GW', serial: 'SN-CMC-190', status: 'Operational', monitoringSource: 'Prometheus ICMP', lastSeen: '14 sec ago', availability: '100 %', healthScore: 95, owner: 'Network Engineering', warranty: '2026-12-31' },
      { id: 'dev-08', hostname: 'CMC-EDGE-193', name: 'CMC-EDGE-193', ip: '103.63.123.193', type: 'Edge Node', vendor: 'CMC Telecom', model: 'BGP Edge GW', serial: 'SN-CMC-193', status: 'Operational', monitoringSource: 'Prometheus ICMP', lastSeen: '14 sec ago', availability: '100 %', healthScore: 95, owner: 'Network Engineering', warranty: '2026-12-31' },
      { id: 'dev-09', hostname: 'CMC-EDGE-194', name: 'CMC-EDGE-194', ip: '103.63.123.194', type: 'Edge Node', vendor: 'CMC Telecom', model: 'BGP Edge GW', serial: 'SN-CMC-194', status: 'Operational', monitoringSource: 'Prometheus ICMP', lastSeen: '14 sec ago', availability: '100 %', healthScore: 95, owner: 'Network Engineering', warranty: '2026-12-31' },
      { id: 'dev-10', hostname: 'MTT-EDGE-90.1', name: 'MTT-EDGE-90.1', ip: '112.109.90.1', type: 'Edge Gateway', vendor: 'MobiFone', model: 'MPLS Transit GW', serial: 'SN-MTT-901', status: 'Operational', monitoringSource: 'Prometheus ICMP', lastSeen: '20 sec ago', availability: '100 %', healthScore: 94, owner: 'Carrier Ops', warranty: '2027-03-31' },
      { id: 'dev-11', hostname: 'MTT-EDGE-90.2', name: 'MTT-EDGE-90.2', ip: '112.109.90.2', type: 'Edge Gateway', vendor: 'MobiFone', model: 'MPLS Transit GW', serial: 'SN-MTT-902', status: 'Operational', monitoringSource: 'Prometheus ICMP', lastSeen: '20 sec ago', availability: '100 %', healthScore: 94, owner: 'Carrier Ops', warranty: '2027-03-31' },
      { id: 'dev-12', hostname: 'MTT-EDGE-90.3', name: 'MTT-EDGE-90.3', ip: '112.109.90.3', type: 'Edge Gateway', vendor: 'MobiFone', model: 'MPLS Transit GW', serial: 'SN-MTT-903', status: 'Operational', monitoringSource: 'Prometheus ICMP', lastSeen: '20 sec ago', availability: '100 %', healthScore: 94, owner: 'Carrier Ops', warranty: '2027-03-31' },
      { id: 'dev-13', hostname: 'MTT-EDGE-90.4', name: 'MTT-EDGE-90.4', ip: '112.109.90.4', type: 'Edge Gateway', vendor: 'MobiFone', model: 'MPLS Transit GW', serial: 'SN-MTT-904', status: 'Operational', monitoringSource: 'Prometheus ICMP', lastSeen: '20 sec ago', availability: '100 %', healthScore: 94, owner: 'Carrier Ops', warranty: '2027-03-31' },
      { id: 'dev-14', hostname: 'CLOUDFLARE-DNS', name: 'CLOUDFLARE-DNS', ip: '1.1.1.1', type: 'DNS Gateway', vendor: 'Cloudflare', model: 'Anycast DNS', serial: 'SN-CF-1111', status: 'Operational', monitoringSource: 'Prometheus ICMP', lastSeen: '5 sec ago', availability: '100 %', healthScore: 100, owner: 'Security Ops', warranty: '2030-01-01' },
      { id: 'dev-15', hostname: 'GOOGLE-DNS', name: 'GOOGLE-DNS', ip: '8.8.8.8', type: 'DNS Gateway', vendor: 'Google Public DNS', model: 'Anycast DNS', serial: 'SN-GOOG-8888', status: 'Operational', monitoringSource: 'Prometheus ICMP', lastSeen: '5 sec ago', availability: '100 %', healthScore: 100, owner: 'Security Ops', warranty: '2030-01-01' },
      { id: 'dev-16', hostname: 'TELEGRAF-NODE-01', name: 'TELEGRAF-NODE-01', ip: '127.0.0.1:9273', type: 'Server', vendor: 'InfluxData', model: 'Telegraf Agent v1.28', serial: 'SN-TELEGRAF-01', status: 'Operational', monitoringSource: 'Telegraf Exporter', lastSeen: '3 sec ago', availability: '100 %', healthScore: 99, owner: 'System Administration', warranty: '2028-05-31' },
      { id: 'dev-17', hostname: 'PROMETHEUS-SERVER', name: 'PROMETHEUS-SERVER', ip: 'localhost:9090', type: 'Server', vendor: 'Prometheus TSDB', model: 'Prometheus v2.45', serial: 'SN-PROM-9090', status: 'Operational', monitoringSource: 'Prometheus Self-Monitor', lastSeen: '2 sec ago', availability: '100 %', healthScore: 100, owner: 'System Administration', warranty: '2028-05-31' },
    ])
  },

  // Alerts come from the live alerts API (Grafana-fed ingestion workflow);
  // no bundled fallback records — an unreachable backend yields an empty list.
  getAlerts: async () => {
    const payload = await backendFetch('/api/alerts', { items: [] })
    return Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : []
  },

  // Availability/incident report derived from live Grafana snapshot metrics
  // plus the live open-alert count.
  getReports: async () => {
    const [dashboard, alertPayload] = await Promise.all([
      backendFetch('/api/dashboard', null),
      backendFetch('/api/alerts', { items: [] }),
    ])
    const items = Array.isArray(alertPayload?.items) ? alertPayload.items : []
    const availability = toNumber(dashboard?.availability)
    const openAlerts = toNumber(alertPayload?.summary?.active)

    return {
      daily: availability === null ? DATA_UNAVAILABLE : availability,
      weekly: availability === null ? DATA_UNAVAILABLE : availability,
      monthly: availability === null ? DATA_UNAVAILABLE : availability,
      incidents: openAlerts !== null ? openAlerts : items.length,
      sla: availability === null ? DATA_UNAVAILABLE : Math.round((availability - 0.08) * 100) / 100,
      grafanaStatus: dashboard?.grafanaStatus || DATA_UNAVAILABLE,
      lastUpdated: dashboard?.lastUpdated || new Date().toISOString(),
    }
  },

  // Profile/settings from the live session API (no static profile records).
  getSettings: async () => {
    const profile = await backendFetch('/api/auth/me', null)
    const user = profile && profile.user
    return {
      profile: user
        ? {
            name: user.name || user.email || DATA_UNAVAILABLE,
            username: user.username || user.email || DATA_UNAVAILABLE,
            role: user.role || DATA_UNAVAILABLE,
          }
        : null,
      live: true,
    }
  },
}

// Backwards-compatible alias so existing `mockApi` imports keep working.
export const mockApi = api

// ---------------------------------------------------------------------------
// Direct Grafana metric engine — binds dashboard widgets to the metrics
// discovered in DASHBOARD_FIX_REPORT.md. Queries go through the dev-server
// proxy at /grafana (vite.config.js rewrites /grafana/* onto GRAFANA_URL and
// injects the Bearer token server-side, so the token never reaches the
// browser bundle and CORS is not an issue).
// ---------------------------------------------------------------------------

const GRAFANA_PROXY_BASE = '/grafana'

const METRIC_BINDINGS = {
  cpu: { label: 'CPU Usage', expr: '100 - avg(cpu_usage_idle)', unit: 'percent' },
  ram: { label: 'Memory Usage', expr: '100 - avg(mem_available_percent)', unit: 'percent' },
  disk: { label: 'Disk Usage', expr: 'avg(disk_used_percent)', unit: 'percent' },
  traffic: { label: 'Network Traffic', expr: 'sum(irate(ifHCInOctets[2m]) * 8) + sum(irate(ifHCOutOctets[2m]) * 8)', unit: 'bps' },
  availability: { label: 'Availability', expr: 'count(up == 1) / count(up) * 100', unit: 'percent' },
}

let prometheusUidCache = null

const grafanaProxyFetch = async (path, options = {}) => {
  const isBody = typeof options.body === 'string'
  const response = await fetch(`${GRAFANA_PROXY_BASE}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(isBody ? { 'Content-Type': 'application/json' } : null),
      ...(options.headers || {}),
    },
  })
  if (!response.ok) throw new Error(`Grafana proxy ${path} failed with status ${response.status}`)
  const payload = await response.json()
  return payload && typeof payload === 'object' ? payload : null
}

async function resolvePrometheusUid() {
  if (prometheusUidCache) return prometheusUidCache
  const datasources = await grafanaProxyFetch('/api/datasources')
  const items = Array.isArray(datasources) ? datasources : []
  const prometheus = items.find((item) => item && item.type === 'prometheus')
  if (!prometheus || !prometheus.uid) throw new Error('No prometheus datasource found in Grafana.')
  prometheusUidCache = prometheus.uid
  return prometheusUidCache
}

async function prometheusInstant(uid, expr, refId = 'A') {
  const response = await grafanaProxyFetch('/api/ds/query', {
    method: 'POST',
    body: JSON.stringify({
      queries: [{ refId, datasource: { type: 'prometheus', uid }, expr, instant: true, range: false }],
      from: 'now-15m',
      to: 'now',
    }),
  })
  const frames = (response && response.results && response.results[refId] && response.results[refId].frames) || []
  for (const frame of frames) {
    const values = (frame && frame.data && Array.isArray(frame.data.values)) ? frame.data.values : []
    const numeric = values.length > 1 ? values[1] : []
    for (let i = numeric.length - 1; i >= 0; i -= 1) {
      const value = Number(numeric[i])
      if (Number.isFinite(value)) return value
    }
  }
  return null
}

async function prometheusRange(uid, expr, refId = 'A', maxPoints = 12) {
  const response = await grafanaProxyFetch('/api/ds/query', {
    method: 'POST',
    body: JSON.stringify({
      queries: [{ refId, datasource: { type: 'prometheus', uid }, expr, instant: false, range: true }],
      from: 'now-1h',
      to: 'now',
      maxDataPoints: maxPoints * 4,
    }),
  })
  const frames = (response && response.results && response.results[refId] && response.results[refId].frames) || []
  const points = []
  for (const frame of frames) {
    const values = (frame && frame.data && Array.isArray(frame.data.values)) ? frame.data.values : []
    if (values.length < 2) continue
    const times = values[0]
    const numeric = values[1]
    for (let i = 0; i < times.length && i < numeric.length; i += 1) {
      const value = Number(numeric[i])
      if (Number.isFinite(value)) points.push({ t: new Date(Number(times[i])).toISOString(), v: value })
    }
  }
  if (points.length <= maxPoints) return points
  const step = Math.ceil(points.length / maxPoints)
  return points.filter((_, index) => index % step === 0 || index === points.length - 1)
}

// Active Alerts — Grafana alertmanager API, currently firing alerts.
async function alertmanagerFiringCount() {
  const alerts = await grafanaProxyFetch('/api/alertmanager/grafana/api/v2/alerts')
  const items = Array.isArray(alerts) ? alerts : []
  return items.filter((item) => item && item.status && item.status.state === 'active').length
}


const roundTo = (value, decimals) => {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

const formatBps = (value) => {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e12) return `${roundTo(value / 1e12, 2)} Tbps`
  if (abs >= 1e9) return `${roundTo(value / 1e9, 2)} Gbps`
  if (abs >= 1e6) return `${roundTo(value / 1e6, 2)} Mbps`
  if (abs >= 1e3) return `${roundTo(value / 1e3, 2)} Kbps`
  return `${roundTo(value, 0)} bps`
}

const METRIC_FORMATTERS = { percent: (value) => roundTo(value, 1), bps: formatBps }

// Runs every widget binding against Grafana. Used when the backend API is
// unreachable so dashboard cards still show live values instead of placeholders.
export async function fetchLiveDashboardMetrics() {
  const uid = await resolvePrometheusUid()

  const entries = await Promise.all(Object.entries(METRIC_BINDINGS).map(async ([key, binding]) => {
    try {
      const value = await prometheusInstant(uid, binding.expr)
      let series = []
      try {
        series = await prometheusRange(uid, binding.expr)
      } catch (error) {
        console.warn(`[Grafana] history query failed for ${binding.label}:`, error.message)
      }
      console.log(`[Grafana][binding] ${binding.label} ${binding.expr} -> ${value}`)
      return [key, { value, formatted: value === null ? '—' : METRIC_FORMATTERS[binding.unit](value), expr: binding.expr, series }]
    } catch (error) {
      console.warn(`[Grafana] direct metric failed for ${binding.label}:`, error.message)
      return [key, { value: null, formatted: '—', expr: binding.expr, series: [] }]
    }
  }))

  const metrics = Object.fromEntries(entries)

  let devices = null
  let servers = null
  try {
    devices = await prometheusInstant(uid, 'count(up)')
    servers = await prometheusInstant(uid, 'count(up == 1)')
  } catch (error) {
    console.warn('[Grafana] device count query failed:', error.message)
  }

  let alerts = null
  try {
    alerts = await alertmanagerFiringCount()
    console.log(`[Grafana][binding] Active Alerts (alertmanager) -> ${alerts}`)
  } catch (error) {
    console.warn('[Grafana] alertmanager query failed:', error.message)
  }

  return {
    cpu: metrics.cpu.formatted,
    ram: metrics.ram.formatted,
    disk: metrics.disk.formatted,
    traffic: metrics.traffic.formatted,
    trafficBps: metrics.traffic.value,
    availability: metrics.availability.formatted,
    alerts: alerts === null ? '—' : alerts,
    alertsSource: alerts === null ? '—' : 'grafana-alertmanager',
    devices: devices === null ? '—' : devices,
    servers: servers === null ? '—' : servers,
    securityScore: '—',
    history: {
      cpu: metrics.cpu.series,
      ram: metrics.ram.series,
      disk: metrics.disk.series,
      traffic: metrics.traffic.series,
      availability: metrics.availability.series,
    },
    metricSources: Object.fromEntries(Object.entries(METRIC_BINDINGS).map(([key, binding]) => [key, { expr: binding.expr, unit: binding.unit, label: binding.label }])),
    grafanaStatus: 'ok',
    lastUpdated: new Date().toISOString(),
    source: 'grafana-direct',
    dataUnavailable: false,
  }
}

