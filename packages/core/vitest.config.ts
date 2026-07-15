import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The `public` symlink (-> ../../apps/web/public) is not materialized on
  // Windows checkouts; disabling publicDir stops Vite from scanning it.
  publicDir: false,
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
