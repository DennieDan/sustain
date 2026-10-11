import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["test/unit/**/*.test.ts"],
          globalSetup: ["test/unit/support/buildScripts.ts"],
        },
      },
      {
        test: {
          name: "dom",
          environment: "happy-dom",
          include: ["test/dom/**/*.test.ts"],
        },
      },
    ],
  },
});
