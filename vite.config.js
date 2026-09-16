import { defineConfig } from 'vite';

// Сайт живёт на GitHub Pages по адресу /backontime/ — все пути строятся от этой базы.
export default defineConfig({
  base: '/backontime/',
  build: { outDir: 'dist', emptyOutDir: true },
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
