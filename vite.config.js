import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const api = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:4200';

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // The increment ladder and the money formatting are shared with
      // the server rather than reimplemented here. A UI that disagrees
      // with the bid script about the minimum bid is a UI that tells
      // people to place bids that get rejected.
      '@core': path.resolve(root, 'src/core'),
    },
  },
  server: {
    port: 5175,
    proxy: {
      '/api': { target: api, changeOrigin: true },
      '/uploads': { target: api, changeOrigin: true },
      '/socket.io': { target: api, ws: true, changeOrigin: true },
    },
  },
  build: { outDir: '../dist', emptyOutDir: true },
});
