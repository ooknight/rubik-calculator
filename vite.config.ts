import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri 以 file:// 协议加载构建产物，故 base 用相对路径；
// 同时关闭源映射以满足 Tauri 的安全默认值。
export default defineConfig({
  plugins: [react()],
  base: './',
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: false,
    // Tauri 期望固定端口以建立 WebSocket HMR
    hmr: process.env.TAURI_DEV_HOST ? { protocol: 'ws', host: process.env.TAURI_DEV_HOST, port: 5173 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] }
  },
  build: {
    target: 'es2021',
    minify: 'esbuild',
    sourcemap: false
  }
});
