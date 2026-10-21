# Progress (refactor)

Tracks [spec-refactor.md](spec-refactor.md). Milestone statuses: Not started, In progress, Closed pending owner, Closed. Tick a feature only when its AC has passed, and write the evidence next to it: test names, commands and results. `[smoke]`, `[ci]` and `[manual]` items that need the owner go under Waiting.

## Status

| Milestone | Status | Branch | Commit |
|---|---|---|---|
| RF0 Adoption | Closed (pull request #9) | `refactor/rf0-adoption` | `50f974c` |
| RF1 Dead code | In progress | `refactor/rf1-dead-code` | |
| RF2 Shared helpers | Not started | `refactor/rf2-shared-helpers` | |
| RF3 Unit folders | Not started | `refactor/rf3-unit-folders` | |
| RF4 Isolate learn | Not started | `refactor/rf4-isolate-learn` | |
| RF5 Skills independence | Not started | `refactor/rf5-skills` | |
| RF6 One check flow | Not started | `refactor/rf6-check-flow` | |
| RF7 Viewer host | Not started | `refactor/rf7-viewer-host` | |
| RF8 Split hotspots | Not started | `refactor/rf8-hotspots` | |
| RF9 Architecture docs | Not started | `refactor/rf9-architecture-docs` | |

## Waiting

Nothing yet.

## Decisions

The owner settled these on 2026-10-21, before the spec was written.

- The refactor gives each product surface clear boundaries. The skills work in any repository, and the diagram viewer works in any host.
- Behaviour stays the same where possible. A change that a boundary requires is logged here and committed on its own.
- The refactor covers `main`. Cloud, bench, eval, IntelliJ, refresh and tour are out of scope, and their leftovers are deleted. `kerk` keeps them.
- The bug-hunt track stays and is isolated behind one seam in `extension.ts`.
- The work ships as one small pull request per milestone into `main`. Other contributors merge into `main` at the same time.
- The spec and progress log are drafted in `.scratch/` and move to `docs/` in RF0.
- There are eight units, as folders in one package. `boundaries.test.ts` enforces the import rules. No npm workspaces.
- The viewer starts through an injected `ViewerHost` and styles itself only with `--sustain-*` tokens. A browser test host proves that it is independent of VS Code.
- Only the diagram viewer is portable. The sidebar and session panel stay VS Code UI.
- Both skills must work from a fresh copy in a bare repository.
- Every move is a pure `git mv` commit, and the edits follow in later commits.
- Tests that pin file paths keep their checks with the new paths. The per-file allowlists in `boundaries.test.ts` give way to unit rules.
- `npm run check` and `npm run test:e2e` gate every pull request.
- Two ADRs are written: "Unit boundaries" and "Viewer host contract". The ADRs for dropped features are marked Superseded, and the duplicate ADR numbers stay as they are.
- `spec-v0.3.md` and `progress-v0.3.md` are marked historical. `AGENTS.md` points at the refactor docs.
- A hotspot counts as split when each of its named concerns has its own module. There is no line-count cap.
- The hook merge and removal logic moves into `src/learn`, and `session.mjs` and the extension share it. `session.mjs init` installs the hooks, and `complete` and `abandon` remove them.

Calls made while writing the spec:
- The spec writes `session.mjs init`, `complete` and `abandon` where the interview said "start" and "end". These are the subcommands the script has today.
- `inject` waits until the hook has fired once. A session therefore reaches `hunting` only when its hook is live, whether or not the agent reloads hook files.
- RF0 is added ahead of RF1 to cover the move to `docs/`, the `AGENTS.md` change and the baseline gate run.

Calls made during the build:
- 2026-10-21: refactor commits are signed. The 1Password SSH signer timed out while RF0 was built. The RF0 commits were first made unsigned, and the owner approved re-signing them with `git rebase -S --force-rebase 215c944` before the push.

## Suggestions

- Validate webview messages at runtime on the host side.
- Build a standalone viewer host (a diagram page) and an IntelliJ JCEF host on the `ViewerHost` contract.
- Promote units to npm workspaces once a second package needs them.
- Delete the remaining exports that no other source file uses, whether or not a test calls them: `agentPrompt` (`agents.ts`), `chosenHeadless` (`generate.ts`), `hotspotMarks` (`hotspots.ts`), `violationArrows` (`rules.ts`), `activeLockPath` (`sessionFiles.ts`), `summarizeStream` (`agentStream/summary.ts`), `rangeOf` (`changes.ts`), `withIgnored` (`config.ts`), `SIDEBAR_ACTIONS` (`home.ts`), `stripAppOwned` (`submission.ts`) and `focusView` (`viewport.ts`). RF1 found them with a scan of exported names.
- `RunKind` `"refresh"` and run.json's `paths` and `base` fields have no writer since the refresh skill left. They stay because run.json is part of the format.
- Widen the margin of `test/unit/layout/perf.test.ts` (NFR-PERF-01), or time more runs. On this machine the 60/120 layout takes about 12 times the small one, right at `BUDGET_FACTOR`, and the test fails about one run in three.

## RF0 Adoption

Proposal:

| File or unit | Change | Estimate | Built |
|---|---|---|---|
| `docs/spec-refactor.md`, `docs/progress-refactor.md` | Move from `.scratch/` into git. The spec's status line says the owner approved it. | +465 / -0 | +478 / -0, then +12 / -2 |
| `scripts/check-docs.mjs` | Trace each spec and progress pair from one table, the v0.3 pair and the refactor pair. | +15 / -8 | +24 / -13 |
| `test/unit/checkDocs.test.ts` | Name the progress file in `checkTraceability` calls, and add the refactor tracing test. | +12 / -4 | +11 / -3 |
| `docs/spec-v0.3.md`, `docs/progress-v0.3.md` | A status line that marks each historical. | +2 / -0 | +3 / -0 |
| `AGENTS.md` | Current work, Git, and Shell and environment. | +10 / -8 | +5 / -4 |
| `test/e2e/runTest.ts` | Not proposed. | | +4 / -0 |

Where the build differs from the proposal:
- `test/e2e/runTest.ts` gained the keychain flags described under Divergences.
- `AGENTS.md` also changed in "Working agreement".
- The RF0 commits went in with `npm run test:e2e` at the baseline's 9 failures, not green. RF1 (RFX-03) owns making e2e pass.
- `test/unit/layout/perf.test.ts` (NFR-PERF-01) failed twice in the last five runs of `npm run check`, once at 292 ms against a 288 ms budget. Each failure passed on the next run. No code it covers changed in RF0.

Tests the AC calls for:
- `RFX-01 check:docs traces the refactor spec and fails when an RFX ID is missing from its progress checklist` in `test/unit/checkDocs.test.ts`.
- The existing `the repository's own docs pass` covers the real `docs/` folder.

Baseline on `main` at `215c944`, 2026-10-21, before any change:
- `npm run check` passes. Vitest runs 1262 tests in 85 files, and check:docs reports 70 ADRs and 242 relative links.
- `npm run test:e2e` fails. The `single` scenario on VS Code 1.126.0 has 69 passing and 12 failing, and the runner stops there. `node out/e2e/runTest.js empty` passes 3 tests on each of 1.126.0 and 1.141.0. `multi` stalled on a macOS dialog, "A keychain cannot be found to store "Code Key"", until the run was stopped.
- With the keychain fix below, `single` has 77 passing and 9 failing, and `multi` passes 2 tests on each version. The 9 failures are in Generate (3), Install (2), architecture notes (2), the session launcher (1) and Open Architecture (1). Several expect the dropped skills, which RFX-03 handles in RF1.

Divergences:
- `test/e2e/runTest.ts` launches VS Code with `--use-inmemory-secretstorage` and `--use-mock-keychain`. Each launch has its own home folder without a keychain. macOS then asked to create one, and the dialog stalled the run. The spec does not name this change. It touches only the test runner and has its own commit.
- `AGENTS.md` also changes in "Working agreement", where the hard stops now point at the spec's §6 instead of v0.3's §7.
- `checkTraceability` takes the progress file's name, and its unknown-ID problem reads "is defined in no spec it builds on" in place of "is defined in neither spec", because the refactor builds on two earlier specs. The ENG-03 unit test follows the new wording.

- [x] **RFX-01 Refactor docs adopted** `[unit]`. `test/unit/checkDocs.test.ts` › `RFX-01 check:docs traces the refactor spec and fails when an RFX ID is missing from its progress checklist` passes, and it failed with the refactor row removed from `TRACES`. `the repository's own docs pass` passes on the real `docs/`. `npm run check` passes with 1263 tests, and check:docs reports 70 ADRs and 245 relative links. `npm run test:e2e` gives the same 77 passing and 9 failing in `single` as the baseline with the keychain fix. RF1 owns those failures.

## RF1 Dead code

Investigation before the proposal:
- The 9 local e2e failures were 5 real ones and 4 caused by this machine. VS Code merged the login shell's PATH, from `/etc/paths.d/homebrew`, into the extension host. `/opt/homebrew/bin/claude` then joined the tests' agent stubs, and the Codex and Devin tests met an agent pick they did not expect. With `--force-disable-user-env` and a PATH without installed agent CLIs, the local run matches CI on pull request #9: 81 passing, 5 failing.
- Of the 5 real failures, the two Install tests expect the dropped skills (RFX-03). The two ARC-04 notes tests write `candidate.json`, which `58793bf` (ADR 0033) renamed to `candidate.sir`. The Open Architecture test expects the "Install the sustain-architecture skill first?" prompt, which `b84ea1b` replaced with the focus prompt. `kerk` already asserts the focus prompt, and `647df7b` kept the older test.
- `RunKind` `"drill"` is written by `repo-facts.mjs --parent`, which `SKILL.md` still describes. Nothing reads it. The owner chose on 2026-10-21 to remove `--parent` from the script and the skill together with the value. The `parent` field stays in run.json, always `null`, so the format does not change.
- `.github/workflows/deploy-cloud.yml` deploys `cloud/`, which `main` does not have, and `test/unit/package.test.ts` pins it.
- Outside this refactor, CI on pull request #9 also failed `check (windows-latest)` in `test/unit/agent/changeMap.test.ts` and `sustain-check`, because the repository commits no map. RF1 leaves both alone.

Proposal:

| File or unit | Change | Estimate |
|---|---|---|
| `test/e2e/runTest.ts` | Launch VS Code with `--force-disable-user-env`, and give it the runner's PATH without folders that hold an installed agent CLI, with Node linked into a folder of its own. | +20 / -3 |
| Files with no importers | Delete `webview/bridge.ts`, `src/model/branchMaps.ts`, `agentHome.ts`, `score.ts`, `openLinks.ts`, `citing.ts`, `schemas/tour.schema.json`, `schemas/upload.schema.json`, and the tests `score.test.ts`, `openLinks.test.ts` and `citing.test.ts`. | +0 / -760 |
| `src/model/git.ts`, `test/unit/model/changes.test.ts` | Delete `diffFor`, `numstatSince`, `foldersAt`, `currentBranch`, `defaultBranch`, `ChangeScope` and the helpers and types only they use. Delete the `diffFor` tests. | +0 / -140 |
| `src/model/refresh.ts` to `src/model/glob.ts` | `git mv`, with `check.ts` and `rules.ts` importing the new path. Then delete `refreshReport`, `refreshArgs`, `inScope` and their types. | +3 / -55 |
| `webview/a11y.ts` | Delete `screenReaderList`. | +0 / -36 |
| Re-exports | `agents.ts` stops re-exporting `findOnPath`, and `citations.ts` stops re-exporting `citationPathOk` and `MAX_PATH_LENGTH`. `devin.ts`, `generate.ts`, `sessionAgents.ts`, `change-map.ts`, `sourceTarget.ts` and three tests import from `which.ts` and `citationPath.ts`. | +8 / -10 |
| `src/model/usageLog.ts`, `test/unit/model/usageLog.test.ts` | Drop the eleven events. The two existing tests use counted events only, and a new test loads a log with a `refresh` count. | +12 / -16 |
| `EstimateKind` | `estimate.ts` keeps `"full"` only. `coefficients.json` drops its `refresh` and `ask` lines. `estimates.ts` loses `estimateKind`, `generate.ts` passes `"full"`, and the `skillEstimates` assertion in `estimate.test.ts` uses `"full"`. | +4 / -32 |
| `RunKind` `"drill"` | `runRecord.ts`, `repo-facts.ts` without `--parent`, `SKILL.md` without the drill-down lines, the rebuilt `skills/sustain-architecture/scripts/repo-facts.mjs`. | +4 / -16 |
| Comments and dead CSS | `esbuild.mjs`, `elkInThread.ts`, `estimate.ts`, `secrets.ts` and `runRecord.ts` stop naming removed files and features. `styles.css` drops the unused `.overview` drill-down rules. `agentStream/feed.ts` drops its `refresh-facts.mjs` branch. | +6 / -24 |
| `tsconfig.json` | Drop `bench` and `eval` from `include`. | +1 / -1 |
| `.github/workflows/ci.yml`, `test/unit/ci.test.ts` | Drop the `cloud` and `cloud-image` jobs and the cloud job test. | +0 / -26 |
| `.github/workflows/deploy-cloud.yml`, `test/unit/package.test.ts` | Delete the workflow and its test. | +0 / -32 |
| `test/e2e/suite/single.install.test.ts` | Expect `sustain-architecture` and `sustain-bugfix` only. | +3 / -12 |
| `test/e2e/suite/single.notes.test.ts`, `single.view.test.ts` | Write `candidate.sir`, and assert the focus prompt as `kerk` does. | +4 / -4 |

Tests the ACs call for:
- RFX-02: `SET-05 a log holding a count for a removed event keeps loading and counts the remaining events` in `test/unit/model/usageLog.test.ts`, plus `npm run check` and `npm run test:e2e`.
- RFX-03: `test/unit/ci.test.ts` against the trimmed workflow, and `npm run test:e2e` green.

Divergences:
- `test/e2e/runTest.ts` also launches VS Code with `--force-disable-user-env` and a PATH without installed agent CLIs. The spec does not name this change. Without it, `npm run test:e2e` fails on any machine with an agent CLI installed.
- `single.notes.test.ts` and `single.view.test.ts` change beyond their import paths. They predate `58793bf` and `b84ea1b`, and RFX-03's AC needs them green.
- `.github/workflows/deploy-cloud.yml` and its test in `package.test.ts` are deleted, beyond the `ci.yml` cloud jobs the spec names.
- `.sr-only` and `.overview` in `webview/styles.css` are deleted. Only `screenReaderList` and the drill-down used them.
- `refresh.ts` moved to `glob.ts`, the home the spec leaves open for `globToRegExp`.
- Other exports with no production caller remain, because the spec lists the ones to delete. They are recorded under Suggestions.

- [x] **RFX-02 Dropped features removed** `[unit]`. Commits `d42e9bc`, `4e8a9b2`, `9bb6e07`, `02e0a12`, `81453b3` and `c02721f`. `test/unit/model/usageLog.test.ts` › `SET-05 a log holding a count for a removed event keeps loading and counts the remaining events` passes, and it failed when `recordUsage` was made to reset a day that holds an unknown event. A smoke run of the committed `repo-facts.mjs` exits 2 with the usage line for `--parent`, and without it writes run.json with `"kind": "full"` and `"parent": null`. `npm run check` passes with 1243 tests in 82 files. `npm run test:e2e` passes, with the RFX-03 changes, in all six runs: `single` 86, `empty` 3 and `multi` 2 on each of VS Code 1.126.0 and 1.141.0.
- [x] **RFX-03 Build, CI and test leftovers removed** `[unit]` `[e2e]`. Commits `baae8ff` and the RFX-03 commit that holds this line. `test/unit/ci.test.ts` passes against the trimmed workflow. `npm run test:e2e` passes for the first time since `647df7b`, with the counts above.

## RF2 Shared helpers

- [ ] **RFX-04 One copy of each shared helper** `[unit]`
- [ ] **RFX-05 One argument parser for the scripts** `[unit]`
- [ ] **RFX-06 One git output parser** `[unit]`
- [ ] **RFX-07 One set of webview DOM helpers** `[dom]`

## RF3 Unit folders

- [ ] **RFX-08 Unit folders** `[unit]` `[e2e]`
- [ ] **RFX-09 Unit import rules** `[unit]`
- [ ] **RFX-10 Protocols owned by their units** `[unit]` `[dom]` `[e2e]`
- [ ] **RFX-11 Unit boundaries ADR** `[unit]`

## RF4 Isolate learn

- [ ] **RFX-12 Learn unit** `[unit]` `[e2e]`
- [ ] **RFX-13 Learn reached through one seam** `[unit]` `[manual]`

## RF5 Skills independence

- [ ] **RFX-14 Architecture skill in any repository** `[unit]`
- [ ] **RFX-15 Bug-hunt hooks owned by the skill** `[unit]`
- [ ] **RFX-16 Bug-hunt skill in any repository** `[unit]` `[smoke]`

## RF6 One check flow

- [ ] **RFX-17 One check flow** `[unit]` `[ci]`

## RF7 Viewer host

- [ ] **RFX-18 Viewer host contract** `[unit]` `[e2e]`
- [ ] **RFX-19 Viewer theme tokens** `[unit]` `[smoke]`
- [ ] **RFX-20 Viewer test host** `[dom]`
- [ ] **RFX-21 Viewer host ADR** `[unit]`

## RF8 Split hotspots

- [ ] **RFX-22 Session referee split** `[unit]`
- [ ] **RFX-23 Git module split** `[unit]`
- [ ] **RFX-24 Sidebar host split** `[e2e]`
- [ ] **RFX-25 Sidebar and changes views split** `[dom]`

## RF9 Architecture docs

- [ ] **RFX-26 Architecture docs** `[unit]` `[manual]`
