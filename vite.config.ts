import { defineConfig } from 'vite';

// GitHub Project Pages serve from /<repo>/, so nothing may be rooted at "/".
// Default to document-relative URLs; BASE_PATH can pin an absolute prefix.
export default defineConfig({
  base: process.env.BASE_PATH || './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
});
