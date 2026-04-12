import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5176,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  // Vite preview has a DNS-rebinding host check that blocks unknown hosts by default.
  // Behind Railway/Cloudflare TLS the proxy already handles host validation, so we
  // allow all hosts here. Safe because the origin is only reachable via Railway routing.
  preview: {
    allowedHosts: true,
    host: '0.0.0.0',
  },
});
