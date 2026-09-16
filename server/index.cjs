require('dotenv').config()

const express = require('express')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const pool = require('./db.cjs')

const app = express()
const port = Number(process.env.PORT || 3001)
const allowedRoles = new Set(['Admin', 'Operator', 'Viewer'])

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }))
app.use(express.json())

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
app.listen(port, () => console.log(`NOC Automation API listening on port ${port}`))
