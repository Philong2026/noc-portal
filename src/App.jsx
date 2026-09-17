import { createContext, useContext, useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Activity, AlertTriangle, Bell, Check, ChevronDown, Cloud, Cpu, Database, Download, FileText, HardDrive, LayoutDashboard, LockKeyhole, LogOut, Menu, Moon, Network, Search, Server, Settings, ShieldCheck, Sun, UserPlus, Users, X, Zap } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { mockApi } from './mockApi'

const TOKEN_KEY = 'noc-automation-token'
const USER_KEY = 'noc-automation-user'
const LOCAL_AUTH_KEY = 'noc-automation-local-auth'
const defaultDashboardData = { cpu: 42.8, ram: 68.4, disk: 71.2, traffic: '1.84 GB/s', alerts: 7, devices: 126, servers: 48 }
const demoAccounts = {
  'admin@nocautomation.com': { password: 'Admin123!', name: 'NOC Administrator', role: 'Admin' },
  'operator@nocautomation.com': { password: 'Operator123!', name: 'NOC Operator', role: 'Operator' },
  'viewer@nocautomation.com': { password: 'Viewer123!', name: 'NOC Viewer', role: 'Viewer' },
}
const AuthContext = createContext(null)

const safeAsyncCall = async (operation, fallback) => {
  try {
    const value = await operation()
    return value ?? fallback
  } catch (error) {
    console.warn('Async operation failed:', error)
    return fallback
  }
}

function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem(USER_KEY)) || null } catch { return null } })
  const [localAuth, setLocalAuth] = useState(() => localStorage.getItem(LOCAL_AUTH_KEY) === 'true')
  const [ready, setReady] = useState(true)

  useEffect(() => {
    if (!token || localAuth) {
      setReady(true)
      return undefined
    }

    setReady(true)
    return undefined
  }, [localAuth, token])

  const signIn = async (email, password) => {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const account = demoAccounts[normalizedEmail]

    if (!account || account.password !== password) {
      const error = new Error('Invalid email or password.')
      error.status = 401
      throw error
    }

    const localUser = { id: `demo-${account.role.toLowerCase()}`, name: account.name, email: normalizedEmail, role: account.role }
    const demoToken = `local-demo-${account.role.toLowerCase()}`

    localStorage.setItem(LOCAL_AUTH_KEY, 'true')
    localStorage.setItem(TOKEN_KEY, demoToken)
    localStorage.setItem(USER_KEY, JSON.stringify(localUser))

    setLocalAuth(true)
    setUser(localUser)
    setToken(demoToken)

    return { user: localUser, local: true }
  }

  const register = async (name, email, password, role) => {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const safeRole = role || 'Viewer'
    const localUser = {
      id: `demo-${safeRole.toLowerCase()}-${Date.now()}`,
      name: name || 'Operations User',
      email: normalizedEmail,
      role: safeRole,
    }
    const demoToken = `local-demo-${safeRole.toLowerCase()}`

    localStorage.setItem(LOCAL_AUTH_KEY, 'true')
    localStorage.setItem(TOKEN_KEY, demoToken)
    localStorage.setItem(USER_KEY, JSON.stringify(localUser))

    setLocalAuth(true)
    setUser(localUser)
    setToken(demoToken)

    return { user: localUser, local: true }
  }

  const signOut = async () => {
    localStorage.removeItem(LOCAL_AUTH_KEY)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setLocalAuth(false)
    setUser(null)
    setToken(null)
  }

  return <AuthContext.Provider value={{ user, ready, authenticated: Boolean(token && user), signIn, register, signOut }}>{children}</AuthContext.Provider>
}
function useAuth() { return useContext(AuthContext) }

function App() {
  useEffect(() => {
    const handleUnhandledRejection = (event) => {
      const reason = event.reason
      const message = typeof reason === 'string' ? reason : reason && typeof reason.message === 'string' ? reason.message : ''

      if (!message || /onboarding|undefined/i.test(message)) {
        console.warn('Handled a non-fatal promise rejection:', message || reason)
        event.preventDefault()
      }
    }

    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection)
  }, [])

  return <AuthProvider><Routes>
    <Route path="/login" element={<Login />} /><Route path="/register" element={<Register />} /><Route path="/forgot-password" element={<ForgotPassword />} />
    <Route element={<ProtectedRoute />}><Route path="/dashboard" element={<Dashboard />} /><Route path="/monitoring" element={<MonitoringPage />} /><Route path="/alerts" element={<AlertsPage />} /><Route path="/reports" element={<ReportsPage />} /><Route path="/audit" element={<AuditLogPage />} /><Route path="/users" element={<UserManagementPage />} /><Route path="/settings" element={<SettingsPage />} /></Route>
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes></AuthProvider>
}
function ProtectedRoute() { const { authenticated, ready } = useAuth(); return !ready ? null : authenticated ? <AppShell /> : <Navigate to="/login" replace /> }

function AuthLayout({ eyebrow, title, text, children }) {
  return <main className="auth-page"><div className="auth-visual"><div className="visual-grid" /><div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" /><div className="auth-signal"><Activity size={22} /><span>NOC / SECURE</span></div><div className="auth-visual-copy"><span className="status-dot" />Always-on infrastructure operations.</div></div><section className="auth-panel"><Link to="/login" className="brand"><span className="brand-mark"><span /></span><span>NOC <span className="brand-accent">Automation</span></span></Link><div className="auth-copy"><span className="auth-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{children}<div className="auth-footer"><span>NOC Automation Operations Center</span><span>v2.4.0</span></div></section></main>
}
function Login() {
  const { signIn } = useAuth(); const navigate = useNavigate(); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [pending, setPending] = useState(false)
  const submit = async event => { event.preventDefault(); setError(''); setPending(true); try { await signIn(email, password); navigate('/dashboard') } catch (requestError) { setError(requestError.message) } finally { setPending(false) } }
  return <AuthLayout eyebrow="Welcome back" title={<>Your network.<br /><span>Always ready.</span></>} text="Sign in to monitor infrastructure, investigate incidents, and keep critical services available."><form className="auth-form" onSubmit={submit}><Field label="Work email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" required /><Field label="Password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" required /><div className="form-row"><label className="checkbox"><input type="checkbox" defaultChecked /> Remember me</label><Link to="/forgot-password">Forgot password?</Link></div>{error && <p className="form-error">{error}</p>}<button className="primary-button" type="submit" disabled={pending}>{pending ? 'Signing in...' : 'Sign in'} <Zap size={16} /></button><p className="switch-copy">New to NOC Automation? <Link to="/register">Create an account</Link></p></form><DemoCredentials onSelect={(demoEmail, demoPassword) => { setEmail(demoEmail); setPassword(demoPassword); setError('') }} /></AuthLayout>
}
function DemoCredentials({ onSelect }) { const accounts = [['Admin', 'admin@nocautomation.com', 'Admin123!'], ['Operator', 'operator@nocautomation.com', 'Operator123!'], ['Viewer', 'viewer@nocautomation.com', 'Viewer123!']]; return <section className="demo-credentials"><div><span className="auth-eyebrow">Demo access</span><strong>Use a demo account</strong></div>{accounts.map(([role, email, password]) => <button type="button" key={role} onClick={() => onSelect(email, password)}><span className={`demo-role demo-${role.toLowerCase()}`}>{role.slice(0, 1)}</span><span><strong>{role}</strong><small>{email}</small></span><span className="demo-password">{password}</span></button>)}</section> }
function Register() {
  const { register } = useAuth(); const navigate = useNavigate(); const [form, setForm] = useState({ name: '', email: '', password: '' }); const [error, setError] = useState(''); const [pending, setPending] = useState(false); const update = key => event => setForm({ ...form, [key]: event.target.value })
  const submit = async event => { event.preventDefault(); setError(''); setPending(true); try { await register(form.name || 'Operations User', form.email, form.password); navigate('/dashboard') } catch (requestError) { setError(requestError.message) } finally { setPending(false) } }
  return <AuthLayout eyebrow="Create workspace access" title={<>One view for<br /><span>every system.</span></>} text="Set up your NOC Automation profile and bring monitoring, response, and reporting into one focused workspace."><form className="auth-form" onSubmit={submit}><Field label="Full name" value={form.name} onChange={update('name')} placeholder="Jordan Lee" required /><Field label="Work email" type="email" value={form.email} onChange={update('email')} placeholder="you@company.com" required /><Field label="Password" type="password" value={form.password} onChange={update('password')} placeholder="Create a password" minLength="8" required />{error && <p className="form-error">{error}</p>}<button className="primary-button" type="submit" disabled={pending}>{pending ? 'Creating account...' : 'Create account'} <UserPlus size={16} /></button><p className="switch-copy">Already have access? <Link to="/login">Sign in</Link></p></form></AuthLayout>
}
function ForgotPassword() {
  const [sent, setSent] = useState(false)
  return <AuthLayout eyebrow="Account recovery" title={<>Back to a<br /><span>clear signal.</span></>} text="Enter your work email and we will send a secure link to reset your password."><form className="auth-form" onSubmit={event => { event.preventDefault(); setSent(true) }}>{sent ? <div className="success-message"><span><Check size={18} /></span><div><strong>Reset link sent</strong><p>Check your inbox for the next step. The link expires in 30 minutes.</p></div></div> : <><Field label="Work email" type="email" placeholder="you@company.com" required /><button className="primary-button" type="submit">Send reset link <LockKeyhole size={16} /></button></>}<p className="switch-copy"><Link to="/login">Return to sign in</Link></p></form></AuthLayout>
}
function Field({ label, ...props }) { return <label className="field">{label}<input {...props} /></label> }
function RoleSelect({ value, onChange }) { return <label className="field">Workspace role<select value={value} onChange={onChange}><option>Admin</option><option>Operator</option><option>Viewer</option></select></label> }

