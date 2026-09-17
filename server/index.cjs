require('dotenv').config()

const express = require('express')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const pool = require('./db.cjs')
const { getGrafanaSnapshot } = require('./grafanaService.cjs')
const { seedAlertsIfEmpty } = require('./alertsSeed.cjs')

const app = express()
const port = Number(process.env.PORT || 3001)
const allowedRoles = new Set(['Admin', 'Operator', 'Viewer'])

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }))
app.use(express.json())

app.get('/api/dashboard', async (_req, res) => {
  try {
    const snapshot = await getGrafanaSnapshot()
    console.log('[Grafana] /api/dashboard response', JSON.stringify(snapshot.dashboard).slice(0, 2000))
    res.json(snapshot.dashboard)
  } catch (error) {
    console.error('Dashboard API error:', error)
    res.json({ cpu: 'Data unavailable', ram: 'Data unavailable', disk: 'Data unavailable', traffic: 'Data unavailable', alerts: 'Data unavailable', devices: 'Data unavailable', servers: 'Data unavailable', availability: 'Data unavailable', securityScore: 'Data unavailable', message: 'Data unavailable' })
  }
})

app.get('/api/monitoring', async (_req, res) => {
  try {
    const snapshot = await getGrafanaSnapshot()
    console.log('[Grafana] /api/monitoring response', JSON.stringify(snapshot.monitoring).slice(0, 2000))
    res.json(snapshot.monitoring)
  } catch (error) {
    console.error('Monitoring API error:', error)
    res.json({ devices: [], healthStatus: 'Data unavailable', reachability: 'Data unavailable', performanceMetrics: { latency: 'Data unavailable', cpu: 'Data unavailable', memory: 'Data unavailable', disk: 'Data unavailable' }, message: 'Data unavailable' })
  }
})

// ---------------------------------------------------------------------------
// Alerts module — persistent alert workflow (Active / Acknowledged / Closed)
// ---------------------------------------------------------------------------
const ALERT_SEVERITIES = ['Critical', 'Warning', 'Information']
const ALERT_STATUSES = ['Active', 'Acknowledged', 'Closed']

function alertTimeAgo(value) {
  if (!value) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return `${seconds} sec ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

function alertToJson(row) {
  return {
    id: row.id,
    title: row.title,
    device: row.device,
    severity: row.severity,
    status: row.status,
    escalationLevel: row.escalation_level || null,
    owner: row.owner || 'Unassigned',
    impact: row.impact || '',
    summary: row.summary || '',
    detail: row.summary || '',
    source: row.source || 'manual',
    createdAt: row.created_at,
    acknowledgedAt: row.acknowledged_at,
    closedAt: row.closed_at,
    time: alertTimeAgo(row.created_at),
  }
}

function alertEventToJson(row) {
  return { time: row.event_time, text: row.text, actor: row.actor || null }
}

async function addAlertEvent(alertId, text, actor) {
  await pool.query('INSERT INTO alert_events (alert_id, text, actor) VALUES ($1, $2, $3)', [alertId, text, actor || 'system'])
}

async function getAlertTimeline(alertId) {
  const result = await pool.query('SELECT id, alert_id, text, actor, event_time FROM alert_events WHERE alert_id = $1 ORDER BY event_time ASC, id ASC', [alertId])
  return result.rows.map(alertEventToJson)
}

async function getAlertSummary() {
  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'Active') AS active,
      COUNT(*) FILTER (WHERE status = 'Acknowledged') AS acknowledged,
      COUNT(*) FILTER (WHERE status = 'Closed') AS closed,
      COUNT(*) FILTER (WHERE severity = 'Critical' AND status <> 'Closed') AS critical,
      COUNT(*) FILTER (WHERE severity = 'Warning' AND status <> 'Closed') AS warning,
      COUNT(*) FILTER (WHERE severity = 'Information' AND status <> 'Closed') AS information,
      COUNT(*) AS total
    FROM alerts
  `)
  const row = result.rows[0] || {}
  const toInt = (value) => Number(value) || 0
  return {
    active: toInt(row.active),
    acknowledged: toInt(row.acknowledged),
    closed: toInt(row.closed),
    open: toInt(row.active) + toInt(row.acknowledged),
    critical: toInt(row.critical),
    warning: toInt(row.warning),
    information: toInt(row.information),
    total: toInt(row.total),
  }
}

