import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // If your app will be deployed to a subdirectory on Hostinger (e.g., yourdomain.com/theraway/),
  // you might need to set the base path:
  base: '/app/', 
  // Otherwise, for the root domain, base: '/' (the default) is fine.
  build: {
    outDir: 'dist', // Output directory for production build
    sourcemap: false, // Disable source maps for production for slightly smaller build size
  },
  publicDir: 'public' // Specifies the directory for static assets like locales
})