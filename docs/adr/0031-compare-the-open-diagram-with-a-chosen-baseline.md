---
status: accepted
date: 2026-10-19
decision-makers: owner
---

# Compare the open diagram with a chosen baseline in the viewer

## Context and Problem Statement

Since M6 ([ADR 0029](0029-update-the-previous-diagram-incrementally.md)) each run patches the previous diagram and keeps component and connection IDs, and every run folder records its lineage. The viewer still shows one `candidate.json` with no history, so after an update the user cannot see what the diagram is compared with or what changed. How should the viewer present the change?

## Decision Drivers

* The user must see what the diagram is compared with (commit hash, subject, date, uncommitted files) and which components, connections and boundaries were added, removed or changed.
* After an update run, the user should see what the agent reviewed and kept, and which changed files no component covers.
* No change to the Archify schema (`additionalProperties: false` everywhere), no git in the extension host, no new runtime dependency (NFR-QUAL-02, NFR-SEC-02).
* Results must be deterministic and testable without an agent.

## Considered Options

* Viewer-computed diff against a chosen baseline, with change metadata recorded by `change-map.mjs`
* Agent-written diff file per run
* Side-by-side diagrams (before and after in two panes)
* Git-based baseline at any commit

## Decision Outcome

Chosen option: "Viewer-computed diff against a chosen baseline, with change metadata recorded by `change-map.mjs`", because IDs are stable since M6, so a pure by-ID diff of two candidates is exact for update runs and close for regenerations. It needs no schema change and no agent output to trust.

* **Baseline.** By default the open run's `lineage.previousRun`; on request any parseable `candidate.json` in the same repo's `.archify/`, or none. A doubtful pair (different focus, under 30 % shared component IDs, different repository, outside the update history, baseline newer than the open diagram) shows a warning but is never blocked. A newer baseline offers Swap. A pair separated by a regeneration, or outside the update history, is labelled "approximate".
* **Diff.** Computed in the webview from the two tolerant-parsed diagrams (`src/model/diagramDiff.ts`). Nothing about change status is written into the diagram.
* **Commit details.** `change-map.mjs` records the subject and date of the base and head commits in `lineage.json`; the extension host runs no git.
* **Removed elements** are listed in a Changes panel, not drawn as ghost nodes, so toggling the change view never moves the layout.
* **Kept and uncited.** `change-map.mjs` writes `changes.json` in update runs. Its "code changed, kept" components and "not in any component" files are shown only when the baseline is the open run's immediate previous run, because combining several steps has no clear meaning.
* **Out of scope:** a "behind HEAD" staleness indicator and file diff editors. Both need git in the extension host, and each would be a separate decision.

### Consequences

* Good, because the diff is pure, deterministic and unit-tested, and works for any two diagrams the user has.
* Good, because the Archify schema, the validator and the skill text stay unchanged.
* Good, because the viewer stays git-free: commit details come from files written at generation time.
* Bad, because regenerations re-ID components the matcher misses, so some renames show up as an added and a removed element (mitigated by the "approximate" label).
* Bad, because boundaries have no `id`: they are matched by label, and a relabelled boundary whose members also changed shows up as removed and added.
* Bad, because kept and uncited information exists only for adjacent runs.

### Confirmation

`test/unit/model/diagramDiff.test.ts`, `test/unit/model/comparison.test.ts`, the DOM tests under `test/dom/`, and `test/e2e/suite/single.compare.test.ts` cover FR-CMP-01…12; FR-CMP-14 is the manual check recorded in `progress.md`.

## Pros and Cons of the Options

### Agent-written diff file per run

* Good, because the agent knows why it changed something.
* Bad, because its output is not reliable enough to trust as a record, and it covers only the pair the agent saw, never a chosen baseline.

### Side-by-side diagrams

* Good, because both layouts are visible.
* Bad, because two independent layouts make the same component sit in different places, which makes changes harder to spot than marks on one diagram.

### Git-based baseline at any commit

* Good, because any point in history could be compared.
* Bad, because no diagram exists for an arbitrary commit, and it needs git in the extension host.

## More Information

Spec: §7.12 of [spec.md](../spec.md) (FR-CMP-01…14). Builds on [ADR 0029](0029-update-the-previous-diagram-incrementally.md) and [ADR 0030](0030-change-map-details-not-fixed-by-the-spec.md).
