import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate', // Automatically updates the app when you deploy new code
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'], // Assets to cache
      manifest: {
        name: 'Factory Job Scheduler',
        short_name: 'SysAdmin',
        description: 'Real-time Manufacturing Job Scheduler',
        theme_color: '#030712', // Matches Tailwind's bg-gray-950
        background_color: '#030712',
        display: 'standalone', // Hides the browser URL bar so it looks like a native app
        orientation: 'portrait',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
});