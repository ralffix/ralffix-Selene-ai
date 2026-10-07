import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [
    react({
      include: '**/*.{jsx,js}',
    }),
    tailwindcss(),
  ],

  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.(js|jsx)$/,
    exclude: [],
  },

  optimizeDeps: {
    // Skip scanning (can't parse JSX in .js files) and manually list deps to pre-bundle
    noDiscovery: true,
    include: ['react', 'react-dom', 'react-dom/client', 'highlight.js'],
  },

  // Prevent Vite from obscuring Rust errors
  clearScreen: false,

  server: {
    // Tauri expects a fixed port; fail if that port is not available
    port: 1420,
    strictPort: true,
    // Allow Tauri to access the dev server
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Tell Vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
})