async function findAlert(id) {
  const result = await pool.query('SELECT * FROM alerts WHERE id = $1', [id])
  return result.rows[0] || null
}

function parseAlertId(raw) {
  const id = Number.parseInt(raw, 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

function actorFromRequest(req) {
  const header = req.get('authorization') || ''
  if (header.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET)
      if (payload && payload.email) return payload.email
      if (payload && payload.sub) return `user-${payload.sub}`
    } catch { /* fall through to body actor */ }
  }
  if (req.body && typeof req.body.actor === 'string' && req.body.actor.trim()) return req.body.actor.trim()
  return 'operator'
}

// GET /api/alerts?status=&severity=&q=&page=&pageSize=
// Returns { summary, items, pagination } — open alerts surface first.
app.get('/api/alerts', async (req, res) => {
  const status = typeof req.query.status === 'string' && ALERT_STATUSES.includes(req.query.status) ? req.query.status : null
  const severity = typeof req.query.severity === 'string' && ALERT_SEVERITIES.includes(req.query.severity) ? req.query.severity : null
  const search = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 6))

  try {
    const conditions = []
    const values = []
    if (status) { values.push(status); conditions.push(`status = $${values.length}`) }
    if (severity) { values.push(severity); conditions.push(`severity = $${values.length}`) }
    if (search) {
      values.push(`%${search.replace(/[\\%_]/g, (match) => `\\${match}`)}%`)
      const idx = values.length
      conditions.push(`(title ILIKE $${idx} OR device ILIKE $${idx} OR owner ILIKE $${idx} OR summary ILIKE $${idx})`)
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM alerts ${whereClause}`, values)
    const total = (countResult.rows[0] && countResult.rows[0].total) || 0
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.min(page, totalPages)

    values.push(pageSize)
    values.push((safePage - 1) * pageSize)
    const rowsResult = await pool.query(
      `SELECT * FROM alerts ${whereClause}
       ORDER BY CASE WHEN status = 'Closed' THEN 1 ELSE 0 END ASC, created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    )

    res.json({
      summary: await getAlertSummary(),
      items: rowsResult.rows.map(alertToJson),
      pagination: { page: safePage, pageSize, total, totalPages },
    })
  } catch (error) {
    console.error('Alerts API error:', error)
    res.status(500).json({ error: 'Unable to load alerts.' })
  }
})

