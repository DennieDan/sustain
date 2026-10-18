import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "cloud",
    environment: "node",
    include: ["test/unit/**/*.test.ts"],
    // Each test opens its own PGlite database, which takes seconds when several start at once.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
