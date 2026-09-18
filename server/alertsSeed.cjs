require('dotenv').config()

const pool = require('./db.cjs')

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000)

const DEMO_ALERTS = [
  {
    title: 'Database replication lag detected',
    device: 'Finance DB Cluster',
    severity: 'Critical',
    status: 'Active',
    owner: 'Jordan Miller',
    impact: 'Customer transactions may queue under latency spikes.',
    summary: 'Primary node is 6s behind the standby cluster. The replication gap is trending upward and is above the service threshold.',
    createdMinutesAgo: 2,
    events: [
      { text: 'Replication delay crossed the 5s threshold', minutesAgo: 10 },
      { text: 'Pager fired to the primary NOC rotation', minutesAgo: 6 },
      { text: 'Failover review started by Jordan Miller', minutesAgo: 2 },
    ],
  },
  {
    title: 'Storage capacity threshold reached',
    device: 'Storage Array',
    severity: 'Warning',
    status: 'Acknowledged',
    owner: 'Priya Shah',
    impact: 'Cold storage tier is above 80% usage and at risk of pressure.',
    summary: 'Volume utilization crossed 80% on the cold storage tier. Growth is accelerating and the next expansion is scheduled within the next maintenance window.',
    createdMinutesAgo: 12,
    events: [
      { text: 'Capacity forecast crossed the 80% threshold', minutesAgo: 18 },
      { text: 'Acknowledged by Priya Shah', minutesAgo: 12 },
      { text: 'Storage expansion ticket opened', minutesAgo: 8 },
    ],
  },
  {
    title: 'Certificate auto-renewal successful',
    device: 'API Gateway',
    severity: 'Information',
    status: 'Closed',
    owner: 'Samira Khan',
    impact: 'No user impact expected.',
    summary: 'TLS certificate renewed successfully without a service interruption. All endpoints verified with successful handshake checks.',
    createdMinutesAgo: 95,
    events: [
      { text: 'Auto-renewal completed', minutesAgo: 95 },
      { text: 'Gateway certificate chain verified', minutesAgo: 90 },
      { text: 'Resolution recorded by Samira Khan', minutesAgo: 65 },
    ],
  },
  {
    title: 'High latency burst on API edge',
    device: 'API Gateway',
    severity: 'Critical',
    status: 'Active',
    owner: 'Diego Ruiz',
    impact: 'Customer portal latency exceeded the 250 ms threshold.',
    summary: 'Edge latency exceeded 250 ms for six consecutive minutes. Traffic is being shed while the autoscaler catches up.',
    createdMinutesAgo: 20,
    events: [
      { text: 'Latency SLO burn-rate alert fired', minutesAgo: 24 },
      { text: 'Traffic shedding enabled by Diego Ruiz', minutesAgo: 20 },
    ],
  },
  {
    title: 'Packet loss spike on core switch',
    device: 'Core Switch',
    severity: 'Warning',
    status: 'Acknowledged',
    escalationLevel: 'Tier 2',
    owner: 'Priya Shah',
    impact: 'Inter-site replication traffic is experiencing intermittent drops.',
    summary: 'Packet loss spiked to 2.4% between core and distribution layers. Vendor TAC engaged while a port diagnostic runs.',
    createdMinutesAgo: 45,
    events: [
      { text: 'Packet loss crossed 2% on uplink Te1/0/1', minutesAgo: 50 },
      { text: 'Acknowledged by Priya Shah', minutesAgo: 45 },
      { text: 'Escalated to Tier 2 — vendor TAC engaged', minutesAgo: 30 },
    ],
  },
  {
    title: 'Backup job failed on CORE-ROUTER-01',
    device: 'CORE-ROUTER-01',
    severity: 'Critical',
    status: 'Closed',
    owner: 'Jordan Miller',
    impact: 'Point-in-time recovery window was at risk.',
    summary: 'Nightly backup failed due to a full archive volume. Volume was extended and the backup re-run successfully.',
    createdMinutesAgo: 320,
    events: [
      { text: 'Backup job exited with code 3 — archive volume full', minutesAgo: 320 },
      { text: 'Acknowledged by Jordan Miller', minutesAgo: 310 },
      { text: 'Archive volume extended by 2 TB', minutesAgo: 280 },
      { text: 'Backup re-run completed successfully — resolved', minutesAgo: 260 },
    ],
  },
  {
    title: 'Cooling fan speed anomaly on SWITCH-NOC-SW1',
    device: 'SWITCH-NOC-SW1',
    severity: 'Warning',
    status: 'Active',
    owner: null,
    impact: 'Thermal headroom reduced; throttling possible under load.',
    summary: 'Chassis fan 3 reporting 30% below nominal RPM. Hardware inspection scheduled for the next maintenance window.',
    createdMinutesAgo: 8,
    events: [{ text: 'Fan speed sensor crossed warning threshold', minutesAgo: 8 }],
  },
  {
    title: 'Firmware update applied to ASR-ROUTER-02',
    device: 'ASR-ROUTER-02',
    severity: 'Information',
    status: 'Closed',
    owner: 'Samira Khan',
    impact: 'No user impact; maintenance performed per schedule.',
    summary: 'Scheduled firmware upgrade completed successfully with no packet loss during the controlled switchover.',
    createdMinutesAgo: 1500,
    events: [
      { text: 'Maintenance window opened', minutesAgo: 1500 },
      { text: 'Firmware 17.9.4a installed', minutesAgo: 1480 },
      { text: 'Resolved by Samira Khan after verification', minutesAgo: 1460 },
    ],
  },
  {
    title: 'VPN gateway connection flapping',
    device: 'VPN Gateway 03',
    severity: 'Warning',
    status: 'Active',
    owner: 'Diego Ruiz',
    impact: 'Remote users experience intermittent disconnects.',
    summary: 'Tunnel renegotiations spiked to 14 per hour. IKE phase 2 lifetime mismatch suspected after the last policy push.',
    createdMinutesAgo: 32,
    events: [
      { text: 'Tunnel renegotiation rate crossed threshold', minutesAgo: 36 },
      { text: 'IKE policy diff started by Diego Ruiz', minutesAgo: 32 },
    ],
  },
]

