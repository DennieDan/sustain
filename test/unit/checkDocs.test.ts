// FR-DOC-03: the check:docs gate rejects malformed ADRs, gaps, stale index rows and broken links.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { checkDocs, checkTraceability, relativeLinks } from "../../scripts/check-docs.mjs";
import { repoRoot } from "./support/sourceScan";

function adr(title: string, overrides: { status?: string; date?: string; body?: string } = {}): string {
  const status = overrides.status ?? "accepted";
  const date = overrides.date ?? "2026-10-10";
  const body =
    overrides.body ??
    [
      "## Context and Problem Statement",
      "",
      "Why.",
      "",
      "## Considered Options",
      "",
      "* A",
      "* B",
      "",
      "## Decision Outcome",
      "",
      'Chosen option: "A", because it works.',
      "",
      "### Consequences",
      "",
      "* Good, because it is simple.",
      "* Bad, because it is new.",
    ].join("\n");
  return `---\nstatus: ${status}\ndate: ${date}\ndecision-makers: owner\n---\n\n# ${title}\n\n${body}\n`;
}

function indexFor(rows: [string, string, string][]): string {
  const lines = rows.map(([file, status, date]) => `| [${file.slice(0, 4)}](${file}) | T | ${status} | ${date} |`);
  return ["# ADRs", "", "| # | Title | Status | Date |", "|---|---|---|---|", ...lines, ""].join("\n");
}

let docs: string;

function write(path: string, content: string): void {
  mkdirSync(dirname(join(docs, path)), { recursive: true });
  writeFileSync(join(docs, path), content);
}

beforeEach(() => {
  docs = mkdtempSync(join(tmpdir(), "sustain-docs-"));
  write("adr/template.md", "template\n");
  write("adr/0001-first.md", adr("First"));
  write("adr/0002-second.md", adr("Second"));
  write(
    "adr/README.md",
    indexFor([
      ["0001-first.md", "accepted", "2026-10-10"],
      ["0002-second.md", "accepted", "2026-10-10"],
    ]),
  );
});

afterEach(() => rmSync(docs, { recursive: true, force: true }));

