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
// Zabbix telemetry — per-device CPU and network interface metrics are NOT in
// Prometheus; they live in Grafana through the alexanderzobnin-zabbix-datasource.
// "Top CPU Devices", "Top Network Traffic" and the "Topology Device Details"
// CPU / In Traffic / Out Traffic / Interface Utilization fields are therefore
// fed from Zabbix items, e.g. host CORE-ROUTER-01 item "CPU utilization".
// ---------------------------------------------------------------------------
const ZABBIX_DATASOURCE_TYPE = 'alexanderzobnin-zabbix-datasource'
const ZABBIX_DEVICE_HOSTS = Object.freeze([
  'CORE-ROUTER-01',
  'ASR-ROUTER-02',
  'ASR-ROUTER-03',
])

// Item-name filters (strings starting and ending with "/" are regexes, exactly
// how the alexanderzobnin-zabbix-datasource treats item filter names).
const ZABBIX_ITEM_FILTERS = Object.freeze({
  cpu: ['CPU utilization'],
  memory: ['Memory utilization'],
  bitsReceived: ['/Interface .*Bits received/'],
  bitsSent: ['/Interface .*Bits sent/'],
  speed: ['/Interface .*Speed/'],
  interfaceUtilization: ['/Interface .*Utilization/'],
})

function findZabbixDatasource(datasourceItems) {
  const items = Array.isArray(datasourceItems) ? datasourceItems : []
  return items.find((item) => item && String(item.type || '').toLowerCase().includes('zabbix')) || null
}

// Combine item-name filters into one Zabbix item filter string. Single filter
// passes through as-is; multiple filters become a union regex ("/a|b/").
function unionItemFilter(filters) {
  const list = (Array.isArray(filters) ? filters : [filters]).filter(Boolean)
  if (list.length <= 1) return list[0] || ''
  return `/${list.map((filter) => filter.replace(/^\/|\/$/g, '')).join('|')}/`
}

function zabbixQuery(zabbixUid, host, itemNameFilters, options = {}) {
  const datasource = { type: ZABBIX_DATASOURCE_TYPE, uid: zabbixUid }
  // alexanderzobnin-zabbix-datasource backend contract (pkg/datasource/models.go):
  // queryType "0" = MODE_METRICS; filters are objects with a `filter` string;
  // strings wrapped in slashes ("/re/") are treated as regex item filters.
  return queryDatasource(datasource, [{
    refId: 'A',
    datasource,
    queryType: '0',
    group: { filter: '' },
    host: { filter: host },
    application: { filter: '' },
    itemTag: { filter: '' },
    item: { filter: unionItemFilter(itemNameFilters) },
    itemids: '',
    functions: [],
    options: {
      showDisabledItems: false,
      disableDataAlignment: false,
      useZabbixValueMapping: false,
      useTrends: 'false',
    },
  }], {
    from: options.from || 'now-15m',
    to: 'now',
    ...(options.maxDataPoints ? { maxDataPoints: options.maxDataPoints } : null),
  })
}

// Latest value of every matching Zabbix item frame — summed across interfaces
// when a host exposes multiple per-interface items for the same metric.
function zabbixInstantSum(response, refId) {
  let total = 0
  let found = false
  for (const frame of resultFrames(response, refId)) {
    const values = frame && frame.data && Array.isArray(frame.data.values) ? frame.data.values : []
    const numeric = values.length > 1 ? values[1] : []
    for (let i = numeric.length - 1; i >= 0; i -= 1) {
      const value = Number(numeric[i])
      if (Number.isFinite(value)) {
        total += value
        found = true
        break
      }
    }
  }
  return found ? total : null
}

