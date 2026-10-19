---
status: accepted
date: 2026-10-19
decision-makers: implementer
---

# Change map and ID matcher details not fixed by the spec

## Context and Problem Statement

FR-UPD-01…04 and FR-UPD-09 port the change collection study's `change-input.mjs`, `lib/diff.mjs` and `s3-match.mjs` with three stated differences (working tree, untracked and previously dirty files, deny-list). Running them on real working trees raises cases the study never met, because it diffed two commits of a clean bare clone: Sustain's own `.archify/` output in the working tree, previously dirty paths that no longer exist, untracked folders in the FR-GIT-01 dirty list, untracked files a component cites, quoted paths in diff headers, git failures, and unreadable previous files. How should `change-map.mjs` and `match-ids.mjs` handle them?

## Decision Drivers

* The agent should get only changes it can act on, and never a secret's content (NFR-SEC-02 spirit, FR-VAL-05 deny-list).
* Every git call stays a fixed argv starting with `--no-optional-locks`, without `-c` or a shell (FR-GIT-01, `test/unit/model/git.test.ts`).
* When in doubt, fall back to a regeneration: it is always correct, only more expensive.

## Considered Options

* Handle each case explicitly as listed below
* Port the study's code literally and let the agent sort out the noise

## Decision Outcome

Chosen option: "Handle each case explicitly as listed below", because the literal port lists Sustain's own run folders as changed files on every run when `.archify/` is not gitignored (Sustain never edits `.gitignore`, spec §3), and mislabels deleted or folder paths.

* **Own output.** Paths under the repo-root `.archify/` are left out of the change map entirely (not listed by name): they are Sustain's run folders, not code. Other deny-listed paths, `.archify` folders deeper in the tree included, are listed by name only, as FR-UPD-03 says.
* **Previously dirty paths.** A path from the previous lineage's `dirty` list that is not already in the diff is listed as `M` when it exists and as `D` when it is gone. An entry ending in `/` (git status reports untracked folders that way) stands for the cited files below it; it is not listed itself. A component citing such a path gets a name-only section noting that it was uncommitted when the previous diagram was drawn.
* **Untracked files.** All are listed as `A`. When a component cites one (it was already untracked at the previous run), its section shows the file as one added hunk, read only when it is a text file the citation rules accept (≤ 2 MiB, no NUL in the first 8 KiB, not deny-listed); otherwise it is name-only.
* **Name-only sections.** Deny-listed and binary files appear as `diff --git a/P b/P`, a `new file`/`deleted file`/`rename from/to` line where it applies, and a parenthesised reason. The `index` line (blob hashes) is dropped.
* **Paths.** `--name-status -z` and `ls-files -z` give verbatim paths. The patch is read with explicit `--src-prefix=a/ --dst-prefix=b/` and `--no-textconv` so user configuration cannot change it, and git's C-quoted header paths (`"a/caf\303\251.ts"`) and the trailing tab git adds after paths with spaces are decoded, instead of passing `-c core.quotePath=false`.
* **Failures.** If any of the three git reads fails after the base was found reachable (for example a diff over the 64 MiB read buffer), the run regenerates with reason `change-too-large`. A previous `candidate.sir` (`candidate.json` before [ADR 0033](0033-custom-editor-for-sir-files.md)) that is not valid JSON does not count as a previous candidate (`no-previous`). A malformed `lineage.json` counts as absent.
* **Reported values.** `baseRevision` is reported (output and lineage) in regenerate mode too, whenever a base was determined. The `change.md` and `mapping.md` titles name the base and "the working tree at" HEAD, because uncommitted edits are included.
* **CLI shapes.** `change-map.mjs` accepts `--run-folder` and `--regenerate` in either order; the run folder must be an existing `<repo>/.archify/architecture-<slug>-<timestamp>[-N]` folder, and the repo root is derived from it, as `validate.mjs` does with the draft path. `match-ids.mjs` accepts exactly `<draft> --previous <candidate>`; a draft that is not an object with a `components` array, or a previous file that is not a JSON object, is a usage error (exit 2, draft untouched). The study's rejection of the threshold 0.5 (reserved for its M2 metric) is dropped; the threshold is fixed at 0.3.
* **Generate command.** The update/regenerate QuickPick of FR-UPD-08 uses the placeholder "Previous diagram".

### Consequences

* Good, because an unchanged repository yields an empty change map whether or not `.archify/` is gitignored.
* Good, because no deny-listed file content, and no hash of it, is ever written into a run folder.
* Bad, because a change map hides edits under the repo-root `.archify/`; nothing cites them (FR-VAL-05 denies the folder), so no component can be affected.
* Neutral, because each fallback ends in a regeneration, which the study showed to be correct but noisier.

### Confirmation

`test/unit/model/changeMap.test.ts` (quoted paths, name-only sections, own-output filter, previously dirty and untracked handling) and `test/unit/agent/changeMap.test.ts` (each FR-UPD-02 reason on temporary git repositories, the `.env`, staged, untracked and rename cases, the lineage counter). `test/unit/model/matchIds.test.ts` and `test/unit/agent/matchIds.test.ts` cover the matcher and its usage errors.

## More Information

Spec: §7.11 of [spec.md](../spec.md) (FR-UPD-01…04, FR-UPD-08, FR-UPD-09). Decision being implemented: [ADR 0029](0029-update-the-previous-diagram-incrementally.md).
