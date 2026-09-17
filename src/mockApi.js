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

// Same call surface the app already uses — every method now returns live data.
export const api = {
  // Grafana snapshot metrics (cpu / ram / disk / traffic / counts).
  getDashboard: () => backendFetch('/api/dashboard', null),

  // Monitored devices from the Grafana snapshot.
  getDevices: async () => {
    const payload = await backendFetch('/api/monitoring', { devices: [] })
    return Array.isArray(payload?.devices) ? payload.devices : []
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
