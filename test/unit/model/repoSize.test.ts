// CST-01: the repository's size from git or a walk, lines per language with a test split, the tier,
// and a cost that grows with the files listed rather than read.
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { repoSize, tierOf, type RepoSize } from "../../../src/model/repoSize";
import { envWithoutGit, git, gitRepo, put, tempDir } from "../support/temp";

const lines = (count: number): string => "x\n".repeat(count);

const FILES: Record<string, string> = {
  "src/app.ts": lines(10),
  "src/app.test.ts": lines(4),
  "src/util.py": "a = 1\nb = 2",
  "tests/test_util.py": lines(3),
  "src/main/java/App.java": lines(6),
  "src/test/java/AppTest.java": lines(2),
  "README.md": lines(5),
  "Dockerfile": lines(2),
  "logo.png": "\u0089PNG\r\n",
  "data.bin.txt": "a\u0000b\n",
  "package-lock.json": lines(500),
  "web/app.min.js": lines(50),
  "node_modules/dep/index.js": lines(70),
  "dist/bundle.js": lines(80),
  ".env": lines(9),
  "gen/schema.ts": lines(40),
  ".gitattributes": "gen/** linguist-generated=true\n",
};

function byLanguage(size: RepoSize): Record<string, [number, number, number]> {
  return Object.fromEntries(size.languages.map((entry) => [entry.language, [entry.files, entry.lines, entry.testLines]]));
}

test("CST-01 tracked files are measured per language with a test split, leaving out binaries, generated, skipped and deny-listed files", () => {
  const root = gitRepo(FILES);
  put(root, "src/untracked.ts", lines(100));
  const size = repoSize(root);
  expect(size.listing).toBe("git");
  expect(byLanguage(size)).toEqual({
    TypeScript: [2, 14, 4],
    Java: [2, 8, 2],
    Python: [2, 5, 3],
    Markdown: [1, 5, 0],
    Dockerfile: [1, 2, 0],
    Other: [1, 1, 0],
  });
  expect(size.lines).toEqual({ total: 35, test: 9, nonTest: 26 });
  expect([size.files, size.counted, size.tier]).toEqual([9, 9, "S"]);
});

test("CST-01 without git, a walk measures every file, skipping the same folders, deny-listed paths and links", () => {
  const root = tempDir();
  for (const [rel, content] of Object.entries(FILES)) put(root, rel, content);
  put(root, "src/untracked.ts", lines(100));
  put(root, ".git/config", lines(30));
  for (const dir of ["vendor/x", "build", "target", "out", ".sustain/run"]) put(root, `${dir}/file.ts`, lines(30));
  symlinkSync(join(root, "src/app.ts"), join(root, "src/link.ts"));
  const size = repoSize(root, envWithoutGit());
  expect(size.listing).toBe("walk");
  expect(byLanguage(size)["TypeScript"]).toEqual([4, 154, 4]);
  expect(size.lines.total).toBe(175);
});

test("CST-01 neither listing measures a link, even when its lines would only be estimated", () => {
  const linked = (root: string): string => {
    put(root, "a.ts", lines(3));
    symlinkSync("a.ts", join(root, "b.ts"));
    return root;
  };
  expect(repoSize(linked(tempDir()), envWithoutGit(), 1).files).toBe(1);
  const repo = linked(tempDir());
  git(repo, "init", "-q");
  git(repo, "add", ".");
  expect(repoSize(repo, process.env, 1).files).toBe(1);
});

test("CST-01 above the count limit, files spread through the tree are counted and the rest estimated from their size", () => {
  const files: Record<string, string> = {};
  for (let i = 0; i < 40; i++) files[`src/f${String(i).padStart(2, "0")}.ts`] = lines(10 + (i % 3));
  const root = gitRepo(files);
  const size = repoSize(root, process.env, 8);
  expect([size.files, size.counted]).toEqual([40, 8]);
  expect(Math.abs(size.lines.total - 440)).toBeLessThanOrEqual(15);
});

test("CST-01 non-test lines set the tier: S below 20k, M from 20k to 150k, L above", () => {
  expect([tierOf(0), tierOf(19_999), tierOf(20_000), tierOf(150_000), tierOf(150_001)]).toEqual(["S", "S", "M", "M", "L"]);
  const root = gitRepo({ "src/big.ts": lines(20_000), "test/big.test.ts": lines(200_000) });
  expect(repoSize(root).tier).toBe("M");
  git(root, "rm", "-q", "src/big.ts");
  expect(repoSize(root).tier).toBe("S");
});

test("CST-01 20,000 files take at most 4 times as long as 2,000", { timeout: 120_000 }, () => {
  const tree = (count: number): string => {
    const root = tempDir();
    for (let i = 0; i < count; i++) put(root, `d${i % 100}/f${i}.ts`, "export const a = 1;\nexport const b = 2;\n");
    return root;
  };
  const env = envWithoutGit();
  const time = (root: string): number => {
    let best = Infinity;
    for (let run = 0; run < 3; run++) {
      const start = performance.now();
      repoSize(root, env);
      best = Math.min(best, performance.now() - start);
    }
    return best;
  };
  const small = tree(2_000);
  const large = tree(20_000);
  expect(repoSize(large, env).files).toBe(20_000);
  expect(time(large)).toBeLessThanOrEqual(4 * time(small));
});
