import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = {
  '@shared': resolve('src/shared'),
  '@core': resolve('src/core'),
  '@services': resolve('src/services'),
  '@renderer': resolve('src/renderer')
}

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: '.',
    resolve: { alias },
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { index: resolve('index.html') }
      }
    }
  }
})
