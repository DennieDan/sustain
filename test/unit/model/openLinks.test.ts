// RCH-01: the page's open targets build editor, GitHub and copy links only for citable paths.
import { describe, expect, test } from "vitest";
import { availableTargets, linkablePath, openLink, type LinkContext } from "../../../src/model/openLinks";

const LOCAL: LinkContext = {
  root: "/home/me/my repo",
  project: "my repo",
  repository: { url: "https://github.com/acme/shop.git", revision: "0123456789abcdef0123456789abcdef01234567", provider: "github" },
};
const SHARED: LinkContext = { root: null, project: null, repository: LOCAL.repository };
const CITED = { path: "src/a b.ts", line: 12, end_line: 20 };

describe("RCH-01 link builders", () => {
  test("VS Code and Cursor open the absolute path at the line", () => {
    expect(openLink("vscode", CITED, LOCAL)).toBe("vscode://file//home/me/my%20repo/src/a%20b.ts:12:1");
    expect(openLink("cursor", { path: "x.ts" }, LOCAL)).toBe("cursor://file//home/me/my%20repo/x.ts:1:1");
    expect(openLink("vscode", { path: "x.ts", line: 3 }, { ...LOCAL, root: "C:\\Users\\me\\repo" })).toBe("vscode://file/C:/Users/me/repo/x.ts:3:1");
  });

  test("JetBrains navigates by project and relative path, or opens the file", () => {
    expect(openLink("jetbrains", CITED, LOCAL)).toBe("jetbrains://idea/navigate/reference?project=my%20repo&path=src%2Fa%20b.ts%3A12");
    expect(openLink("jetbrains", { path: "x.ts", line: 2 }, { ...LOCAL, project: null })).toBe("idea://open?file=%2Fhome%2Fme%2Fmy%20repo%2Fx.ts&line=2");
  });

  test("GitHub links the revision's lines; Copy gives path:line", () => {
    expect(openLink("github", CITED, SHARED)).toBe("https://github.com/acme/shop/blob/0123456789abcdef0123456789abcdef01234567/src/a%20b.ts#L12-L20");
    expect(openLink("github", { path: "x.ts" }, SHARED)).toBe("https://github.com/acme/shop/blob/0123456789abcdef0123456789abcdef01234567/x.ts");
    expect(openLink("copy", CITED, SHARED)).toBe("src/a b.ts:12-20");
    expect(openLink("copy", { path: "x.ts", line: 4 }, SHARED)).toBe("x.ts:4");
  });

  test("targets that need the root or a GitHub revision are absent without them", () => {
    expect(availableTargets(LOCAL)).toEqual(["vscode", "cursor", "jetbrains", "github", "copy"]);
    expect(availableTargets(SHARED)).toEqual(["github", "copy"]);
    expect(availableTargets({ root: null, project: null, repository: { url: "https://gitlab.com/a/b", revision: "abc1234" } })).toEqual(["copy"]);
    expect(openLink("vscode", CITED, SHARED)).toBeNull();
    expect(openLink("github", CITED, { ...SHARED, repository: { url: "https://github.com/a/b", revision: "main", provider: "github" } })).toBeNull();
  });
});

describe("RCH-01 path checks", () => {
  test.each(["../etc/passwd", "/etc/passwd", "a//b.ts", ".env", "keys/id_rsa", "C:/x.ts", "certs/server.pem", ".git/config"])("%s gets no link", (path) => {
    expect(linkablePath(path)).toBe(false);
    for (const target of ["vscode", "cursor", "jetbrains", "github", "copy"] as const) expect(openLink(target, { path, line: 1 }, LOCAL)).toBeNull();
  });

  test("an ordinary path is linkable", () => {
    expect(linkablePath("src/model/types.ts")).toBe(true);
    expect(linkablePath(".env.example")).toBe(true);
  });
});
