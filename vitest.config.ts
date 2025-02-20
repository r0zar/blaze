import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000, // 30 seconds since we're using real network
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/types/**",
      ],
    },
    env: process.env.PRIVATE_KEY ? {
      PRIVATE_KEY: process.env.PRIVATE_KEY,
    } : {},
  },
});
