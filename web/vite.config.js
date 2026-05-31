import path from 'path';
import { fileURLToPath } from 'url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(rootDir, '..');

/** GitHub Pages 子路径部署时由 CI 注入，本地默认为 / */
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [react()],
  root: rootDir,
  publicDir: path.join(projectRoot, 'data'),
  resolve: {
    alias: {
      '@engine': path.join(projectRoot, 'demo/js'),
    },
  },
  server: {
    port: 5173,
    fs: { allow: [projectRoot] },
  },
  build: {
    outDir: path.join(projectRoot, 'dist-web'),
    emptyOutDir: true,
  },
});
