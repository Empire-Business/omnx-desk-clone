import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// Nome do app: um lugar só (src/config/brand.ts lê a mesma variável no navegador).
const NOME_PADRAO = 'OMNX Desk'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const appName = (env.VITE_APP_NAME || process.env.VITE_APP_NAME || '').trim() || NOME_PADRAO
  return {
  cacheDir: 'node_modules/.vite-react18',
  plugins: [
    {
      // index.html: título e metas com o nome do app.
      name: 'nome-do-app-no-html',
      transformIndexHtml: (html: string) => html.replaceAll(NOME_PADRAO, appName),
    },
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'notification.mp3'],
      manifest: {
        id: '/',
        name: appName,
        short_name: appName,
        description: `Sistema de gestão ${appName}`,
        lang: 'pt-BR',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'any',
        scope: '/',
        start_url: '/',
        categories: ['business', 'productivity'],
        prefer_related_applications: false,
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Os arquivos do leitor de comprovante (OCR) são ~12 MB e só fazem sentido
        // para quem anexa comprovante. Fora do precache, o navegador os busca sob
        // demanda na primeira leitura e guarda em cache a partir daí — em vez de
        // custar 12 MB de download a todo mundo que só abre o app.
        // /docs (Swagger ~2 MB) é página pública estática: fora do precache do app.
        globIgnores: ['**/tesseract/**', 'docs/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        target: 'esnext',
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    force: true,
    include: ['react', 'react-dom/client', '@tanstack/react-query', 'react-router-dom'],
  },
  server: {
    port: 5175,
    strictPort: true,
  },
  }
})
