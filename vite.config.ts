import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/waypoint/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.png', 'hero.png', 'app-icon.png'],
      manifest: {
        // Stable identity for the installed app. Without it the browser keys
        // the install off start_url, so changing start_url later would look
        // like a different app and orphan existing installs.
        id: '/waypoint/',
        name: 'Waypoint',
        short_name: 'Waypoint',
        description: 'Project management for the Design team.',
        theme_color: '#4f46e5',
        background_color: '#f5f6fa',
        display: 'standalone',
        start_url: '/waypoint/',
        // Shared project links look like /waypoint/?project=<id>, which is
        // inside this scope — the prerequisite for the installed app being
        // allowed to capture them at all.
        scope: '/waypoint/',
        // Ask the browser to route in-scope links to the installed app rather
        // than a browser tab. Chromium honours this but still gates it behind
        // a per-app user setting; iOS home-screen apps ignore it entirely.
        handle_links: 'preferred',
        // When a link is captured and a Waypoint window is already open,
        // focus that window and hand it the URL through launchQueue instead
        // of navigating it. Navigating would full-reload the SPA and throw
        // away whatever the person was in the middle of.
        launch_handler: {
          client_mode: 'focus-existing',
        },
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
