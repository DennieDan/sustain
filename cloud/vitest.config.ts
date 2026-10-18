import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "cloud",
    environment: "node",
    include: ["test/unit/**/*.test.ts"],
    testTimeout: 20_000,
  },
});
