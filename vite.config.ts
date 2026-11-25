/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: Number(process.env.KALAN_PREVIEW_PORT ?? 4317), strictPort: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'web',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
          // The token test reads stylesheets as text (?raw); with css: false Vitest would hand it empty strings.
          css: true,
        },
      },
      {
        test: { name: 'desktop', environment: 'node', include: ['desktop/src/**/*.test.ts'] },
      },
    ],
  },
});
