// SAF-03: the secret scan rejects credential-shaped strings and leaves real maps alone.
import { describe, expect, test } from "vitest";
import { findSecrets, secretKind } from "../../../src/core/secrets";
import { archifyFixtures } from "../support/fixtures";

describe("SAF-03 secret scan", () => {
  test.each([
    ["-----BEGIN OPENSSH PRIVATE KEY-----", "private key"],
    ["token ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4", "GitHub token"],
    ["github_pat_11ABCDEFG0123456789_abcdefghij", "GitHub token"],
    ["sk-ant-api03-AbCdEfGhIjKlMnOpQrStUv", "API key"],
    ["xoxb-123456789012-abcdefghij", "Slack token"],
    ["AKIAIOSFODNN7EXAMPLE", "AWS access key"],
    ["q8Zr2LmX9vB4nT7wK1pYc6HdF3sJ0aGe", "high-entropy string"],
  ])("flags %s as a %s", (text, kind) => {
    expect(secretKind(text)).toBe(kind);
  });

  test.each([
    "e5164af0123456789abcdef0123456789abcdef0",
    "src/test/java/seedu/address/model/person/Person2TestUtilBuilder.java",
    "createRunFolderWithCollisionHandlingAndRetries",
    "Orders API handles checkout and refunds",
  ])("leaves %s alone", (text) => {
    expect(secretKind(text)).toBeNull();
  });

  test("reports the JSON pointer of every secret in a document", () => {
    const doc = { components: [{ id: "a", label: "AKIAIOSFODNN7EXAMPLE", sources: [{ path: "a/b.ts", label: "ok" }] }], "x/y": "xoxb-123456789012-abcdefghij" };
    expect(findSecrets(doc).map((issue) => issue.pointer)).toEqual(["/components/0/label", "/x~1y"]);
  });

  test("the vendored Archify fixtures contain nothing secret-shaped", () => {
    const fixtures = archifyFixtures();
    expect(fixtures.length).toBeGreaterThan(0);
    for (const fixture of fixtures) expect(findSecrets(JSON.parse(fixture.text)), fixture.name).toEqual([]);
  });
});