function AppShell() {
  const [open, setOpen] = useState(false); const [darkMode, setDarkMode] = useState(() => localStorage.getItem('noc-automation-theme') !== 'light'); const { user, signOut } = useAuth(); const location = useLocation()
  useEffect(() => { window.scrollTo(0, 0); setOpen(false) }, [location.pathname])
  const toggleTheme = () => { const next = !darkMode; setDarkMode(next); localStorage.setItem('noc-automation-theme', next ? 'dark' : 'light') }
    const renderProtectedPage = () => {
      switch (location.pathname) {
        case '/monitoring': return <MonitoringPage />
        case '/alerts': return <AlertsPage />
        case '/reports': return <ReportsPage />
        case '/audit': return <AuditLogPage />
        case '/users': return <UserManagementPage />
        case '/settings': return <SettingsPage />
        case '/dashboard':
        default: return <Dashboard />
      }
    }

    return <div className={`app-shell ${darkMode ? 'dark-mode' : ''}`}><aside className={`sidebar ${open ? 'is-open' : ''}`}><div className="sidebar-top"><Link to="/dashboard" className="brand brand-light"><span className="brand-mark"><span /></span><span>NOC <span className="brand-accent">Automation</span></span></Link><button className="close-menu" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={20} /></button></div><div className="workspace-switcher"><span className="workspace-icon"><Network size={15} /></span><span><small>WORKSPACE</small><strong>Enterprise Operations</strong></span><ChevronDown size={16} /></div><nav className="sidebar-nav"><span className="nav-label">Monitor</span><NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}><LayoutDashboard size={17} />Dashboard</NavLink><NavLink to="/monitoring" className={({ isActive }) => isActive ? 'active' : ''}><Activity size={17} />Monitoring</NavLink><NavLink to="/alerts" className={({ isActive }) => isActive ? 'active' : ''}><Bell size={17} />Alerts<span className="nav-count alert">7</span></NavLink><span className="nav-label">Analyze</span><NavLink to="/reports" className={({ isActive }) => isActive ? 'active' : ''}><Database size={17} />Reports</NavLink><NavLink to="/audit" className={({ isActive }) => isActive ? 'active' : ''}><FileText size={17} />Audit Log</NavLink><span className="nav-label">System</span><NavLink to="/users" className={({ isActive }) => isActive ? 'active' : ''}><Users size={17} />User Management</NavLink><NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : ''}><Settings size={17} />Settings</NavLink></nav><div className="sidebar-bottom"><div className="support-card"><ShieldCheck size={18} /><div><strong>All systems protected</strong><span>Last checked 2 min ago</span></div></div><button className="signout" onClick={signOut}><LogOut size={16} />Sign out</button></div></aside><div className="main-area"><header className="topbar"><button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={21} /></button><div className="topbar-search"><Search size={17} /><input placeholder="Search infrastructure..." /></div><div className="topbar-actions"><button className="icon-button" onClick={toggleTheme} aria-label={darkMode ? 'Use light mode' : 'Use dark mode'}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button><button className="icon-button" aria-label="Notifications"><Bell size={18} /><span /></button><div className="user-menu"><span className="avatar">{(user?.name || 'OP').slice(0, 2).toUpperCase()}</span><div><strong>{user?.name || 'Operator'}</strong><small>{user?.role || 'Operator'}</small></div><ChevronDown size={15} /></div></div></header><main className="dashboard-main">{renderProtectedPage()}</main></div>{open && <button className="mobile-scrim" onClick={() => setOpen(false)} aria-label="Close navigation overlay" />}</div>
  }

  const metrics = [
    { label: 'CPU usage', value: '42.8%', detail: 'across monitored hosts', icon: Cpu, tone: 'cyan', trend: '-8.4%' },
    { label: 'RAM usage', value: '68.4%', detail: 'of allocated capacity', icon: Database, tone: 'blue', trend: '+2.1%' },
    { label: 'Disk usage', value: '71.2%', detail: 'average utilization', icon: HardDrive, tone: 'amber', trend: '-1.6%' },
    { label: 'Network traffic', value: '1.84 GB/s', detail: 'across monitored links', icon: Network, tone: 'green', trend: '+6.8%' },
    { label: 'Active alerts', value: '7', detail: '3 require attention', icon: Bell, tone: 'amber', trend: '-12%' },
    { label: 'Device count', value: '126', detail: 'networked devices', icon: Network, tone: 'cyan', trend: '+8' },
    { label: 'Server count', value: '48', detail: 'managed servers', icon: Server, tone: 'green', trend: '+2' },
  ]