describe("FR-DOC-03 check:docs", () => {
  test("a well-formed tree passes", () => {
    expect(checkDocs(docs).problems).toEqual([]);
  });

  test("the repository's own docs pass", () => {
    const result = checkDocs(join(repoRoot, "docs"));
    expect(result.problems).toEqual([]);
    expect(result.adrCount).toBeGreaterThan(0);
  });

  test("missing front matter fields are reported", () => {
    write("adr/0002-second.md", "---\nstatus: accepted\n---\n\n# Second\n");
    const problems = checkDocs(docs).problems;
    expect(problems).toContain("0002-second.md: front matter lacks date");
    expect(problems).toContain("0002-second.md: front matter lacks decision-makers");
  });

  test("invalid statuses and dangling supersession targets are reported", () => {
    write("adr/0001-first.md", adr("First", { status: "done" }));
    write("adr/0002-second.md", adr("Second", { status: "superseded by [ADR-0009](0009-nine.md)" }));
    const problems = checkDocs(docs).problems;
    expect(problems).toContain('0001-first.md: invalid status "done"');
    expect(problems).toContain("0002-second.md: status points at unknown ADR 0009-nine.md");
  });

  test("a valid supersession passes when the index matches", () => {
    const status = "superseded by [ADR-0002](0002-second.md)";
    write("adr/0001-first.md", adr("First", { status }));
    write(
      "adr/README.md",
      indexFor([
        ["0001-first.md", status, "2026-10-10"],
        ["0002-second.md", "accepted", "2026-10-10"],
      ]),
    );
    expect(checkDocs(docs).problems).toEqual([]);
  });

  test("missing required sections and too few options are reported", () => {
    write("adr/0002-second.md", adr("Second", { body: "## Considered Options\n\n* Only one\n" }));
    const problems = checkDocs(docs).problems;
    expect(problems).toContain('0002-second.md: missing section "## Context and Problem Statement"');
    expect(problems).toContain('0002-second.md: missing section "## Decision Outcome"');
    expect(problems).toContain('0002-second.md: missing section "### Consequences"');
    expect(problems).toContain('0002-second.md: "## Considered Options" lists fewer than two options');
  });

  test("an outcome without the MADR sentence is reported", () => {
    const body = adr("x").split("---\n\n# x\n\n")[1]!.replace('Chosen option: "A", because it works.', "We pick A.");
    write("adr/0002-second.md", adr("Second", { body }));
    expect(checkDocs(docs).problems).toContain(`0002-second.md: "## Decision Outcome" lacks 'Chosen option: "…", because …'`);
  });

  test("numbering gaps are reported", () => {
    rmSync(join(docs, "adr/0002-second.md"));
    write("adr/0003-third.md", adr("Third"));
    write(
      "adr/README.md",
      indexFor([
        ["0001-first.md", "accepted", "2026-10-10"],
        ["0003-third.md", "accepted", "2026-10-10"],
      ]),
    );
    expect(checkDocs(docs).problems).toEqual(["0003-third.md: expected number 0002 (numbers must be contiguous from 0001)"]);
  });

  test("index rows that are missing, stale or extra are reported", () => {
    write(
      "adr/README.md",
      indexFor([
        ["0001-first.md", "proposed", "2026-10-10"],
        ["0007-ghost.md", "accepted", "2026-10-10"],
      ]),
    );
    const problems = checkDocs(docs).problems;
    expect(problems).toContain('adr/README.md: status of 0001-first.md is "proposed", file says "accepted"');
    expect(problems).toContain("adr/README.md: index does not list 0002-second.md");
    expect(problems).toContain("adr/README.md: index lists missing file 0007-ghost.md");
  });

  test("broken relative links anywhere under docs are reported; code and URLs are ignored", () => {
    write("progress.md", "[ok](adr/0001-first.md) [anchor](#x) [web](https://example.com) `[code](nope.md)` [bad](missing.md#top)\n");
    expect(checkDocs(docs).problems).toEqual(["progress.md: broken link missing.md#top"]);
  });

  test("links in docs/research/ go unchecked, since they point at the researcher's own data", () => {
    write("research/report.md", "[ledger](../../research/change-collection/results/ledger.jsonl)\n");
    write("progress.md", "[report](research/report.md)\n");
    expect(checkDocs(docs).problems).toEqual([]);
  });

  test("relativeLinks skips fenced code blocks", () => {
    expect(relativeLinks("```\n[a](a.md)\n```\n[b](b.md)\n")).toEqual(["b.md"]);
  });
});

describe("ENG-03 traceability", () => {
  const SPEC = ["| ID | Feature |", "|---|---|", "| SAF-01 | Integrity |", "| SAF-02 | Approvals |", "| UI-01 | Sidebar |"].join("\n");
  const SPEC_V01 = "FR-VAL-05 checks citations.";

  test("ENG-03 every ID the spec defines is on exactly one checklist line, and progress names only defined IDs", () => {
    const good = ["- [x] **SAF-01 Integrity** — done, see FR-VAL-05.", "- [ ] **SAF-02 Approvals**", "- [x] **UI-01 Sidebar**"].join("\n");
    expect(checkTraceability(SPEC, SPEC_V01, good)).toEqual([]);
    const bad = ["- [x] **SAF-01 Integrity**", "- [x] **SAF-01 Integrity**, pulled forward", "- [x] **UI-01 Sidebar** — also closes SAF-09"].join("\n");
    expect(checkTraceability(SPEC, SPEC_V01, bad)).toEqual([
      "progress-v0.3.md: SAF-01 is on 2 checklist lines; it needs exactly one",
      "progress-v0.3.md: SAF-02 is on 0 checklist lines; it needs exactly one",
      "progress-v0.3.md: SAF-09 is defined in neither spec",
    ]);
  });

  test("ENG-03 check:docs traces the spec and progress it finds in the docs folder", () => {
    write("spec-v0.3.md", SPEC);
    write("progress-v0.3.md", ["- [x] **SAF-01 Integrity**", "- [x] **SAF-02 Approvals**"].join("\n"));
    expect(checkDocs(docs).problems).toEqual(["progress-v0.3.md: UI-01 is on 0 checklist lines; it needs exactly one"]);
  });
});
