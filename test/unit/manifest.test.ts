// SAF-07: the extension manifest keeps Sustain off in untrusted workspaces.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { repoRoot } from "./support/sourceScan";

test("SAF-07 Sustain declares no support for untrusted workspaces", () => {
  const manifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { capabilities?: { untrustedWorkspaces?: { supported?: unknown } } };
  expect(manifest.capabilities?.untrustedWorkspaces?.supported).toBe(false);
});