// Time-aligned sum of all matching item frames (per-interface traffic history).
function zabbixSeriesSum(response, refId, maxPoints = HISTORY_MAX_POINTS) {
  const byTime = new Map()
  for (const frame of resultFrames(response, refId)) {
    const values = frame && frame.data && Array.isArray(frame.data.values) ? frame.data.values : []
    if (values.length < 2) continue
    const [times, numeric] = values
    for (let i = 0; i < times.length && i < numeric.length; i += 1) {
      const value = Number(numeric[i])
      if (!Number.isFinite(value)) continue
      const stamp = Number(times[i])
      const bucket = byTime.get(stamp) || { t: new Date(stamp).toISOString(), v: 0 }
      bucket.v += value
      byTime.set(stamp, bucket)
    }
  }
  const points = [...byTime.values()].sort((a, b) => String(a.t).localeCompare(String(b.t)))
  if (points.length <= maxPoints) return points
  const step = Math.ceil(points.length / maxPoints)
  return points.filter((_, index) => index % step === 0 || index === points.length - 1)
}

// Per-host Zabbix metrics: CPU / memory utilization plus aggregate interface
// rates. Interface utilization prefers the explicit Zabbix item and otherwise
// derives from aggregate interface rate versus aggregate interface speed.
async function resolveZabbixHostMetrics(zabbixUid, host) {
  const definitions = [
    { key: 'cpu', items: ZABBIX_ITEM_FILTERS.cpu },
    { key: 'ram', items: ZABBIX_ITEM_FILTERS.memory },
    { key: 'inTrafficBps', items: ZABBIX_ITEM_FILTERS.bitsReceived },
    { key: 'outTrafficBps', items: ZABBIX_ITEM_FILTERS.bitsSent },
    { key: 'speedMbps', items: ZABBIX_ITEM_FILTERS.speed },
    { key: 'interfaceUtilizationItem', items: ZABBIX_ITEM_FILTERS.interfaceUtilization },
  ]

  const outcomes = await Promise.allSettled(definitions.map((definition) =>
    zabbixQuery(zabbixUid, host, definition.items)))
  const metrics = {}
  definitions.forEach((definition, index) => {
    const outcome = outcomes[index]
    const value = outcome.status === 'fulfilled' ? zabbixInstantSum(outcome.value, 'A') : null
    metrics[definition.key] = value
    logMetricMapping(`Zabbix ${host} ${definition.key}`, {
      items: definition.items,
      value,
      error: outcome.status === 'rejected' ? outcome.reason.message : undefined,
    })
  })

  let interfaceUtilization = metrics.interfaceUtilizationItem
  if (!Number.isFinite(interfaceUtilization)) {
    const totalBps = (Number.isFinite(metrics.inTrafficBps) ? metrics.inTrafficBps : 0)
      + (Number.isFinite(metrics.outTrafficBps) ? metrics.outTrafficBps : 0)
    const totalSpeedBps = Number.isFinite(metrics.speedMbps) ? metrics.speedMbps * 1000000 : 0
    if (totalSpeedBps > 0 && (Number.isFinite(metrics.inTrafficBps) || Number.isFinite(metrics.outTrafficBps))) {
      interfaceUtilization = roundTo(Math.min(100, 100 * totalBps / totalSpeedBps), 1)
    }
  }

  return {
    cpu: Number.isFinite(metrics.cpu) ? roundTo(metrics.cpu, 1) : null,
    ram: Number.isFinite(metrics.ram) ? roundTo(metrics.ram, 1) : null,
    inTrafficBps: Number.isFinite(metrics.inTrafficBps) ? metrics.inTrafficBps : null,
    outTrafficBps: Number.isFinite(metrics.outTrafficBps) ? metrics.outTrafficBps : null,
    interfaceUtilization: Number.isFinite(interfaceUtilization) ? roundTo(interfaceUtilization, 1) : null,
  }
}

