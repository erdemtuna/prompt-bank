import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Tauri expects a fixed dev port and an untouched console. The Playwright suite
// passes its own --port, so it keeps running on its port unaffected. See
// src-tauri/tauri.conf.json for the matching devUrl.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] }
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    // Prompt Bank targets modern webviews only (webkit2gtk, WebView2, WKWebView),
    // so no down-leveling. Vite 8 / rolldown cannot transform down to an old
    // target such as safari13, and none is needed.
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts']
  }
});
