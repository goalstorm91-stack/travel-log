import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// MapLibre runs tile parsing in a module worker that imports a sibling file.
// Bundlers (and Vite's dev server, which injects its browser-only HMR client
// into worker files) break that, so serve the two files untouched from
// /maplibre/ in dev and emit them as plain assets in the build.
const MAPLIBRE_WORKER_FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']
function maplibreWorker(): Plugin {
  const dist = path.resolve(__dirname, 'node_modules/maplibre-gl/dist')
  return {
    name: 'maplibre-worker-files',
    configureServer(server) {
      server.middlewares.use('/maplibre/', (req, res, next) => {
        const name = MAPLIBRE_WORKER_FILES.find((f) => req.url?.split('?')[0] === `/${f}`)
        if (!name) return next()
        res.setHeader('Content-Type', 'text/javascript')
        res.end(fs.readFileSync(path.join(dist, name)))
      })
    },
    generateBundle() {
      for (const name of MAPLIBRE_WORKER_FILES) {
        this.emitFile({
          type: 'asset',
          fileName: `maplibre/${name}`,
          source: fs.readFileSync(path.join(dist, name)),
        })
      }
    },
  }
}

// The link-preview tags in index.html need the app's absolute address. Fill it in here
// (rather than relying on Vite's own %VAR% replacement) so a stray trailing slash in
// VITE_APP_URL can't produce "https://host//icon.png".
function appUrlInHtml(): Plugin {
  let url = ''
  return {
    name: 'app-url-in-html',
    configResolved(config) {
      const env = loadEnv(config.mode, config.envDir || process.cwd(), 'VITE_')
      url = (env.VITE_APP_URL ?? '').trim().replace(/\/+$/, '')
    },
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace(/%VITE_APP_URL%/g, url),
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    maplibreWorker(),
    appUrlInHtml(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '여행 기록',
        short_name: '여행 기록',
        description: '사진, 글, 지출까지 담는 나만의 여행 일지',
        lang: 'ko',
        id: '/',
        theme_color: '#4338ca',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        categories: ['travel', 'lifestyle', 'photo'],
        start_url: '/',
        shortcuts: [
          { name: '새 여행 만들기', short_name: '새 여행', url: '/#/trips/new' },
          { name: '사진으로 여행 만들기', short_name: '사진으로', url: '/#/trips/from-photos' },
          { name: '내 지도 보기', short_name: '지도', url: '/#/map' },
        ],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // mjs: the MapLibre worker files, so the map can still start offline
        globPatterns: ['**/*.{js,mjs,css,html,svg,png}'],
        // the HEIC converter (1.3MB) is only needed when importing HEIC photos online
        globIgnores: ['**/heic2any-*.js'],
      },
    }),
  ],
})
