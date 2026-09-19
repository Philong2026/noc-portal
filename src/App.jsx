import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Activity, AlertTriangle, Bell, Check, ChevronDown, Cloud, Cpu, Database, Download, FileText, GitBranch, HardDrive, LayoutDashboard, LockKeyhole, LogOut, Menu, Moon, Network, Search, Server, Settings, ShieldCheck, Sun, UserPlus, Users, X, Zap } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import ReactFlow, { Background, Controls, Handle, MiniMap, Position, applyNodeChanges } from 'reactflow'
import 'reactflow/dist/style.css'
import { api } from './mockApi'

const TOKEN_KEY = 'noc-automation-token'
const USER_KEY = 'noc-automation-user'
const LOCAL_AUTH_KEY = 'noc-automation-local-auth'
const DATA_UNAVAILABLE = 'Data unavailable'
const defaultDashboardData = { cpu: '—', ram: '—', disk: '—', traffic: '—', alerts: '—', devices: '—', servers: '—', availability: '—', securityScore: '—', lastUpdated: '—' }
const demoAccounts = {
  svtelecom: { password: 'Admin123!', name: 'NOC SAO VÀNG', role: 'Administrator', username: 'svtelecom' },
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

const apiRequest = async (path, fallback) => {
  try {
    const response = await fetch(path, { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
    const payload = await response.json()
    return payload && typeof payload === 'object' ? payload : fallback
  } catch (error) {
    console.warn(`API request failed for ${path}:`, error)
    return fallback
  }
}

const formatMetricValue = (value, suffix = '') => {
  if (value === null || value === undefined || value === DATA_UNAVAILABLE) return '—'
  if (typeof value === 'number') return `${value}${suffix}`
  return String(value)
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

  const signIn = async (username, password) => {
    const normalizedUsername = String(username || '').trim().toLowerCase()
    const account = demoAccounts[normalizedUsername]

    if (!account || account.password !== password) {
      const error = new Error('Invalid username or password.')
      error.status = 401
      throw error
    }

    const localUser = { id: 'demo-administrator', name: account.name, email: account.username, username: account.username, role: account.role }
    const demoToken = 'local-demo-administrator'

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
    <Route element={<ProtectedRoute />}><Route path="/dashboard" element={<Dashboard />} /><Route path="/monitoring" element={<MonitoringPage />} /><Route path="/topology" element={<TopologyPage />} /><Route path="/alerts" element={<AlertsPage />} /><Route path="/assets" element={<AssetsPage />} /><Route path="/reports" element={<ReportsPage />} /><Route path="/audit" element={<AuditLogPage />} /><Route path="/users" element={<UserManagementPage />} /><Route path="/settings" element={<SettingsPage />} /><Route path="/profile" element={<ProfilePage />} /><Route path="/security" element={<SecurityPage />} /></Route>
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes></AuthProvider>
}
function ProtectedRoute() { const { authenticated, ready } = useAuth(); return !ready ? null : authenticated ? <AppShell /> : <Navigate to="/login" replace /> }

function AuthLayout({ eyebrow, title, text, children }) {
  return <main className="auth-page"><div className="auth-visual"><div className="visual-grid" /><div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" /><div className="auth-signal"><Activity size={22} /><span>NOC / SECURE</span></div><div className="auth-visual-copy"><span className="status-dot" />Always-on infrastructure operations.</div></div><section className="auth-panel"><Link to="/login" className="brand"><span className="brand-mark"><span /></span><span>NOC <span className="brand-accent">Automation</span></span></Link><div className="auth-copy"><span className="auth-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{children}<div className="auth-footer"><span>NOC Automation Operations Center</span><span>v2.4.0</span></div></section></main>
}
function Login() {
  const { signIn } = useAuth(); const navigate = useNavigate(); const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [pending, setPending] = useState(false)
  const submit = async event => { event.preventDefault(); setError(''); setPending(true); try { await signIn(username, password); navigate('/dashboard') } catch (requestError) { setError(requestError.message) } finally { setPending(false) } }
  return <AuthLayout eyebrow="Welcome back" title={<>Your network.<br /><span>Always ready.</span></>} text="Sign in to monitor infrastructure, investigate incidents, and keep critical services available."><form className="auth-form" onSubmit={submit}><Field label="Username" type="text" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} placeholder="svtelecom" required /><Field label="Password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" required /><div className="form-row"><label className="checkbox"><input type="checkbox" defaultChecked /> Remember me</label><Link to="/forgot-password">Forgot password?</Link></div>{error && <p className="form-error">{error}</p>}<button className="primary-button" type="submit" disabled={pending}>{pending ? 'Signing in...' : 'Sign in'} <Zap size={16} /></button><p className="switch-copy">New to NOC Automation? <Link to="/register">Create an account</Link></p></form></AuthLayout>
}
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
  const [open, setOpen] = useState(false); const [darkMode, setDarkMode] = useState(() => localStorage.getItem('noc-automation-theme') !== 'light'); const [notificationOpen, setNotificationOpen] = useState(false); const [profileMenuOpen, setProfileMenuOpen] = useState(false); const [notificationFilter, setNotificationFilter] = useState('All'); const [notifications, setNotifications] = useState([
  ]);  const [sidebarAlertCount, setSidebarAlertCount] = useState(0)
  const { user, signOut } = useAuth(); const location = useLocation(); const navigate = useNavigate(); const displayName = user?.name || 'NOC SAO VÀNG'; const displayRole = user?.role || 'Administrator'; const displayUsername = user?.username || 'svtelecom'
  useEffect(() => { window.scrollTo(0, 0); setOpen(false) }, [location.pathname])
  useEffect(() => {
    let active = true
    api.getAlerts().then((items) => {
      if (!active) return
      const list = Array.isArray(items) ? items : []
      const liveNotifications = list.slice(0, 5).map((item, index) => ({
        id: item.id ?? index,
        title: item.title,
        category: 'Alert Notifications',
        detail: item.summary || item.detail || '',
        time: item.time,
        unread: item.status === 'Open' || item.status === 'Active' || item.status === 'Acknowledged',
        owner: item.owner || 'Grafana',
        type: item.severity === 'Critical' ? 'Escalation' : 'Assignment',
      }))
      setNotifications(liveNotifications)
      const firingCount = list.filter((item) => item.status === 'Active' || item.status === 'Open' || item.status === 'Firing').length
      setSidebarAlertCount(firingCount)
    })
    return () => { active = false }
  }, [])
  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!event.target.closest('.user-menu-wrap')) {
        setProfileMenuOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setProfileMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])
  const toggleTheme = () => { const next = !darkMode; setDarkMode(next); localStorage.setItem('noc-automation-theme', next ? 'dark' : 'light') }
  const filteredNotifications = notifications.filter((item) => notificationFilter === 'All' || item.category === notificationFilter)
  const unreadCount = notifications.filter((item) => item.unread).length
  const markAllRead = () => setNotifications((current) => current.map((item) => ({ ...item, unread: false })))
  const markItemRead = (id) => setNotifications((current) => current.map((item) => item.id === id ? { ...item, unread: false } : item))
    const renderProtectedPage = () => {
      switch (location.pathname) {
        case '/monitoring': return <MonitoringPage />
        case '/topology': return <TopologyPage />
        case '/alerts': return <AlertsPage />
        case '/assets': return <AssetsPage />
        case '/reports': return <ReportsPage />
        case '/audit': return <AuditLogPage />
        case '/users': return <UserManagementPage />
        case '/settings': return <SettingsPage />
        case '/profile': return <ProfilePage />
        case '/security': return <SecurityPage />
        case '/dashboard':
        default: return <Dashboard />
      }
    }

    const handleSignOut = async () => {
      setProfileMenuOpen(false)
      await signOut()
      navigate('/login')
    }

    const profileItems = [
      { label: 'My Profile', href: '/profile' },
      { label: 'Preferences', href: '#', action: 'preferences' },
      { label: 'Security Settings', href: '#', action: 'security' },
      { label: 'Notification Preferences', href: '#', action: 'notifications' },
    ]

    return <div className={`app-shell ${darkMode ? 'dark-mode' : ''}`}><aside className={`sidebar ${open ? 'is-open' : ''}`}><div className="sidebar-top"><Link to="/dashboard" className="brand brand-light"><span className="brand-mark"><span /></span><span>NOC <span className="brand-accent">Automation</span></span></Link><button className="close-menu" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={20} /></button></div><div className="workspace-switcher"><span className="workspace-icon"><Network size={15} /></span><span><small>WORKSPACE</small><strong>Enterprise Operations</strong></span><ChevronDown size={16} /></div><nav className="sidebar-nav"><span className="nav-label">Monitor</span><NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}><LayoutDashboard size={17} />Dashboard</NavLink><NavLink to="/monitoring" className={({ isActive }) => isActive ? 'active' : ''}><Activity size={17} />Monitoring</NavLink><NavLink to="/topology" className={({ isActive }) => isActive ? 'active' : ''}><GitBranch size={17} />Topology</NavLink><NavLink to="/alerts" className={({ isActive }) => isActive ? 'active' : ''}><Bell size={17} />Alerts<span className="nav-count alert">{sidebarAlertCount}</span></NavLink><NavLink to="/assets" className={({ isActive }) => isActive ? 'active' : ''}><Server size={17} />Assets</NavLink><span className="nav-label">Analyze</span><NavLink to="/reports" className={({ isActive }) => isActive ? 'active' : ''}><Database size={17} />Reports</NavLink><NavLink to="/audit" className={({ isActive }) => isActive ? 'active' : ''}><FileText size={17} />Audit Log</NavLink><span className="nav-label">System</span><NavLink to="/users" className={({ isActive }) => isActive ? 'active' : ''}><Users size={17} />User Management</NavLink><NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : ''}><Settings size={17} />Settings</NavLink></nav><div className="sidebar-bottom"><Link to="/security" className="support-card" aria-label="Open Security Center"><ShieldCheck size={18} /><div><strong>All systems protected</strong><span>Last checked 2 min ago</span></div></Link><button className="signout" onClick={handleSignOut}><LogOut size={16} />Sign out</button></div></aside><div className="main-area"><header className="topbar"><button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={21} /></button><div className="topbar-search"><Search size={17} /><input placeholder="Search infrastructure..." /></div><div className="topbar-actions"><button className="icon-button" onClick={toggleTheme} aria-label={darkMode ? 'Use light mode' : 'Use dark mode'}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button><div className="notification-wrap"><button className="icon-button notification-button" onClick={() => setNotificationOpen((openState) => !openState)} aria-label="Notifications"><Bell size={18} />{unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}</button>{notificationOpen && <aside className="notification-panel"><div className="notification-header"><div><span className="auth-eyebrow">Center</span><h3>Notifications</h3></div><button type="button" className="outline-button small-button" onClick={markAllRead}>Mark all read</button></div><div className="notification-filters"><button type="button" className={notificationFilter === 'All' ? 'active' : ''} onClick={() => setNotificationFilter('All')}>All</button><button type="button" className={notificationFilter === 'Alert Notifications' ? 'active' : ''} onClick={() => setNotificationFilter('Alert Notifications')}>Alerts</button><button type="button" className={notificationFilter === 'Assignment' ? 'active' : ''} onClick={() => setNotificationFilter('Assignment')}>Assignments</button><button type="button" className={notificationFilter === 'Mentions' ? 'active' : ''} onClick={() => setNotificationFilter('Mentions')}>Mentions</button></div><div className="notification-list">{filteredNotifications.map((item) => <button type="button" key={item.id} className={`notification-item ${item.unread ? 'unread' : ''}`} onClick={() => markItemRead(item.id)}><div className="notification-icon"><Bell size={14} /></div><div className="notification-copy"><div className="notification-row"><strong>{item.title}</strong><span className="notification-type">{item.type}</span></div><small>{item.category}</small><p>{item.detail}</p><div className="notification-meta"><span>{item.owner}</span><time>{item.time}</time></div></div></button>)}</div></aside>}</div><div className="user-menu-wrap"><button type="button" className="user-menu" onClick={() => setProfileMenuOpen((current) => !current)} aria-label="Open user profile menu" aria-expanded={profileMenuOpen} aria-haspopup="menu"><span className="avatar">{displayName.slice(0, 2).toUpperCase()}</span><div><strong>{displayName}</strong><small>{displayRole}</small><small className="profile-username">@{displayUsername}</small></div><ChevronDown size={15} /></button>{profileMenuOpen && <div className="profile-menu" role="menu"><button type="button" className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); navigate('/profile') }} role="menuitem"><span>My Profile</span></button>{profileItems.filter((item) => item.label !== 'My Profile').map((item) => <button key={item.label} type="button" className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); if (item.href !== '#') navigate(item.href) }} role="menuitem"><span>{item.label}</span></button>)}<button type="button" className="profile-menu-item danger" onClick={handleSignOut} role="menuitem"><span>Sign Out</span></button></div>}</div></div></header><main className="dashboard-main">{renderProtectedPage()}</main></div>{open && <button className="mobile-scrim" onClick={() => setOpen(false)} aria-label="Close navigation overlay" />}</div>
  }

