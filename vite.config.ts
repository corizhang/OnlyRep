import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 单文件构建：JS/CSS 全部内联进 dist/index.html；
// Web Worker 通过 `?worker&inline` 以 base64 内联，兼容 file:// 协议。
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 10_000,
  },
  worker: {
    format: 'iife',
  },
});
