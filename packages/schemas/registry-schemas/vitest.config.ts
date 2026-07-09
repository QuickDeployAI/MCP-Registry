import { defineConfig } from "vitest/config";

// Self-contained config so the package's unit tests do not inherit the
// repo-root vite config (which relies on the bespoke `vite-plus` plugin).
export default defineConfig({
  test: {
    root: __dirname,
    include: ["src/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "threads",
    maxWorkers: 4,
  },
});
