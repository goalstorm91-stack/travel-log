import { defineConfig } from 'vitest/config'

// Unit tests run in plain Node: they cover the app's logic (settlement, routes, backup,
// geocoding...), not the screens. IndexedDB comes from fake-indexeddb (see src/test/setup.ts).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
})
