import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Base path set for deployment at theraway.net/app/
  base: '/app/', 
  build: {
    outDir: 'dist', // Output directory for production build
    sourcemap: false, // Disable source maps for production for slightly smaller build size
  },
  publicDir: 'public' // Specifies the directory for static assets like locales
})