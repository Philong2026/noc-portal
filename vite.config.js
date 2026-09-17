import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load the whole .env (including GRAFANA_URL / GRAFANA_TOKEN) so the dev
  // server can proxy browser requests to Grafana and inject the Bearer token
  // server-side. The token never reaches the client bundle.
  const env = loadEnv(mode, process.cwd(), '')
  const grafanaUrl = String(env.GRAFANA_URL || '').trim().replace(/\/+$/, '')
  const grafanaToken = String(env.GRAFANA_TOKEN || '').trim()

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
        // Direct Grafana path used by src/mockApi.js when the Express API is
        // unreachable. /grafana/* is rewritten onto GRAFANA_URL with auth.
        ...(grafanaUrl ? {
          '/grafana': {
            target: grafanaUrl,
            changeOrigin: true,
            secure: false,
            rewrite: (path) => path.replace(/^\/grafana/, ''),
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq) => {
                if (grafanaToken) proxyReq.setHeader('Authorization', `Bearer ${grafanaToken}`)
              })
            },
          },
        } : {}),
      },
    },
  }
})