function Dashboard() {
  const location = useLocation(); const [dashboardData, setDashboardData] = useState(defaultDashboardData); const [refreshing, setRefreshing] = useState(false)
  const refresh = async () => {
    setRefreshing(true)
    const nextData = await safeAsyncCall(() => mockApi.getDashboard(), defaultDashboardData)
    setDashboardData(nextData || defaultDashboardData)
    setRefreshing(false)
  }
  useEffect(() => { refresh() }, [])
  if (location.pathname === '/monitoring') return <MonitoringPage />
  if (location.pathname === '/alerts') return <AlertsPage />
  if (location.pathname === '/reports') return <ReportsPage />
  if (location.pathname === '/audit') return <AuditLogPage />
  if (location.pathname === '/settings') return <SettingsPage />

  const liveValues = { 'CPU usage': `${dashboardData.cpu}%`, 'RAM usage': `${dashboardData.ram}%`, 'Disk usage': `${dashboardData.disk}%`, 'Network traffic': dashboardData.traffic, 'Active alerts': dashboardData.alerts, 'Device count': dashboardData.devices, 'Server count': dashboardData.servers }
  const performanceSeries = [
    { label: 'CPU Trend', value: `${dashboardData.cpu}%`, detail: 'Across 12 clusters', color: '#28d8c0', data: [{ name: 'Jan', value: 32 }, { name: 'Feb', value: 36 }, { name: 'Mar', value: 33 }, { name: 'Apr', value: 41 }, { name: 'May', value: 49 }, { name: 'Jun', value: 45 }, { name: 'Jul', value: 52 }, { name: 'Aug', value: 57 }, { name: 'Sep', value: 59 }, { name: 'Oct', value: 63 }] },
    { label: 'Memory Trend', value: `${dashboardData.ram}%`, detail: 'Committed capacity', color: '#6e9ee8', data: [{ name: 'Jan', value: 53 }, { name: 'Feb', value: 58 }, { name: 'Mar', value: 56 }, { name: 'Apr', value: 60 }, { name: 'May', value: 64 }, { name: 'Jun', value: 67 }, { name: 'Jul', value: 69 }, { name: 'Aug', value: 70 }, { name: 'Sep', value: 73 }, { name: 'Oct', value: 68 }] },
    { label: 'Disk Trend', value: `${dashboardData.disk}%`, detail: 'Utilization baseline', color: '#e2a84d', data: [{ name: 'Jan', value: 44 }, { name: 'Feb', value: 48 }, { name: 'Mar', value: 47 }, { name: 'Apr', value: 55 }, { name: 'May', value: 60 }, { name: 'Jun', value: 63 }, { name: 'Jul', value: 66 }, { name: 'Aug', value: 71 }, { name: 'Sep', value: 72 }, { name: 'Oct', value: 74 }] },
    { label: 'Network Traffic', value: dashboardData.traffic, detail: 'Peak ingress rate', color: '#43be92', data: [{ name: 'Jan', value: 1.1 }, { name: 'Feb', value: 1.3 }, { name: 'Mar', value: 1.5 }, { name: 'Apr', value: 1.8 }, { name: 'May', value: 1.7 }, { name: 'Jun', value: 2.1 }, { name: 'Jul', value: 1.9 }, { name: 'Aug', value: 2.3 }, { name: 'Sep', value: 2.2 }, { name: 'Oct', value: 2.6 }] },
    { label: 'Alert Trend', value: `${dashboardData.alerts}`, detail: 'Operational noise', color: '#f06b68', data: [{ name: 'Jan', value: 5 }, { name: 'Feb', value: 7 }, { name: 'Mar', value: 6 }, { name: 'Apr', value: 8 }, { name: 'May', value: 9 }, { name: 'Jun', value: 7 }, { name: 'Jul', value: 6 }, { name: 'Aug', value: 8 }, { name: 'Sep', value: 7 }, { name: 'Oct', value: 6 }] },
    { label: 'Availability Trend', value: '99.98%', detail: 'Service reliability', color: '#6e9ee8', data: [{ name: 'Jan', value: 99.68 }, { name: 'Feb', value: 99.74 }, { name: 'Mar', value: 99.82 }, { name: 'Apr', value: 99.87 }, { name: 'May', value: 99.91 }, { name: 'Jun', value: 99.9 }, { name: 'Jul', value: 99.94 }, { name: 'Aug', value: 99.96 }, { name: 'Sep', value: 99.98 }, { name: 'Oct', value: 99.98 }] },
  ]

  return <div className="dashboard"><div className="dashboard-heading"><div><span className="auth-eyebrow">Tuesday, September 16, 2026</span><h1>Good morning, <span>Operations.</span></h1><p>Here is the latest pulse across your enterprise environment.</p></div><button className="outline-button" onClick={refresh} disabled={refreshing}><Activity size={16} />{refreshing ? 'Refreshing...' : 'Live refresh'}</button></div><div className="metric-grid">{metrics.map(metric => <MetricCard key={metric.label} {...metric} value={liveValues[metric.label] || metric.value} />)}</div><div className="executive-layout"><section className="dashboard-card performance-panel"><CardHeader eyebrow="Performance intelligence" title="Operational trends" /><div className="chart-grid">{performanceSeries.map((series) => <TrendChart key={series.label} {...series} />)}</div></section><ExecutiveSummaryPanel /></div><AssetInventoryModule /><div className="dashboard-grid"><TopologyMap /><MonitoringTable /><AlertConsole /><ServerStatus /><NetworkMap /><MonitoringSummary /><PingStatus /><Alerts /></div><SuccessStories /><TeamSection /><ContactSection /></div>
}

function TrendChart({ label, value, detail, color, data }) {
  const gradientId = `trend-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

  return <article className="trend-card"><div className="trend-header"><span>{label}</span><strong>{value}</strong></div><div className="trend-chart-shell"><ResponsiveContainer width="100%" height={110}><AreaChart data={data} margin={{ top: 8, right: 10, left: -14, bottom: 0 }}><defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.38" /><stop offset="100%" stopColor={color} stopOpacity="0.04" /></linearGradient></defs><CartesianGrid vertical={false} stroke="rgba(148,163,184,0.18)" strokeDasharray="3 3" /><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#718190', fontSize: 10 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: '#718190', fontSize: 10 }} hide /><Tooltip contentStyle={{ backgroundColor: '#0d2436', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 12, color: '#edf6fb' }} labelStyle={{ color: '#edf6fb' }} /><Legend wrapperStyle={{ fontSize: '10px', color: '#718190' }} /><Area type="monotone" dataKey="value" name={label} stroke={color} fill={`url(#${gradientId})`} strokeWidth={2.5} animationDuration={1000} animationEasing="ease-out" /></AreaChart></ResponsiveContainer></div><div className="trend-meta"><small>{detail}</small><span>{typeof data[data.length - 1].value === 'number' ? `${data[data.length - 1].value.toFixed(data[data.length - 1].value % 1 === 0 ? 0 : 2)}${label.includes('Traffic') ? ' GB/s' : label.includes('Availability') ? '%' : '%'}` : data[data.length - 1].value}</span></div></article>
}

function ExecutiveSummaryPanel() {
  const summaryItems = [
    { label: 'Availability', value: '99.98%', tone: 'green' },
    { label: 'MTTR', value: '14 min', tone: 'amber' },
    { label: 'Risk score', value: 'Low', tone: 'cyan' },
  ]

  return <section className="dashboard-card executive-summary-panel"><CardHeader eyebrow="Executive summary" title="Business impact" /><div className="summary-capsule"><div><strong>96%</strong><span>Service coverage</span></div><span className="health-badge">Healthy</span></div><div className="executive-list">{summaryItems.map((item) => <div className="executive-stat" key={item.label}><span>{item.label}</span><strong className={item.tone}>{item.value}</strong></div>)}</div><div className="executive-note"><ShieldCheck size={15} /><p>Incident backlog is down 18% this week and customer-facing latency remains within SLA thresholds.</p></div></section>
}

function TopologyMap() {
  const nodes = [
    { name: 'Core Switch', role: 'Primary', x: '50%', y: '18%', type: 'core' },
    { name: 'Firewall', role: 'Security', x: '18%', y: '52%', type: 'firewall' },
    { name: 'Servers', role: 'Compute', x: '38%', y: '78%', type: 'server' },
    { name: 'Cloud', role: 'Hybrid', x: '76%', y: '60%', type: 'cloud' },
  ]

  return <section className="dashboard-card topology-panel"><CardHeader eyebrow="Network topology" title="Infrastructure map" /><div className="topology-visual"><svg viewBox="0 0 500 260" className="topology-svg" aria-label="Infrastructure topology map" role="img"><path d="M245 52 L180 125 L126 165" /><path d="M245 52 L245 125 L210 185" /><path d="M245 52 L332 132 L390 158" /><path d="M180 125 L250 180 L332 132" /><path d="M126 165 L210 185 L250 180" /></svg>{nodes.map((node) => <div key={node.name} className={`topology-node ${node.type}`} style={{ left: node.x, top: node.y }}><span className="node-chip"><Network size={12} /></span><div><strong>{node.name}</strong><small>{node.role}</small></div></div>)}</div></section>
}

function MonitoringTable() {
  const rows = [
    { name: 'Core Edge Router', ip: '10.24.11.12', status: 'Operational', cpu: '42%', memory: '58%', lastCheck: '12 sec ago' },
    { name: 'Finance DB Cluster', ip: '10.24.19.02', status: 'Warning', cpu: '71%', memory: '76%', lastCheck: '28 sec ago' },
    { name: 'API Gateway', ip: '10.24.17.33', status: 'Operational', cpu: '39%', memory: '52%', lastCheck: '18 sec ago' },
    { name: 'Storage Array', ip: '10.24.24.08', status: 'Degraded', cpu: '66%', memory: '81%', lastCheck: '46 sec ago' },
    { name: 'Edge Firewall', ip: '10.24.08.21', status: 'Operational', cpu: '48%', memory: '55%', lastCheck: '7 sec ago' },
  ]

  return <section className="dashboard-card monitoring-table-card"><CardHeader eyebrow="Inventory" title="Monitoring table" /><div className="table-wrap"><table className="monitoring-table"><thead><tr><th>Device Name</th><th>IP Address</th><th>Status</th><th>CPU</th><th>Memory</th><th>Last Check</th></tr></thead><tbody>{rows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.ip}</td><td><span className={`status-pill ${row.status === 'Operational' ? 'green' : row.status === 'Warning' ? 'amber' : 'red'}`}>{row.status}</span></td><td>{row.cpu}</td><td>{row.memory}</td><td>{row.lastCheck}</td></tr>)}</tbody></table></div></section>
}

