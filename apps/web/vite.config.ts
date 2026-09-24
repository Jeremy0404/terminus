import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const DAEMON_URL = `http://127.0.0.1:${process.env['TERMINUS_PORT'] ?? 4317}`;

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': DAEMON_URL } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