async function seedAlertsIfEmpty() {
  const existing = await pool.query('SELECT COUNT(*)::int AS count FROM alerts')
  if (existing.rows[0] && existing.rows[0].count > 0) {
    return { seeded: false, count: 0 }
  }

  for (const alert of DEMO_ALERTS) {
    const createdAt = minutesAgo(alert.createdMinutesAgo)
    const acknowledgedAt = alert.status === 'Active' ? null : minutesAgo(Math.max(0, alert.createdMinutesAgo - 2))
    const closedAt = alert.status === 'Closed' ? minutesAgo(Math.max(0, alert.createdMinutesAgo - 20)) : null

    const inserted = await pool.query(
      `INSERT INTO alerts (title, device, severity, status, escalation_level, owner, impact, summary, source, created_at, updated_at, acknowledged_at, closed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'seed', $9, NOW(), $10, $11)
       RETURNING id`,
      [
        alert.title,
        alert.device,
        alert.severity,
        alert.status,
        alert.escalationLevel || null,
        alert.owner || null,
        alert.impact || null,
        alert.summary || null,
        createdAt,
        acknowledgedAt,
        closedAt,
      ],
    )
    const alertId = inserted.rows[0].id

    for (const event of alert.events) {
      await pool.query(
        'INSERT INTO alert_events (alert_id, text, actor, event_time) VALUES ($1, $2, $3, $4)',
        [alertId, event.text, alert.owner || 'system', minutesAgo(event.minutesAgo)],
      )
    }
  }

  return { seeded: true, count: DEMO_ALERTS.length }
}

module.exports = { seedAlertsIfEmpty }

if (require.main === module) {
  seedAlertsIfEmpty()
    .then((result) => {
      console.log(result.seeded ? `[alerts] seeded ${result.count} demo alerts` : '[alerts] seed skipped — alerts already exist')
      process.exit(0)
    })
    .catch((error) => {
      console.error('[alerts] seed failed:', error.message)
      process.exit(1)
    })
}