function AssetInventoryModule() {
  const rows = [
    { name: 'PRD-WEB-01', type: 'Server', vendor: 'Dell', model: 'PowerEdge R760', serial: 'DELL-RT-10784', status: 'Operational', warranty: '2028-02-09' },
    { name: 'RTR-EDGE-12', type: 'Router', vendor: 'Cisco', model: 'ASR 1002-X', serial: 'CISCO-9K-20491', status: 'Operational', warranty: '2027-11-14' },
    { name: 'SQL-CORE-02', type: 'Database', vendor: 'HPE', model: 'Apollo 4510 Gen10', serial: 'HPE-DB-55781', status: 'Warning', warranty: '2027-05-22' },
    { name: 'FILE-OPS-04', type: 'Storage', vendor: 'NetApp', model: 'AFF A800', serial: 'NETAPP-4187', status: 'Degraded', warranty: '2026-12-03' },
    { name: 'VPN-GW-03', type: 'Security', vendor: 'Palo Alto', model: 'PA-3220', serial: 'PAN-43199', status: 'Operational', warranty: '2028-03-08' },
  ]

  return <section className="dashboard-card inventory-card"><CardHeader eyebrow="Asset inventory" title="Managed hardware" /><div className="inventory-table-wrap"><table className="inventory-table"><thead><tr><th>Asset Name</th><th>Type</th><th>Vendor</th><th>Model</th><th>Serial Number</th><th>Status</th><th>Warranty</th></tr></thead><tbody>{rows.map((row) => <tr key={row.serial}><td>{row.name}</td><td>{row.type}</td><td>{row.vendor}</td><td>{row.model}</td><td>{row.serial}</td><td><span className={`status-pill ${row.status === 'Operational' ? 'green' : row.status === 'Warning' ? 'amber' : 'red'}`}>{row.status}</span></td><td>{row.warranty}</td></tr>)}</tbody></table></div></section>
}

function AlertConsole() {
  const alerts = [
    { level: 'Critical', title: 'Database replication lag detected', host: 'Finance DB Cluster', summary: 'Primary node is 6s behind the standby cluster.', time: '2 min ago' },
    { level: 'Warning', title: 'Storage capacity threshold reached', host: 'Storage Array', summary: 'Volume utilization crossed 80% on the cold storage tier.', time: '12 min ago' },
    { level: 'Information', title: 'Certificate auto-renewal successful', host: 'API Gateway', summary: 'TLS certificate renewed without service interruption.', time: '1 hr ago' },
  ]

  return <section className="dashboard-card alert-console-card"><CardHeader eyebrow="Response center" title="Alert console" /><div className="alert-console-filters"><span className="active">Critical</span><span>Warning</span><span>Information</span></div><div className="alert-console-list">{alerts.map((alert) => <div key={`${alert.level}-${alert.title}`} className="alert-console-item"><div className={`alert-icon ${alert.level.toLowerCase()}`}><AlertTriangle size={14} /></div><div className="alert-console-copy"><div className="alert-console-head"><strong>{alert.title}</strong><span className={`alert-badge ${alert.level.toLowerCase()}`}>{alert.level}</span></div><small>{alert.host}</small><p>{alert.summary}</p><time>{alert.time}</time></div></div>)}</div></section>
}