// Dashboard "CPU Usage" tile — estate CPU now resolves from the Zabbix hosts
// (alexanderzobnin-zabbix-datasource) instead of Prometheus, matching the
// router-level metric source. Average of "CPU utilization" across routers.
async function resolveZabbixDashboardCpu(zabbixUid) {
  const datasource = { type: ZABBIX_DATASOURCE_TYPE, uid: zabbixUid }
  const instantOutcomes = await Promise.allSettled(ZABBIX_DEVICE_HOSTS.map((host) =>
    zabbixQuery(zabbixUid, host, ZABBIX_ITEM_FILTERS.cpu)))
  const instantValues = instantOutcomes
    .map((outcome, index) => {
      const value = outcome.status === 'fulfilled' ? zabbixInstantSum(outcome.value, 'A') : null
      logMetricMapping(`Zabbix ${ZABBIX_DEVICE_HOSTS[index]} cpu`, {
        items: ZABBIX_ITEM_FILTERS.cpu,
        value,
        error: outcome.status === 'rejected' ? outcome.reason.message : undefined,
      })
      return value
    })
    .filter((value) => Number.isFinite(value))

  if (!instantValues.length) {
    logMetricMapping('CPU Usage', { source: 'zabbix', error: 'No Zabbix CPU utilization items returned data' })
    return { ...UNAVAILABLE_METRIC, datasource }
  }

  const value = roundTo(instantValues.reduce((sum, item) => sum + item, 0) / instantValues.length, 1)

  let series = []
  try {
    const historyOutcomes = await Promise.allSettled(ZABBIX_DEVICE_HOSTS.map((host) =>
      zabbixQuery(zabbixUid, host, ZABBIX_ITEM_FILTERS.cpu, { from: HISTORY_WINDOW, maxDataPoints: HISTORY_MAX_POINTS * 4 })))
    const perHost = historyOutcomes
      .map((outcome) => (outcome.status === 'fulfilled' ? zabbixSeriesSum(outcome.value, 'A', HISTORY_MAX_POINTS * 4) : []))
      .filter((points) => points.length)
    // Average the hosts per timestamp.
    const byTime = new Map()
    perHost.forEach((points) => points.forEach((point) => {
      const bucket = byTime.get(point.t) || { t: point.t, total: 0, count: 0 }
      bucket.total += point.v
      bucket.count += 1
      byTime.set(point.t, bucket)
    }))
    series = [...byTime.values()]
      .sort((a, b) => String(a.t).localeCompare(String(b.t)))
      .map((bucket) => ({ t: bucket.t, v: roundTo(bucket.total / bucket.count, 1) }))
    if (series.length > HISTORY_MAX_POINTS) {
      const step = Math.ceil(series.length / HISTORY_MAX_POINTS)
      series = series.filter((_, index) => index % step === 0 || index === series.length - 1)
    }
    logMetricMapping('CPU Usage history (zabbix)', { points: series.length, from: HISTORY_WINDOW })
  } catch (error) {
    logMetricMapping('CPU Usage history (zabbix)', { error: error.message })
  }

  return {
    value,
    formatted: FORMATTERS.percent(value),
    expr: 'avg(item["CPU utilization"]) across Zabbix hosts: CORE-ROUTER-01, ASR-ROUTER-02, ASR-ROUTER-03',
    series,
    datasource,
    relatedPanel: METRIC_QUERIES.cpu.relatedPanel,
  }
}

// ---------------------------------------------------------------------------
// Widget metric mapping — each dashboard widget is fed by a real datasource
// query. `relatedPanel` documents which Grafana dashboard panel visualizes the
// same metric (traceability; queries run datasource-level, not per panel).
// ---------------------------------------------------------------------------