function ProfilePage() {
  const { user } = useAuth()
  const profileName = user?.name || 'NOC SAO VÀNG'
  const profileUsername = user?.username || 'svtelecom'
  const profileRole = user?.role || 'Administrator'

  return <div className="dashboard"><PageHeader eyebrow="Profile" title={<>Your profile<br /><span>and workspace preferences.</span></>} text="Review your identity, access scope, and preferred operational settings." action={<button className="outline-button" type="button">Edit profile</button>} /><section className="dashboard-card settings-panel"><div className="user-profile-layout"><div className="user-profile-card"><div className="user-avatar-large">{profileName.slice(0, 2).toUpperCase()}</div><div><span className="auth-eyebrow">Account</span><h2>{profileName}</h2><p>@{profileUsername}</p><span className="status-pill green">{profileRole}</span></div></div><div className="profile-details"><div className="settings-field"><span>Display name</span><input value={profileName} readOnly /></div><div className="settings-field"><span>Username</span><input value={profileUsername} readOnly /></div><div className="settings-field"><span>Role</span><input value={profileRole} readOnly /></div></div></div><div className="profile-actions"><button className="outline-button" type="button">Preferences</button><button className="outline-button" type="button">Security Settings</button><button className="outline-button" type="button">Notification Preferences</button></div></section></div>
}

function Dashboard() {
  const location = useLocation(); const [dashboardData, setDashboardData] = useState(defaultDashboardData); const [refreshing, setRefreshing] = useState(false)
  const refresh = async () => {
    setRefreshing(true)
    const nextData = await safeAsyncCall(() => api.getDashboard(), defaultDashboardData)
    // Any stale 'Data unavailable' strings from older payloads are normalized
    // to the '—' placeholder — the dashboard never renders that text anymore.
    const normalizedData = { ...defaultDashboardData, ...(nextData || defaultDashboardData) }
    Object.keys(normalizedData).forEach((key) => {
      if (normalizedData[key] === DATA_UNAVAILABLE) normalizedData[key] = '—'
    })
    normalizedData.lastUpdated = (nextData && nextData.lastUpdated) || new Date().toISOString()
    console.log('[Dashboard] Grafana dashboard payload', normalizedData)
    setDashboardData(normalizedData)
    setRefreshing(false)
  }
  useEffect(() => { refresh() }, [])
  if (location.pathname === '/monitoring') return <MonitoringPage />
  if (location.pathname === '/topology') return <TopologyPage />
  if (location.pathname === '/alerts') return <AlertsPage />
  if (location.pathname === '/reports') return <ReportsPage />
  if (location.pathname === '/audit') return <AuditLogPage />
  if (location.pathname === '/settings') return <SettingsPage />

  const hasValue = (val) => val !== undefined && val !== null && val !== '' && String(val) !== DATA_UNAVAILABLE
  const trafficValue = hasValue(dashboardData.traffic) ? dashboardData.traffic : '—'
  const alertsValue = hasValue(dashboardData.alerts) ? dashboardData.alerts : '—'
  const deviceValue = hasValue(dashboardData.devices) ? dashboardData.devices : '—'
  const availabilityValue = hasValue(dashboardData.availability) ? dashboardData.availability : '—'
  const securityScoreValue = hasValue(dashboardData.securityScore) ? dashboardData.securityScore : '—'
  const lastUpdatedValue = hasValue(dashboardData.lastUpdated) ? new Date(dashboardData.lastUpdated).toLocaleString() : '—'

  const metrics = [
    { label: 'CPU Usage', value: formatMetricValue(dashboardData.cpu, '%'), detail: 'across monitored hosts', icon: Cpu, tone: 'cyan', trend: 'Live' },
    { label: 'Memory Usage', value: formatMetricValue(dashboardData.ram, '%'), detail: 'of allocated capacity', icon: Database, tone: 'blue', trend: 'Live' },
    { label: 'Disk Usage', value: formatMetricValue(dashboardData.disk, '%'), detail: 'average utilization', icon: HardDrive, tone: 'amber', trend: 'Live' },
    { label: 'Network Traffic', value: trafficValue, detail: 'across monitored links', icon: Network, tone: 'green', trend: 'Live' },
    { label: 'Device Count', value: deviceValue, detail: 'networked devices', icon: Network, tone: 'cyan', trend: 'Live' },
    { label: 'Availability', value: formatMetricValue(dashboardData.availability, '%'), detail: 'interface operational ratio', icon: ShieldCheck, tone: 'green', trend: 'Live' },
    { label: 'Active Alerts', value: alertsValue, detail: 'current queue', icon: Bell, tone: 'amber', trend: 'Live' },
    { label: 'Security Score', value: securityScoreValue, detail: 'security posture', icon: LockKeyhole, tone: 'blue', trend: 'Live' },
  ]

  const liveValues = {
    'CPU Usage': formatMetricValue(dashboardData.cpu, '%'),
    'Memory Usage': formatMetricValue(dashboardData.ram, '%'),
    'Disk Usage': formatMetricValue(dashboardData.disk, '%'),
    'Network Traffic': trafficValue,
    'Device Count': deviceValue,
    'Availability': formatMetricValue(dashboardData.availability, '%'),
    'Active Alerts': alertsValue,
    'Security Score': securityScoreValue,
  }
  console.log('[Dashboard] live Grafana widget values', liveValues)

  // Live trend series from Grafana range queries (dashboard.history).
  const history = dashboardData.history || {}
  const pointLabel = (iso) => {
    const date = new Date(iso)
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  const seriesFromHistory = (points, scale = 1) => (Array.isArray(points) ? points.map((point) => ({ name: pointLabel(point.t), value: Number(point.v) / scale })) : [])

  const cpuHistory = seriesFromHistory(history.cpu)
  const memoryHistory = seriesFromHistory(history.ram)
  const diskHistory = seriesFromHistory(history.disk)
  const trafficHistory = seriesFromHistory(history.traffic, 1e9) // bps -> Gbps
  const availabilityHistory = seriesFromHistory(history.availability)
  const alertsNumber = Number(alertsValue)
  const alertHistory = Number.isFinite(alertsNumber) ? [{ name: 'Now', value: alertsNumber }] : []

  const performanceSeries = [
    { label: 'CPU Trend', value: formatMetricValue(dashboardData.cpu, '%'), detail: 'Live Prometheus · last hour', color: '#28d8c0', data: cpuHistory },
    { label: 'Memory Trend', value: formatMetricValue(dashboardData.ram, '%'), detail: 'Live Prometheus · last hour', color: '#6e9ee8', data: memoryHistory },
    { label: 'Disk Trend', value: formatMetricValue(dashboardData.disk, '%'), detail: 'Live Prometheus · last hour', color: '#e2a84d', data: diskHistory },
    { label: 'Network Traffic', value: trafficValue, detail: 'Live SNMP ifHC counters', color: '#43be92', data: trafficHistory },
    { label: 'Alert Trend', value: String(alertsValue), detail: 'Open alert queue', color: '#f06b68', data: alertHistory },
    { label: 'Availability Trend', value: formatMetricValue(dashboardData.availability, '%'), detail: 'Live interface availability', color: '#6e9ee8', data: availabilityHistory },
  ]

  return <div className="dashboard"><div className="dashboard-heading"><div><span className="auth-eyebrow">Last updated: {lastUpdatedValue}</span><h1>Good morning, <span>Operations.</span></h1><p>Here is the latest pulse across your enterprise environment.</p></div><button className="outline-button" onClick={refresh} disabled={refreshing}><Activity size={16} />{refreshing ? 'Refreshing...' : 'Live refresh'}</button></div><div className="metric-grid">{metrics.map(metric => <MetricCard key={metric.label} {...metric} value={liveValues[metric.label] || metric.value} />)}</div><div className="executive-layout"><section className="dashboard-card performance-panel"><CardHeader eyebrow="Performance intelligence" title="Operational trends" /><div className="chart-grid">{performanceSeries.map((series) => <TrendChart key={series.label} {...series} />)}</div></section><ExecutiveSummaryPanel availability={availabilityValue} securityScore={securityScoreValue} activeAlerts={alertsValue} /></div><AssetInventoryModule /><SLADashboardModule /><div className="dashboard-grid"><TopologyMap /><MonitoringTable /><AlertConsole /><ServerStatus /><NetworkMap /><MonitoringSummary /><PingStatus /><Alerts /></div><SuccessStories /><TeamSection /><ContactSection /></div>
}

function TrendChart({ label, value, detail, color, data }) {
  const gradientId = `trend-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const points = Array.isArray(data) ? data : []
  const last = points.length ? points[points.length - 1] : null

  return <article className="trend-card"><div className="trend-header"><span>{label}</span><strong>{value}</strong></div><div className="trend-chart-shell">{points.length ? <ResponsiveContainer width="100%" height={110}><AreaChart data={data} margin={{ top: 8, right: 10, left: -14, bottom: 0 }}><defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.38" /><stop offset="100%" stopColor={color} stopOpacity="0.04" /></linearGradient></defs><CartesianGrid vertical={false} stroke="rgba(148,163,184,0.18)" strokeDasharray="3 3" /><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#718190', fontSize: 10 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: '#718190', fontSize: 10 }} hide /><Tooltip contentStyle={{ backgroundColor: '#0d2436', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 12, color: '#edf6fb' }} labelStyle={{ color: '#edf6fb' }} /><Legend wrapperStyle={{ fontSize: '10px', color: '#718190' }} /><Area type="monotone" dataKey="value" name={label} stroke={color} fill={`url(#${gradientId})`} strokeWidth={2.5} animationDuration={1000} animationEasing="ease-out" /></AreaChart></ResponsiveContainer> : <small className="trend-empty">No live series returned by Grafana for this window.</small>}</div><div className="trend-meta"><small>{detail}</small><span>{last ? (typeof last.value === 'number' ? `${last.value.toFixed(last.value % 1 === 0 ? 0 : 2)}${label.includes('Traffic') ? ' Gbps' : '%'}` : String(last.value)) : '—'}</span></div></article>
}

function ExecutiveSummaryPanel({ availability, securityScore, activeAlerts }) {
  const summaryItems = [
    { label: 'Availability', value: availability || '—', tone: 'green' },
    { label: 'Active alerts', value: activeAlerts || '—', tone: 'amber' },
    { label: 'Security score', value: securityScore || '—', tone: 'cyan' },
  ]

  return <section className="dashboard-card executive-summary-panel"><CardHeader eyebrow="Executive summary" title="Business impact" /><div className="summary-capsule"><div><strong>{availability || '—'}</strong><span>Service coverage</span></div><span className="health-badge">Healthy</span></div><div className="executive-list">{summaryItems.map((item) => <div className="executive-stat" key={item.label}><span>{item.label}</span><strong className={item.tone}>{item.value}</strong></div>)}</div><div className="executive-note"><ShieldCheck size={15} /><p>Incident backlog is down 18% this week and customer-facing latency remains within SLA thresholds.</p></div></section>
}

function TopologyMap() {
  const [devices, setDevices] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    api.getDevices().then((items) => { if (active) setDevices(Array.isArray(items) ? items : []) })
    return () => { active = false }
  }, [])

  // Same derivation as the /topology page — the dashboard widget is never a
  // placeholder: nodes, links, and layout come from the live inventory.
  const { nodes, links } = useMemo(() => deriveTopology(devices), [devices])
  const flow = useMemo(() => toReactFlowGraph({ nodes, links }), [nodes, links])
  const liveCount = nodes.filter((node) => deviceStatusTone(node.device) !== 'red').length

  return (
    <section className="dashboard-card topology-panel">
      <CardHeader eyebrow="Network topology" title="Live infrastructure map" action={{ label: 'Open topology', href: '/topology' }} />
      <div className="topology-flow topology-flow-widget">
        <ReactFlow
          nodes={flow.nodes}
          edges={flow.edges}
          nodeTypes={deviceNodeTypes}
          nodesDraggable={false}
          zoomOnScroll={false}
          preventScrolling={false}
          onNodeClick={() => navigate('/topology')}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          minZoom={0.3}
          maxZoom={1.8}
        >
          <Background color="#7ea4bd" gap={26} size={1.4} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <div className="map-footer" style={{ paddingLeft: '4px' }}>
        <span><i className="green-dot" />{liveCount}/{nodes.length} live targets</span>
        <span><i className="amber-dot" />{links.length} derived links</span>
        <span>Click a node or open the full map</span>
      </div>
    </section>
  )
}

