// Smoke test: verify Zabbix-backed telemetry resolves for the monitored routers.
require('dotenv').config()
const { getGrafanaSnapshot } = require('./grafanaService.cjs')

async function main() {
  const snapshot = await getGrafanaSnapshot(true)
  const devices = (snapshot.monitoring && snapshot.monitoring.devices) || []
  const targets = ['CORE-ROUTER-01', 'ASR-ROUTER-02', 'ASR-ROUTER-03']
  console.log('\n===== SMOKE TEST =====')
  console.log('zabbixUid:', snapshot.dashboard.zabbixUid, '| cpuSource:', snapshot.dashboard.cpuSource)
  console.log('dashboard.cpu:', snapshot.dashboard.cpu)
  for (const host of targets) {
    const device = devices.find((item) => item.hostname === host)
    if (!device) { console.log(`${host}: NOT FOUND`); continue }
    console.log(`${host}: cpu=${device.cpu} ram=${device.ram} inBps=${device.inTrafficBps} outBps=${device.outTrafficBps} ifUtil=${device.interfaceUtilization} source=${device.telemetrySource} ds=${device.telemetryDatasource || 'n/a'}`)
  }
}

main().then(() => process.exit(0)).catch((error) => { console.error('SMOKE FAILED:', error.message); process.exit(1) })
