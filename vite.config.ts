import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/waypoint/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'hero.png', 'app-icon.png'],
      manifest: {
        name: 'Waypoint',
        short_name: 'Waypoint',
        description: 'Project management for the Design team.',
        theme_color: '#4f46e5',
        background_color: '#f5f6fa',
        display: 'standalone',
        start_url: '/waypoint/',
        scope: '/waypoint/',
        icons: [
          {
            src: 'app-icon.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'app-icon.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'app-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/waypoint/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,ico,webp}'],
      },
    }),
  ],
})
