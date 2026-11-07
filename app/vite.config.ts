import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import fs from 'node:fs'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'static-web-app-config',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'staticwebapp.config.json',
          source: fs.readFileSync(path.resolve(__dirname, '../staticwebapp.config.json'), 'utf8'),
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:7071',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../public/app',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ['vue'],
          axios: ['axios'],
        },
      },
    },
  },
})
