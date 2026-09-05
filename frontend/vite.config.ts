import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendPort = process.env.PORT || '3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
        secure: false,
      },
      '/media': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    sourcemap: true, // Enable sourcemaps for source-map-explorer analysis
    rollupOptions: {
      output: {
        manualChunks: {
          // Split heavy vendor libraries into separate cacheable chunks
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-motion': ['framer-motion'],
          'vendor-icons': ['lucide-react']
        }
      }
    }
  }
});