// GET /api/alerts/:id — alert detail including its full timeline.
app.get('/api/alerts/:id', async (req, res) => {
  const id = parseAlertId(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid alert id.' })
  try {
    const alert = await findAlert(id)
    if (!alert) return res.status(404).json({ error: 'Alert not found.' })
    res.json({ alert: { ...alertToJson(alert), timeline: await getAlertTimeline(id) } })
  } catch (error) {
    console.error('Alert detail API error:', error)
    res.status(500).json({ error: 'Unable to load alert.' })
  }
})

// POST /api/alerts — create a new alert (starts in the Active state).
app.post('/api/alerts', async (req, res) => {
  const { title, device, severity, owner, impact, summary } = req.body || {}
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required.' })
  if (String(title).trim().length > 200) return res.status(400).json({ error: 'Title must be 200 characters or fewer.' })
  if (severity && !ALERT_SEVERITIES.includes(severity)) return res.status(400).json({ error: 'Severity must be Critical, Warning, or Information.' })
  try {
    const result = await pool.query(
      `INSERT INTO alerts (title, device, severity, owner, impact, summary, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'api') RETURNING *`,
      [String(title).trim(), device || 'Unknown', severity || 'Information', owner || null, impact || null, summary || null],
    )
    const alert = result.rows[0]
    await addAlertEvent(alert.id, 'Alert created', owner || 'operator')
    res.status(201).json({ alert: { ...alertToJson(alert), timeline: await getAlertTimeline(alert.id) } })
  } catch (error) {
    console.error('Alert create error:', error)
    res.status(500).json({ error: 'Unable to create alert.' })
  }
})

// POST /api/alerts/:id/acknowledge — Active → Acknowledged.
app.post('/api/alerts/:id/acknowledge', async (req, res) => {
  const id = parseAlertId(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid alert id.' })
  try {
    const alert = await findAlert(id)
    if (!alert) return res.status(404).json({ error: 'Alert not found.' })
    if (alert.status === 'Closed') return res.status(409).json({ error: 'Closed alerts cannot be acknowledged.' })
    if (alert.status === 'Acknowledged') return res.status(409).json({ error: 'Alert is already acknowledged.' })
    const actor = actorFromRequest(req)
    const updated = await pool.query(
      `UPDATE alerts SET status = 'Acknowledged', acknowledged_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    )
    await addAlertEvent(id, `Acknowledged by ${actor}`, actor)
    res.json({ alert: { ...alertToJson(updated.rows[0]), timeline: await getAlertTimeline(id) } })
  } catch (error) {
    console.error('Alert acknowledge error:', error)
    res.status(500).json({ error: 'Unable to acknowledge alert.' })
  }
})

// POST /api/alerts/:id/escalate — flag an open alert for Tier 2 (auto-acknowledges).
app.post('/api/alerts/:id/escalate', async (req, res) => {
  const id = parseAlertId(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid alert id.' })
  try {
    const alert = await findAlert(id)
    if (!alert) return res.status(404).json({ error: 'Alert not found.' })
    if (alert.status === 'Closed') return res.status(409).json({ error: 'Closed alerts cannot be escalated.' })
    const actor = actorFromRequest(req)
    const level = req.body && typeof req.body.level === 'string' && req.body.level.trim() ? req.body.level.trim() : 'Tier 2'
    const updated = await pool.query(
      `UPDATE alerts
       SET escalation_level = $2,
           status = CASE WHEN status = 'Active' THEN 'Acknowledged' ELSE status END,
           acknowledged_at = COALESCE(acknowledged_at, NOW()),
           updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, level],
    )
    await addAlertEvent(id, `Escalated to ${level} by ${actor}`, actor)
    res.json({ alert: { ...alertToJson(updated.rows[0]), timeline: await getAlertTimeline(id) } })
  } catch (error) {
    console.error('Alert escalate error:', error)
    res.status(500).json({ error: 'Unable to escalate alert.' })
  }
})

// POST /api/alerts/:id/resolve — any open state → Closed.
app.post('/api/alerts/:id/resolve', async (req, res) => {
  const id = parseAlertId(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid alert id.' })
  try {
    const alert = await findAlert(id)
    if (!alert) return res.status(404).json({ error: 'Alert not found.' })
    if (alert.status === 'Closed') return res.status(409).json({ error: 'Alert is already closed.' })
    const actor = actorFromRequest(req)
    const note = req.body && typeof req.body.note === 'string' && req.body.note.trim() ? ` — ${req.body.note.trim()}` : ''
    const updated = await pool.query(
      `UPDATE alerts SET status = 'Closed', closed_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    )
    await addAlertEvent(id, `Resolved by ${actor}${note}`, actor)
    res.json({ alert: { ...alertToJson(updated.rows[0]), timeline: await getAlertTimeline(id) } })
  } catch (error) {
    console.error('Alert resolve error:', error)
    res.status(500).json({ error: 'Unable to resolve alert.' })
  }
})

// POST /api/alerts/:id/reopen — Closed → Active (clears acknowledgement/escalation).
app.post('/api/alerts/:id/reopen', async (req, res) => {
  const id = parseAlertId(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid alert id.' })
  try {
    const alert = await findAlert(id)
    if (!alert) return res.status(404).json({ error: 'Alert not found.' })
    if (alert.status !== 'Closed') return res.status(409).json({ error: 'Only closed alerts can be reopened.' })
    const actor = actorFromRequest(req)
    const updated = await pool.query(
      `UPDATE alerts SET status = 'Active', acknowledged_at = NULL, closed_at = NULL, escalation_level = NULL, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    )
    await addAlertEvent(id, `Reopened by ${actor}`, actor)
    res.json({ alert: { ...alertToJson(updated.rows[0]), timeline: await getAlertTimeline(id) } })
  } catch (error) {
    console.error('Alert reopen error:', error)
    res.status(500).json({ error: 'Unable to reopen alert.' })
  }
})

// DELETE /api/alerts/:id — Admin only; timeline is removed by ON DELETE CASCADE.
app.delete('/api/alerts/:id', requireAuth, requireRole('Admin'), async (req, res) => {
  const id = parseAlertId(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid alert id.' })
  try {
    const result = await pool.query('DELETE FROM alerts WHERE id = $1', [id])
    if (!result.rowCount) return res.status(404).json({ error: 'Alert not found.' })
    res.status(204).send()
  } catch (error) {
    console.error('Alert delete error:', error)
    res.status(500).json({ error: 'Unable to delete alert.' })
  }
})

app.get('/api/security', async (_req, res) => {
  try {
    const snapshot = await getGrafanaSnapshot()
    console.log('[Grafana] /api/security response', JSON.stringify(snapshot.security).slice(0, 2000))
    res.json(snapshot.security)
  } catch (error) {
    console.error('Security API error:', error)
    res.json({ securityScore: 'Data unavailable', activeThreats: 'Data unavailable', vulnerabilityCount: 'Data unavailable', securityHealth: 'Data unavailable', events: [], message: 'Data unavailable' })
  }
})

function createToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' })
}
function publicUser(user) { return { id: user.id, name: user.name, email: user.email, role: user.role } }
function requireAuth(req, res, next) {
  const header = req.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Authentication required.' })
  try { req.auth = jwt.verify(token, process.env.JWT_SECRET); next() } catch { return res.status(401).json({ error: 'Invalid or expired token.' }) }
}
function requireRole(...roles) { return (req, res, next) => { if (!roles.includes(req.auth.role)) return res.status(403).json({ error: 'You do not have permission to access this resource.' }); next() } }

app.get('/api/health', async (_req, res) => { try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }) } catch { res.status(503).json({ status: 'error', database: 'unavailable' }) } })

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required.' })
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' })
  try {
    const passwordHash = await bcrypt.hash(password, 12)
    const result = await pool.query("INSERT INTO users (name, email, password_hash, role) VALUES ($1, LOWER($2), $3, 'Viewer') RETURNING id, name, email, role", [name.trim(), email.trim(), passwordHash])
    const user = result.rows[0]
    res.status(201).json({ token: createToken(user), user: publicUser(user) })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An account with that email already exists.' })
    console.error(error); res.status(500).json({ error: 'Unable to create account.' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' })
  try {
    const result = await pool.query('SELECT id, name, email, role, password_hash FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()])
    const user = result.rows[0]
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Invalid email or password.' })
    res.json({ token: createToken(user), user: publicUser(user) })
  } catch (error) { console.error(error); res.status(500).json({ error: 'Unable to sign in.' }) }
})

app.post('/api/auth/logout', requireAuth, (_req, res) => res.status(204).send())
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [req.auth.sub])
    if (!result.rows[0]) return res.status(401).json({ error: 'Account no longer exists.' })
    res.json({ user: publicUser(result.rows[0]) })
  } catch (error) { console.error(error); res.status(500).json({ error: 'Unable to load account.' }) }
})
app.get('/api/admin/users', requireAuth, requireRole('Admin'), async (_req, res) => {
  try { const result = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC'); res.json({ users: result.rows }) } catch (error) { console.error(error); res.status(500).json({ error: 'Unable to load users.' }) }
})
app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: 'Unexpected server error.' }) })

// Seed demo alerts on first boot (no-op when alerts already exist).
seedAlertsIfEmpty().catch((error) => console.error('[alerts] startup seed failed:', error.message))

app.listen(port, () => console.log(`NOC Automation API listening on port ${port}`))