function MonitoringTable() {
  const rows = [
    { name: 'CORE-ROUTER-01', ip: '103.122.160.129', status: 'Operational', cpu: '42%', memory: '58%', lastCheck: '12 sec ago' },
    { name: 'Finance DB Cluster', ip: '10.24.19.02', status: 'Warning', cpu: '71%', memory: '76%', lastCheck: '28 sec ago' },
    { name: 'API Gateway', ip: '10.24.17.33', status: 'Operational', cpu: '39%', memory: '52%', lastCheck: '18 sec ago' },
    { name: 'Storage Array', ip: '10.24.24.08', status: 'Degraded', cpu: '66%', memory: '81%', lastCheck: '46 sec ago' },
    { name: 'Edge Firewall', ip: '10.24.08.21', status: 'Operational', cpu: '48%', memory: '55%', lastCheck: '7 sec ago' },
  ]

  return <section className="dashboard-card monitoring-table-card"><CardHeader eyebrow="Inventory" title="Monitoring table" /><div className="table-wrap"><table className="monitoring-table"><thead><tr><th>Device Name</th><th>IP Address</th><th>Status</th><th>CPU</th><th>Memory</th><th>Last Check</th></tr></thead><tbody>{rows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.ip}</td><td><span className={`status-pill ${row.status === 'Operational' ? 'green' : row.status === 'Warning' ? 'amber' : 'red'}`}>{row.status}</span></td><td>{row.cpu}</td><td>{row.memory}</td><td>{row.lastCheck}</td></tr>)}</tbody></table></div></section>
}

function AssetInventoryModule() {
  const [rows, setRows] = useState([])
  useEffect(() => {
    let active = true
    api.getDevices().then((devices) => {
      if (!active) return
      setRows((Array.isArray(devices) ? devices : []).map((device) => ({
        name: device.name || device.id || '—',
        type: device.type || '—',
        vendor: device.vendor || '—',
        model: device.model || '—',
        serial: device.id || '—',
        status: device.status || 'Operational',
        warranty: device.warranty || '—',
      })))
    })
    return () => { active = false }
  }, [])

  return <section className="dashboard-card inventory-card"><CardHeader eyebrow="Asset inventory" title="Managed hardware" /><div className="inventory-table-wrap"><table className="inventory-table"><thead><tr><th>Asset Name</th><th>Type</th><th>Vendor</th><th>Model</th><th>Serial Number</th><th>Status</th><th>Warranty</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.serial}><td>{row.name}</td><td>{row.type}</td><td>{row.vendor}</td><td>{row.model}</td><td>{row.serial}</td><td><span className={`status-pill ${row.status === 'Operational' ? 'green' : row.status === 'Warning' ? 'amber' : 'red'}`}>{row.status}</span></td><td>{row.warranty}</td></tr>) : <tr><td colSpan="7">No live assets reported by Grafana.</td></tr>}</tbody></table></div></section>
}

function AlertConsole() {
  const [liveAlerts, setLiveAlerts] = useState([])
  useEffect(() => {
    let active = true
    api.getAlerts().then((items) => { if (active) setLiveAlerts(Array.isArray(items) ? items : []) })
    return () => { active = false }
  }, [])
  const alerts = liveAlerts.slice(0, 3).map((item) => ({
    level: item.severity || 'Information',
    title: item.title,
    host: item.device,
    summary: item.summary || item.detail || '',
    time: item.time,
  }))

  return <section className="dashboard-card alert-console-card"><CardHeader eyebrow="Response center" title="Alert console" /><div className="alert-console-filters"><span className="active">Critical</span><span>Warning</span><span>Information</span></div><div className="alert-console-list">{alerts.map((alert) => <div key={`${alert.level}-${alert.title}`} className="alert-console-item"><div className={`alert-icon ${alert.level.toLowerCase()}`}><AlertTriangle size={14} /></div><div className="alert-console-copy"><div className="alert-console-head"><strong>{alert.title}</strong><span className={`alert-badge ${alert.level.toLowerCase()}`}>{alert.level}</span></div><small>{alert.host}</small><p>{alert.summary}</p><time>{alert.time}</time></div></div>)}</div></section>
}

function PageHeader({ eyebrow, title, text, action }) { return <div className="page-heading"><div><span className="auth-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{action && (typeof action === 'string' ? <button className="outline-button">{action}</button> : action)}</div> }

function SLADashboardModule() {
  const [snapshot, setSnapshot] = useState(null)
  const [alertCount, setAlertCount] = useState(null)
  useEffect(() => {
    let active = true
    api.getDashboard().then((data) => { if (active) setSnapshot(data || {}) })
    api.getAlerts().then((items) => { if (active) setAlertCount(Array.isArray(items) ? items.length : 0) })
    return () => { active = false }
  }, [])

  const availability = snapshot ? Number.parseFloat(snapshot.availability) : NaN
  const availabilityValue = Number.isFinite(availability) ? availability : null
  const liveTone = availabilityValue === null ? 'amber' : 'green'

  const kpis = [
    { label: 'Monthly Availability', value: availabilityValue === null ? '—' : `${availabilityValue}%`, change: availabilityValue === null ? '—' : 'live', detail: 'Grafana snapshot', tone: liveTone },
    { label: 'MTTR', value: '—', change: '—', detail: 'requires alert timeline data', tone: 'amber' },
    { label: 'MTBF', value: '—', change: '—', detail: 'requires incident history', tone: 'amber' },
    { label: 'Incident Count', value: alertCount === null ? '—' : String(alertCount), change: 'live', detail: 'open alerts in queue', tone: 'blue' },
    { label: 'Service Health', value: availabilityValue === null ? '—' : `${Math.round(availabilityValue)}%`, change: availabilityValue === null ? '—' : 'live', detail: 'Grafana snapshot', tone: liveTone },
  ]

  const gaugeData = availabilityValue === null
    ? []
    : [{ label: 'Overall availability', value: availabilityValue, target: 99.9, color: '#28d8c0' }]

  const trendData = availabilityValue === null
    ? []
    : [{ month: 'Now', availability: availabilityValue, mttr: alertCount ?? 0, incidents: alertCount ?? 0 }]

  return <section className="dashboard-card sla-dashboard"><div className="card-header"><div><span className="auth-eyebrow">SLA performance</span><h2>Service assurance</h2></div><a href="#reports">View report</a></div><div className="sla-kpi-grid">{kpis.map((item) => <div key={item.label} className="sla-kpi-card"><span>{item.label}</span><strong>{item.value}</strong><div><b className={item.tone}>{item.change}</b><small>{item.detail}</small></div></div>)}</div><div className="sla-body"><div className="sla-gauges"><div className="sla-gauges-header"><h3>Service health</h3><span>Current threshold</span></div>{gaugeData.length ? gaugeData.map((item) => <GaugeCard key={item.label} {...item} />) : <div className="sla-gauge-card"><span>Grafana availability unavailable</span></div>}</div><div className="sla-trend"><div className="sla-gauges-header"><h3>Monthly trends</h3><span>Last 6 months</span></div><ResponsiveContainer width="100%" height={210}><AreaChart data={trendData} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}><defs><linearGradient id="sla-trend-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#28d8c0" stopOpacity="0.38" /><stop offset="100%" stopColor="#28d8c0" stopOpacity="0.04" /></linearGradient></defs><CartesianGrid vertical={false} stroke="rgba(148,163,184,0.18)" strokeDasharray="3 3" /><XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#718190', fontSize: 10 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: '#718190', fontSize: 10 }} domain={[99.5, 100]} /><Tooltip contentStyle={{ backgroundColor: '#0d2436', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 12, color: '#edf6fb' }} /><Area type="monotone" dataKey="availability" name="Availability" stroke="#28d8c0" fill="url(#sla-trend-fill)" strokeWidth={2.5} /></AreaChart></ResponsiveContainer></div></div></section>
}

function GaugeCard({ label, value, target, color }) {
  const radius = 34
  const circumference = 2 * Math.PI * radius
  const progress = Math.min(Math.max((value - 90) / 10, 0), 1)
  const dash = circumference * progress

  return <div className="sla-gauge-card"><div className="gauge-wrap"><svg viewBox="0 0 120 120" className="sla-gauge" aria-label={`${label} gauge`} role="img"><circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(148,163,184,0.22)" strokeWidth="10" /><circle cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth="10" strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round" transform="rotate(-90 60 60)" /></svg><div className="gauge-value"><strong>{value.toFixed(1)}%</strong><span>{target.toFixed(1)}% target</span></div></div><div className="gauge-meta"><span>{label}</span><b>{value >= target ? 'On target' : 'Watchlist'}</b></div></div>
}