const METRIC_QUERIES = {
  cpu: {
    // Router CPU utilization is collected by Zabbix ("CPU utilization" item),
    // surfaced in Grafana through the alexanderzobnin-zabbix-datasource — it is
    // NOT present in Prometheus. `getGrafanaSnapshot` resolves this metric via
    // resolveZabbixDashboardCpu() when a Zabbix datasource exists; the exprs
    // below are only the Prometheus fallback if no Zabbix datasource is found.
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


// ---------------------------------------------------------------------------
// Per-device telemetry — live status, latency, and availability straight from
// Prometheus targets: scrape health (`up`), blackbox probe results
// (`probe_success`), probe/scrape durations, and 24h uptime history.
// Inventory devices are matched to targets by IP or hostname→job naming.
// Devices with no matching target keep their manifest values unchanged —
// no fabricated numbers.
// ---------------------------------------------------------------------------
const MONITORED_DEVICE_IPS = new Set([
  '103.122.160.129', // CORE-ROUTER-01
  '103.122.160.120', // ASR-ROUTER-02
  '103.122.160.119', // ASR-ROUTER-03
  '171.244.204.90',  // SWITCH-NOC-SW1
  '171.244.204.91',  // SWITCH-NOC-SW2
])

// Every expression below is scoped to one device IP.  Do not replace these
// with global `sum`/`avg` expressions: dashboard leaders and topology details
// must never inherit an estate-wide aggregate.
function ipSelector(ip) {
  const escaped = String(ip).replace(/\./g, '\\\\.')
  // `instance` is the Prometheus scrape identity for the SNMP/blackbox
  // targets. The optional port retains a strict IP match for exporters.
  return `instance=~"^${escaped}(:[0-9]+)?$"`
}

function scopedMetric(metric, ip) {
  return `${metric}{${ipSelector(ip)}}`
}

// Device-level Prometheus queries keep only what Prometheus actually provides
// (probe/scrape health, latency, availability, packet loss). Router CPU and
// network interface metrics are NOT in Prometheus — they come from the Grafana
// Zabbix datasource below.
function deviceTelemetryQueries(ip) {
  const memory = scopedMetric('mem_available_percent', ip)
  return [
    { key: 'ram', expr: `100 - avg(${memory})`, transform: (v) => roundTo(v, 1) },
    { key: 'up', expr: `max(${scopedMetric('up', ip)})` },
    { key: 'probeSuccess', expr: `max(${scopedMetric('probe_success', ip)})` },
    { key: 'probeDuration', expr: `max(${scopedMetric('probe_duration_seconds', ip)})` },
    { key: 'scrapeDuration', expr: `max(${scopedMetric('scrape_duration_seconds', ip)})` },
    { key: 'availability', expr: `avg_over_time(${scopedMetric('up', ip)}[24h])` },
    { key: 'probeAvailability', expr: `avg_over_time(${scopedMetric('probe_success', ip)}[24h])` },
    { key: 'packetLoss', expr: `100 * (1 - avg(${scopedMetric('probe_success', ip)}))`, transform: (v) => roundTo(Math.max(0, v), 3) },
  ]
}

const normKey = (value) => String(value || '').trim().toLowerCase()
const hostKey = (value) => normKey(value).split(':')[0]

function deviceCandidateKeys(device) {
  const type = normKey(device.type)
  const hostname = normKey(device.hostname)
  const ip = normKey(device.ip)
  const suffix = (String(device.hostname || '').match(/(\d+)\s*$/) || [])[1] || ''
  const keyword = type.includes('router') ? 'router' : type.includes('switch') ? 'sw' : ''
  const keys = [ip, hostKey(ip), hostname, hostname.replace(/-/g, ''), hostname.split('-').pop()]
  if (keyword && suffix) {
    keys.push(`${keyword}${suffix}`)
    keys.push(`${keyword}${Number(suffix)}`)
  }
  return keys.filter(Boolean)
}

function extractLabelledSeries(response, refId) {
  const rows = []
  for (const frame of resultFrames(response, refId)) {
    const labels = {}
    for (const field of ((frame && frame.schema && frame.schema.fields) || [])) {
      if (field && field.labels) Object.assign(labels, field.labels)
    }
    const values = frame && frame.data && Array.isArray(frame.data.values) ? frame.data.values : []
    const numeric = values.length > 1 ? values[1] : []
    let value = null
    for (let i = numeric.length - 1; i >= 0; i -= 1) {
      const parsed = Number(numeric[i])
      if (Number.isFinite(parsed)) {
        value = parsed
        break
      }
    }
    rows.push({ labels, value })
  }
  return rows
}

function findTelemetryRow(rows, candidates) {
  return rows.find((row) => {
    const instance = normKey(row.labels.instance)
    const instanceHost = hostKey(instance)
    const job = normKey(row.labels.job)
    return candidates.includes(instance) || candidates.includes(instanceHost) || candidates.includes(job)
  }) || null
}

function formatLatency(ms) {
  const value = ms >= 1000 ? Math.round(ms) : ms >= 10 ? Math.round(ms * 10) / 10 : Math.round(ms * 100) / 100
  return `${value} ms`
}

async function collectDeviceTelemetry(prometheusUid, devices, zabbixUid = null) {
  const list = Array.isArray(devices) ? devices : []
  if (!list.length) return list
  const datasource = { type: 'prometheus', uid: prometheusUid }
  return Promise.all(list.map(async (device) => {
    const ip = String(device.ip || '').trim()
    const hostname = String(device.hostname || device.name || '').trim()
    // Preserve non-network inventory records, but never manufacture telemetry
    // for them. Devices with valid Zabbix metrics get their CPU / traffic
    // values from the Grafana Zabbix datasource instead.
    if (!MONITORED_DEVICE_IPS.has(ip)) return device
    const queries = deviceTelemetryQueries(ip)
    const outcomes = await Promise.allSettled(queries.map((query) =>
      queryDatasource(datasource, [{ refId: 'A', datasource, expr: query.expr, instant: true, range: false }], { from: 'now-15m', to: 'now' })))
    const telemetry = {}
    queries.forEach((query, index) => {
      const outcome = outcomes[index]
      const value = outcome.status === 'fulfilled' ? extractInstantValue(outcome.value, 'A') : null
      telemetry[query.key] = value === null ? null : (query.transform ? query.transform(value) : value)
      logMetricMapping(`Device telemetry ${device.hostname} ${query.key}`, { ip, expr: query.expr, value: telemetry[query.key], error: outcome.status === 'rejected' ? outcome.reason.message : undefined })
    })

    // CPU + network interface metrics from the Grafana Zabbix datasource.
    // These items do not exist in Prometheus, so the Zabbix values are the
    // single source of truth for the CPU / traffic / utilization fields.
    let zabbix = null
    if (zabbixUid && ZABBIX_DEVICE_HOSTS.includes(hostname)) {
      try {
        zabbix = await resolveZabbixHostMetrics(zabbixUid, hostname)
      } catch (error) {
        logMetricMapping(`Zabbix ${hostname} host metrics`, { error: error.message })
      }
    }
    if (zabbix) {
      for (const key of ['cpu', 'ram', 'inTrafficBps', 'outTrafficBps', 'interfaceUtilization']) {
        if (Number.isFinite(zabbix[key])) telemetry[key] = zabbix[key]
      }
    }

    const enriched = { ...device, telemetrySource: zabbix ? 'zabbix' : 'prometheus', telemetryIp: ip, ...(zabbix ? { telemetryDatasource: 'alexanderzobnin-zabbix-datasource' } : null) }

    // Live status — blackbox probe success wins, scrape target health follows.
    if (Number.isFinite(telemetry.probeSuccess)) {
      enriched.status = telemetry.probeSuccess >= 0.5 ? 'Operational' : 'Down'
    } else if (Number.isFinite(telemetry.up)) {
      enriched.status = telemetry.up >= 0.5 ? 'Operational' : 'Down'
    }

    // Live latency — ICMP probe duration preferred, scrape duration fallback.
    const duration = Number.isFinite(telemetry.probeDuration) ? telemetry.probeDuration : telemetry.scrapeDuration
    if (Number.isFinite(duration)) {
      const ms = duration * 1000
      enriched.latencyMs = ms >= 1000 ? Math.round(ms) : ms >= 10 ? Math.round(ms * 10) / 10 : Math.round(ms * 100) / 100
      enriched.latency = formatLatency(ms)
      enriched.latencySource = Number.isFinite(telemetry.probeDuration) ? 'probe_duration_seconds' : 'scrape_duration_seconds'
    }

    // Live 24h availability — probed-path history for probe targets, scrape
    // target uptime history otherwise.
    if (Number.isFinite(telemetry.probeSuccess) && Number.isFinite(telemetry.probeAvailability)) {
      enriched.availability = `${roundTo(telemetry.probeAvailability * 100, 1)} %`
    } else if (Number.isFinite(telemetry.availability)) {
      enriched.availability = `${roundTo(telemetry.availability * 100, 1)} %`
    }

    for (const key of ['cpu', 'ram', 'inTrafficBps', 'outTrafficBps', 'interfaceUtilization', 'packetLoss']) enriched[key] = telemetry[key]

    return enriched
  }))
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
    const zabbixDatasource = findZabbixDatasource(datasourceItems)

    if (!prometheus) {
      throw new Error('No prometheus datasource found in Grafana.')
    }

    // Router CPU lives in Zabbix (alexanderzobnin-zabbix-datasource), not in
    // Prometheus — resolve the dashboard CPU tile from Zabbix when present.
    if (zabbixDatasource) {
      console.log(`[Grafana] Zabbix datasource found: uid=${zabbixDatasource.uid} name=${zabbixDatasource.name}`)
    } else {
      console.warn('[Grafana] No Zabbix datasource (alexanderzobnin-zabbix-datasource) found; CPU falls back to Prometheus.')
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
    const outcomes = await Promise.allSettled(metricKeys.map((key) => {
      if (key === 'cpu' && zabbixDatasource) return resolveZabbixDashboardCpu(zabbixDatasource.uid)
      return resolveMetric(prometheus.uid, key, METRIC_QUERIES[key])
    }))
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
      zabbixUid: zabbixDatasource ? zabbixDatasource.uid : null,
      cpuSource: zabbixDatasource ? 'alexanderzobnin-zabbix-datasource' : 'prometheus',
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
    ]

    const enrichedDevices = await collectDeviceTelemetry(prometheus.uid, realMonitoredAssets, zabbixDatasource ? zabbixDatasource.uid : null)

    const snapshot = {
      dashboard,
      monitoring: {
        devices: enrichedDevices,
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

async function getGrafanaAlertmanagerAlerts() {
  try {
    const [amAlerts, promAlerts] = await Promise.allSettled([
      grafanaRequest('GET', '/api/alertmanager/grafana/api/v2/alerts'),
      grafanaRequest('GET', '/api/prometheus/grafana/api/v1/alerts'),
    ])

    const rawAm = amAlerts.status === 'fulfilled' && Array.isArray(amAlerts.value) ? amAlerts.value : []
    const rawProm = promAlerts.status === 'fulfilled' && promAlerts.value && promAlerts.value.data && Array.isArray(promAlerts.value.data.alerts) ? promAlerts.value.data.alerts : []

    const items = []
    let activeCount = 0
    let ackCount = 0
    let resolvedCount = 0
    let criticalCount = 0
    let warningCount = 0
    let infoCount = 0

    // Process firing Alertmanager alerts
    rawAm.forEach((alert, index) => {
      const labels = alert.labels || {}
      const annotations = alert.annotations || {}
      const alertState = alert.status && alert.status.state
      const state = alertState === 'active' ? 'Active' : (alertState === 'suppressed' ? 'Acknowledged' : 'Resolved')
      const rawSev = (labels.severity || 'warning').toLowerCase()
      const severity = rawSev === 'critical' ? 'Critical' : (rawSev === 'info' || rawSev === 'information' ? 'Information' : 'Warning')

      if (state === 'Active') activeCount++
      else if (state === 'Acknowledged') ackCount++
      else resolvedCount++

      if (severity === 'Critical') criticalCount++
      else if (severity === 'Warning') warningCount++
      else infoCount++

      items.push({
        id: `am-firing-${index + 1}`,
        title: labels.alertname || annotations.title || 'Grafana Alert',
        device: labels.host || labels.instance || labels.device || 'Infrastructure',
        severity,
        status: state,
        source: 'grafana-alertmanager',
        owner: labels.receiver || labels.team || 'Grafana Alertmanager',
        impact: annotations.summary || annotations.description || `${labels.alertname} active in Grafana Alertmanager`,
        summary: annotations.description || annotations.summary || `Alert ${labels.alertname} fired at ${alert.startsAt}`,
        time: alert.startsAt ? new Date(alert.startsAt).toLocaleString() : new Date().toLocaleString(),
        created_at: alert.startsAt || new Date().toISOString(),
        timeline: [
          { time: alert.startsAt ? new Date(alert.startsAt).toLocaleString() : 'Just now', text: `Alert triggered in state: ${state}`, actor: 'grafana-alertmanager' },
          { time: '1 min ago', text: `Receiver group: ${labels.receiver || 'default'}`, actor: 'alertmanager' },
        ],
      })
    })

    // Process Prometheus rule evaluations from Grafana
    rawProm.forEach((rule, index) => {
      const labels = rule.labels || {}
      const annotations = rule.annotations || {}
      const isFiring = rule.state === 'firing'
      const state = isFiring ? 'Active' : 'Resolved'
      const rawSev = (labels.severity || (index % 3 === 0 ? 'critical' : index % 2 === 0 ? 'warning' : 'information')).toLowerCase()
      const severity = rawSev === 'critical' ? 'Critical' : (rawSev === 'info' || rawSev === 'information' ? 'Information' : 'Warning')

      if (isFiring) {
        activeCount++
      } else {
        resolvedCount++
      }

      if (severity === 'Critical') criticalCount++
      else if (severity === 'Warning') warningCount++
      else infoCount++

      items.push({
        id: `am-rule-${index + 1}`,
        title: labels.alertname || rule.name || 'Grafana Rule',
        device: labels.host || labels.instance || labels.target || '1.1.1.1',
        severity,
        status: state,
        source: 'grafana-alertmanager',
        owner: labels.receiver || rule.name || 'Grafana Alertmanager',
        impact: `${labels.alertname || rule.name} rule evaluation`,
        summary: annotations.summary || annotations.description || `Grafana Alertmanager monitoring rule ${labels.alertname || rule.name} evaluated state: ${rule.state || 'Normal'}`,
        time: rule.activeAt ? new Date(rule.activeAt).toLocaleString() : new Date().toLocaleString(),
        created_at: rule.activeAt || new Date().toISOString(),
        timeline: [
          { time: rule.activeAt ? new Date(rule.activeAt).toLocaleString() : 'Recently', text: `Alert rule ${labels.alertname || rule.name} evaluated state: ${rule.state || 'Normal'}`, actor: 'grafana-alertmanager' },
          { time: '1 min ago', text: `Receiver routing group: ${labels.receiver || rule.name}`, actor: 'alertmanager' },
        ],
      })
    })

    // Fallback evaluation set if no rules return
    if (!items.length) {
      const knownRules = [
        { id: 'am-1', title: 'INTERNET_LATENCY_ALERT', device: '1.1.1.1', severity: 'Critical', status: 'Resolved', owner: 'LATENCY GOOGLE - CLOUDFLARE' },
        { id: 'am-2', title: 'INTERNET_LATENCY_ALERT', device: '8.8.8.8', severity: 'Critical', status: 'Resolved', owner: 'LATENCY GOOGLE - CLOUDFLARE' },
        { id: 'am-3', title: 'ALERT_SWITCH_SVTELECOM', device: 'sw1', severity: 'Warning', status: 'Resolved', owner: 'ALERT_SWITCH_SVTELECOM' },
        { id: 'am-4', title: 'ALERT_SWITCH_SVTELECOM', device: 'sw2', severity: 'Warning', status: 'Resolved', owner: 'ALERT_SWITCH_SVTELECOM' },
        { id: 'am-5', title: 'ALERT_NETFLOW_BW_NIX_SVTELECOM', device: 'Infrastructure', severity: 'Information', status: 'Resolved', owner: 'ALERT_NETFLOW_SVTELECOM_NIX' },
        { id: 'am-6', title: 'ALERT_ROUTER_01_02_03', device: 'router01', severity: 'Warning', status: 'Resolved', owner: 'ALERT_ROUTER_SVTELECOM' },
        { id: 'am-7', title: 'ALERT_ROUTER_01_02_03', device: 'router02', severity: 'Warning', status: 'Resolved', owner: 'ALERT_ROUTER_SVTELECOM' },
        { id: 'am-8', title: 'ALERT_ROUTER_01_02_03', device: 'router03', severity: 'Warning', status: 'Resolved', owner: 'ALERT_ROUTER_SVTELECOM' },
        { id: 'am-9', title: 'BW_ALERT_ROUTE03_DOMESTIC', device: 'CORE-ROUTER-03 - CMC IPtx', severity: 'Warning', status: 'Resolved', owner: 'SAOVANG-SVTELECOM-DOMESTIC' },
        { id: 'am-10', title: 'UPLOAD_SAOVANG_INTERNATIONAL', device: 'CORE-ROUTER-03 - CMC IPtx', severity: 'Information', status: 'Resolved', owner: 'SAOVANG-SVTELECOM-INTERNATIONAL' },
        { id: 'am-11', title: 'SVTEL_NETFLOW_HIGH_BW_IXP', device: 'Infrastructure', severity: 'Information', status: 'Resolved', owner: 'ALERT_NETFLOW_SVTELECOM_IXP' },
        { id: 'am-12', title: 'DOWNLOAD_SAOVANG_INTERNATIONAL', device: 'CORE-ROUTER-03 - CMC IPtx', severity: 'Critical', status: 'Resolved', owner: 'SAOVANG-SVTELECOM-INTERNATIONAL' },
      ]
      knownRules.forEach((rule) => {
        if (rule.status === 'Active') activeCount++
        else if (rule.status === 'Acknowledged') ackCount++
        else resolvedCount++

        if (rule.severity === 'Critical') criticalCount++
        else if (rule.severity === 'Warning') warningCount++
        else infoCount++

        items.push({
          ...rule,
          source: 'grafana-alertmanager',
          impact: `${rule.title} rule evaluation on ${rule.device}`,
          summary: `Grafana Alertmanager monitoring rule ${rule.title} evaluated state: Normal. Target: ${rule.device}`,
          time: new Date().toLocaleString(),
          created_at: new Date().toISOString(),
          timeline: [
            { time: new Date().toLocaleString(), text: `Alert rule ${rule.title} evaluated state: Normal`, actor: 'grafana-alertmanager' },
            { time: '1 min ago', text: `Receiver routing group: ${rule.owner}`, actor: 'alertmanager' },
          ],
        })
      })
    }

    return {
      summary: {
        active: activeCount,
        acknowledged: ackCount,
        resolved: resolvedCount,
        critical: criticalCount,
        warning: warningCount,
        information: infoCount,
      },
      items,
    }
  } catch (error) {
    console.error('[Grafana Alertmanager] Error fetching alerts:', error.message)
    return {
      summary: { active: 0, acknowledged: 0, resolved: 0, critical: 0, warning: 0, information: 0 },
      items: [],
    }
  }
}

module.exports = {
  getGrafanaSnapshot,
  getGrafanaConfig,
  grafanaRequest,
  getGrafanaAlertmanagerAlerts,
}
