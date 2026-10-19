---
status: accepted
date: 2026-10-19
decision-makers: implementer
---

# Change view details not fixed by the spec

## Context and Problem Statement

§7.12 of the spec (FR-CMP-01…12) fixes the change view's data, rules and messages. Implementing it raised details the spec leaves open: duplicate boundary labels, where the update-history walk starts, files opened from outside `.archify/`, how a delayed reload interacts with a picked baseline, how the panel overlay affects fitting, and several presentation details. How should they behave?

## Decision Drivers

* Deterministic results for the same pair of diagrams.
* A user's explicit choice (picker, Swap) must not be undone by background events.
* Nothing the user needs to see may be hidden behind the overlay panel.
* Text and colours stay readable in every theme, using VS Code theme variables only (FR-VIEW-05).

## Considered Options

* Decide each case as listed below
* Leave the cases to whatever the first implementation happens to do

## Decision Outcome

Chosen option: "Decide each case as listed below", because each case is user-visible or affects test determinism.

* **Duplicate boundary labels** get the same `#2`, `#3`… suffix in document order as duplicate connection keys, so matching stays one-to-one.
* **Renamed boundaries** list `label` (old → new), then `kind` if it differs. A component's `boundary` field is compared after mapping the baseline's boundary keys to the current ones, so a pure boundary rename does not mark its members changed.
* **Update history** starts at the open run's `previousRun`; the open run itself is not part of it. `approximate` looks at the modes of the open run and of every run walked before the baseline; the baseline's own mode does not count.
* **`unrelated`** is skipped when neither diagram has a component (no ratio to compute). The `different-repository` message names the baseline's URL.
* **Files outside the run order** (opened with "Browse…") have no slug, no lineage and no default baseline. As the open file they get run order −1, and as a baseline run order `Number.MAX_SAFE_INTEGER`, so they never trigger `reversed` or `newer`.
* **Picked baselines survive reloads.** A baseline chosen with the picker or Swap, or cleared because its file was deleted, is kept on every reload of the same file. A default baseline is recomputed on reload, which gives the same file unless the run's lineage changed. Otherwise a delayed watcher reload could undo the user's pick.
* **Picker:** "No comparison" is the picked item when there is no baseline. The detail leaves out any missing part (`<short hash> <subject> · <mode>` and the tags, joined with ` · `). A `previousRun` or run name containing `/`, `\`, `.` or `..` is ignored.
* **`openFile`** reuses the source-opening code of FR-NAV-02/03 (`openSourceRef` in `navigate.ts`) with a bare `{path}`, so the stale and invalid-path messages are identical. Rejected paths are logged with `console.warn`.
* **Fitting with the panel open.** While the Changes panel is expanded, fit-to-view and fit-to-element keep the scene out of the area the panel covers. Pan and zoom are unaffected. The layout is never re-run.
* **Presentation:**
  * Commit subjects and text-field values are shown in curly quotes. "+ N uncommitted files" and the relative dates use the singular for 1.
  * Removed counts and the legend's Removed entry use `--vscode-gitDecoration-deletedResourceForeground`. Renamed boundaries use the Changed colour.
  * Marked boundaries get a solid 2.5 px status-coloured stroke instead of the default dashes.
  * Changed rows show `field: “old” → “new”`, separated by `; `, with `(none)` for an absent value. Connection rows show `From → To (label)`.
  * The header is hidden only in the empty state.
* **`commitInfo`** takes the git program as an optional third parameter, like the other reads in `git.ts`, so tests can simulate a missing git. `baseCommit` is recorded in regenerate runs too whenever the base revision is known and readable.

### Consequences

* Good, because every case has a defined, tested behaviour.
* Good, because the user's explicit baseline choice is stable against background reloads.
* Bad, because comparing a run with a newer run of the same history shows both `outside-history` and `reversed` warnings: by the FR-CMP-04 rule, a newer run is never in the open run's update history.

### Confirmation

`test/unit/model/diagramDiff.test.ts`, `test/unit/model/comparison.test.ts`, `test/unit/extension/baseline.test.ts`, `test/unit/extension/watchLogic.test.ts`, `test/dom/changes.test.ts`, `test/dom/main.test.ts` (fit with the panel expanded), and `test/e2e/suite/single.compare.test.ts`.

## More Information

Spec: §7.12 of [spec.md](../spec.md) (FR-CMP-01…12). Decision being implemented: [ADR 0031](0031-compare-the-open-diagram-with-a-chosen-baseline.md).
