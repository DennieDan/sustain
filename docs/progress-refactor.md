# Progress (refactor)

Tracks [spec-refactor.md](spec-refactor.md). Milestone statuses: Not started, In progress, Closed pending owner, Closed. Tick a feature only when its AC has passed, and write the evidence next to it: test names, commands and results. `[smoke]`, `[ci]` and `[manual]` items that need the owner go under Waiting.

## Status

| Milestone | Status | Branch | Commit |
|---|---|---|---|
| RF0 Adoption | Closed (pull request #9) | `refactor/rf0-adoption` | `50f974c` |
| RF1 Dead code | Closed (pull request #10) | `refactor/rf1-dead-code` | `91addcc` |
| RF2 Shared helpers | Closed pending owner (push and pull request) | `refactor/rf2-shared-helpers` | `f802490` |
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
- Route the remaining inline JSON reads through `readJson`. RF2 found ten, in `change-map.ts`, `session.ts`, `cli/commands.ts`, `extension/integrity.ts`, `extension/rules.ts`, `sessionFiles.ts`, `showInMap.ts`, `check.ts`, `runRecord.ts` and `staleness.ts`. `session-hook.ts` reads its event from stdin the same way.
- Let `runFolder.ts`'s `isInside` and the containment check in `citations.probeFile` use `confine.isWithin`. `isInside` excludes the root itself, and it would keep that with its own equality check.
- Build the tooltip's `div` and the viewer toolbar's buttons in `webview/main.ts` with the shared `el` and `button`.

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

| File or unit | Change | Estimate | Built |
|---|---|---|---|
| `test/e2e/runTest.ts` | Launch VS Code with `--force-disable-user-env`, and give it the runner's PATH without folders that hold an installed agent CLI, with Node linked into a folder of its own. | +20 / -3 | +23 / -4 |
| Files with no importers | Delete `webview/bridge.ts`, `src/model/branchMaps.ts`, `agentHome.ts`, `score.ts`, `openLinks.ts`, `citing.ts`, `schemas/tour.schema.json`, `schemas/upload.schema.json`, and the tests `score.test.ts`, `openLinks.test.ts` and `citing.test.ts`. | +0 / -760 | +0 / -774 |
| `src/model/git.ts`, `test/unit/model/changes.test.ts` | Delete `diffFor`, `numstatSince`, `foldersAt`, `currentBranch`, `defaultBranch`, `ChangeScope` and the helpers and types only they use. Delete the `diffFor` tests. | +0 / -140 | +1 / -123 |
| `src/model/refresh.ts` to `src/model/glob.ts` | `git mv`, with `check.ts` and `rules.ts` importing the new path. Then delete `refreshReport`, `refreshArgs`, `inScope` and their types. | +3 / -55 | +4 / -4, then +2 / -56 |
| `webview/a11y.ts` | Delete `screenReaderList`. | +0 / -36 | +2 / -53, with the `.sr-only` rules |
| Re-exports | `agents.ts` stops re-exporting `findOnPath`, and `citations.ts` stops re-exporting `citationPathOk` and `MAX_PATH_LENGTH`. `devin.ts`, `generate.ts`, `sessionAgents.ts`, `change-map.ts`, `sourceTarget.ts` and three tests import from `which.ts` and `citationPath.ts`. | +8 / -10 | +16 / -14, with the rebuilt `change-map.mjs` |
| `src/model/usageLog.ts`, `test/unit/model/usageLog.test.ts` | Drop the eleven events. The two existing tests use counted events only, and a new test loads a log with a `refresh` count. | +12 / -16 | +14 / -23 |
| `EstimateKind` | `estimate.ts` keeps `"full"` only. `coefficients.json` drops its `refresh` and `ask` lines. `estimates.ts` loses `estimateKind`, `generate.ts` passes `"full"`, and the `skillEstimates` assertion in `estimate.test.ts` uses `"full"`. | +4 / -32 | +9 / -71, with the rebuilt `repo-facts.mjs` |
| `RunKind` `"drill"` | `runRecord.ts`, `repo-facts.ts` without `--parent`, `SKILL.md` without the drill-down lines, the rebuilt `skills/sustain-architecture/scripts/repo-facts.mjs`. | +4 / -16 | +21 / -43, with the rebuilt bundles |
| Comments and dead CSS | `esbuild.mjs`, `elkInThread.ts`, `estimate.ts`, `secrets.ts` and `runRecord.ts` stop naming removed files and features. `styles.css` drops the unused `.overview` drill-down rules. `agentStream/feed.ts` drops its `refresh-facts.mjs` branch. | +6 / -24 | +3 / -21 |
| `tsconfig.json` | Drop `bench` and `eval` from `include`. | +1 / -1 | +1 / -1 |
| `.github/workflows/ci.yml`, `test/unit/ci.test.ts` | Drop the `cloud` and `cloud-image` jobs and the cloud job test. | +0 / -26 | +0 / -26 |
| `.github/workflows/deploy-cloud.yml`, `test/unit/package.test.ts` | Delete the workflow and its test. | +0 / -32 | +0 / -32 |
| `test/e2e/suite/single.install.test.ts` | Expect `sustain-architecture` and `sustain-bugfix` only. | +3 / -12 | +3 / -12 |
| `test/e2e/suite/single.notes.test.ts`, `single.view.test.ts` | Write `candidate.sir`, and assert the focus prompt as `kerk` does. | +4 / -4 | +4 / -3 |

Where the build differs from the proposal:
- The `a11y.ts` row also deleted the `.sr-only` rules, which only `screenReaderList` used.
- Three rows rebuilt committed bundles: `change-map.mjs`, `repo-facts.mjs` and `validate.mjs`. The move rebuilt `action/dist/index.js` for its source-path comment.
- The `estimate.ts` comment fixes landed with the `EstimateKind` row.
- The `git.ts` row came out smaller than estimated, because `untrackedFiles` and `DIFF_FLAGS` still have callers.
- The Divergences below list the changes the spec does not name.

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
- [x] **RFX-03 Build, CI and test leftovers removed** `[unit]` `[e2e]`. Commits `baae8ff` and `91addcc`. `test/unit/ci.test.ts` passes against the trimmed workflow. `npm run test:e2e` passes for the first time since `647df7b`, with the counts above.

## RF2 Shared helpers

Investigation before the proposal:
- `relativeDate` (changes panel) and `relativeAge` (sidebar) differ. Past 30 days the panel shows the ISO date (FR-CMP-09), and it shows no date for an unparseable timestamp. `relativeAge` says "N months ago" and "just now". The owner chose on 2026-10-21 one helper with both behaviours: `relativeAge` takes an optional number of days after which it gives the ISO date.
- Node's type stripping, which lets `esbuild.mjs` import TypeScript, cannot resolve extensionless imports such as `integrity.ts`'s `./confine`. The owner chose on 2026-10-21 to move `hashTree` into a module without relative imports, which `esbuild.mjs` imports by its `.ts` path.
- `session-hook.ts` reads no arguments and reports no usage error. It has nothing to share with the argument parser.
- `isRevision` (a full commit name) and `REVISION_PATTERN` (a name a user may type) guard different calls. `commitInfo(root, "HEAD")` must stay `null` (git.test.ts). The one guard therefore takes the kind of revision it checks.
- `ChangeInput.untracked` is the raw `ls-files -z` output, and the changeMap tests pass it as a string. `readChanges` and `untrackedFiles` therefore share one read of `GIT_READS.untracked`, and `untrackedFiles` splits it.
- `leaderboard.ts`, `secrets.ts` and `webview/changes.ts` test `typeof value === "object" && value !== null` without excluding arrays. They are not copies of `isRecord`, and they stay.

Proposal:

| File or unit | Change | Estimate | Built |
|---|---|---|---|
| `isRecord` | `isJsonObject` in `src/model/types.ts` is renamed `isRecord`, and its ten importers follow. `tolerant.ts`, `rules.ts`, `session.ts`, `hooksFiles.ts`, `agentStream/claude.ts` and `agentStream/codex.ts` drop their copies and import it. | +30 / -40 | +50 / -54 |
| `src/model/jsonFile.ts` | New. `readJson`, `writeJson` and `writeAtomic`, out of `session.ts`. `writeAtomic` names its temp file after the target, as `publishCandidate` does today. `runFolder.ts`, `lineage.ts`, `match-ids.ts` and `session.ts` use them, and `validate.ts`, `hooksFiles.ts`, `fingerprints.ts` and `runRecord.ts` import `writeJson` from here. `boundaries.test.ts` lists the module among the Node modules. | +45 / -60 | +74 / -94 |
| `src/model/hashTree.ts` | New. `hashTree` and `LINK_MARK` move here from `integrity.ts`. `esbuild.mjs` imports it and drops its copy. `tsconfig.json` gains `allowImportingTsExtensions`. `integrity.test.ts` and `single.smoke.test.ts` import the new path. `AGENTS.md` says the toolchain needs Node 22.18. | +30 / -35 | +34 / -45, as `hashTree.mts` |
| `src/model/dates.ts` | New. `relativeAge` from `home.ts`, with an optional number of days after which it gives the ISO date. `home.ts`, `webview/home.ts` and `webview/changes.ts` use it, and `relativeDate` goes. The FR-CMP-09 test calls `relativeAge(iso, NOW, 30)`. `boundaries.test.ts` lists the module as browser-safe. | +30 / -35 | +47 / -44 |
| `src/agent/session.ts` | `repoFile` and `looseRel` give way to one path helper on `confine.isWithin`, with `citations.probeFile` telling a file from a folder. | +20 / -35 | +22 / -38 |
| `test/unit/sharedHelpers.test.ts` | New. A source scan finds exactly one definition of each RFX-04 helper. | +40 / -0 | +37 / -0 |
| `src/model/scriptArgs.ts` | New. `parseArgs` (leading positionals, options with a value, switches, and whether a flag may repeat) and `usageError`. | +45 / -0 | +55 / -0 |
| Script argument handling | `change-map.ts`, `match-ids.ts`, `validate.ts`, `repo-facts.ts` and `session.ts` parse with `parseArgs` and report with `usageError`. Usage text, error wording and exit codes stay. | +40 / -75 | +67 / -108 |
| `src/model/gitFormat.ts` | New. `unquotePath`, `parseNameStatusZ`, `parsePorcelainZ`, one unified-diff section parser and `isRevision(value, kind)`. | +130 / -0 | +198 / -0 |
| `src/model/changes.ts`, `changeMap.ts` | `parseDiff` and `splitDiff` read the shared sections. Both copies of `unquotePath`, the header helpers, `parseNameStatusZ` and `REVISION_PATTERN` go. | +30 / -170 | +28 / -203, with `runChanges.ts` |
| `src/model/git.ts`, `check.ts` | `renamesSince` uses `parseNameStatusZ`. `parsePorcelainZ` and `isRevision` move out. Every revision check uses the one guard. `untrackedFiles` and `readChanges` share one read. `baseReachable`, `readChanges` and `commitInfo` default to the resolved git. | +20 / -40 | +24 / -50 |
| `test/unit/execScan.test.ts` | The scan flags a bare `"git"` program. Import paths in the changeMap, changes and git tests follow the moved functions. | +12 / -4 | +17 / -4, with `boundaries.test.ts` |
| `webview/dom.ts` | New. `el` and `button`. `changes.ts`, `home.ts` and `session.ts` drop their copies, and `home.ts`'s `button` calls take the shared argument order. | +20 / -35 | +35 / -49 |
| Bundles | `skills/*/scripts/*.mjs` and `action/dist/index.js` are rebuilt with the change that causes them. | | +906 / -693 |

Where the build differs from the proposal:
- The Built sizes come from `git show --numstat` of `a742e7a`, `51f4229`, `daa4df7` and `f802490`, without the progress log. A file that two RFX-04 rows touch counts once, in the `jsonFile.ts` row: `hooksFiles.ts`, `runRecord.ts`, `match-ids.ts`, `lineage.ts` and `boundaries.test.ts`.
- `hashTree` went into `src/model/hashTree.mts`, not `hashTree.ts`. The Divergences below say why.
- `gitFormat.ts` came out larger than estimated. It documents each field of a diff section, and it reads a `diff --git` line both by length and by its last ` b/`.
- `match-ids.ts` keeps `readInput`, and `lineage.ts` keeps `readRunFile`. Each turns the shared `readJson`'s throw into the result its caller had before.
- The RFX-04 test is `test/unit/sharedHelpers.test.ts` › `RFX-04 one copy of each shared helper`, with one case per helper, in place of the single test the proposal named.

Tests the ACs call for:
- RFX-04: `RFX-04 each shared helper has exactly one definition` in `test/unit/sharedHelpers.test.ts`, and the existing tests of every caller.
- RFX-05: the existing script tests in `test/unit/agent/`.
- RFX-06: `SAF-07 the scan flags a bare "git" program` in `test/unit/execScan.test.ts`, and the existing changeMap, changes and git tests.
- RFX-07: the existing dom tests.

Divergences:
- `hashTree` lives in `src/model/hashTree.mts`, not `integrity.ts`, as the owner chose. The `.mts` name tells Node that the file is an ES module. The build then prints no module-type warning. Its importers name the file with its extension, which `allowImportingTsExtensions` in `tsconfig.json` allows. `AGENTS.md` raises the toolchain's Node to 22.18.
- `writeAtomic` names its temp file `.<target>.tmp-<pid>-<time>`, as `publishCandidate` did. The session files' temp file was `.tmp-<pid>-<time>`. No watcher or test reads either name.
- The FR-CMP-09 dom test calls `relativeAge(iso, NOW, 30)` in place of `relativeDate(iso, NOW)`, as the owner chose. Its cases and expectations stay.
- `boundaries.test.ts` lists `dates.ts` as browser-safe, and `jsonFile.ts` and `hashTree.mts` among the Node modules.
- `session.mjs inject` checks that the file exists with `existsSync` before the path checks. `repoFile` used the failure of `realpathSync` for this, with the same message.
- `session-hook.ts` does not use the argument parser. It reads no arguments and reports no usage error.
- The `session.mjs` commands that take no arguments keep their `args.length` check. They have no flags to parse.
- `parseDiff` reads paths only from a section's header lines, as `splitDiff` did. It used to take a removed line starting `-- ` or an added line starting `++ ` inside a hunk for a `---` or `+++` header, and reported that line's text as the file's path. A comparison of the old and new parsers on every commit of this repository, and on a commit with quoted, tabbed, spaced, renamed, binary, mode-only, added and deleted paths, differed only on that case.
- `renamesSince` accepts any revision a user may type, where it took 7 to 64 hex characters before. Of the guard's two kinds, only `"name"` accepts every revision `renamesSince` took. Its caller passes the full commit name from `fingerprints.json`.
- The one untracked listing is `GIT_READS.untracked`, which both `readChanges` and `untrackedFiles` run. `untrackedFiles` had its own argv with the same flags in another order.
- The shared `button` takes its class before its text, as `el` does and as the changes panel's copy did. The sidebar's fourteen calls swap their first two arguments.

- [x] **RFX-04 One copy of each shared helper** `[unit]`. Commit `a742e7a`. `test/unit/sharedHelpers.test.ts` passes: `RFX-04 one copy of each shared helper` › each of `isRecord`, `readJson`, `writeJson`, `writeAtomic`, `hashTree`, `relativeAge`, `isWithin` and `probeFile` `has exactly one definition`, `relativeDate`, `repoFile` and `looseRel` have none, `one expression tells a plain object from null and arrays` and `one write renames a temp file over its target`. Two of them failed with an `isRecord` copy and a `relativeDate` function added to `hooksFiles.ts`. The existing caller tests pass with import-path changes only, apart from the FR-CMP-09 test above. A smoke run of the rebuilt `session.mjs` gives the old messages for a missing file, the root, a folder, `.sustain/active`, `/etc/hosts` and a link out of the repository, and seeds and reports a bug in `src/a.ts`. `npm run check` passes with 1256 tests in 83 files. `npm run test:e2e` passes in all six runs: `single` 86, `empty` 3 and `multi` 2 on each of VS Code 1.126.0 and 1.141.0. The action bundle no longer includes `src/model/session.ts`.
- [x] **RFX-05 One argument parser for the scripts** `[unit]`. Commit `51f4229`. `parseArgs` and `usageError` in `src/model/scriptArgs.ts` serve `change-map`, `match-ids`, `validate`, `repo-facts` and `session`. The script tests in `test/unit/agent/` pass unchanged: 226 tests in 8 files. A throwaway script ran the committed and the rebuilt bundles of the five scripts on 50 argument lists, among them missing, repeated, unknown and misplaced flags, and their stderr and exit codes matched on every one. `npm run check` passes with 1256 tests in 83 files. `npm run test:e2e` passes in all six runs with the same counts.
- [x] **RFX-06 One git output parser** `[unit]`. Commit `daa4df7`. `src/model/gitFormat.ts` holds `isRevision`, `unquotePath`, `parseNameStatusZ`, `parsePorcelainZ` and `parseDiffSections`. `parseDiff` and `splitDiff` read its sections, `renamesSince` uses `parseNameStatusZ`, and `baseReachable`, `readChanges` and `commitInfo` default to `gitProgram()`. The changeMap, changes and git tests pass with import-path changes only. `test/unit/execScan.test.ts` › `SAF-07 the scan flags a bare "git" program` passes, and `SAF-02 src/agent and src/model spawn only node itself or the resolved git` failed with `baseReachable`'s default set back to `"git"`. `npm run check` passes with 1257 tests in 83 files. `npm run test:e2e` passes in all six runs with the same counts.
- [x] **RFX-07 One set of webview DOM helpers** `[dom]`. Commit `f802490`. `webview/dom.ts` holds `el` and `button`, and `changes.ts`, `home.ts` and `session.ts` import them. The dom tests pass unchanged: 145 tests in 8 files. 22 of them failed with the shared `button`'s first two parameters swapped. `npm run check` passes with 1257 tests in 83 files. `npm run test:e2e` passes in all six runs with the same counts.

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