function ReportsPage() {
  const [report, setReport] = useState({ daily: null, weekly: null, monthly: null, incidents: 0, sla: null })

  const fmtPct = (value) => (value === null || value === undefined || typeof value === 'string') ? String(value ?? '—') : `${value}%`

  useEffect(() => {
    const loadReport = async () => {
      const nextReport = await safeAsyncCall(() => api.getReports(), report)
      if (nextReport) setReport({ ...report, ...nextReport })
    }
    loadReport()
  }, [])

  const exportPdf = (title) => {
    const content = `NOC Automation ${title}\nAvailability (live Grafana): ${fmtPct(report.monthly)}\nSLA target: ${fmtPct(report.sla)}\nOpen alerts (live): ${report.incidents ?? 0}`
    const blob = new Blob([content], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `noc-${title.toLowerCase().replace(/\s+/g, '-')}.pdf`
    link.click()
    URL.revokeObjectURL(url)
  }

  const liveAvailability = Number.parseFloat(report.monthly)
  const availabilityData = Number.isFinite(liveAvailability) ? [{ name: 'Live', value: liveAvailability }] : []

  return <div className="dashboard"><PageHeader eyebrow="Reports" title={<>Operational clarity<br /><span>on demand.</span></>} text="Shareable performance summaries for infrastructure, availability, and response." action={<button className="outline-button" onClick={() => exportPdf('Executive')}><Download size={15} />Export PDF</button>} /><div className="report-grid"><ReportCard period="Executive" value={fmtPct(report.monthly)} detail="Platform availability across core services" onDownload={() => exportPdf('Executive')} /><ReportCard period="Monthly" value={fmtPct(report.monthly)} detail="Availability across the last 30 days" onDownload={() => exportPdf('Monthly')} /><ReportCard period="SLA" value={fmtPct(report.sla)} detail="Service level agreement target coverage" onDownload={() => exportPdf('SLA')} /></div><section className="dashboard-card report-chart"><CardHeader eyebrow="Monthly availability" title="Service availability" /><div className="report-chart-shell"><ResponsiveContainer width="100%" height={260}><AreaChart data={availabilityData} margin={{ top: 16, right: 12, left: -12, bottom: 0 }}><defs><linearGradient id="report-availability" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#28d8c0" stopOpacity="0.35" /><stop offset="100%" stopColor="#28d8c0" stopOpacity="0.05" /></linearGradient></defs><CartesianGrid vertical={false} stroke="rgba(148,163,184,0.18)" strokeDasharray="3 3" /><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#718190', fontSize: 10 }} /><YAxis domain={[99.6, 100]} tickLine={false} axisLine={false} tick={{ fill: '#718190', fontSize: 10 }} /><Tooltip contentStyle={{ backgroundColor: '#0d2436', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 12, color: '#edf6fb' }} /><Legend wrapperStyle={{ color: '#718190', fontSize: '10px' }} /><Area type="monotone" dataKey="value" name="Availability" stroke="#28d8c0" fill="url(#report-availability)" strokeWidth={2.5} animationDuration={900} /></AreaChart></ResponsiveContainer></div></section><div className="report-grid secondary-report-grid"><article className="dashboard-card report-summary-card"><CardHeader eyebrow="Executive report" title="Business impact" /><ul className="statement-list"><li><span>Customer uptime (live)</span><strong>{fmtPct(report.monthly)}</strong></li><li><span>Open alerts (live)</span><strong>{report.incidents ?? 0}</strong></li><li><span>MTTR</span><strong>—</strong></li><li><span>Risk posture</span><strong>{Number.isFinite(Number.parseFloat(report.monthly)) ? (Number.parseFloat(report.monthly) >= 99.5 ? 'Low' : Number.parseFloat(report.monthly) >= 98 ? 'Medium' : 'High') : '—'}</strong></li></ul></article><article className="dashboard-card report-summary-card"><CardHeader eyebrow="SLA report" title="Coverage" /><div className="sla-chart"><BarChart data={Number.isFinite(liveAvailability) ? [{ name: 'Live', value: liveAvailability }] : []} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="rgba(148,163,184,0.18)" strokeDasharray="3 3" /><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#718190', fontSize: 10 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: '#718190', fontSize: 10 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: '10px', color: '#718190' }} /><Bar dataKey="value" name="SLA" fill="#6e9ee8" radius={[10, 10, 0, 0]} animationDuration={900} /></BarChart></div></article></div></div> }
function ReportCard({ period, value, detail, onDownload }) { return <article className="report-card"><span className="auth-eyebrow">{period} report</span><strong>{value}</strong><p>{detail}</p><button className="outline-button" onClick={onDownload}>Export report <Database size={14} /></button></article> }
function AuditLogPage() {
  const auditRows = [
    { timestamp: '2026-09-17 06:02:14', username: 'svtelecom', action: 'Login', resource: 'Portal access', result: 'Success' },
    { timestamp: '2026-09-17 05:44:28', username: 'svtelecom', action: 'Role Updated', resource: 'Command center access', result: 'Success' },
    { timestamp: '2026-09-17 05:16:10', username: 'svtelecom', action: 'Access Verified', resource: 'Firewall policy', result: 'Confirmed' },
    { timestamp: '2026-09-17 04:58:32', username: 'svtelecom', action: 'Password Rotation', resource: 'Portal security', result: 'Success' },
    { timestamp: '2026-09-17 04:26:09', username: 'svtelecom', action: 'Configuration Review', resource: 'Alert rule: Storage threshold', result: 'Success' },
    { timestamp: '2026-09-17 03:54:41', username: 'svtelecom', action: 'Login Attempt', resource: 'Portal access', result: 'Verified' },
    { timestamp: '2026-09-17 03:33:18', username: 'svtelecom', action: 'Policy Update', resource: 'Access governance', result: 'Success' },
    { timestamp: '2026-09-17 03:11:02', username: 'svtelecom', action: 'Logout', resource: 'Portal access', result: 'Success' },
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
const normalizeDeviceStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase()

  if (['operational', 'online'].includes(normalized)) return 'Online'
  if (['warning', 'degraded'].includes(normalized)) return 'Warning'
  if (['critical', 'fault', 'down'].includes(normalized)) return 'Critical'
  if (['offline'].includes(normalized)) return 'Offline'
  return 'Online'
}

const getDeviceStatusTone = (value) => {
  if (value === 'Online') return 'green'
  if (value === 'Warning') return 'amber'
  if (value === 'Critical') return 'red'
  return 'offline'
}

const getLastIncident = (device) => {
  const defaultMap = {
    'Production Web 01': 'TCP queue spike resolved 2h ago',
    'SQL Core 02': 'Replication delay cleared 38m ago',
    'Edge Router 12': 'WAN failover tested 1h ago',
    'Operations File 04': 'Capacity threshold crossed 18m ago',
    'VPN Gateway 03': 'Fallback route restored 54m ago',
    'Application API 07': 'Traffic burst stabilized 1h ago',
  }

  return defaultMap[device?.name] || 'No recent incidents'
}

function MonitoringPage() {
  const [devices, setDevices] = useState([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All')
  const [selected, setSelected] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(true)

  useEffect(() => {
    const loadDevices = async () => {
      const nextPayload = await safeAsyncCall(() => apiRequest('/api/monitoring', { devices: [] }), { devices: [] })
      const rawDevices = Array.isArray(nextPayload?.devices) ? nextPayload.devices : Array.isArray(nextPayload) ? nextPayload : []
      const normalizedDevices = rawDevices.map((device) => ({
        ...device,
        status: normalizeDeviceStatus(device.status),
        healthScore: typeof device.healthScore === 'number' ? device.healthScore : Math.max(0, Math.min(100, 100 - Math.round(((device.cpu || 0) + (device.ram || 0) + (device.disk || 0)) / 3))),
        lastIncident: device.lastIncident || getLastIncident(device),
      }))

      setDevices(normalizedDevices)
      if (normalizedDevices[0]) {
        setSelected(normalizedDevices[0])
        setDrawerOpen(true)
      }
    }

    loadDevices()
  }, [])

  const filtered = devices.filter((device) => {
    const matchesStatus = status === 'All' || device.status === status
    const haystack = `${device.name} ${device.ip} ${device.type} ${device.location}`.toLowerCase()
    const matchesQuery = haystack.includes(query.toLowerCase())
    return matchesStatus && matchesQuery
  })

  const selectedDevice = filtered.find((device) => device.id === selected?.id) || filtered[0] || selected || null

  const responseTrend = (selectedDevice ? [
    { name: '00:00', value: Math.max(10, (selectedDevice.ping || 18) - 7) },
    { name: '00:15', value: Math.max(10, (selectedDevice.ping || 18) - 3) },
    { name: '00:30', value: selectedDevice.ping || 18 },
    { name: '00:45', value: Math.max(12, (selectedDevice.ping || 18) + 4) },
    { name: '01:00', value: Math.max(12, (selectedDevice.ping || 18) + 2) },
  ] : [
    { name: '00:00', value: 11 },
    { name: '00:15', value: 14 },
    { name: '00:30', value: 18 },
    { name: '00:45', value: 16 },
    { name: '01:00', value: 19 },
  ])

  const packetLossTrend = (selectedDevice ? [
    { name: '00:00', value: Math.max(0.1, ((selectedDevice.cpu || 38) / 100) * 1.8) },
    { name: '00:15', value: Math.max(0.1, ((selectedDevice.cpu || 38) / 100) * 2.4) },
    { name: '00:30', value: Math.max(0.1, ((selectedDevice.ram || 61) / 100) * 2.2) },
    { name: '00:45', value: Math.max(0.15, ((selectedDevice.cpu || 38) / 100) * 2.6) },
    { name: '01:00', value: Math.max(0.15, ((selectedDevice.ram || 61) / 100) * 2.8) },
  ] : [
    { name: '00:00', value: 0.2 },
    { name: '00:15', value: 0.4 },
    { name: '00:30', value: 0.3 },
    { name: '00:45', value: 0.5 },
    { name: '01:00', value: 0.4 },
  ])

  const exportCsv = () => {
    if (!filtered.length) return

    const header = ['Device Name', 'IP Address', 'Type', 'Status', 'CPU', 'Memory', 'Latency', 'Last Check', 'Last Incident']
    const rows = filtered.map((device) => [device.name, device.ip, device.type, device.status, `${device.cpu}%`, `${device.ram}%`, `${device.ping} ms`, device.lastCheck, device.lastIncident])
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'noc-monitoring.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return <div className="dashboard"><PageHeader eyebrow="Monitoring" title={<>Operational insight<br /><span>at a glance.</span></>} text="Live service health, device telemetry, and network quality across the enterprise estate." action={<button className="outline-button" type="button" onClick={exportCsv}><Download size={15} />Export CSV</button>} /><div className="monitoring-kpis"><div className="dashboard-card metric-card monitoring-kpi"><div className="metric-card-top"><span className="auth-eyebrow">Devices online</span></div><strong>{devices.filter((device) => device.status === 'Online').length}</strong><small>healthy endpoints</small></div><div className="dashboard-card metric-card monitoring-kpi"><div className="metric-card-top"><span className="auth-eyebrow">Warnings</span></div><strong>{devices.filter((device) => device.status === 'Warning').length}</strong><small>requires review</small></div><div className="dashboard-card metric-card monitoring-kpi"><div className="metric-card-top"><span className="auth-eyebrow">Critical</span></div><strong>{devices.filter((device) => device.status === 'Critical').length}</strong><small>action required</small></div><div className="dashboard-card metric-card monitoring-kpi"><div className="metric-card-top"><span className="auth-eyebrow">Avg health</span></div><strong>{Math.round(devices.reduce((total, device) => total + (device.healthScore || 0), 0) / (devices.length || 1))}%</strong><small>portfolio score</small></div></div><div className="monitoring-shell"><section className="dashboard-card monitor-table"><CardHeader eyebrow="Operational overview" title={`${filtered.length} monitored devices`} /><div className="monitor-toolbar"><div className="device-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, IP, or type..." /></div><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="All">All statuses</option><option value="Online">Online</option><option value="Warning">Warning</option><option value="Critical">Critical</option><option value="Offline">Offline</option></select></div><div className="monitoring-table-wrap"><div className="table-row table-head monitoring-row"><span>Device Name</span><span>IP Address</span><span>Type</span><span>Status</span><span>CPU</span><span>Memory</span><span>Latency</span><span>Last Check</span><span>Last Incident</span></div>{filtered.map((device) => <button className={`table-row device-row monitoring-row ${selectedDevice?.id === device.id ? 'selected' : ''}`} key={device.id} type="button" onClick={() => { setSelected(device); setDrawerOpen(true) }}><span className="device-name-cell"><strong>{device.name}</strong><small>{device.location}</small></span><span>{device.ip}</span><span>{device.type}</span><span><span className={`status-pill ${getDeviceStatusTone(device.status)}`}>{device.status}</span></span><span>{device.cpu}%</span><span>{device.ram}%</span><span>{device.ping} ms</span><span>{device.lastCheck}</span><span>{device.lastIncident}</span></button>)}</div></section><aside className={`device-drawer ${drawerOpen ? 'open' : ''}`}><DeviceDetail device={selectedDevice} onClose={() => setDrawerOpen(false)} /></aside></div><div className="monitoring-charts"><section className="dashboard-card monitoring-chart"><CardHeader eyebrow="Network quality" title="Response time" /><div className="monitor-chart-shell"><ResponsiveContainer width="100%" height={180}><AreaChart data={responseTrend} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}><defs><linearGradient id="monitor-response-gradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#50b9ff" stopOpacity={0.38} /><stop offset="100%" stopColor="#50b9ff" stopOpacity={0.04} /></linearGradient></defs><CartesianGrid vertical={false} stroke="rgba(148,163,184,0.18)" strokeDasharray="3 3" /><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#718190', fontSize: 10 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: '#718190', fontSize: 10 }} /><Tooltip contentStyle={{ backgroundColor: '#0d2436', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 12, color: '#edf6fb' }} /><Area type="monotone" dataKey="value" stroke="#50b9ff" fill="url(#monitor-response-gradient)" strokeWidth={2.5} /></AreaChart></ResponsiveContainer></div></section><section className="dashboard-card monitoring-chart"><CardHeader eyebrow="Packet integrity" title="Packet loss" /><div className="monitor-chart-shell"><ResponsiveContainer width="100%" height={180}><BarChart data={packetLossTrend} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="rgba(148,163,184,0.18)" strokeDasharray="3 3" /><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#718190', fontSize: 10 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: '#718190', fontSize: 10 }} /><Tooltip contentStyle={{ backgroundColor: '#0d2436', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 12, color: '#edf6fb' }} /><Bar dataKey="value" fill="#43be92" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></section></div></div>
}

function DeviceDetail({ device, onClose }) {
  if (!device) {
    return <section className="dashboard-card device-detail"><div className="device-detail-header"><span className="auth-eyebrow">Device detail</span>{onClose && <button className="close-button" onClick={onClose} aria-label="Close detail panel"><X size={16} /></button>}</div><h2>Select a device</h2><p>Choose a monitored asset to inspect its health score, throughput, and recent incidents.</p></section>
  }

  const status = device.status || 'Online'
  const tone = getDeviceStatusTone(status)
  const healthScore = typeof device.healthScore === 'number' ? device.healthScore : 96

  return <section className="dashboard-card device-detail"><div className="device-detail-header"><div><span className="auth-eyebrow">Device detail</span><h2>{device.name}</h2><p>{device.type} &middot; {device.ip}</p></div>{onClose && <button className="close-button" onClick={onClose} aria-label="Close detail panel"><X size={16} /></button>}</div><span className={`status-pill ${tone}`}>{status}</span><div className="detail-highlight"><div className="detail-stat"><span>Health score</span><strong>{healthScore}</strong></div><div className="detail-stat"><span>Uptime</span><strong>{device.uptime || '99.98%'}</strong></div><div className="detail-stat"><span>Latency</span><strong>{device.ping || 18} ms</strong></div></div><div className="detail-bars"><div className="usage-bar"><div><span>CPU</span><strong>{device.cpu || 0}%</strong></div><i className="cyan" style={{ width: `${device.cpu || 0}%` }} /></div><div className="usage-bar"><div><span>Memory</span><strong>{device.ram || 0}%</strong></div><i className="blue" style={{ width: `${device.ram || 0}%` }} /></div><div className="usage-bar"><div><span>Disk</span><strong>{device.disk || 0}%</strong></div><i className="amber" style={{ width: `${device.disk || 0}%` }} /></div></div><div className="detail-grid"><div><span>IP</span><strong>{device.ip}</strong></div><div><span>Location</span><strong>{device.location}</strong></div><div><span>Last check</span><strong>{device.lastCheck}</strong></div><div><span>Last incident</span><strong>{device.lastIncident}</strong></div></div><div className="detail-note"><span className="auth-eyebrow">Latest activity</span><p>{device.lastIncident || 'No recent incidents captured for this device.'}</p></div><button className="outline-button" type="button">Open device history</button></section>
}
function AlertsPage() {
  const defaultItems = []

  const [items, setItems] = useState(defaultItems)
  const [severity, setSeverity] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(defaultItems[0]?.id ?? null)

  useEffect(() => {
    let active = true

    apiRequest('/api/alerts', { items: defaultItems }).then((payload) => {
      if (!active) return
      const nextItems = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : defaultItems
      if (!nextItems.length) return
      setItems(nextItems)
      setSelectedId(nextItems[0].id)
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

  const statusCounts = {
    Active: items.filter((item) => item.status === 'Active' || item.status === 'Open' || item.status === 'Firing').length,
    Acknowledged: items.filter((item) => item.status === 'Acknowledged').length,
    Resolved: items.filter((item) => item.status === 'Resolved').length,
  }

  const severityCounts = ['Critical', 'Warning', 'Information'].reduce((accumulator, level) => {
    accumulator[level] = items.filter((item) => item.severity === level).length
    return accumulator
  }, {})

  const filteredAlerts = (Array.isArray(items) ? items : []).filter((item) => {
    const matchesSeverity = severity === 'All' || item.severity === severity
    const matchesStatus = statusFilter === 'All' || item.status === statusFilter || (statusFilter === 'Active' && (item.status === 'Open' || item.status === 'Firing'))
    const searchText = `${item.title} ${item.device} ${item.owner} ${item.status} ${item.source || ''}`.toLowerCase()
    const matchesQuery = searchText.includes(query.toLowerCase())
    return matchesSeverity && matchesStatus && matchesQuery
  })

  const selectedAlert = filteredAlerts.find((item) => item.id === selectedId) || filteredAlerts[0] || null
  const timeline = Array.isArray(selectedAlert?.timeline) ? selectedAlert.timeline : []

  return <div className="dashboard"><PageHeader eyebrow="Alerts" title={<>Resolve issues<br /><span>before impact.</span></>} text="Real-time Grafana Alertmanager incidents and threshold events across the NOC estate." action={<button className="outline-button" type="button">Acknowledge all</button>} /><div className="metric-grid"><article className="metric-card"><div className="metric-icon red"><AlertTriangle size={18} /></div><div className="metric-card-top"><span>Active Alerts</span><span className="trend positive">{statusCounts.Active}</span></div><strong>{statusCounts.Active}</strong><small>Grafana Alertmanager firing</small></article><article className="metric-card"><div className="metric-icon blue"><AlertTriangle size={18} /></div><div className="metric-card-top"><span>Acknowledged</span><span className="trend positive">{statusCounts.Acknowledged}</span></div><strong>{statusCounts.Acknowledged}</strong><small>In review by operators</small></article><article className="metric-card"><div className="metric-icon green"><ShieldCheck size={18} /></div><div className="metric-card-top"><span>Resolved</span><span className="trend positive">{statusCounts.Resolved}</span></div><strong>{statusCounts.Resolved}</strong><small>Evaluated rules normal</small></article><article className="metric-card"><div className="metric-icon cyan"><Bell size={18} /></div><div className="metric-card-top"><span>Critical / Warning</span><span className="trend positive">{severityCounts.Critical + severityCounts.Warning}</span></div><strong>{severityCounts.Critical + severityCounts.Warning}</strong><small>Critical: {severityCounts.Critical || 0} &middot; Warning: {severityCounts.Warning || 0}</small></article></div><div className="alert-center-layout"><section className="dashboard-card alerts-card"><CardHeader eyebrow="Current queue" title={`${filteredAlerts.length} Grafana Alertmanager items`} /><div className="alert-filters"><span className="filter-group-label">Status:</span><button type="button" className={statusFilter === 'All' ? 'active' : ''} onClick={() => setStatusFilter('All')}>All <span>{items.length}</span></button><button type="button" className={statusFilter === 'Active' ? 'active' : ''} onClick={() => setStatusFilter('Active')}>Active <span>{statusCounts.Active}</span></button><button type="button" className={statusFilter === 'Acknowledged' ? 'active' : ''} onClick={() => setStatusFilter('Acknowledged')}>Acked <span>{statusCounts.Acknowledged}</span></button><button type="button" className={statusFilter === 'Resolved' ? 'active' : ''} onClick={() => setStatusFilter('Resolved')}>Resolved <span>{statusCounts.Resolved}</span></button></div><div className="alert-filters" style={{ marginTop: '8px' }}><span className="filter-group-label">Severity:</span><button type="button" className={severity === 'All' ? 'active' : ''} onClick={() => setSeverity('All')}>All</button>{['Critical', 'Warning', 'Information'].map((level) => <button type="button" className={severity === level ? 'active' : ''} key={level} onClick={() => setSeverity(level)}>{level} <span>{severityCounts[level] || 0}</span></button>)}</div><div className="monitor-toolbar" style={{ marginTop: '12px' }}><div className="device-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search alerts by title, host, owner, or status..." /></div></div><div className="alert-list">{filteredAlerts.length ? filteredAlerts.map((item) => <button type="button" className={`alert-row detailed-alert ${selectedAlert?.id === item.id ? 'selected' : ''}`} key={item.id} onClick={() => setSelectedId(item.id)}><span className={`alert-icon ${item.severity.toLowerCase()}`}><AlertTriangle size={15} /></span><span><strong>{item.title}</strong><small>{item.device} &middot; {item.time}</small></span><span className="alert-row-meta"><span className="status-pill cyan" style={{ marginRight: '6px' }}>{item.source || 'grafana-alertmanager'}</span><span className={`status-pill ${item.status === 'Resolved' ? 'green' : item.status === 'Escalated' ? 'amber' : item.status === 'Acknowledged' ? 'blue' : 'red'}`}>{item.status}</span></span></button>) : <div className="alert-empty-state">No alerts match the current search and filter.</div>}</div></section><section className="dashboard-card alert-details-card">{selectedAlert ? <><div className="detail-heading"><div><span className="auth-eyebrow">{selectedAlert.severity} &middot; {selectedAlert.source || 'grafana-alertmanager'}</span><h2>{selectedAlert.title}</h2><p>{selectedAlert.device} &middot; {selectedAlert.time}</p></div><span className={`status-pill ${selectedAlert.status === 'Resolved' ? 'green' : selectedAlert.status === 'Escalated' ? 'amber' : selectedAlert.status === 'Acknowledged' ? 'blue' : 'red'}`}>{selectedAlert.status}</span></div><p className="alert-detail-copy">{selectedAlert.summary}</p><div className="detail-grid"><div><span>Impact</span><strong>{selectedAlert.impact}</strong></div><div><span>Owner / Receiver</span><strong>{selectedAlert.owner}</strong></div></div><div className="detail-actions"><button type="button" className="outline-button" onClick={() => acknowledge(selectedAlert.id)}>Acknowledge</button><button type="button" className="outline-button" onClick={() => resolve(selectedAlert.id)}>Resolve</button><button type="button" className="outline-button" onClick={() => escalate(selectedAlert.id)}>Escalate</button></div><div className="detail-timeline"><h3>Timeline</h3>{timeline.length ? <ul>{timeline.map((entry) => <li key={`${selectedAlert.id}-${entry.time}-${entry.text}`}><span>{entry.time}</span><p>{entry.text}</p></li>)}</ul> : <p>No timeline entries for this alert.</p>}</div></> : <div className="alert-empty-state">No alert selected.</div>}</section></div><section className="dashboard-card monitor-table"><CardHeader eyebrow="Alert table" title="Operations queue" /><div className="table-wrap"><table className="audit-table"><thead><tr><th>Severity</th><th>Title</th><th>Device</th><th>Source</th><th>Time</th><th>Status</th><th>Assigned Receiver</th></tr></thead><tbody>{filteredAlerts.length ? filteredAlerts.map((alert) => <tr key={alert.id}><td><span className={`status-pill ${alert.severity === 'Critical' ? 'red' : alert.severity === 'Warning' ? 'amber' : 'blue'}`}>{alert.severity}</span></td><td>{alert.title}</td><td>{alert.device}</td><td><span className="status-pill cyan">{alert.source || 'grafana-alertmanager'}</span></td><td>{alert.time}</td><td><span className={`status-pill ${alert.status === 'Resolved' ? 'green' : alert.status === 'Acknowledged' ? 'blue' : 'red'}`}>{alert.status}</span></td><td>{alert.owner}</td></tr>) : <tr><td colSpan="7" className="audit-empty">No alerts match your current criteria.</td></tr>}</tbody></table></div></section></div>
}

function MetricCard({ label, value, detail, icon: Icon, tone, trend }) { return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><div className="metric-card-top"><span>{label}</span><span className={`trend ${trend.startsWith('+') ? 'positive' : 'negative'}`}>{trend}</span></div><strong>{value}</strong><small>{detail}</small></article> }
function CardHeader({ eyebrow, title, action }) { return <div className="card-header"><div><span>{eyebrow}</span><h2>{title}</h2></div>{action && <a href={action.href || '#'}>{action.label}</a>}</div> }
function ServerStatus() { const [devices, setDevices] = useState([]); useEffect(() => { let active = true; api.getDevices().then((items) => { if (active) setDevices(Array.isArray(items) ? items : []) }); return () => { active = false } }, []); const servers = devices.slice(0, 4).map((device) => { const status = normalizeDeviceStatus(device.status); return [device.name || device.id || '—', device.type || '—', status, getDeviceStatusTone(status)] }); return <section className="dashboard-card server-card" id="servers"><CardHeader eyebrow="Infrastructure" title="Server status" action={{ label: devices.length ? `View all ${devices.length}` : 'View devices', href: '#servers' }} /><div className="server-list">{servers.length ? servers.map(([name, type, status, tone]) => <div className="server-row" key={name}><span className="server-status-dot" data-tone={tone} /><span className="server-name"><strong>{name}</strong><small>{type}</small></span><span className={`status-pill ${tone}`}>{status}</span><span className="server-pulse"><i /><i /><i /><i /><i /></span></div>) : <div className="server-row"><span className="server-status-dot" data-tone="offline" /><span className="server-name"><strong>No devices reported</strong><small>Grafana snapshot unavailable</small></span><span className="status-pill offline">Offline</span></div>}</div></section> }
function UsageChart() { const [snapshot, setSnapshot] = useState(null); useEffect(() => { let active = true; api.getDashboard().then((data) => { if (active) setSnapshot(data || {}) }); return () => { active = false } }, []); const toPct = (value) => { const parsed = Number.parseFloat(value); return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0 }; const cpu = toPct(snapshot?.cpu); const ram = toPct(snapshot?.ram); const disk = toPct(snapshot?.disk); const bars = [cpu, ram, disk, Math.round((cpu + ram + disk) / 3)]; const live = snapshot && !snapshot.dataUnavailable; const avg = live ? `${Math.round((cpu + ram + disk) / 3 * 10) / 10}% avg.` : '—'; return <section className="dashboard-card usage-card"><CardHeader eyebrow="Performance" title="Resource usage" action={{ label: 'Live Grafana snapshot', href: '#usage' }} /><div className="chart-legend"><span><i className="legend-cyan" />CPU</span><span><i className="legend-blue" />Memory</span><span className="chart-value">{avg}</span></div><div className="bar-chart">{live ? bars.map((height, index) => <div className="bar-group" key={index}><i style={{ height: `${height}%` }} /><i style={{ height: `${Math.max(24, height - 17)}%` }} /></div>) : <div className="bar-group"><i style={{ height: '8%' }} /></div>}</div><div className="chart-axis"><span>CPU</span><span>Memory</span><span>Disk</span><span>Avg</span></div></section> }
function Alerts() { const [liveAlerts, setLiveAlerts] = useState([]); useEffect(() => { let active = true; api.getAlerts().then((items) => { if (active) setLiveAlerts(Array.isArray(items) ? items : []) }); return () => { active = false } }, []); const alerts = liveAlerts.slice(0, 3).map((item) => [item.title, item.device, item.time, item.severity === 'Critical' ? 'high' : item.severity === 'Warning' ? 'medium' : 'low']); return <section className="dashboard-card alerts-card" id="alerts"><CardHeader eyebrow="Needs attention" title="Active alerts" action={{ label: 'Open alert center', href: '#alerts' }} /><div className="alert-list">{alerts.length ? alerts.map(([title, host, time, level], index) => <div className="alert-row" key={`${title}-${index}`}><span className={`alert-icon ${level}`}><AlertTriangle size={15} /></span><span><strong>{title}</strong><small>{host} &middot; {time}</small></span><ChevronDown size={15} /></div>) : <div className="alert-row"><span className="alert-icon low"><Check size={15} /></span><span><strong>No active alerts</strong><small>Live alert queue is empty</small></span><ChevronDown size={15} /></div>}</div></section> }
function MonitoringSummary() { const [snapshot, setSnapshot] = useState(null); useEffect(() => { let active = true; api.getDashboard().then((data) => { if (active) setSnapshot(data || {}) }); return () => { active = false } }, []); const availability = snapshot ? Number.parseFloat(snapshot.availability) : NaN; const monitored = Number.isFinite(availability) ? `${Math.round(availability)}%` : '—'; const stat = (value) => (snapshot && Number.isFinite(Number.parseInt(value, 10)) ? value : '—'); const healthy = snapshot && Number.isFinite(availability) ? availability >= 95 : false; return <section className="dashboard-card summary-card"><CardHeader eyebrow="Coverage" title="Monitoring summary" /><div className="summary-ring"><div><strong>{monitored}</strong><span>monitored</span></div></div><div className="summary-stats"><span><i className="green-dot" />{stat(snapshot?.servers)} servers</span><span><i className="cyan-dot" />{stat(snapshot?.datasourceCount)} services</span><span><i className="blue-dot" />{stat(snapshot?.panelCount)} checks</span></div><div className="summary-note">{healthy ? <Check size={15} /> : <AlertTriangle size={15} />} {healthy ? 'Monitoring is healthy' : 'Grafana metrics unavailable'}</div></section> }
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
function AssetsPage() {
  const [assetList, setAssetList] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    api.getDevices().then((items) => {
      if (active) {
        setAssetList(Array.isArray(items) ? items : [])
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [])

  const categories = ['Asset List', 'Server Inventory', 'Network Devices', 'Storage Systems', 'Virtual Machines']
  const categoryMap = { 'Server Inventory': 'Server', 'Network Devices': 'Network Device', 'Storage Systems': 'Storage System', 'Virtual Machines': 'Virtual Machine' }
  const [category, setCategory] = useState('Asset List')
  const [query, setQuery] = useState('')
  const [vendorFilter, setVendorFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [selectedId, setSelectedId] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(true)

  useEffect(() => {
    if (assetList.length && !selectedId) {
      setSelectedId(assetList[0].id)
    }
  }, [assetList, selectedId])

  const visibleAssets = assetList.filter((asset) => {
    const matchesCategory = category === 'Asset List' || asset.type === categoryMap[category] || category === 'Asset List'
    const matchesVendor = vendorFilter === 'All' || asset.vendor === vendorFilter
    const matchesType = typeFilter === 'All' || asset.type === typeFilter
    const matchesStatus = statusFilter === 'All' || asset.status === statusFilter
    const haystack = `${asset.hostname || asset.name} ${asset.ip} ${asset.type} ${asset.vendor} ${asset.model} ${asset.monitoringSource || ''} ${asset.owner || ''}`.toLowerCase()
    const matchesQuery = haystack.includes(query.toLowerCase())
    return matchesCategory && matchesVendor && matchesType && matchesStatus && matchesQuery
  })

  const selectedAsset = visibleAssets.find((asset) => asset.id === selectedId) || visibleAssets[0] || null

  const exportCsv = () => {
    if (!visibleAssets.length) return
    const header = ['Hostname', 'IP Address', 'Status', 'Monitoring Source', 'Last Seen', 'Availability', 'Type', 'Vendor', 'Owner']
    const rows = visibleAssets.map((asset) => [asset.hostname || asset.name, asset.ip, asset.status, asset.monitoringSource || 'Prometheus / Grafana', asset.lastSeen || '12 sec ago', asset.availability || '100 %', asset.type || 'Infrastructure', asset.vendor || 'Cisco Systems', asset.owner || 'Operations'])
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'monitored-assets.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const getTone = (status) => status === 'Operational' ? 'green' : status === 'Warning' ? 'amber' : 'red'

  return <div className="dashboard"><PageHeader eyebrow="Monitored Assets" title={<>Real-time monitored infrastructure<br /><span>across enterprise domains.</span></>} text="Live target inventory sourced from Grafana, Prometheus, Zabbix hosts, and network telemetry endpoints." action={<button className="outline-button" type="button" onClick={exportCsv}><Download size={15} />Export CSV</button>} /><div className="asset-summary-grid"><div className="dashboard-card asset-summary-card"><span className="auth-eyebrow">Total monitored assets</span><strong>{loading ? '—' : assetList.length}</strong><small>Active targets</small></div><div className="dashboard-card asset-summary-card"><span className="auth-eyebrow">Operational</span><strong>{loading ? '—' : assetList.filter((a) => a.status === 'Operational').length}</strong><small>Healthy & responsive</small></div><div className="dashboard-card asset-summary-card"><span className="auth-eyebrow">At risk / warning</span><strong>{loading ? '—' : assetList.filter((a) => a.status !== 'Operational').length}</strong><small>Requires review</small></div><div className="dashboard-card asset-summary-card"><span className="auth-eyebrow">Avg availability</span><strong>{loading ? '—' : '100%'}</strong><small>Telemetry uptime</small></div></div><div className="monitoring-layout"><section className="dashboard-card monitor-table asset-table-card"><CardHeader eyebrow="Live target inventory" title={`${visibleAssets.length} ${category === 'Asset List' ? 'monitored targets' : category.toLowerCase()}`} /><div className="asset-tabs">{categories.map((item) => <button key={item} type="button" className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="asset-filter-bar"><div className="device-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by hostname, IP, or source..." /></div><div className="asset-filter-group"><select value={vendorFilter} onChange={(event) => setVendorFilter(event.target.value)}><option>All Vendors</option>{[...new Set(assetList.map((a) => a.vendor).filter(Boolean))].map((vendor) => <option key={vendor}>{vendor}</option>)}</select><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option>All Types</option>{[...new Set(assetList.map((a) => a.type).filter(Boolean))].map((type) => <option key={type}>{type}</option>)}</select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All Statuses</option>{['Operational', 'Warning', 'Degraded'].map((status) => <option key={status}>{status}</option>)}</select></div></div><div className="table-wrap"><table className="monitoring-table asset-table"><thead><tr><th>Hostname</th><th>IP Address</th><th>Status</th><th>Monitoring Source</th><th>Last Seen</th><th>Availability</th></tr></thead><tbody>{visibleAssets.length ? visibleAssets.map((asset) => <tr key={asset.id || asset.hostname} className={selectedAsset?.id === asset.id ? 'selected-row' : ''} onClick={() => { setSelectedId(asset.id); setDrawerOpen(true) }}><td><strong>{asset.hostname || asset.name}</strong><small>{asset.type || 'Node'}</small></td><td><strong>{asset.ip || '—'}</strong></td><td><span className={`status-pill ${getTone(asset.status)}`}>{asset.status || 'Operational'}</span></td><td>{asset.monitoringSource || 'Prometheus / Grafana'}</td><td>{asset.lastSeen || '12 sec ago'}</td><td><strong>{asset.availability || '100 %'}</strong></td></tr>) : <tr><td colSpan="6" className="audit-empty">{loading ? 'Loading live asset inventory...' : 'No monitored targets match the current search or filter.'}</td></tr>}</tbody></table></div></section><aside className={`device-drawer ${drawerOpen ? 'open' : ''}`}><AssetDetail asset={selectedAsset} onClose={() => setDrawerOpen(false)} /></aside></div></div>
}

function AssetDetail({ asset, onClose }) {
  if (!asset) return <section className="dashboard-card device-detail"><div className="device-detail-header"><span className="auth-eyebrow">Asset detail</span>{onClose && <button className="close-button" onClick={onClose} aria-label="Close detail panel"><X size={16} /></button>}</div><h2>Select a target</h2><p>Choose a monitored host to inspect telemetry, source details, and availability metrics.</p></section>

  const tone = asset.status === 'Operational' ? 'green' : asset.status === 'Warning' ? 'amber' : 'red'

  return <section className="dashboard-card device-detail asset-detail"><div className="device-detail-header"><div><span className="auth-eyebrow">Monitored Target Detail</span><h2>{asset.hostname || asset.name}</h2><p>{asset.ip} &middot; {asset.monitoringSource || 'Prometheus / Grafana'}</p></div>{onClose && <button className="close-button" onClick={onClose} aria-label="Close detail panel"><X size={16} /></button>}</div><span className={`status-pill ${tone}`}>{asset.status || 'Operational'}</span><div className="asset-detail-grid"><div><span>IP Address</span><strong>{asset.ip || '—'}</strong></div><div><span>Monitoring Source</span><strong>{asset.monitoringSource || 'Prometheus / Grafana'}</strong></div><div><span>Last Telemetry Check</span><strong>{asset.lastSeen || '12 sec ago'}</strong></div><div><span>Availability Uptime</span><strong>{asset.availability || '100 %'}</strong></div></div><div className="asset-detail-metrics"><div><strong>{asset.healthScore || 99}%</strong><span>Health Score</span></div><div><strong>{asset.type || 'Node'}</strong><span>Device Type</span></div><div><strong>{asset.owner || 'Operations'}</strong><span>Owner</span></div></div><div className="asset-detail-copy"><h3>Telemetry Details</h3><p>Active monitoring target scraped by Grafana and Prometheus tsdb. Operational checks verify ICMP reachability, SNMP link states, and host health indicators.</p><h3>Vendor & Model</h3><p>{asset.vendor || 'Cisco Systems'} &middot; {asset.model || 'Enterprise Gateway'}</p></div><button className="outline-button" type="button">Inspect Grafana Target Dashboard</button></section>
}

function SecurityPage() {
  const [security, setSecurity] = useState({
    securityScore: '—',
    activeThreats: '—',
    vulnerabilityCount: '—',
    securityHealth: '—',
    events: [],
  })

  useEffect(() => {
    let active = true

    apiRequest('/api/security', {
      securityScore: '—',
      activeThreats: '—',
      vulnerabilityCount: '—',
      securityHealth: '—',
      events: [],
    }).then((payload) => {
      if (!active) return
      setSecurity({
        securityScore: payload?.securityScore || '—',
        activeThreats: payload?.activeThreats || '—',
        vulnerabilityCount: payload?.vulnerabilityCount || '—',
        securityHealth: payload?.securityHealth || '—',
        events: Array.isArray(payload?.events) ? payload.events : [],
      })
    })

    return () => {
      active = false
    }
  }, [])

  const overview = [
    { label: 'Security score', value: String(security.securityScore), tone: 'green' },
    { label: 'Active threats', value: String(security.activeThreats), tone: 'amber' },
    { label: 'Vulnerabilities', value: String(security.vulnerabilityCount), tone: 'cyan' },
    { label: 'Security health', value: String(security.securityHealth), tone: 'green' },
  ]

  const vulnerabilities = [
    { title: 'Critical: SSH hardening', severity: 'Critical', status: 'Pending', owner: 'Samira Khan' },
    { title: 'Medium: API token rotation', severity: 'Medium', status: 'In review', owner: 'Jordan Miller' },
    { title: 'Low: Legacy certificate policy', severity: 'Low', status: 'Scheduled', owner: 'Priya Shah' },
  ]

  const events = security.events.length ? security.events : [
    { time: '06:12 UTC', event: 'Firewall policy update applied', source: 'Edge cluster', impact: 'Reduced risk score by 1.4%' },
    { time: '05:48 UTC', event: 'Threat intelligence match blocked', source: 'API edge', impact: 'No user impact' },
    { time: '05:17 UTC', event: 'Privilege escalation alert reviewed', source: 'Admin access', impact: 'Access restored and logged' },
    { time: '04:51 UTC', event: 'Vulnerability scan completed', source: 'Core servers', impact: 'Patch backlog reduced by 6%' },
  ]

  return <div className="dashboard"><PageHeader eyebrow="Security" title={<>Security center<br /><span>with full visibility.</span></>} text="Monitor policy posture, threat exposure, compliance coverage, and the latest security activity across the estate." action={<button className="outline-button" type="button">Run security scan</button>} /><div className="metric-grid">{overview.map((item) => <div key={item.label} className="dashboard-card metric-card monitoring-kpi"><div className="metric-card-top"><span className="auth-eyebrow">{item.label}</span></div><strong className={item.tone}>{item.value}</strong><small>{item.label === 'Active threats' ? 'requires response' : item.label === 'Vulnerabilities' ? 'to be remediated' : item.label === 'Security health' ? 'current posture' : 'current posture'}</small></div>)}</div><div className="dashboard-grid" style={{ marginTop: '17px' }}><section className="dashboard-card"><CardHeader eyebrow="Security overview" title="Operational posture" /><div className="summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', marginTop: '16px' }}><div className="detail-stat"><span>Patch status</span><strong>{security.securityHealth === '—' ? '—' : '94% compliant'}</strong></div><div className="detail-stat"><span>Compliance status</span><strong>ISO 27001 aligned</strong></div><div className="detail-stat"><span>Last scan</span><strong>06:15 UTC</strong></div><div className="detail-stat"><span>Threat model</span><strong>Low / monitored</strong></div></div></section><section className="dashboard-card"><CardHeader eyebrow="Vulnerability summary" title="Open findings" /><div className="alert-list" style={{ marginTop: '18px' }}>{vulnerabilities.map((item) => <div key={item.title} className="alert-row detailed-alert"><span className={`alert-icon ${item.severity.toLowerCase()}`}><ShieldCheck size={15} /></span><span><strong>{item.title}</strong><small>{item.owner} &middot; {item.status}</small></span><span className="alert-state">{item.severity}</span></div>)}</div></section></div><section className="dashboard-card" style={{ marginTop: '17px' }}><CardHeader eyebrow="Recent security events" title="Threat activity" /><div className="alert-list" style={{ marginTop: '18px' }}>{events.map((item) => <div key={`${item.time}-${item.event}`} className="alert-row detailed-alert"><span className="alert-icon cyan"><ShieldCheck size={15} /></span><span><strong>{item.event}</strong><small>{item.source} &middot; {item.time}</small></span><span className="event-impact">{item.impact}</span></div>)}</div></section></div>
}

function SettingsPage() {
  const [workspace, setWorkspace] = useState('Enterprise Operations')
  const [timezone, setTimezone] = useState('UTC-05:00 (New York)')
  const [retention, setRetention] = useState('90 days')
  const [notifications, setNotifications] = useState(true)

  return <div className="dashboard"><PageHeader eyebrow="Settings" title={<>Configure your<br /><span>operations layer.</span></>} text="Tune automation, notification, and response policies across the enterprise workspace." action="Save changes" /><section className="dashboard-card settings-panel"><div className="settings-tabs"><button className="active" type="button">Workspace</button><button type="button">Integrations</button><button type="button">Security</button></div><div className="settings-layout"><div className="settings-column"><label className="settings-field"><span>Workspace name</span><input value={workspace} onChange={(event) => setWorkspace(event.target.value)} /></label><label className="settings-field"><span>Timezone</span><select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option>UTC-05:00 (New York)</option><option>UTC-00:00 (London)</option><option>UTC+01:00 (Frankfurt)</option><option>UTC+08:00 (Singapore)</option></select></label><label className="settings-field"><span>Incident retention</span><select value={retention} onChange={(event) => setRetention(event.target.value)}><option>30 days</option><option>60 days</option><option>90 days</option><option>180 days</option></select></label></div><div className="settings-column"><label className="settings-field checkbox-field"><span>Alert notifications</span><input type="checkbox" checked={notifications} onChange={(event) => setNotifications(event.target.checked)} /></label><div className="role-list"><div><span className="role-badge role-0">A</span><span><strong>Admin access</strong><small>Full control of policy, users, and automation.</small></span></div><div><span className="role-badge role-1">O</span><span><strong>Operator access</strong><small>Escalation, monitoring, and response workflows.</small></span></div><div><span className="role-badge role-2">V</span><span><strong>Viewer access</strong><small>Read-only dashboards and incident summaries.</small></span></div></div></div></div></section></div>
}
// ---------------------------------------------------------------------------
// Topology graph derivation — built entirely from the LIVE monitored inventory
// returned by api.getDevices(). Node tiers come from the device type, links
// come from shared subnets + tier relationships, and the layout is computed.
// No per-device data is hardcoded: new/removed/renamed devices in the live
// inventory automatically appear in the graph.
// ---------------------------------------------------------------------------
const TOPOLOGY_VIEW = { width: 520, height: 340, padX: 30, top: 46, rowGap: 78 }
const TIER_META = [
  { label: 'Core routing', css: 'core' },
  { label: 'NOC switching', css: 'firewall' },
  { label: 'Edge & transit', css: 'cloud' },
  { label: 'DNS & compute', css: 'server' },
]
const deviceStatusTone = (device) => {
  const status = String((device && device.status) || '').toLowerCase()
  if (status === 'operational' || status === 'online' || status === 'up') return 'green'
  if (status === 'down' || status === 'offline' || status === 'unreachable') return 'red'
  return 'amber'
}
const deviceLatencyText = (device) => {
  if (device && typeof device.latencyMs === 'number' && Number.isFinite(device.latencyMs)) return `${device.latencyMs} ms`
  return (device && device.latency) || '—'
}

// ---------------------------------------------------------------------------
// React Flow adapter — converts deriveTopology() output (UNCHANGED) into
// React Flow nodes/edges. Node positions reuse the derivation's layered
// layout (scaled up for pixel-space); edges keep their per-kind styling.
// ---------------------------------------------------------------------------
const RF_SCALE = 1.6
const RF_EDGE_STYLES = {
  backbone: { stroke: 'rgba(40,216,192,0.85)', strokeWidth: 2.4 },
  uplink: { stroke: 'rgba(80,185,255,0.6)', strokeWidth: 2, strokeDasharray: '6 3' },
  edge: { stroke: 'rgba(40,216,192,0.35)', strokeWidth: 1.6, strokeDasharray: '4 2' },
  service: { stroke: 'rgba(226,168,77,0.5)', strokeWidth: 1.4, strokeDasharray: '2 3' },
}

function toReactFlowGraph(topology) {
  const nodes = topology.nodes.map((node) => ({
    id: node.id,
    type: 'device',
    position: { x: node.x * RF_SCALE, y: node.y * RF_SCALE },
    data: { node, device: node.device },
  }))
  const edges = topology.links.map((link) => ({
    id: `${link.from}-${link.to}`,
    source: link.from,
    target: link.to,
    type: 'straight',
    style: RF_EDGE_STYLES[link.kind] || RF_EDGE_STYLES.edge,
  }))
  return { nodes, edges }
}

function DeviceNode({ data, selected }) {
  const tone = deviceStatusTone(data.device)
  const toneColor = tone === 'green' ? 'var(--green)' : tone === 'red' ? 'var(--red)' : 'var(--amber)'
  return (
    <div className={`rf-device tone-${tone}${selected ? ' rf-device-selected' : ''}`} title={`${data.node.label} · ${data.node.ip} · ${data.node.subnet} · ${data.device.status || 'Unknown'}`}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <span className="rf-status-dot" style={{ background: toneColor }} />
      <div>
        <strong>{data.node.label}</strong>
        <small style={{ color: tone === 'red' ? 'var(--red)' : 'var(--teal)' }}>
          {data.device.status || 'Unknown'} · {deviceLatencyText(data.device)} · {data.device.availability || '—'}
        </small>
        <small>{data.node.ip || data.node.subnet}</small>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

const deviceNodeTypes = { device: DeviceNode }
const minimapNodeColor = (flowNode) => {
  const tone = flowNode && flowNode.data && flowNode.data.device ? deviceStatusTone(flowNode.data.device) : 'amber'
  return tone === 'red' ? '#f06868' : tone === 'green' ? '#43be92' : '#e2a84d'
}
const deviceTypeLower = (device) => String((device && (device.type || device.device_type)) || '').toLowerCase()
const deviceIpOf = (device) => String((device && (device.ip || device.ip_address || device.address)) || '').trim()
const deviceLabelOf = (device) => (device && (device.hostname || device.name || device.ip || device.id)) || 'unknown'
const subnetKeyOf = (device) => {
  if (device && device.topologySubnet) return device.topologySubnet
  const octets = deviceIpOf(device).match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/)
  if (octets) return `${octets[1]}.${octets[2]}.${octets[3]}.0/24`
  return `${((device && device.vendor) || 'unclassified').toLowerCase()} services`
}
const deviceTierOf = (device) => {
  const type = deviceTypeLower(device)
  if (type.includes('router')) return 0
  if (type.includes('switch')) return 1
  if (type.includes('dns')) return 3
  if (type.includes('edge') || type.includes('gateway')) return 2
  return 3
}

function deriveTopology(devices) {
  const nodes = (Array.isArray(devices) ? devices : []).map((device) => ({
    id: String(device.id || deviceLabelOf(device)),
    device,
    label: deviceLabelOf(device),
    ip: deviceIpOf(device),
    type: device.type || 'Device',
    tier: deviceTierOf(device),
    subnet: subnetKeyOf(device),
    x: 0,
    y: 0,
  }))
  const tierList = (tier) => nodes.filter((node) => node.tier === tier)
  const routers = tierList(0)
  const switches = tierList(1)
  const dnsNodes = nodes.filter((node) => deviceTypeLower(node.device).includes('dns'))
  const servers = tierList(3).filter((node) => !dnsNodes.includes(node))

  const seen = new Set()
  const links = []
  const addLink = (source, target, kind, note) => {
    if (!source || !target || source.id === target.id) return
    const pair = [source.id, target.id].sort().join('->')
    if (seen.has(pair)) return
    seen.add(pair)
    links.push({ from: source.id, to: target.id, source, target, kind, note })
  }
  const sameSubnet = (a, b) => a.subnet === b.subnet

  // 1) Backbone: full mesh between same-subnet routers (10.24.11.0/24).
  routers.forEach((router, index) => routers.slice(index + 1).forEach((peer) => {
    if (sameSubnet(router, peer)) addLink(router, peer, 'backbone', 'Core 10G trunk')
  }))
  // 2) Distribution: switches uplink to same-subnet routers + inter-switch trunk.
  switches.forEach((sw) => routers.filter((router) => sameSubnet(router, sw)).forEach((router) => addLink(sw, router, 'uplink', '10G uplink')))
  switches.forEach((sw, index) => switches.slice(index + 1).forEach((peer) => {
    if (sameSubnet(sw, peer)) addLink(sw, peer, 'uplink', 'Switch interconnect')
  }))
  // 3) Edge/transit: each edge subnet spreads round-robin over the switch tier
  //    (routers take over when no switch is monitored).
  const uplinkParents = switches.length ? switches : routers
  const edgeGroups = new Map()
  tierList(2).forEach((edge) => {
    if (!edgeGroups.has(edge.subnet)) edgeGroups.set(edge.subnet, [])
    edgeGroups.get(edge.subnet).push(edge)
  })
  edgeGroups.forEach((group) => group.forEach((edge, index) => {
    if (!uplinkParents.length) return
    addLink(edge, uplinkParents[index % uplinkParents.length], 'edge', 'Transit subnet uplink')
  }))
  // 4) Services: DNS probes hang off the routing tier, compute/monitoring
  //    servers off the switching tier (management plane).
  dnsNodes.forEach((dns, index) => {
    const parents = routers.length ? routers : uplinkParents
    if (parents.length) addLink(dns, parents[index % parents.length], 'service', 'Anycast DNS probe')
  })
  servers.forEach((server, index) => {
    const parents = switches.length ? switches : routers
    if (parents.length) addLink(server, parents[index % parents.length], 'service', 'Management plane')
  })

  // Layered layout: one row per populated tier, evenly spread per row.
  const populatedTiers = [0, 1, 2, 3].filter((tier) => tierList(tier).length)
  populatedTiers.forEach((tier, rowIndex) => {
    const row = tierList(tier)
    const y = populatedTiers.length > 1 ? TOPOLOGY_VIEW.top + rowIndex * TOPOLOGY_VIEW.rowGap : TOPOLOGY_VIEW.height / 2
    row.forEach((node, index) => {
      node.x = Math.round(TOPOLOGY_VIEW.padX + ((index + 0.5) * (TOPOLOGY_VIEW.width - TOPOLOGY_VIEW.padX * 2)) / row.length)
      node.y = y
    })
  })

  const subnetGroups = []
  nodes.forEach((node) => {
    let group = subnetGroups.find((entry) => entry.subnet === node.subnet)
    if (!group) {
      group = { subnet: node.subnet, tiers: [], devices: [] }
      subnetGroups.push(group)
    }
    const tierLabel = TIER_META[node.tier].label
    if (!group.tiers.includes(tierLabel)) group.tiers.push(tierLabel)
    group.devices.push(node.label)
  })

  return { nodes, links, subnetGroups, view: TOPOLOGY_VIEW }
}


function TopologyPage() {
  const [devices, setDevices] = useState([])
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [activeTab, setActiveTab] = useState('All')
  const [refreshing, setRefreshing] = useState(false)

  const refresh = () => {
    setRefreshing(true)
    api.getDevices().then((items) => {
      const list = Array.isArray(items) ? items : []
      setDevices(list)
      setSelectedDevice((current) => (current && list.find((d) => String(d.id) === String(current.id))) || list[0] || null)
    }).finally(() => setRefreshing(false))
  }

  useEffect(() => {
    refresh()
  }, [])

  // Live polling — node status/latency/availability refresh every 30s.
  useEffect(() => {
    const interval = setInterval(() => { refresh() }, 30000)
    return () => clearInterval(interval)
  }, [])

  // React Flow graph state — node positions come from deriveTopology()'s
  // layered layout; user drags are remembered so 30s polling doesn't reset
  // them. deriveTopology() itself is never modified.
  const draggedPositionsRef = useRef({})
  const [flowNodes, setFlowNodes] = useState([])

  const { nodes: topologyNodes, links, subnetGroups } = useMemo(() => deriveTopology(devices), [devices])

  const flowEdges = useMemo(
    () => toReactFlowGraph({ nodes: topologyNodes, links }).edges,
    [topologyNodes, links],
  )

  useEffect(() => {
    const rebuilt = toReactFlowGraph({ nodes: topologyNodes, links }).nodes.map((flowNode) => (
      draggedPositionsRef.current[flowNode.id]
        ? { ...flowNode, position: draggedPositionsRef.current[flowNode.id] }
        : flowNode
    ))
    setFlowNodes(rebuilt)
  }, [topologyNodes, links])

  const onFlowNodesChange = (changes) => {
    setFlowNodes((current) => {
      const next = applyNodeChanges(changes, current)
      changes.forEach((change) => {
        if (change.type === 'position' && change.position) draggedPositionsRef.current[change.id] = change.position
      })
      return next
    })
  }
  const routers = topologyNodes.filter((node) => node.tier === 0)
  const switches = topologyNodes.filter((node) => node.tier === 1)
  const edgeDevices = topologyNodes.filter((node) => node.tier === 2)

  const filteredDevices = devices.filter((d) => {
    if (activeTab === 'Routers') return (d.type || '').toLowerCase().includes('router')
    if (activeTab === 'Switches') return (d.type || '').toLowerCase().includes('switch')
    if (activeTab === 'Edge') {
      const t = (d.type || '').toLowerCase()
      return t.includes('edge') || t.includes('gateway')
    }
    return true
  })

  const selectedNode = selectedDevice ? topologyNodes.find((node) => node.id === String(selectedDevice.id || selectedDevice.hostname)) : null
  const neighborNodes = selectedNode
    ? links
        .filter((link) => link.from === selectedNode.id || link.to === selectedNode.id)
        .map((link) => ({ peer: link.from === selectedNode.id ? link.target : link.source, note: link.note }))
    : []

  return (
    <div className="dashboard">
      <PageHeader
        eyebrow="Infrastructure Topology"
        title={<>Network Topology<br /><span>Live Connectivity Map.</span></>}
        text="Derived connectivity map with live status, latency, and availability for every monitored device."
        action={<button className="outline-button" type="button" onClick={refresh} disabled={refreshing}>{refreshing ? 'Refreshing...' : 'Live refresh'}</button>}
      />

      <div className="metric-grid">
        <article className="metric-card">
          <div className="metric-icon cyan"><GitBranch size={18} /></div>
          <div className="metric-card-top"><span>Routers</span><span className="trend positive">{routers.length}</span></div>
          <strong>{routers.length}</strong>
          <small>ASR & Core Routers live</small>
        </article>
        <article className="metric-card">
          <div className="metric-icon blue"><Network size={18} /></div>
          <div className="metric-card-top"><span>Switches</span><span className="trend positive">{switches.length}</span></div>
          <strong>{switches.length}</strong>
          <small>NOC Catalyst switches</small>
        </article>
        <article className="metric-card">
          <div className="metric-icon green"><Activity size={18} /></div>
          <div className="metric-card-top"><span>Edge Devices</span><span className="trend positive">{edgeDevices.length}</span></div>
          <strong>{edgeDevices.length}</strong>
          <small>CMC & MobiFone transit GWs</small>
        </article>
        <article className="metric-card">
          <div className="metric-icon amber"><Server size={18} /></div>
          <div className="metric-card-top"><span>Interconnect Links</span><span className="trend positive">{links.length}</span></div>
          <strong>{links.length} Active</strong>
          <small>BGP, MPLS & 10G links operational</small>
        </article>
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-card topology-panel" style={{ gridColumn: 'span 2' }}>
          <CardHeader eyebrow="Interactive Connectivity Map" title="Topology Visualizer" />
          <div className="topology-flow">
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={deviceNodeTypes}
              onNodesChange={onFlowNodesChange}
              onNodeClick={(event, flowNode) => { const dev = flowNode.data && flowNode.data.device; if (dev) setSelectedDevice(dev) }}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.3}
              maxZoom={2.5}
            >
              <Background color="#7ea4bd" gap={26} size={1.4} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable nodeColor={minimapNodeColor} />
            </ReactFlow>
          </div>
          <div className="map-footer" style={{ paddingLeft: '4px' }}>
            <span><i style={{ width: 18, height: 2, display: 'inline-block', background: 'rgba(40,216,192,0.85)' }} />Backbone</span>
            <span><i style={{ width: 18, height: 2, display: 'inline-block', background: 'rgba(80,185,255,0.7)' }} />Uplink / interconnect</span>
            <span><i style={{ width: 18, height: 2, display: 'inline-block', background: 'rgba(40,216,192,0.4)' }} />Edge &amp; transit</span>
            <span><i style={{ width: 18, height: 2, display: 'inline-block', background: 'rgba(226,168,77,0.6)' }} />DNS &amp; management</span>
          </div>
        </section>

        {selectedDevice && (
          <aside className="dashboard-card device-detail-panel">
            <CardHeader eyebrow="Node Details" title={selectedDevice.name || selectedDevice.hostname || selectedDevice.id} />
            <div style={{ marginTop: '12px' }}>
              <span className={`status-pill ${deviceStatusTone(selectedDevice)}`}>
                {selectedDevice.status || 'Unknown'}
              </span>
              <div className="detail-highlight" style={{ marginTop: '12px' }}>
                <div className="detail-stat"><span>Type</span><strong>{selectedDevice.type || '—'}</strong></div>
                <div className="detail-stat"><span>IP Address</span><strong>{selectedDevice.ip || '—'}</strong></div>
                <div className="detail-stat"><span>Vendor</span><strong>{[selectedDevice.vendor, selectedDevice.model].filter(Boolean).join(' · ') || '—'}</strong></div>
              </div>

              <div className="detail-grid" style={{ marginTop: '14px' }}>
                <div><span>Latency</span><strong>{deviceLatencyText(selectedDevice)}</strong></div>
                <div><span>Availability</span><strong>{selectedDevice.availability || '—'}</strong></div>
                <div><span>Status</span><strong>{selectedDevice.status || 'Unknown'}</strong></div>
                <div><span>Subnet</span><strong>{selectedNode ? selectedNode.subnet : '—'}</strong></div>
                <div><span>Health Score</span><strong>{selectedDevice.healthScore ? `${selectedDevice.healthScore}%` : '—'}</strong></div>
                <div><span>Serial</span><strong>{selectedDevice.serial || '—'}</strong></div>
                <div><span>Owner</span><strong>{selectedDevice.owner || '—'}</strong></div>
                <div><span>Last Seen</span><strong>{selectedDevice.lastSeen || '—'}</strong></div>
              </div>

              <div className="detail-note" style={{ marginTop: '14px' }}>
                <span className="auth-eyebrow">Monitoring Source</span>
                <p>{selectedDevice.monitoringSource || '—'}{selectedDevice.latencySource ? ` · live latency via ${selectedDevice.latencySource}` : ''}</p>
              </div>

              <div className="detail-note" style={{ marginTop: '12px' }}>
                <span className="auth-eyebrow">Derived links ({neighborNodes.length})</span>
                {neighborNodes.length ? neighborNodes.map(({ peer, note }) => (
                  <p key={peer.id} style={{ margin: '6px 0 0' }}>
                    <strong style={{ fontSize: '11px' }}>{peer.label}</strong>
                    <small style={{ color: 'var(--muted)', marginLeft: '6px' }}>{note}</small>
                  </p>
                )) : <p style={{ margin: '6px 0 0' }}>No links derived for this node.</p>}
              </div>
            </div>
          </aside>
        )}
      </div>

      <section className="dashboard-card monitor-table" style={{ marginTop: '20px' }}>
        <CardHeader eyebrow="Derived from live inventory" title="Subnet Relationships" />
        <div className="table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Subnet</th>
                <th>Functional Tier</th>
                <th>Monitored Devices</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {subnetGroups.map((group) => (
                <tr key={group.subnet}>
                  <td><strong>{group.subnet}</strong></td>
                  <td><span className="status-pill cyan">{group.tiers.join(' / ')}</span></td>
                  <td><small>{group.devices.join(', ')}</small></td>
                  <td>{group.devices.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-card monitor-table" style={{ marginTop: '20px' }}>
        <CardHeader eyebrow="Inventory by Tier" title="Monitored Devices" />
        <div className="alert-filters" style={{ marginBottom: '12px' }}>
          <button type="button" className={activeTab === 'All' ? 'active' : ''} onClick={() => setActiveTab('All')}>All Devices ({devices.length})</button>
          <button type="button" className={activeTab === 'Routers' ? 'active' : ''} onClick={() => setActiveTab('Routers')}>Routers ({routers.length})</button>
          <button type="button" className={activeTab === 'Switches' ? 'active' : ''} onClick={() => setActiveTab('Switches')}>Switches ({switches.length})</button>
          <button type="button" className={activeTab === 'Edge' ? 'active' : ''} onClick={() => setActiveTab('Edge')}>Edge Devices ({edgeDevices.length})</button>
        </div>

        <div className="table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Device Name</th>
                <th>IP Address</th>
                <th>Type</th>
                <th>Vendor / Model</th>
                <th>Status</th>
                <th>Health Score</th>
                <th>Monitoring Source</th>
              </tr>
            </thead>
            <tbody>
              {filteredDevices.map((device) => (
                <tr key={device.id} onClick={() => setSelectedDevice(device)} style={{ cursor: 'pointer' }}>
                  <td><strong>{device.name || device.hostname}</strong></td>
                  <td>{device.ip}</td>
                  <td><span className="status-pill cyan">{device.type}</span></td>
                  <td>{device.vendor} &middot; {device.model}</td>
                  <td><span className={`status-pill ${device.status === 'Operational' || device.status === 'Online' ? 'green' : 'amber'}`}>{device.status}</span></td>
                  <td><strong>{device.healthScore ? `${device.healthScore}%` : '98%'}</strong></td>
                  <td><small>{device.monitoringSource}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function TeamSection() { return <section className="team-section" id="team"><div className="section-intro"><span className="auth-eyebrow">Your operations team</span><h2>People who keep<br /><span>systems moving.</span></h2></div><div className="team-list"><div><span className="team-avatar teal">JM</span><span><strong>Jordan Miller</strong><small>Infrastructure Lead</small></span><span className="online"><i />Available</span></div><div><span className="team-avatar blue">SK</span><span><strong>Samira Khan</strong><small>Security Operations</small></span><span className="online"><i />Available</span></div><div><span className="team-avatar amber">DR</span><span><strong>Diego Ruiz</strong><small>Automation Architect</small></span><span className="online away"><i />In a meeting</span></div></div></section> }
function ContactSection() { return <section className="contact-banner" id="contact"><div><span className="auth-eyebrow">Talk to our team</span><h2>Make your next<br /><span>move with confidence.</span></h2><p>Talk to a NOC Automation specialist about network monitoring, cloud operations, security, and your next reliability goal.</p></div><a className="primary-button" href="mailto:operations@nocautomation.com">Contact operations <Zap size={16} /></a></section> }

export { deriveTopology, TopologyPage, TopologyMap }
export default App
