import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    base: process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/` : '/',
    // Aset publik lama pada baseline berisi PNG rusak. Semua aset runtime V1
    // diimpor dari src agar Vite hanya menerbitkan berkas yang tervalidasi.
    publicDir: 'public',
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
        },
        includeAssets: ['pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          name: 'SIMOSDA',
          short_name: 'SIMOSDA',
          description: 'Sistem Manajemen Pegawai dan Monitoring Aset Daerah',
          theme_color: '#0f5ad7',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Opsi B (disepakati): pisahkan vendor besar ke chunk bernama & stabil
          // agar caching browser lebih efisien saat aplikasi di-update.
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              // Peta (HANYA dipakai PetaSebaran) — cek lebih dulu agar react-leaflet ikut ke sini.
              if (id.includes('leaflet')) return 'vendor-maps';
              // Chart (HANYA dipakai Dashboard) — recharts beserta dependensi d3/victory-vendor.
              if (
                id.includes('recharts') ||
                id.includes('victory-vendor') ||
                id.includes('/d3-') ||
                id.includes('node_modules/d3')
              ) {
                return 'vendor-charts';
              }
              // Inti React (selalu termuat) → satu chunk vendor stabil.
              if (
                id.includes('node_modules/react-router') ||
                id.includes('node_modules/react-dom') ||
                id.includes('node_modules/react/') ||
                id.includes('node_modules/scheduler')
              ) {
                return 'vendor-react';
              }
              return 'vendor';
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
