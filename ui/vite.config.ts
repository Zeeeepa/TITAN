import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:48420',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:48420',
        ws: true,
      },
      '/metrics': {
        target: 'http://localhost:48420',
        changeOrigin: true,
      },
    },
  },
});
