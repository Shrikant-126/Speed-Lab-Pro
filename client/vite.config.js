import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// Build output goes to <repo root>/dist so Vercel finds it with the default "dist" setting.
const outDir = fileURLToPath(new URL('../dist', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: '..',
  // ffmpeg.wasm and the @jsquash codecs load their own worker/wasm files via new URL(..., import.meta.url) – it must not be pre-bundled.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@jsquash/webp', '@jsquash/avif', '@jsquash/jpeg', '@jsquash/png', '@jsquash/oxipng', '@jsquash/resize'] },
  worker: { format: 'es' },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_DEV_API || 'http://localhost:8080', changeOrigin: true },
    },
  },
  build: {
    outDir,
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
        },
      },
    },
  },
});