function PageHeader({ eyebrow, title, text, action }) { return <div className="page-heading"><div><span className="auth-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{action && (typeof action === 'string' ? <button className="outline-button">{action}</button> : action)}</div> }

function ReportsPage() {
  const [report, setReport] = useState({ daily: 99.98, weekly: 99.96, monthly: 99.98, incidents: 38, sla: 99.9, availability: [99.74, 99.79, 99.82, 99.87, 99.94, 99.96, 99.98] })

  useEffect(() => {
    const loadReport = async () => {
      const nextReport = await safeAsyncCall(() => mockApi.getReports(), report)
      if (nextReport) setReport({ ...report, ...nextReport })
    }
    loadReport()
  }, [])

  const exportPdf = (title) => {
    const content = `NOC Automation ${title}\nAvailability: ${report.monthly || 99.98}%\nSLA target: ${report.sla || 99.9}%\nIncidents resolved: ${report.incidents || 38}`
    const blob = new Blob([content], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `noc-${title.toLowerCase().replace(/\s+/g, '-')}.pdf`
    link.click()
    URL.revokeObjectURL(url)
  }

  const availabilityData = [{ name: 'W1', value: 99.7 }, { name: 'W2', value: 99.8 }, { name: 'W3', value: 99.84 }, { name: 'W4', value: 99.88 }, { name: 'W5', value: 99.92 }, { name: 'W6', value: 99.95 }, { name: 'W7', value: 99.98 }]

  return <div className="dashboard"><PageHeader eyebrow="Reports" title={<>Operational clarity<br /><span>on demand.</span></>} text="Shareable performance summaries for infrastructure, availability, and response." action={<button className="outline-button" onClick={() => exportPdf('Executive')}><Download size={15} />Export PDF</button>} /><div className="report-grid"><ReportCard period="Executive" value={`${report.monthly || 99.98}%`} detail="Platform availability across core services" onDownload={() => exportPdf('Executive')} /><ReportCard period="Monthly" value={`${report.monthly || 99.98}%`} detail="Availability across the last 30 days" onDownload={() => exportPdf('Monthly')} /><ReportCard period="SLA" value={`${report.sla || 99.9}%`} detail="Service level agreement target coverage" onDownload={() => exportPdf('SLA')} /></div><section className="dashboard-card report-chart"><CardHeader eyebrow="Monthly availability" title="Service availability" /><div className="report-chart-shell"><ResponsiveContainer width="100%" height={260}><AreaChart data={availabilityData} margin={{ top: 16, right: 12, left: -12, bottom: 0 }}><defs><linearGradient id="report-availability" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#28d8c0" stopOpacity="0.35" /><stop offset="100%" stopColor="#28d8c0" stopOpacity="0.05" /></linearGradient></defs><CartesianGrid vertical={false} stroke="rgba(148,163,184,0.18)" strokeDasharray="3 3" /><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#718190', fontSize: 10 }} /><YAxis domain={[99.6, 100]} tickLine={false} axisLine={false} tick={{ fill: '#718190', fontSize: 10 }} /><Tooltip contentStyle={{ backgroundColor: '#0d2436', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 12, color: '#edf6fb' }} /><Legend wrapperStyle={{ color: '#718190', fontSize: '10px' }} /><Area type="monotone" dataKey="value" name="Availability" stroke="#28d8c0" fill="url(#report-availability)" strokeWidth={2.5} animationDuration={900} /></AreaChart></ResponsiveContainer></div></section><div className="report-grid secondary-report-grid"><article className="dashboard-card report-summary-card"><CardHeader eyebrow="Executive report" title="Business impact" /><ul className="statement-list"><li><span>Customer uptime</span><strong>99.98%</strong></li><li><span>Incidents resolved</span><strong>{report.incidents || 38}</strong></li><li><span>MTTR</span><strong>14 min</strong></li><li><span>Risk posture</span><strong>Low</strong></li></ul></article><article className="dashboard-card report-summary-card"><CardHeader eyebrow="SLA report" title="Coverage" /><div className="sla-chart"><BarChart data={[{ name: 'Gold', value: 99.98 }, { name: 'Silver', value: 99.92 }, { name: 'Bronze', value: 99.86 }]} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="rgba(148,163,184,0.18)" strokeDasharray="3 3" /><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#718190', fontSize: 10 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: '#718190', fontSize: 10 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: '10px', color: '#718190' }} /><Bar dataKey="value" name="SLA" fill="#6e9ee8" radius={[10, 10, 0, 0]} animationDuration={900} /></BarChart></div></article></div></div> }
function ReportCard({ period, value, detail, onDownload }) { return <article className="report-card"><span className="auth-eyebrow">{period} report</span><strong>{value}</strong><p>{detail}</p><button className="outline-button" onClick={onDownload}>Export report <Database size={14} /></button></article> }
function AuditLogPage() {
  const auditRows = [
    { timestamp: '2026-09-17 06:02:14', username: 'admin@nocautomation.com', action: 'Login', resource: 'Portal access', result: 'Success' },
    { timestamp: '2026-09-17 05:44:28', username: 'operator@nocautomation.com', action: 'Role Updated', resource: 'User: priya.shah@nocautomation.com', result: 'Success' },
    { timestamp: '2026-09-17 05:16:10', username: 'viewer@nocautomation.com', action: 'Access Denied', resource: 'Firewall policy', result: 'Denied' },
    { timestamp: '2026-09-17 04:58:32', username: 'admin@nocautomation.com', action: 'Password Reset', resource: 'User: leo.martins@nocautomation.com', result: 'Success' },
    { timestamp: '2026-09-17 04:26:09', username: 'operator@nocautomation.com', action: 'Configuration Change', resource: 'Alert rule: Storage threshold', result: 'Success' },
    { timestamp: '2026-09-17 03:54:41', username: 'viewer@nocautomation.com', action: 'Login Failed', resource: 'Portal access', result: 'Failed' },
    { timestamp: '2026-09-17 03:33:18', username: 'admin@nocautomation.com', action: 'User Created', resource: 'User: samir.ali@nocautomation.com', result: 'Success' },
    { timestamp: '2026-09-17 03:11:02', username: 'operator@nocautomation.com', action: 'Logout', resource: 'Portal access', result: 'Success' },
  ]
  const [query, setQuery] = useState('')
  const [actionFilter, setActionFilter] = useState('All')
  const [resultFilter, setResultFilter] = useState('All')

  const filteredRows = auditRows.filter((row) => {
    const matchesQuery = `${row.timestamp} ${row.username} ${row.action} ${row.resource} ${row.result}`.toLowerCase().includes(query.toLowerCase())
    const matchesAction = actionFilter === 'All' || row.action === actionFilter
    const matchesResult = resultFilter === 'All' || row.result === resultFilter
    return matchesQuery && matchesAction && matchesResult
  })

  return <div className="dashboard"><PageHeader eyebrow="Audit" title={<>Security activity<br /><span>with full traceability.</span></>} text="Review user, configuration, and security events across your operations environment." action="Export log" /><section className="dashboard-card audit-panel"><div className="audit-toolbar"><div className="device-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search audit log..." /></div><select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}><option>All</option><option>Login</option><option>Logout</option><option>Login Failed</option><option>User Created</option><option>Password Reset</option><option>Role Updated</option><option>Configuration Change</option><option>Access Denied</option></select><select value={resultFilter} onChange={(event) => setResultFilter(event.target.value)}><option>All</option><option>Success</option><option>Failed</option><option>Denied</option></select></div><div className="audit-table-wrap"><table className="audit-table"><thead><tr><th>Timestamp</th><th>Username</th><th>Action</th><th>Resource</th><th>Result</th></tr></thead><tbody>{filteredRows.length ? filteredRows.map((row) => <tr key={`${row.timestamp}-${row.username}-${row.action}`}><td>{row.timestamp}</td><td>{row.username}</td><td>{row.action}</td><td>{row.resource}</td><td><span className={`status-pill ${row.result === 'Success' ? 'green' : row.result === 'Failed' ? 'red' : 'amber'}`}>{row.result}</span></td></tr>) : <tr><td colSpan="5" className="audit-empty">No audit entries match your current filters.</td></tr>}</tbody></table></div></section></div>
}
function PingStatus() { const locations = [['Chicago edge', '18 ms', 'green'], ['Frankfurt edge', '92 ms', 'green'], ['Singapore edge', '184 ms', 'amber']]; return <section className="dashboard-card ping-card"><CardHeader eyebrow="Connectivity" title="Ping status" action={{ label: 'View probes', href: '#monitoring' }} /><div className="ping-summary"><strong>99.97%</strong><span>average reachability</span></div><div className="ping-list">{locations.map(([name, latency, tone]) => <div key={name}><span className="server-status-dot" data-tone={tone} /><strong>{name}</strong><span>{latency}</span></div>)}</div></section> }
function NetworkMap() { const nodes = [['Chicago', 'green', '18 ms', 'node-chicago'], ['Frankfurt', 'green', '92 ms', 'node-frankfurt'], ['Singapore', 'amber', '184 ms', 'node-singapore'], ['New York', 'green', '36 ms', 'node-new-york']]; return <section className="dashboard-card network-map"><CardHeader eyebrow="Global topology" title="Monitoring map" action={{ label: 'Open monitoring', href: '/monitoring' }} /><div className="map-canvas"><div className="map-grid" /><div className="map-route route-one" /><div className="map-route route-two" /><div className="map-core"><Network size={18} /><span>CORE</span></div>{nodes.map(([name, tone, ping, position]) => <div className={`map-node ${position}`} key={name}><span className={`map-dot ${tone}`} /><strong>{name}</strong><small>{ping}</small></div>)}</div><div className="map-footer"><span><i className="green-dot" />Operational</span><span><i className="amber-dot" />Degraded</span><span>126 endpoints</span></div></section> }
function MonitoringPage() {
  const [devices, setDevices] = useState([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All')
  const [selected, setSelected] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    const loadDevices = async () => {
      const nextDevices = await safeAsyncCall(() => mockApi.getDevices(), [])
      const safeList = Array.isArray(nextDevices) ? nextDevices : []
      setDevices(safeList)
      if (safeList[0]) {
        setSelected(safeList[0])
        setDrawerOpen(true)
      }
    }
    loadDevices()
  }, [])

  const filtered = devices.filter(device => (status === 'All' || device.status === status) && `${device.name} ${device.id} ${device.type} ${device.location}`.toLowerCase().includes(query.toLowerCase()))

  const exportCsv = () => {
    if (!filtered.length) return
    const header = ['Asset', 'Type', 'Location', 'Status', 'CPU', 'Memory', 'Disk']
    const rows = filtered.map(device => [device.id, device.type, device.location, device.status, `${device.cpu}%`, `${device.ram}%`, `${device.disk}%`])
    const csv = [header, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'noc-assets.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return <div className="dashboard"><PageHeader eyebrow="Monitoring" title={<>Know what is<br /><span>happening now.</span></>} text="Live health signals from every monitored server, device, and network path." action={<button className="outline-button" onClick={exportCsv}><Download size={15} />Export CSV</button>} /><div className="metric-grid">{metrics.slice(0, 4).map(metric => <MetricCard key={metric.label} {...metric} />)}</div><NetworkMap /><div className="monitoring-layout"><section className="dashboard-card monitor-table"><CardHeader eyebrow="Monitored assets" title={`${filtered.length} devices online`} /><div className="monitor-toolbar"><div className="device-search"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search devices..." /></div><select value={status} onChange={event => setStatus(event.target.value)}><option>All</option><option>Operational</option><option>Degraded</option><option>Warning</option></select></div><div className="table-row table-head"><span>Asset</span><span>Type</span><span>Location</span><span>Health</span></div>{filtered.map(device => <button className={`table-row device-row ${selected?.id === device.id ? 'selected' : ''}`} key={device.id} onClick={() => { setSelected(device); setDrawerOpen(true) }}><strong>{device.id}</strong><span>{device.type}</span><span>{device.location}</span><span className={`status-pill ${device.status === 'Operational' ? 'green' : device.status === 'Warning' ? 'amber' : 'red'}`}>{device.status}</span></button>)}</section><aside className={`device-drawer ${drawerOpen ? 'open' : ''}`}><DeviceDetail device={selected} onClose={() => setDrawerOpen(false)} /></aside></div></div> }
function DeviceDetail({ device, onClose }) { if (!device) return <section className="dashboard-card device-detail"><div className="device-detail-header"><span className="auth-eyebrow">Device detail</span>{onClose && <button className="close-button" onClick={onClose} aria-label="Close detail panel"><X size={16} /></button>}</div><h2>Select a device</h2><p>Choose an asset from the inventory to inspect health and connectivity.</p></section>; return <section className="dashboard-card device-detail"><div className="device-detail-header"><div><span className="auth-eyebrow">Device detail</span><h2>{device.name}</h2><p>{device.id} &middot; {device.ip}</p></div>{onClose && <button className="close-button" onClick={onClose} aria-label="Close detail panel"><X size={16} /></button>}</div><span className={`status-pill ${device.status === 'Operational' ? 'green' : device.status === 'Warning' ? 'amber' : 'red'}`}>{device.status}</span><div className="detail-stats"><span><strong>{device.uptime}</strong><small>Uptime</small></span><span><strong>{device.ping} ms</strong><small>Ping latency</small></span><span><strong>{device.lastCheck}</strong><small>Last check</small></span></div><div className="detail-bars"><UsageBar label="CPU" value={device.cpu} tone="cyan" /><UsageBar label="RAM" value={device.ram} tone="blue" /><UsageBar label="Disk" value={device.disk} tone="amber" /></div><button className="outline-button">Open device history</button></section> }
function UsageBar({ label, value, tone }) { return <div className="usage-bar"><div><span>{label}</span><strong>{value}%</strong></div><i className={tone} style={{ width: `${value}%` }} /></div> }
function AlertsPageLegacy() { const [items, setItems] = useState([]); const [severity, setSeverity] = useState('All'); useEffect(() => { mockApi.getAlerts().then(setItems) }, []); const filtered = items.filter(item => severity === 'All' || item.severity === severity); return <div className="dashboard"><PageHeader eyebrow="Alerts" title={<>Resolve issues<br /><span>before impact.</span></>} text="Prioritized incidents and threshold events across the NOC estate." action="Acknowledge all" /><div className="alert-filters"><button className={severity === 'All' ? 'active' : ''} onClick={() => setSeverity('All')}>All <span>{items.length}</span></button>{['Critical', 'Warning', 'Information'].map(level => <button className={severity === level ? 'active' : ''} key={level} onClick={() => setSeverity(level)}>{level} <span>{items.filter(item => item.severity === level).length}</span></button>)}</div><div className="dashboard-grid"><section className="dashboard-card alerts-card"><CardHeader eyebrow="Current queue" title={`${filtered.length} active alerts`} /><div className="alert-list">{filtered.map(item => <div className="alert-row detailed-alert" key={item.id}><span className={`alert-icon ${item.severity.toLowerCase()}`}><AlertTriangle size={15} /></span><span><strong>{item.title}</strong><small>{item.device} &middot; {item.time}</small></span><span className="alert-state">{item.status}</span></div>)}</div></section><section className="dashboard-card alert-health"><CardHeader eyebrow="Response health" title="Alert performance" /><div className="alert-stat"><strong>14 min</strong><span>mean time to acknowledge</span></div><div className="alert-stat"><strong>96.4%</strong><span>alerts resolved within SLA</span></div><div className="summary-note"><Check size={15} /> Response targets are on track</div></section></div><section className="dashboard-card monitor-table"><CardHeader eyebrow="Alert history" title="Recent activity" /><div className="table-row table-head"><span>Incident</span><span>Severity</span><span>Device</span><span>Detail</span></div>{items.map(item => <div className="table-row" key={item.id}><strong>{item.title}</strong><span>{item.severity}</span><span>{item.device}</span><span>{item.detail}</span></div>)}</section></div> }
function AlertsPage() {
  const defaultItems = [
    {
      id: 1,
      title: 'Database replication lag detected',
      device: 'Finance DB Cluster',
      severity: 'Critical',
      status: 'Open',
      time: '2 min ago',
      owner: 'Jordan Miller',
      impact: 'Customer transactions may queue under latency spikes.',
      summary: 'Primary node is 6s behind the standby cluster. The replication gap is trending upward and is above the service threshold.',
      timeline: [
        { time: '06:02', text: 'Pager fired after replication delay crossed 5s' },
        { time: '06:06', text: 'Operator acknowledged and started failover review' },
        { time: '06:10', text: 'Database team placed primary under maintenance watch' },
      ],
    },
    {
      id: 2,
      title: 'Storage capacity threshold reached',
      device: 'Storage Array',
      severity: 'Warning',
      status: 'Acknowledged',
      time: '12 min ago',
      owner: 'Priya Shah',
      impact: 'Cold storage tier is above 80% usage and at risk of pressure.',
      summary: 'Volume utilization crossed 80% on the cold storage tier. Growth is accelerating and the next expansion is scheduled within the next maintenance window.',
      timeline: [
        { time: '05:48', text: 'Capacity forecast crossed 80% threshold' },
        { time: '05:56', text: 'Acknowledged by Priya Shah' },
        { time: '06:00', text: 'Storage expansion ticket opened' },
      ],
    },
    {
      id: 3,
      title: 'Certificate auto-renewal successful',
      device: 'API Gateway',
      severity: 'Information',
      status: 'Resolved',
      time: '1 hr ago',
      owner: 'Samira Khan',
      impact: 'No user impact expected.',
      summary: 'TLS certificate renewed successfully without a service interruption. All endpoints verified with successful handshake checks.',
      timeline: [
        { time: '04:58', text: 'Auto-renewal completed' },
        { time: '05:02', text: 'Gateway certificate chain verified' },
        { time: '05:05', text: 'Resolution recorded' },
      ],
    },
  ]

  const [items, setItems] = useState(defaultItems)
  const [severity, setSeverity] = useState('All')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(defaultItems[0]?.id ?? null)

  useEffect(() => {
    let active = true

    mockApi.getAlerts().then((data) => {
      if (!active || !Array.isArray(data) || !data.length) return
      setItems(data)
      setSelectedId(data[0].id)
    })

    return () => {
      active = false
    }
  }, [])

  const updateAlert = (id, nextState) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...nextState } : item))
  }

  const acknowledge = (id) => updateAlert(id, { status: 'Acknowledged' })
  const resolve = (id) => updateAlert(id, { status: 'Resolved' })
  const escalate = (id) => updateAlert(id, { status: 'Escalated', escalationLevel: 'Tier 2' })

  const filteredAlerts = (Array.isArray(items) ? items : []).filter((item) => {
    const matchesSeverity = severity === 'All' || item.severity === severity
    const searchText = `${item.title} ${item.device} ${item.owner} ${item.status}`.toLowerCase()
    const matchesQuery = searchText.includes(query.toLowerCase())
    return matchesSeverity && matchesQuery
  })

  const selectedAlert = filteredAlerts.find((item) => item.id === selectedId) || filteredAlerts[0] || null
  const timeline = Array.isArray(selectedAlert?.timeline) ? selectedAlert.timeline : []

  const severityCounts = ['Critical', 'Warning', 'Information'].reduce((accumulator, level) => {
    accumulator[level] = items.filter((item) => item.severity === level).length
    return accumulator
  }, {})

  return <div className="dashboard"><PageHeader eyebrow="Alerts" title={<>Resolve issues<br /><span>before impact.</span></>} text="Prioritized incidents and threshold events across the NOC estate." action={<button className="outline-button" type="button">Acknowledge all</button>} /><div className="metric-grid">{['Critical', 'Warning', 'Information'].map((level) => <article key={level} className="metric-card"><div className={`metric-icon ${level === 'Critical' ? 'red' : level === 'Warning' ? 'amber' : 'cyan'}`}><AlertTriangle size={18} /></div><div className="metric-card-top"><span>{level} Alerts</span><span className="trend positive">{severityCounts[level] || 0}</span></div><strong>{severityCounts[level] || 0}</strong><small>Active in queue</small></article>)}</div><div className="alert-center-layout"><section className="dashboard-card alerts-card"><CardHeader eyebrow="Current queue" title={`${filteredAlerts.length} active alerts`} /><div className="alert-filters"><button type="button" className={severity === 'All' ? 'active' : ''} onClick={() => setSeverity('All')}>All <span>{items.length}</span></button>{['Critical', 'Warning', 'Information'].map((level) => <button type="button" className={severity === level ? 'active' : ''} key={level} onClick={() => setSeverity(level)}>{level} <span>{severityCounts[level] || 0}</span></button>)}</div><div className="monitor-toolbar"><div className="device-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search alerts..." /></div></div><div className="alert-list">{filteredAlerts.length ? filteredAlerts.map((item) => <button type="button" className={`alert-row detailed-alert ${selectedAlert?.id === item.id ? 'selected' : ''}`} key={item.id} onClick={() => setSelectedId(item.id)}><span className={`alert-icon ${item.severity.toLowerCase()}`}><AlertTriangle size={15} /></span><span><strong>{item.title}</strong><small>{item.device} &middot; {item.time}</small></span><span className="alert-row-meta"><span className={`status-pill ${item.status === 'Resolved' ? 'green' : item.status === 'Escalated' ? 'amber' : item.status === 'Acknowledged' ? 'blue' : 'red'}`}>{item.status}</span></span></button>) : <div className="alert-empty-state">No alerts match the current search and filter.</div>}</div></section><section className="dashboard-card alert-details-card">{selectedAlert ? <><div className="detail-heading"><div><span className="auth-eyebrow">{selectedAlert.severity}</span><h2>{selectedAlert.title}</h2><p>{selectedAlert.device} &middot; {selectedAlert.time}</p></div><span className={`status-pill ${selectedAlert.status === 'Resolved' ? 'green' : selectedAlert.status === 'Escalated' ? 'amber' : selectedAlert.status === 'Acknowledged' ? 'blue' : 'red'}`}>{selectedAlert.status}</span></div><p className="alert-detail-copy">{selectedAlert.summary}</p><div className="detail-grid"><div><span>Impact</span><strong>{selectedAlert.impact}</strong></div><div><span>Owner</span><strong>{selectedAlert.owner}</strong></div></div><div className="detail-actions"><button type="button" className="outline-button" onClick={() => acknowledge(selectedAlert.id)}>Acknowledge</button><button type="button" className="outline-button" onClick={() => resolve(selectedAlert.id)}>Resolve</button><button type="button" className="outline-button" onClick={() => escalate(selectedAlert.id)}>Escalate</button></div><div className="detail-timeline"><h3>Timeline</h3>{timeline.length ? <ul>{timeline.map((entry) => <li key={`${selectedAlert.id}-${entry.time}-${entry.text}`}><span>{entry.time}</span><p>{entry.text}</p></li>)}</ul> : <p>No timeline entries for this alert.</p>}</div></> : <div className="alert-empty-state">No alert selected.</div>}</section></div><section className="dashboard-card monitor-table"><CardHeader eyebrow="Alert table" title="Operations queue" /><div className="table-wrap"><table className="audit-table"><thead><tr><th>Severity</th><th>Title</th><th>Device</th><th>Time</th><th>Status</th><th>Assigned To</th></tr></thead><tbody>{filteredAlerts.length ? filteredAlerts.map((alert) => <tr key={alert.id}><td><span className={`status-pill ${alert.severity === 'Critical' ? 'red' : alert.severity === 'Warning' ? 'amber' : 'blue'}`}>{alert.severity}</span></td><td>{alert.title}</td><td>{alert.device}</td><td>{alert.time}</td><td>{alert.status}</td><td>{alert.owner}</td></tr>) : <tr><td colSpan="6" className="audit-empty">No alerts match your current criteria.</td></tr>}</tbody></table></div></section></div>
}

function MetricCard({ label, value, detail, icon: Icon, tone, trend }) { return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><div className="metric-card-top"><span>{label}</span><span className={`trend ${trend.startsWith('+') ? 'positive' : 'negative'}`}>{trend}</span></div><strong>{value}</strong><small>{detail}</small></article> }
function CardHeader({ eyebrow, title, action }) { return <div className="card-header"><div><span>{eyebrow}</span><h2>{title}</h2></div>{action && <a href={action.href || '#'}>{action.label}</a>}</div> }
function ServerStatus() { const servers = [['PRD-WEB-01', 'Customer portal', 'Operational', 'green'], ['SQL-CORE-02', 'Finance database', 'Operational', 'green'], ['FILE-OPS-04', 'Operations file services', 'Degraded', 'amber'], ['DR-VAULT-01', 'Disaster recovery vault', 'Operational', 'green']]; return <section className="dashboard-card server-card" id="servers"><CardHeader eyebrow="Infrastructure" title="Server status" action={{ label: 'View all 48', href: '#servers' }} /><div className="server-list">{servers.map(([name, type, status, tone]) => <div className="server-row" key={name}><span className="server-status-dot" data-tone={tone} /><span className="server-name"><strong>{name}</strong><small>{type}</small></span><span className={`status-pill ${tone}`}>{status}</span><span className="server-pulse"><i /><i /><i /><i /><i /></span></div>)}</div></section> }
function UsageChart() { const bars = [34, 45, 41, 56, 48, 64, 58, 70, 54, 62, 74, 61, 68, 58, 73, 66, 78, 71, 68, 72, 63, 57, 64, 59]; return <section className="dashboard-card usage-card"><CardHeader eyebrow="Performance" title="Resource usage" action={{ label: 'Last 24 hours', href: '#usage' }} /><div className="chart-legend"><span><i className="legend-cyan" />CPU</span><span><i className="legend-blue" />Memory</span><span className="chart-value">68.4% avg.</span></div><div className="bar-chart">{bars.map((height, index) => <div className="bar-group" key={index}><i style={{ height: `${height}%` }} /><i style={{ height: `${Math.max(24, height - 17)}%` }} /></div>)}</div><div className="chart-axis"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>Now</span></div></section> }
function Alerts() { const alerts = [['SQL replication latency', 'SQL-CORE-02', '12 min ago', 'high'], ['Storage capacity above 70%', 'FILE-OPS-04', '38 min ago', 'medium'], ['TLS certificate expires in 14 days', 'PRD-WEB-01', '2 hrs ago', 'low']]; return <section className="dashboard-card alerts-card" id="alerts"><CardHeader eyebrow="Needs attention" title="Active alerts" action={{ label: 'Open alert center', href: '#alerts' }} /><div className="alert-list">{alerts.map(([title, host, time, level]) => <div className="alert-row" key={title}><span className={`alert-icon ${level}`}><AlertTriangle size={15} /></span><span><strong>{title}</strong><small>{host} &middot; {time}</small></span><ChevronDown size={15} /></div>)}</div></section> }
function MonitoringSummary() { return <section className="dashboard-card summary-card"><CardHeader eyebrow="Coverage" title="Monitoring summary" /><div className="summary-ring"><div><strong>96%</strong><span>monitored</span></div></div><div className="summary-stats"><span><i className="green-dot" />48 servers</span><span><i className="cyan-dot" />32 services</span><span><i className="blue-dot" />86 checks</span></div><div className="summary-note"><Check size={15} /> Monitoring is healthy</div></section> }
function SuccessStories() { return <section className="stories-section" id="infrastructure"><div className="section-intro"><span className="auth-eyebrow">Customer outcomes</span><h2>Infrastructure that<br /><span>earns trust.</span></h2><p>Enterprise teams use NOC Automation to turn operational data into resilient services and confident decisions.</p></div><div className="story-grid"><article><span className="story-number">01</span><strong>42%</strong><h3>faster incident response</h3><p>Meridian Logistics unified network and server monitoring across 18 distribution sites, reducing mean time to resolution.</p><a href="#contact">Read the story <span>&rarr;</span></a></article><article><span className="story-number">02</span><strong>99.98%</strong><h3>critical platform availability</h3><p>HarborPoint Financial automated cloud health checks and recovery workflows across its customer-facing services.</p><a href="#contact">Read the story <span>&rarr;</span></a></article></div></section> }
function UserManagementPage() {
  const [tab, setTab] = useState('Users')
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState([
    { id: 1, name: 'Jordan Miller', email: 'jordan.miller@nocautomation.com', role: 'Admin', status: 'Active', lastLogin: '2026-09-17 06:02', activity: '42 actions' },
    { id: 2, name: 'Priya Shah', email: 'priya.shah@nocautomation.com', role: 'Operator', status: 'Active', lastLogin: '2026-09-17 05:46', activity: '31 actions' },
    { id: 3, name: 'Samira Khan', email: 'samira.khan@nocautomation.com', role: 'Viewer', status: 'Active', lastLogin: '2026-09-16 18:40', activity: '19 actions' },
    { id: 4, name: 'Diego Ruiz', email: 'diego.ruiz@nocautomation.com', role: 'Operator', status: 'Disabled', lastLogin: '2026-09-15 11:12', activity: '8 actions' },
  ])
  const [form, setForm] = useState({ name: '', email: '', role: 'Viewer' })
  const [notice, setNotice] = useState('')

  const visibleUsers = users.filter((user) => `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(query.toLowerCase()))

  const createUser = (event) => {
    event.preventDefault()
    if (!form.name.trim() || !form.email.trim()) return

    const nextUser = {
      id: Date.now(),
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      status: 'Active',
      lastLogin: 'Never',
      activity: '0 actions',
    }

    setUsers((current) => [nextUser, ...current])
    setForm({ name: '', email: '', role: 'Viewer' })
    setNotice(`User ${nextUser.name} created successfully.`)
  }

  const disableUser = (id) => {
    setUsers((current) => current.map((user) => user.id === id ? { ...user, status: user.status === 'Active' ? 'Disabled' : 'Active' } : user))
    setNotice('User status updated successfully.')
  }

  const resetPassword = (email) => {
    setNotice(`Password reset sent to ${email}.`)
  }

  const assignRole = (id, role) => {
    setUsers((current) => current.map((user) => user.id === id ? { ...user, role } : user))
    setNotice('Role updated successfully.')
  }

  const roles = [
    { name: 'Admin', description: 'Full access to health, alerting, users, and configuration.', count: users.filter((user) => user.role === 'Admin').length },
    { name: 'Operator', description: 'Can collaborate on incidents, responses, and monitoring actions.', count: users.filter((user) => user.role === 'Operator').length },
    { name: 'Viewer', description: 'Read-only access to dashboards, reports, and audit data.', count: users.filter((user) => user.role === 'Viewer').length },
  ]

  const permissions = [
    { section: 'Dashboard', items: ['View overview', 'View performance cards', 'Access live monitors'] },
    { section: 'Incidents', items: ['Acknowledge alerts', 'Escalate incidents', 'Resolve tickets'] },
    { section: 'Operations', items: ['Edit thresholds', 'Manage assets', 'Review audit log'] },
    { section: 'Administration', items: ['Create users', 'Assign roles', 'Reset passwords'] },
  ]

  return <div className="dashboard"><PageHeader eyebrow="User management" title={<>Control access across your<br /><span>operations teams.</span></>} text="Manage users, roles, and permissions from a single administrative workspace." action={<button className="outline-button" type="button">Invite user</button>} /><section className="dashboard-card settings-panel"><div className="settings-tabs">{['Users', 'Roles', 'Permissions'].map((item) => <button key={item} type="button" className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</div>{notice && <div className="success-message" style={{ marginBottom: 16 }}><span><Check size={18} /></span><div><strong>Update complete</strong><p>{notice}</p></div></div>}{tab === 'Users' && <div className="user-management-layout"><div className="user-form-card"><h3>Create user</h3><form onSubmit={createUser} className="user-create-form"><label className="settings-field"><span>Full name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Jamie Patel" /></label><label className="settings-field"><span>Email</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="jamie@nocautomation.com" /></label><label className="settings-field"><span>Role</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option>Admin</option><option>Operator</option><option>Viewer</option></select></label><button className="primary-button" type="submit">Create user <UserPlus size={16} /></button></form></div><div className="user-table-card"><div className="audit-toolbar"><div className="device-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users..." /></div></div><div className="table-wrap"><table className="monitoring-table"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last Login</th><th>Activity</th><th>Actions</th></tr></thead><tbody>{visibleUsers.map((user) => <tr key={user.id}><td><strong>{user.name}</strong><div className="table-subtle">{user.email}</div></td><td><select value={user.role} onChange={(event) => assignRole(user.id, event.target.value)}><option>Admin</option><option>Operator</option><option>Viewer</option></select></td><td><span className={`status-pill ${user.status === 'Active' ? 'green' : 'amber'}`}>{user.status}</span></td><td>{user.lastLogin}</td><td>{user.activity}</td><td><div className="user-actions"><button type="button" className="outline-button small-button" onClick={() => resetPassword(user.email)}>Reset</button><button type="button" className="outline-button small-button" onClick={() => disableUser(user.id)}>{user.status === 'Active' ? 'Disable' : 'Enable'}</button></div></td></tr>)}</tbody></table></div></div></div>}{tab === 'Roles' && <div className="grid-two-column"><div className="role-card-grid">{roles.map((role) => <div key={role.name} className="dashboard-card role-card"><span className={`role-badge role-${role.name === 'Admin' ? '0' : role.name === 'Operator' ? '1' : '2'}`}>{role.name.slice(0, 1)}</span><h3>{role.name}</h3><p>{role.description}</p><ul>{['Manage access', 'View reports', 'Audit trail'].map((item) => <li key={item}>{item}</li>)}</ul><strong>{role.count} users</strong></div>)}</div></div>}{tab === 'Permissions' && <div className="permission-grid">{permissions.map((group) => <div key={group.section} className="dashboard-card permission-card"><h3>{group.section}</h3><ul>{group.items.map((item) => <li key={item}><span>{item}</span><span className="status-pill green">Allowed</span></li>)}</ul></div>)}</div>}</section></div>
}
function SettingsPage() {
  const [workspace, setWorkspace] = useState('Enterprise Operations')
  const [timezone, setTimezone] = useState('UTC-05:00 (New York)')
  const [retention, setRetention] = useState('90 days')
  const [notifications, setNotifications] = useState(true)

  return <div className="dashboard"><PageHeader eyebrow="Settings" title={<>Configure your<br /><span>operations layer.</span></>} text="Tune automation, notification, and response policies across the enterprise workspace." action="Save changes" /><section className="dashboard-card settings-panel"><div className="settings-tabs"><button className="active" type="button">Workspace</button><button type="button">Integrations</button><button type="button">Security</button></div><div className="settings-layout"><div className="settings-column"><label className="settings-field"><span>Workspace name</span><input value={workspace} onChange={(event) => setWorkspace(event.target.value)} /></label><label className="settings-field"><span>Timezone</span><select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option>UTC-05:00 (New York)</option><option>UTC-00:00 (London)</option><option>UTC+01:00 (Frankfurt)</option><option>UTC+08:00 (Singapore)</option></select></label><label className="settings-field"><span>Incident retention</span><select value={retention} onChange={(event) => setRetention(event.target.value)}><option>30 days</option><option>60 days</option><option>90 days</option><option>180 days</option></select></label></div><div className="settings-column"><label className="settings-field checkbox-field"><span>Alert notifications</span><input type="checkbox" checked={notifications} onChange={(event) => setNotifications(event.target.checked)} /></label><div className="role-list"><div><span className="role-badge role-0">A</span><span><strong>Admin access</strong><small>Full control of policy, users, and automation.</small></span></div><div><span className="role-badge role-1">O</span><span><strong>Operator access</strong><small>Escalation, monitoring, and response workflows.</small></span></div><div><span className="role-badge role-2">V</span><span><strong>Viewer access</strong><small>Read-only dashboards and incident summaries.</small></span></div></div></div></div></section></div>
}
function TeamSection() { return <section className="team-section" id="team"><div className="section-intro"><span className="auth-eyebrow">Your operations team</span><h2>People who keep<br /><span>systems moving.</span></h2></div><div className="team-list"><div><span className="team-avatar teal">JM</span><span><strong>Jordan Miller</strong><small>Infrastructure Lead</small></span><span className="online"><i />Available</span></div><div><span className="team-avatar blue">SK</span><span><strong>Samira Khan</strong><small>Security Operations</small></span><span className="online"><i />Available</span></div><div><span className="team-avatar amber">DR</span><span><strong>Diego Ruiz</strong><small>Automation Architect</small></span><span className="online away"><i />In a meeting</span></div></div></section> }
function ContactSection() { return <section className="contact-banner" id="contact"><div><span className="auth-eyebrow">Talk to our team</span><h2>Make your next<br /><span>move with confidence.</span></h2><p>Talk to a NOC Automation specialist about network monitoring, cloud operations, security, and your next reliability goal.</p></div><a className="primary-button" href="mailto:operations@nocautomation.com">Contact operations <Zap size={16} /></a></section> }

export default App
