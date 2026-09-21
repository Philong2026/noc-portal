// Debug: try several Zabbix /api/ds/query payload variants, print error bodies.
require('dotenv').config()
const http = require('http')
const https = require('https')

const url = process.env.GRAFANA_URL.replace(/\/+$/, '')
const token = process.env.GRAFANA_TOKEN
const ds = { type: 'alexanderzobnin-zabbix-datasource', uid: 'bf9ccc7zhfqbke' }

function post(body) {
  return new Promise((resolve) => {
    const parsed = new URL(`${url}/api/ds/query`)
    const payload = JSON.stringify(body)
    const transport = parsed.protocol === 'https:' ? https : http
    const req = transport.request(parsed, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 15000,
    }, (res) => {
      let raw = ''
      res.on('data', (chunk) => { raw += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body: raw.slice(0, 1200) }))
    })
    req.on('error', (error) => resolve({ status: 0, body: error.message }))
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }) })
    req.write(payload)
    req.end()
  })
}

function get(path) {
  return new Promise((resolve) => {
    const parsed = new URL(path)
    const transport = parsed.protocol === 'https:' ? https : http
    const req = transport.request(parsed, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      timeout: 15000,
    }, (res) => {
      let raw = ''
      res.on('data', (chunk) => { raw += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body: raw }))
    })
    req.on('error', (error) => resolve({ status: 0, body: error.message }))
    req.end()
  })
}

async function main() {
  // 0) Deployed plugin version.
  const plugin = await get(`${url}/api/plugins/alexanderzobnin-zabbix-datasource/settings`)
  console.log('\n--- plugin settings ->', plugin.status)
  try { const p = JSON.parse(plugin.body); console.log('plugin info:', JSON.stringify(p.info && { version: p.info.version, author: p.info.author })) } catch (error) { console.log(plugin.body.slice(0, 300)) }

  const resources = `${url}/api/datasources/uid/${ds.uid}/resources/zabbix-api`

  function call(method, params) {
    return new Promise((resolve) => {
      const parsed = new URL(resources)
      const payload = JSON.stringify({ method, params })
      const transport = parsed.protocol === 'https:' ? https : http
      const req = transport.request(parsed, {
        method: 'POST',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: 20000,
      }, (res) => {
        let raw = ''
        res.on('data', (chunk) => { raw += chunk })
        res.on('end', () => resolve({ status: res.statusCode, body: raw }))
      })
      req.on('error', (error) => resolve({ status: 0, body: error.message }))
      req.write(payload)
      req.end()
    })
  }

  // 1) Does history exist for the CPU item (62041) in the last 2 hours?
  const now = Math.floor(Date.now() / 1000)
  const history = await call('history.get', {
    output: 'extend',
    itemids: ['62041'],
    history: 0,
    time_from: now - 7200,
    time_till: now,
    sortfield: 'clock',
    sortorder: 'ASC',
    limit: 5,
  })
  console.log(`\n--- history.get 62041 (last 2h) -> ${history.status}`)
  console.log(history.body.slice(0, 900))

  // 2) Interface bits item 61975 history.
  const hist2 = await call('history.get', {
    output: 'extend',
    itemids: ['61975'],
    history: 3,
    time_from: now - 7200,
    time_till: now,
    sortfield: 'clock',
    sortorder: 'ASC',
    limit: 5,
  })
  console.log(`\n--- history.get 61975 (Bits received, last 2h) -> ${hist2.status}`)
  console.log(hist2.body.slice(0, 900))

  // 4) item.get with lastvalue/lastclock for all items of router host 10797.
  const items = await call('item.get', {
    output: ['name', 'key_', 'value_type', 'lastvalue', 'lastclock', 'status'],
    hostids: ['10797'],
    limit: 300,
  })
  // 5) Probe Prometheus per-router ifHighSpeed/ifHCInOctets.
  const promUids = (await get(`${url}/api/datasources`))
  let promUid = null
  try { promUid = JSON.parse(promUids.body).find((d) => d.type === 'prometheus').uid } catch (error) { /* ignore */ }
  if (promUid) {
    const prom = await post({
      queries: [{
        refId: 'A', datasource: { type: 'prometheus', uid: promUid },
        expr: 'count(ifHighSpeed{instance=~"^103\\\\.122\\\\.160\\\\.129.*"}) by (instance)',
        instant: true, range: false,
      }],
      from: 'now-15m', to: 'now',
    })
    console.log(`\n--- prom ifHighSpeed count 103.122.160.129 -> ${prom.status}`)
    console.log(prom.body.slice(0, 600))
    const prom2 = await post({
      queries: [{
        refId: 'A', datasource: { type: 'prometheus', uid: promUid },
        expr: 'count(ifHCInOctets{instance=~"^103\\\\.122\\\\.160\\\\.129.*"})',
        instant: true, range: false,
      }],
      from: 'now-15m', to: 'now',
    })
    console.log(`\n--- prom ifHCInOctets count 103.122.160.129 -> ${prom2.status}`)
    console.log(prom2.body.slice(0, 600))
  }

  // 6) Check for Speed / Utilization items on each router host.
  const allHosts = await call('host.get', { output: ['host', 'hostid'], limit: 200 })
  try {
    const hostResult = JSON.parse(allHosts.body).result || []
    for (const host of hostResult.filter((h) => /router/i.test(h.host))) {
      const speedItems = await call('item.get', {
        output: ['name', 'key_', 'lastvalue'],
        hostids: [host.hostid],
        searchByAny: true,
        search: { name: 'Speed', key_: 'speed' },
        searchWildcardsAllowed: true,
        limit: 20,
      })
      console.log(`\n--- Speed items ${host.host} -> ${speedItems.status}`)
      console.log(speedItems.body.slice(0, 700))
    }
  } catch (error) { console.log('speed probe failed:', error.message) }
}

main().then(() => process.exit(0)).catch((error) => { console.error('DEBUG FAILED:', error.message); process.exit(1) })
