// CLD-03 and CLD-04: cloud pages open boxes on GitHub at the map's commit, take freshness from the
// latest check, and on a pull request add the overlay and candidates.
import { expect, test } from "vitest";
import { mapPageData } from "../../src/lib/mapPage";
import type { Repository, UploadRow } from "../../src/lib/store";
import { checkUpload, COMMIT, MAP } from "../support/fixtures";

const REPO = { id: 1, githubId: 1, owner: "acme", name: "shop", defaultBranch: "main", private: true, publicMaps: false, createdAt: new Date() } as Repository;

function row(fields: Partial<UploadRow>): UploadRow {
  return { id: 1, repoId: 1, kind: "map", commit: COMMIT, branch: "main", pull: null, payload: {}, via: "token", tokenId: null, size: null, createdAt: new Date("2026-10-18T10:00:00Z"), ...fields };
}

test("CLD-03 the map page links GitHub at the map's commit and shows the latest check's stale boxes", () => {
  const { check } = checkUpload(7) as { check: unknown };
  const data = mapPageData(REPO, row({ payload: { map: MAP } }), row({ kind: "check", commit: "f".repeat(40), payload: { check } }));
  expect(data.repository).toEqual({ url: "https://github.com/acme/shop", revision: COMMIT, provider: "github" });
  expect(data.root).toBeNull();
  expect(data.messages).toEqual([{ type: "freshness", boxes: { llm: "edited" }, header: expect.stringMatching(/^1 of \d+ boxes changed since this map \(fffffff, /) }]);
});

test("CLD-04 a pull request page adds the touched boxes and the candidates as ghosts", () => {
  const { check } = checkUpload(7) as { check: unknown };
  const data = mapPageData(REPO, row({ payload: { map: MAP } }), row({ kind: "check", pull: 7, payload: { check } }), 7);
  expect(data.messages?.slice(1)).toEqual([
    { type: "changes", overlay: { scope: "Pull request #7", strong: ["retriever"], weak: [], uncovered: ["src/new.ts"] } },
    { type: "ghosts", ghosts: [{ label: "payments", files: 1 }] },
  ]);
});
