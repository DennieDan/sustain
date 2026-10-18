// Sustain Cloud's Next.js configuration. The app imports the shared model from ../src, so the
// build's root is the repository.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const config: NextConfig = {
  turbopack: { root: repository },
  outputFileTracingRoot: repository,
  poweredByHeader: false,
  // PGlite loads its WebAssembly at run time from its own package.
  serverExternalPackages: ["@electric-sql/pglite"],
  // The docs pages read the repository's README and docs/ (CLD-08).
  outputFileTracingIncludes: { "/docs/[[...slug]]": ["../README.md", "../docs/*.md"] },
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }, { key: "Referrer-Policy", value: "same-origin" }, { key: "X-Frame-Options", value: "DENY" }] }];
  },
};

export default config;
