// FR-VAL-05 deny-list, ported from the prototype's deny.rs unit tests and tests/deny.rs.
import { describe, expect, test } from "vitest";
import { isDenied, segmentDenied } from "../../../src/core/deny";

describe("FR-VAL-05 deny-list", () => {
  test.each([
    ".git", ".archify", ".npmrc", ".pypirc", ".netrc", ".env", ".env.local", ".env.production",
    "server.pem", "tls.key", "cert.p12", "cert.pfx", "id_rsa", "id_rsa.pub", "id_ed25519",
    "id_ed25519_work.pub", ".ENV", "Server.PEM", ".GIT",
  ])("segment %s is denied", (segment) => {
    expect(segmentDenied(segment)).toBe(true);
  });

  test.each([
    ".env.example", ".env.sample", ".ENV.Example", ".envrc", "env", "dotenv.rs", ".gitignore", ".github",
    "archify", "keys", "keyboard.rs", "key", "pem.rs", "my_id_rsa", "npmrc", "server.pem.txt",
  ])("segment %s is allowed", (segment) => {
    expect(segmentDenied(segment)).toBe(false);
  });

  test.each([
    ".git/HEAD", "a/.git/HEAD", "vendor/lib/.git/config", ".archify/architecture-x-20261010-093000/candidate.sir",
    "sub/.archify/x", "config/.env", "apps/web/.env.development", "keys/server.PEM", "a/b/cert.p12",
    "home/.ssh/id_rsa_old", "deploy/id_ed25519.pub", "packages/app/.npmrc", "x/.netrc",
  ])("path %s is denied (any segment)", (path) => {
    expect(isDenied(path)).toBe(true);
  });

  test.each([
    ".gitignore", ".github/workflows/ci.yml", "git/x", "archify/x", "a.git", "config/.env.example",
    "apps/web/.env.sample", "src/env.rs", "keys/README.md", "docs/p12.md", "docs/rsa.md", "id_ecdsa",
    ".npmrc.md", ".yarnrc", "netrc.rs", "src/main.rs",
  ])("path %s is allowed", (path) => {
    expect(isDenied(path)).toBe(false);
  });
});
