// ARC-04: the agents' notes block, merged into AGENTS.md and CLAUDE.md idempotently with the
// people's own text untouched.
import { expect, test } from "vitest";
import { claudeNeedsNotes, mergeNotes, notesBlock, NOTES_END, NOTES_START } from "../../../src/model/agentNotes";
import type { Rule } from "../../../src/model/rules";

const MAP = {
  run: "architecture-shop-20261019-120000",
  components: [
    { id: "api", label: "API", sublabel: "Order requests", type: "backend", sources: [{ path: "src/api/handler.ts" }, { path: "src/api/handler.ts" }, { path: "src/api/routes.ts" }] },
    { id: "store", label: "Store", type: "database", sources: [] },
  ],
  connections: [{ from: "api", to: "store", label: "saves orders" }, { from: "store", to: "api" }],
};
const RULES: Rule[] = [
  { id: "a", kind: "forbid", from: ["store"], to: ["api", "path:src/web/**"], reason: "The store knows no callers." },
  { id: "b", kind: "only-via", from: ["path:**"], to: ["store"], via: ["api"], reason: "One door." },
  { id: "c", kind: "isolated", from: ["store"], to: ["api"], reason: "Kept private." },
  { id: "d", kind: "isolated", from: ["store"], reason: "Sealed." },
];

test("ARC-04 the block lists the boxes with roles and paths, the arrows, and the rules in plain language", () => {
  expect(notesBlock(MAP, RULES)).toBe(
    [
      NOTES_START,
      "## Architecture",
      "",
      "Sustain wrote this block from the map `.archify/architecture-shop-20261019-120000` and replaces it when the notes are written again. Change the map or `sustain.config.json`, not this block.",
      "",
      "### Boxes",
      "",
      "- **API**: Order requests (backend). Code: `src/api/handler.ts`, `src/api/routes.ts`.",
      "- **Store**: database.",
      "",
      "### How the boxes work together",
      "",
      "- API uses Store (saves orders).",
      "- Store uses API.",
      "",
      "### Rules",
      "",
      "Keep to these when you change the code. `sustain check` and the editor report imports that break them.",
      "",
      "- Code in Store must not import API and files matching `src/web/**`. The store knows no callers.",
      "- Code reaches Store only through API. One door.",
      "- Only API may import Store. Kept private.",
      "- Nothing outside Store may import it. Sealed.",
      NOTES_END,
    ].join("\n"),
  );
  expect(notesBlock({ ...MAP, connections: [] }, [])).not.toContain("### How the boxes work together");
});

test("ARC-04 merging adds the block once, replaces only the block, and leaves the people's text as it was", () => {
  const block = notesBlock(MAP, RULES);
  const own = "# Agents\n\nRun npm test before you push.\n";
  const first = mergeNotes(own, block);
  expect(first).toBe(`${own}\n${block}\n`);
  expect(mergeNotes(first, block)).toBe(first);
  const edited = `${first}\nMore notes after the block.\n`;
  const next = mergeNotes(edited, notesBlock(MAP, []));
  expect(next.startsWith(own)).toBe(true);
  expect(next.endsWith("\nMore notes after the block.\n")).toBe(true);
  expect(next).not.toContain("### Rules");
  expect(mergeNotes("", block)).toBe(`${block}\n`);
});

test("ARC-04 CLAUDE.md gets the block only when it does not import AGENTS.md", () => {
  expect(claudeNeedsNotes("# Claude\n\n@AGENTS.md\n")).toBe(false);
  expect(claudeNeedsNotes("@./AGENTS.md")).toBe(false);
  expect(claudeNeedsNotes("# Claude\n\nSee AGENTS.md for more.\n")).toBe(true);
});
