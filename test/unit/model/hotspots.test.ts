// ARC-03: hotspots from a temporary git history: commits, lines changed and distinct authors per
// box over the window, with older commits left out.
import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";
import { changeLog } from "../../../src/model/git";
import { hotspotNote, hotspots } from "../../../src/model/hotspots";
import { git, gitRepo, put } from "../support/temp";

/** Commits everything as `email`, `daysAgo` days back. */
function commitAs(root: string, email: string, daysAgo = 0): void {
  git(root, "add", "-A");
  const date = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  const result = spawnSync("git", ["-c", `user.name=Someone`, "-c", `user.email=${email}`, "-c", "commit.gpgsign=false", "commit", "-qm", "change"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
  if (result.status !== 0) throw new Error(result.stderr);
}

test("ARC-03 each box counts the commits, lines and distinct authors over its files in the window", () => {
  const root = gitRepo({ "src/api/a.ts": "1\n", "src/store/b.ts": "1\n", "docs/x.md": "1\n" });
  put(root, "src/store/b.ts", "1\n2\n");
  commitAs(root, "old@example.com", 200);
  put(root, "src/api/a.ts", "1\n2\n3\n4\n");
  commitAs(root, "ann@example.com");
  put(root, "src/api/a.ts", "1\n2\n3\n");
  put(root, "docs/x.md", "1\n2\n");
  commitAs(root, "ann@example.com");
  put(root, "docs/x.md", "1\n2\n3\n");
  commitAs(root, "bo@example.com");

  const log = changeLog(root, 90)!;
  expect(log).toHaveLength(4);
  const components = [
    { id: "api", sources: [{ path: "src/api/a.ts" }] },
    { id: "store", sources: [{ path: "src/store/b.ts" }] },
    { id: "ui", sources: [{ path: "src/ui/c.ts" }] },
  ];
  const result = hotspots(log, components);
  // The initial commit adds each file's one line; the 200-day-old commit is outside the window.
  // Store's one commit of the busiest box's three rounds up to level 2.
  expect(result).toEqual([
    { id: "api", commits: 3, lines: 1 + 3 + 1, authors: 2, level: 4 },
    { id: "store", commits: 1, lines: 1, authors: 1, level: 2 },
    { id: "ui", commits: 0, lines: 0, authors: 0, level: 0 },
  ]);
  expect(hotspotNote(result[0]!, 90)).toBe("3 commits, 5 lines changed, 2 authors in the last 90 days.");
  expect(hotspotNote(result[2]!, 30)).toBe("0 commits, 0 lines changed, 0 authors in the last 30 days.");
  expect(changeLog(root, 365)).toHaveLength(5);
});
