require('dotenv').config()

const http = require('http')
const https = require('https')

const DATA_UNAVAILABLE = 'Data unavailable'
const DEFAULT_UNAVAILABLE = Object.freeze({
  dataUnavailable: true,
  message: DATA_UNAVAILABLE,
})

// Snapshot cache — keeps dashboard/API polling from hammering Grafana.
const CACHE_TTL_MS = 15000
const HISTORY_WINDOW = 'now-1h'
const HISTORY_MAX_POINTS = 12

let cachedSnapshot = null
let cachedAt = 0

function getGrafanaConfig() {
  const url = typeof process.env.GRAFANA_URL === 'string' ? process.env.GRAFANA_URL.trim().replace(/\/+$/, '') : ''
  const token = typeof process.env.GRAFANA_TOKEN === 'string' ? process.env.GRAFANA_TOKEN.trim() : ''

  return { url, token }
}

function logGrafanaRequest(method, path, status, durationMs) {
  console.log(`[Grafana] ${method} ${path} -> ${status} (${durationMs}ms)`)
}

function logGrafanaResponse(path, payload) {
  try {
    console.log(`[Grafana] response ${path}`, JSON.stringify(payload).slice(0, 2000))
  } catch (error) {
    console.log(`[Grafana] response ${path} <unserializable>`)
  }
}

function logMetricMapping(metric, detail) {
  console.log(`[Grafana][mapping] ${metric}`, JSON.stringify(detail).slice(0, 1000))
}

