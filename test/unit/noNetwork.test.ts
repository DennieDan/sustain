// NFR-SEC-02, PRC-04 and CLD-09: neither the extension, the webview nor the skill scripts make
// network requests; only the cloud upload client and, in the Action, the GitHub client do.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { importSpecifiers, repoRoot, sourceFiles } from "./support/sourceScan";

const NETWORK_MODULES: Record<string, true> = { http: true, https: true, http2: true, net: true, tls: true, dgram: true };
const NETWORK_APIS = [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/];

function networkViolations(file: string, source: string): string[] {
  const violations: string[] = [];
  for (const specifier of importSpecifiers(source)) {
    const bare = specifier.replace(/^node:/, "").split("/")[0]!;
    if (NETWORK_MODULES[bare]) violations.push(`${file}: imports ${specifier}`);
  }
  for (const api of NETWORK_APIS) {
    if (api.test(source)) violations.push(`${file}: uses ${api.source}`);
  }
  return violations;
}

describe("NFR-SEC-02 no network", () => {
  test("src/** and webview/** contain no network imports or APIs, except the cloud upload client", () => {
    // CLD-09: src/cloud/client.ts uploads only when the user runs publish or sets the Action's upload.
    const files = [...sourceFiles("src"), ...sourceFiles("webview")].filter((file) => file !== "src/cloud/client.ts");
    expect(sourceFiles("src")).toContain("src/cloud/client.ts");
    const violations = files.flatMap((file) => networkViolations(file, readFileSync(join(repoRoot, file), "utf8")));
    expect(violations).toEqual([]);
  });

  test("PRC-04 in the Action only the GitHub client uses the network, and nothing starts a program", () => {
    const files = sourceFiles("action/src");
    expect(files).toContain("action/src/github.ts");
    const violations = files.filter((file) => file !== "action/src/github.ts").flatMap((file) => networkViolations(file, readFileSync(join(repoRoot, file), "utf8")));
    expect(violations).toEqual([]);
    for (const file of files) expect(readFileSync(join(repoRoot, file), "utf8")).not.toMatch(/child_process|\bspawn|\bexec(File)?(Sync)?\(/);
  });

  test.each([
    'import * as http from "http";',
    'import { request } from "node:https";',
    'import { connect } from "node:http2";',
    'const net = require("net");',
    'import tls from "node:tls";',
    'import { createSocket } from "dgram";',
    "const response = await fetch(url);",
    "const xhr = new XMLHttpRequest();",
    "const socket = new WebSocket(url);",
  ])("flags %s", (source) => {
    expect(networkViolations("src/x.ts", source)).toHaveLength(1);
  });

  test("allows file-system and child-process imports", () => {
    const source = 'import { readFileSync } from "node:fs";\nimport { spawnSync } from "node:child_process";';
    expect(networkViolations("src/x.ts", source)).toEqual([]);
  });
});
