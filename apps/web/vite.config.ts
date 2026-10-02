import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here, '')
  const apiTarget = env.VITE_API_PROXY || 'http://localhost:8787'
  return {
    root: here,
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { '/api': { target: apiTarget, changeOrigin: false, ws: false } },
      fs: { allow: [repoRoot] },
    },
    preview: { port: 4173, proxy: { '/api': { target: apiTarget } } },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      target: 'es2022',
      cssCodeSplit: true,
      chunkSizeWarningLimit: 300,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/scheduler')) return 'react'
            if (id.includes('react-router') || id.includes('@remix-run')) return 'router'
            if (id.includes('@tanstack')) return 'query'
            return undefined
          },
        },
        // @hiclaude/contracts exports zod schemas we never use in the browser; treat its modules as side-effect free so unused ones are dropped.
        treeshake: { moduleSideEffects: (id) => !id.replace(/\\/g, '/').includes('/packages/contracts/src/') },
      },
    },
    define: { __BUILD_DATE__: JSON.stringify('2026-10-02') },
  }
})