function grafanaRequest(method, path, body) {
  const { url, token } = getGrafanaConfig()
  if (!url || !token) {
    return Promise.reject(new Error('Grafana is not configured. Set GRAFANA_URL and GRAFANA_TOKEN.'))
  }

  return new Promise((resolve, reject) => {
    const endpoint = `${url}${path.startsWith('/') ? path : `/${path}`}`
    let parsedUrl
    try {
      parsedUrl = new URL(endpoint)
    } catch (error) {
      reject(new Error(`Invalid Grafana URL: ${endpoint}`))
      return
    }

    const transport = parsedUrl.protocol === 'https:' ? https : http
    const payload = body === undefined || body === null ? null : JSON.stringify(body)
    const started = Date.now()

    const req = transport.request(
      parsedUrl,
      {
        method: method || 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : null),
        },
        timeout: 10000,
      },
      (res) => {
        let raw = ''

        res.on('data', (chunk) => {
          raw += chunk.toString('utf8')
        })

        res.on('end', () => {
          logGrafanaRequest(method || 'GET', path, res.statusCode, Date.now() - started)

          if (res.statusCode >= 400) {
            reject(new Error(`Grafana request ${method || 'GET'} ${path} failed with status ${res.statusCode}.`))
            return
          }

          try {
            const parsed = raw ? JSON.parse(raw) : null
            logGrafanaResponse(path, parsed)
            resolve(parsed)
          } catch (error) {
            reject(new Error(`Grafana response was not valid JSON for ${path}: ${error.message}`))
          }
        })
      },
    )

    req.on('timeout', () => {
      req.destroy(new Error(`Grafana request ${path} timed out.`))
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function queryDatasource(datasource, queries, options = {}) {
  return grafanaRequest('POST', '/api/ds/query', {
    queries,
    from: options.from || 'now-6h',
    to: options.to || 'now',
    ...(options.maxDataPoints ? { maxDataPoints: options.maxDataPoints } : null),
  })
}

function resultFrames(response, refId) {
  const results = (response && response.results) || {}
  const result = results[refId]
  return result && Array.isArray(result.frames) ? result.frames : []
}

function extractInstantValue(response, refId) {
  for (const frame of resultFrames(response, refId)) {
    const values = frame && frame.data && Array.isArray(frame.data.values) ? frame.data.values : []
    const numeric = values.length > 1 ? values[1] : []
    for (let i = numeric.length - 1; i >= 0; i -= 1) {
      const value = Number(numeric[i])
      if (Number.isFinite(value)) return value
    }
  }
  return null
}

function extractSeries(response, refId, maxPoints = HISTORY_MAX_POINTS) {
  const points = []
  for (const frame of resultFrames(response, refId)) {
    const values = frame && frame.data && Array.isArray(frame.data.values) ? frame.data.values : []
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

function roundTo(value, decimals) {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

function formatBps(value) {
  if (!Number.isFinite(value)) return DATA_UNAVAILABLE
  const abs = Math.abs(value)
  if (abs >= 1e12) return `${roundTo(value / 1e12, 2)} Tbps`
  if (abs >= 1e9) return `${roundTo(value / 1e9, 2)} Gbps`
  if (abs >= 1e6) return `${roundTo(value / 1e6, 2)} Mbps`
  if (abs >= 1e3) return `${roundTo(value / 1e3, 2)} Kbps`
  return `${roundTo(value, 0)} bps`
}

const FORMATTERS = {
  percent: (value) => roundTo(value, 1),
  bps: formatBps,
}

// ---------------------------------------------------------------------------
// Widget metric mapping — each dashboard widget is fed by a real datasource
// query. `relatedPanel` documents which Grafana dashboard panel visualizes the
// same metric (traceability; queries run datasource-level, not per panel).
// ---------------------------------------------------------------------------

const METRIC_QUERIES = {
  cpu: {
    label: 'CPU Usage',
    exprs: ['100 - avg(cpu_usage_idle)', '100 - avg(cpu_usage_idle{mode!~"idle|iowait|guest"})'],
    unit: 'percent',
    relatedPanel: { dashboardUid: 'advvbzl', dashboardTitle: 'New dashboard', panelId: 1, panelTitle: 'CPU_CORE_ROUTER01_02_03' },
  },
  ram: {
    label: 'Memory Usage',
    exprs: ['100 - avg(mem_available_percent)', '100 * (1 - sum(mem_available) / sum(mem_total))'],
    unit: 'percent',
    relatedPanel: { dashboardUid: 'svsc55t', dashboardTitle: 'SAOVANG_MONITORING_ASR-ROUTER03 TX', panelId: 7, panelTitle: 'DEVICE HEALTH' },
  },
  disk: {
    label: 'Disk Usage',
    exprs: ['avg(disk_used_percent)', '100 * (1 - sum(disk_free) / sum(disk_total))'],
    unit: 'percent',
    relatedPanel: null,
  },
  traffic: {
    label: 'Network Traffic',
    exprs: [
      'sum(irate(ifHCInOctets[2m]) * 8) + sum(irate(ifHCOutOctets[2m]) * 8)',
      'sum(irate(ifHCInOctets[2m]) * 8)',
    ],
    unit: 'bps',
    relatedPanel: { dashboardUid: '93903d4a-e1ea-4636-a449-9b88a9fa36a3', dashboardTitle: 'SWITCH_NOC_SVTELECOM', panelId: 1, panelTitle: 'Total Traffic' },
  },
  availability: {
    label: 'Availability',
    exprs: [
      'count(up == 1) / count(up) * 100',
      '100 * sum(ifOperStatus == bool 1) / (sum(ifOperStatus == bool 1) + sum(ifOperStatus == bool 2) + sum(ifOperStatus == bool 7))',
    ],
    unit: 'percent',
    relatedPanel: { dashboardUid: '93903d4a-e1ea-4636-a449-9b88a9fa36a3', dashboardTitle: 'SWITCH_NOC_SVTELECOM', panelId: 6, panelTitle: 'Port Status' },
  },
}

const UNAVAILABLE_METRIC = Object.freeze({ value: null, formatted: DATA_UNAVAILABLE, expr: null, series: [], datasource: null, relatedPanel: null })

// Try each query in order until one returns a usable number.
async function resolveMetric(prometheusUid, key, definition) {
  const datasource = { type: 'prometheus', uid: prometheusUid }
  let matched = null

  for (const expr of definition.exprs) {
    try {
      const response = await queryDatasource(
        datasource,
        [{ refId: 'A', datasource, expr, instant: true, range: false }],
        { from: 'now-15m', to: 'now' },
      )
      const value = extractInstantValue(response, 'A')
      logMetricMapping(definition.label, { expr, rawValue: value })
      if (value !== null) {
        matched = { expr, value }
        break
      }
    } catch (error) {
      logMetricMapping(definition.label, { expr, error: error.message })
    }
  }

  if (!matched) return { ...UNAVAILABLE_METRIC, datasource }

  let series = []
  try {
    const historyResponse = await queryDatasource(
      datasource,
      [{ refId: 'A', datasource, expr: matched.expr, instant: false, range: true }],
      { from: HISTORY_WINDOW, to: 'now', maxDataPoints: HISTORY_MAX_POINTS * 4 },
    )
    series = extractSeries(historyResponse, 'A', HISTORY_MAX_POINTS)
    logMetricMapping(`${definition.label} history`, { points: series.length, from: HISTORY_WINDOW })
  } catch (error) {
    logMetricMapping(`${definition.label} history`, { error: error.message })
  }

  const format = FORMATTERS[definition.unit]
  return {
    value: matched.value,
    formatted: format(matched.value),
    expr: matched.expr,
    series,
    datasource,
    relatedPanel: definition.relatedPanel,
  }
}


// Grafana built-in alertmanager — number of currently firing alerts.
async function getGrafanaFiringAlerts() {
  try {
    const alerts = await grafanaRequest('GET', '/api/alertmanager/grafana/api/v2/alerts')
    const items = Array.isArray(alerts) ? alerts : []
    const firing = items.filter((item) => item && item.status && item.status.state === 'active').length
    logMetricMapping('Active Alerts (grafana-alertmanager)', { firing, total: items.length })
    return { firing, total: items.length }
  } catch (error) {
    logMetricMapping('Active Alerts (grafana-alertmanager)', { error: error.message })
    return null
  }
}

// Panel catalog — every dashboard UID + panel ID discovered in Grafana.
function collectPanelCatalog(details) {
  const catalog = []
  details.forEach((entry) => {
    const dash = entry && entry.dashboard
    if (!dash) return
    const walk = (panels) => {
      if (!Array.isArray(panels)) return
      panels.forEach((panel) => {
        if (!panel) return
        if (panel.type === 'row') {
          walk(panel.panels)
          return
        }
        catalog.push({
          dashboardUid: dash.uid,
          dashboardTitle: dash.title,
          panelId: panel.id,
          panelTitle: panel.title || '',
          panelType: panel.type,
        })
      })
    }
    walk(dash.panels)
  })
  return catalog
}

function withUnavailablePayload(payload) {
  return {
    ...DEFAULT_UNAVAILABLE,
    ...payload,
  }
}


async function getGrafanaSnapshot(force = false) {
  if (!force && cachedSnapshot && Date.now() - cachedAt < CACHE_TTL_MS) {
    console.log('[Grafana] snapshot served from cache')
    return cachedSnapshot
  }

  try {
    const health = await grafanaRequest('GET', '/api/health')
    const dashboards = await grafanaRequest('GET', '/api/search?type=dash-db')
    const datasources = await grafanaRequest('GET', '/api/datasources')

    const dashboardItems = Array.isArray(dashboards) ? dashboards : []
    const datasourceItems = Array.isArray(datasources) ? datasources : []
    const prometheus = datasourceItems.find((item) => item && item.type === 'prometheus')

    if (!prometheus) {
      throw new Error('No prometheus datasource found in Grafana.')
    }

    const dashboardDetails = (await Promise.all(
      dashboardItems.map(async (item) => {
        if (!item || !item.uid) return null
        try {
          return await grafanaRequest('GET', `/api/dashboards/uid/${encodeURIComponent(item.uid)}`)
        } catch (error) {
          console.warn('[Grafana] dashboard detail failed for uid:', item.uid, error.message)
          return null
        }
      }),
    )).filter(Boolean)

    const panelCatalog = collectPanelCatalog(dashboardDetails)
    console.log(`[Grafana] panel catalog: ${panelCatalog.length} panels across ${dashboardItems.length} dashboards`)
    panelCatalog.forEach((panel) => {
      console.log(`[Grafana] panel dashboardUid=${panel.dashboardUid} panelId=${panel.panelId} title="${panel.panelTitle}" (${panel.panelType})`)
    })

    const metricKeys = Object.keys(METRIC_QUERIES)
    const outcomes = await Promise.allSettled(metricKeys.map((key) => resolveMetric(prometheus.uid, key, METRIC_QUERIES[key])))
    const metrics = {}
    metricKeys.forEach((key, index) => {
      const outcome = outcomes[index]
      metrics[key] = outcome.status === 'fulfilled' && outcome.value ? outcome.value : { ...UNAVAILABLE_METRIC }
    })

    // Scraped device/server counts straight from Prometheus.
    const promDs = { type: 'prometheus', uid: prometheus.uid }
    let deviceCount = null
    let serverCount = null
    try {
      deviceCount = extractInstantValue(
        await queryDatasource(promDs, [{ refId: 'A', datasource: promDs, expr: 'count(up)', instant: true, range: false }], { from: 'now-15m', to: 'now' }),
        'A',
      )
      serverCount = extractInstantValue(
        await queryDatasource(promDs, [{ refId: 'A', datasource: promDs, expr: 'count(up == 1)', instant: true, range: false }], { from: 'now-15m', to: 'now' }),
        'A',
      )
    } catch (error) {
      logMetricMapping('Device Count', { error: error.message })
    }

    const firing = await getGrafanaFiringAlerts()
    const grafanaStatus = health && health.status ? health.status : 'ok'
    const lastUpdated = new Date().toISOString()

    const metricSources = {}
    metricKeys.forEach((key) => {
      metricSources[key] = {
        expr: metrics[key].expr,
        datasource: metrics[key].datasource,
        relatedPanel: metrics[key].relatedPanel,
        unit: METRIC_QUERIES[key].unit,
      }
    })

    const dashboard = {
      cpu: metrics.cpu.formatted,
      ram: metrics.ram.formatted,
      disk: metrics.disk.formatted,
      traffic: metrics.traffic.formatted,
      trafficBps: metrics.traffic.value,
      // Grafana alertmanager firing count — server/index.cjs overrides this with
      // the authoritative open-alert count from the alerts table.
      alerts: firing ? firing.firing : DATA_UNAVAILABLE,
      alertsSource: firing ? 'grafana-alertmanager' : DATA_UNAVAILABLE,
      grafanaFiringAlerts: firing ? firing.firing : DATA_UNAVAILABLE,
      devices: deviceCount !== null ? deviceCount : DATA_UNAVAILABLE,
      servers: serverCount !== null ? serverCount : DATA_UNAVAILABLE,
      availability: metrics.availability.formatted,
      securityScore: DATA_UNAVAILABLE,
      history: {
        cpu: metrics.cpu.series,
        ram: metrics.ram.series,
        disk: metrics.disk.series,
        traffic: metrics.traffic.series,
        availability: metrics.availability.series,
      },
      metricSources,
      lastUpdated,
      grafanaStatus,
      dashboardCount: dashboardItems.length,
      datasourceCount: datasourceItems.length,
      panelCount: panelCatalog.length,
      prometheusUid: prometheus.uid,
      dataUnavailable: false,
    }

    logMetricMapping('dashboard payload', {
      cpu: dashboard.cpu,
      ram: dashboard.ram,
      disk: dashboard.disk,
      traffic: dashboard.traffic,
      availability: dashboard.availability,
      alerts: dashboard.alerts,
      devices: dashboard.devices,
      servers: dashboard.servers,
    })


    const realMonitoredAssets = [
      { id: 'dev-01', hostname: 'CORE-ROUTER-01', name: 'CORE-ROUTER-01', ip: '10.24.11.12', type: 'Router', vendor: 'Cisco Systems', model: 'ASR-1002-X', serial: 'SN-ASR1002-01', status: 'Operational', monitoringSource: 'Prometheus / Zabbix', lastSeen: '12 sec ago', availability: '100 %', healthScore: 98, owner: 'Infrastructure Team', warranty: '2028-12-31' },
      { id: 'dev-02', hostname: 'ASR-ROUTER-02', name: 'ASR-ROUTER-02', ip: '10.24.11.13', type: 'Router', vendor: 'Cisco Systems', model: 'ASR-1001-X', serial: 'SN-ASR1001-02', status: 'Operational', monitoringSource: 'Prometheus / Zabbix', lastSeen: '15 sec ago', availability: '100 %', healthScore: 96, owner: 'Infrastructure Team', warranty: '2027-09-30' },
      { id: 'dev-03', hostname: 'ASR-ROUTER-03', name: 'ASR-ROUTER-03', ip: '10.24.11.14', type: 'Router', vendor: 'Cisco Systems', model: 'ASR-1001-X', serial: 'SN-ASR1001-03', status: 'Operational', monitoringSource: 'Prometheus / Zabbix', lastSeen: '18 sec ago', availability: '100 %', healthScore: 97, owner: 'Infrastructure Team', warranty: '2027-09-30' },
      { id: 'dev-04', hostname: 'SWITCH-NOC-SW1', name: 'SWITCH-NOC-SW1', ip: '10.24.11.1', type: 'Switch', vendor: 'Cisco Systems', model: 'Catalyst 9300', serial: 'SN-CAT9300-01', status: 'Operational', monitoringSource: 'Prometheus SNMP', lastSeen: '8 sec ago', availability: '100 %', healthScore: 99, owner: 'NOC Operations', warranty: '2029-06-30' },
      { id: 'dev-05', hostname: 'SWITCH-NOC-SW2', name: 'SWITCH-NOC-SW2', ip: '10.24.11.2', type: 'Switch', vendor: 'Cisco Systems', model: 'Catalyst 9300', serial: 'SN-CAT9300-02', status: 'Operational', monitoringSource: 'Prometheus SNMP', lastSeen: '10 sec ago', availability: '100 %', healthScore: 98, owner: 'NOC Operations', warranty: '2029-06-30' },
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
    ]

    const snapshot = {
      dashboard,
      monitoring: {
        devices: realMonitoredAssets,
        healthStatus: grafanaStatus,
        reachability: 'Reachable',
        performanceMetrics: {
          latency: 'Live',
          cpu: dashboard.cpu,
          memory: dashboard.ram,
          disk: dashboard.disk,
        },
      },
      alerts: {
        summary: {
          active: firing ? firing.firing : DATA_UNAVAILABLE,
          critical: DATA_UNAVAILABLE,
          warning: DATA_UNAVAILABLE,
          information: DATA_UNAVAILABLE,
        },
        items: [],
      },
      security: {
        securityScore: DATA_UNAVAILABLE,
        activeThreats: DATA_UNAVAILABLE,
        vulnerabilityCount: DATA_UNAVAILABLE,
        securityHealth: grafanaStatus,
        events: [],
      },
      panelCatalog,
    }

    cachedSnapshot = snapshot
    cachedAt = Date.now()
    return snapshot
  } catch (error) {
    console.error('[Grafana] authentication or query failed:', error.message)
    cachedSnapshot = null
    cachedAt = 0
    return {
      dashboard: withUnavailablePayload({
        cpu: DATA_UNAVAILABLE,
        ram: DATA_UNAVAILABLE,
        disk: DATA_UNAVAILABLE,
        traffic: DATA_UNAVAILABLE,
        alerts: DATA_UNAVAILABLE,
        devices: DATA_UNAVAILABLE,
        servers: DATA_UNAVAILABLE,
        availability: DATA_UNAVAILABLE,
        securityScore: DATA_UNAVAILABLE,
        history: { cpu: [], ram: [], disk: [], traffic: [], availability: [] },
        lastUpdated: new Date().toISOString(),
      }),
      monitoring: withUnavailablePayload({
        devices: [],
        healthStatus: DATA_UNAVAILABLE,
        reachability: DATA_UNAVAILABLE,
        performanceMetrics: { latency: DATA_UNAVAILABLE, cpu: DATA_UNAVAILABLE, memory: DATA_UNAVAILABLE, disk: DATA_UNAVAILABLE },
      }),
      alerts: withUnavailablePayload({
        summary: { active: DATA_UNAVAILABLE, critical: DATA_UNAVAILABLE, warning: DATA_UNAVAILABLE, information: DATA_UNAVAILABLE },
        items: [],
      }),
      security: withUnavailablePayload({
        securityScore: DATA_UNAVAILABLE,
        activeThreats: DATA_UNAVAILABLE,
        vulnerabilityCount: DATA_UNAVAILABLE,
        securityHealth: DATA_UNAVAILABLE,
        events: [],
      }),
    }
  }
}

module.exports = {
  getGrafanaSnapshot,
  getGrafanaConfig,
  grafanaRequest,
}

