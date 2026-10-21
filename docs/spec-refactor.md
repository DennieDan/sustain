# Sustain refactor specification

- Status: Proposed, 2026-10-21. Drafted in `.scratch/`. It moves to `docs/spec-refactor.md` in RF0, before any code changes.
- Base: `main` at `215c944`. `main` holds the VS Code subset of `kerk`, because `647df7b` ("merge only vscode") left out the cloud, bench, eval and IntelliJ work.
- This is the contract for the refactor. It lists each feature with acceptance criteria (AC) that an agent can check. `progress-refactor.md` records the state of the build.

## 1. Goal and features

The refactor splits the code into units with one-way import rules. The goal is that each product surface can stand on its own:
- **The skills work in any repository.** That covers `sustain-architecture` and `sustain-bugfix`. Neither needs the extension, the viewer or anything the extension writes.
- **The diagram viewer works in any host.** VS Code is one adapter. A JCEF panel in IntelliJ, a plain browser page or another IDE can host the same viewer through the same contract.
- **The bug-hunt learning track is isolated.** Removing it touches only its own folders and the lines in `src/vscode/extension.ts` that wire it in.

Along the way the refactor deletes code left behind by the features `647df7b` dropped, merges duplicated helpers and splits the files that mix concerns.

| ID | Feature | Milestone |
|---|---|---|
| RFX-01 | Refactor docs adopted | RF0 |
| RFX-02 | Dropped features removed | RF1 |
| RFX-03 | Build, CI and test leftovers removed | RF1 |
| RFX-04 | One copy of each shared helper | RF2 |
| RFX-05 | One argument parser for the scripts | RF2 |
| RFX-06 | One git output parser | RF2 |
| RFX-07 | One set of webview DOM helpers | RF2 |
| RFX-08 | Unit folders | RF3 |
| RFX-09 | Unit import rules | RF3 |
| RFX-10 | Protocols owned by their units | RF3 |
| RFX-11 | Unit boundaries ADR | RF3 |
| RFX-12 | Learn unit | RF4 |
| RFX-13 | Learn reached through one seam | RF4 |
| RFX-14 | Architecture skill in any repository | RF5 |
| RFX-15 | Bug-hunt hooks owned by the skill | RF5 |
| RFX-16 | Bug-hunt skill in any repository | RF5 |
| RFX-17 | One check flow | RF6 |
| RFX-18 | Viewer host contract | RF7 |
| RFX-19 | Viewer theme tokens | RF7 |
| RFX-20 | Viewer test host | RF7 |
| RFX-21 | Viewer host ADR | RF7 |
| RFX-22 | Session referee split | RF8 |
| RFX-23 | Git module split | RF8 |
| RFX-24 | Sidebar host split | RF8 |
| RFX-25 | Sidebar and changes views split | RF8 |
| RFX-26 | Architecture docs | RF9 |

## 2. Units

Each unit is a top-level folder under `src/`. All of them stay in one npm package. The import rules are enforced by `test/unit/boundaries.test.ts` (RFX-09). A unit can later become an npm workspace without any code moving.

| Unit | Holds | May import |
|---|---|---|
| `src/core` | The Archify format: types, schema, tolerant parsing, submission and citation-path checks, diagram diff, ID matching, comparison and small pure helpers such as `isRecord` and relative dates. | Nothing outside `src/core`, plus `ajv`. No `node:` module and no DOM. |
| `src/core-node` | Repository facts and file I/O: git, run folders, run records, lineage, change maps, repository size, evidence, the rules, delta and check engine, fingerprints, confinement, integrity hashing, skill install files, `.git/info/exclude`, and JSON reads and atomic writes. | `src/core`, `node:` modules. |
| `src/skills` | The `sustain-architecture` scripts, bundled into `skills/sustain-architecture/scripts/`. | `src/core`, `src/core-node`. |
| `src/viewer` | The diagram viewer: layout (elk), render, viewport, tooltip, changes, a11y, click handling, the viewer protocol, the host contract and shared DOM helpers. | `src/core`, `elkjs`, the DOM. |
| `src/cli` | The core CLI, bundled as `dist/cli/sustain.mjs`. | `src/core`, `src/core-node`. |
| `src/action` | The GitHub Action, bundled into `action/dist/`. `action.yml` stays at `action/action.yml`. | `src/core`, `src/core-node`. |
| `src/learn` | The bug-hunt track without any VS Code UI: session state, leaderboard, the `session.mjs` and `session-hook.mjs` scripts, mutations, hook files, the session protocol and the session webview. | `src/core`, `src/core-node`, `src/viewer`. |
| `src/vscode` | The extension host, the sidebar, the viewer's VS Code adapter and `src/vscode/learn/` (the session panel, watcher and command). | Everything above. |

Placement rules:
- A module lives in the most specific unit that every one of its importers may import. A module with one consumer unit lives in that unit.
- Pure logic that only one host uses stays in that host's unit as a file without `vscode` imports. Examples are the sidebar state (today `src/model/home.ts`) and the agent stream parsers (today `src/model/agentStream/`). Its unit tests run in Node as they do now.
- Only the diagram viewer is portable. The sidebar and the session panel stay VS Code UI. The sidebar lives in `src/vscode/sidebar/`, and the session webview lives in `src/learn/webview/`.
- The bundles keep their current output paths: `dist/extension.js`, `dist/webview.js`, `dist/sidebar.js`, `dist/session-webview.js`, `dist/cli/sustain.mjs`, `action/dist/` and `skills/*/scripts/*.mjs`. `package.json`, `action.yml` and both SKILL.md files therefore keep working unchanged.
- Tests mirror the units, as `test/unit/<unit>/` and `test/dom/<unit>/`. `test/e2e/` stays where it is.

## 3. Constraints

- **Behaviour stays the same where possible.** This covers commands, webview output, CLI JSON, script output and exit codes, and the on-disk formats. A change that a boundary requires is allowed. Each one gets a line in the progress log and its own commit, separate from the pure moves. RFX-15 and RFX-16 add new behaviour to `session.mjs`, and the spec names it there.
- **No change to the Archify format** (`archify-format.md`, the schemas, run folders, sidecars).
- **No new runtime or development dependency.** The import rules use the existing source scan in `test/unit/support/sourceScan.ts`, and the core typecheck uses the TypeScript already installed.
- **The security properties survive.** These are no network outside `src/action/github.ts`, the exec allowlist, path confinement, skill integrity and the safe pre-approvals. The tests that assert them keep their checks, and only their paths change.
- **Moves are pure.** A file moves in a `git mv` commit whose only edits are import paths and build entry points. Any other edit goes in a later commit, so that `git log --follow` and blame keep working.

## 4. Features

### RF0 Adoption

**RFX-01 Refactor docs adopted.**
- `spec-refactor.md` and `progress-refactor.md` move from `.scratch/` to `docs/`.
- `scripts/check-docs.mjs` traces this spec's IDs to the progress checklist in the same way it traces v0.3's.
- `spec-v0.3.md` and `progress-v0.3.md` each gain a status line that says they are historical and that `main` shipped only the VS Code subset (`647df7b`).
- `AGENTS.md` changes in three places. "Current work" points at this spec and its progress log. "Git" says each milestone gets a branch off `main` named `refactor/rfN-<slug>` and one pull request, commits are named `refactor RFn <IDs>: <summary>`, and the owner pushes and merges. "Shell and environment" says the nvm prefix applies only where nvm is installed.
- The progress log records the baseline: the results of `npm run check` and `npm run test:e2e` on `main` at the commit RF0 starts from.

AC: `npm run check:docs` passes, and it fails when an RFX ID is missing from the progress checklist `[unit]`.

### RF1 Dead code

**RFX-02 Dropped features removed.** The code the dropped features left behind is deleted.
- **Files with no importers.** `webview/bridge.ts` (RFX-18 replaces it), `src/model/branchMaps.ts`, `src/model/agentHome.ts`, `src/model/score.ts`, `src/model/openLinks.ts`, `src/model/citing.ts`, `src/model/schemas/tour.schema.json` and `src/model/schemas/upload.schema.json`, together with the tests that cover only them.
- **Exports with no production caller.**
  - In `src/model/git.ts`: `diffFor`, `numstatSince`, `foldersAt`, `currentBranch`, `defaultBranch` and `ChangeScope`.
  - In `src/model/refresh.ts`: `refreshReport`, `refreshArgs` and `inScope`. `globToRegExp` stays, in its new home.
  - `screenReaderList` in `webview/a11y.ts`.
  - The `findOnPath` and `citationPath` re-exports.
- **Values for features that no longer exist.**
  - `USAGE_EVENTS`: `refresh`, `audit`, `ask`, `review`, `showChanges`, `exportPage`, `checkUnderstanding`, `tour`, `createTour`, `drillDown` and `find`.
  - `EstimateKind`: `refresh` and `ask`.
  - `RunKind`: `drill`.
  - The dead skill branch in `src/extension/estimates.ts`.
- **Comments** that name removed files or features, such as the layout worker in `esbuild.mjs` and `elkInThread.ts`.

A usage log on disk that still holds counts for a removed event keeps loading and keeps counting the remaining events.

AC: `npm run check` and `npm run test:e2e` pass. A unit test loads a usage log with a `refresh` count, records `generate`, and gets the `generate` count it expects `[unit]`.

**RFX-03 Build, CI and test leftovers removed.**
- `tsconfig.json` drops `bench/` and `eval/` from `include`.
- `.github/workflows/ci.yml` drops the `cloud` jobs, and `test/unit/ci.test.ts` follows.
- `test/e2e/suite/single.install.test.ts` expects the two skills that exist, `sustain-architecture` and `sustain-bugfix`.

AC: `npm run test:e2e` passes on `main` for the first time since `647df7b` `[e2e]`. `ci.test.ts` passes against the trimmed workflow `[unit]`.

### RF2 Shared helpers

Each helper lands in the file and folder where RF3 will move it. RF2 changes call sites, and RF3 then moves whole files.

**RFX-04 One copy of each shared helper.**
- **`isRecord`.** One function replaces the seven copies: `types.ts:110`, `tolerant.ts:55`, `rules.ts:33`, `session.ts:217`, `hooksFiles.ts:48`, `agentStream/claude.ts:7` and `agentStream/codex.ts:8`.
- **`readJson`, `writeJson` and `writeAtomic`.** These come out of `src/model/session.ts` into one JSON file module, and they replace the temp-file-and-rename copy in `runFolder.ts:173` and the `readJson` copies in `agent/match-ids.ts` and `lineage.ts`. The diagram track then no longer imports anything from the bug-hunt files.
- **`hashTree`.** `esbuild.mjs` imports the one in `src/model/integrity.ts` instead of keeping its own.
- **Relative dates.** `relativeDate` in `webview/changes.ts` gives way to `relativeAge` from `src/model/home.ts`, which moves to `src/core`.
- **Path confinement.** `agent/session.ts` uses `confine.isWithin` and `citations.probeFile` in place of its own `repoFile` and `looseRel`.

AC: the existing tests for each caller pass unchanged, and a source scan finds exactly one definition of each helper named here `[unit]`.

**RFX-05 One argument parser for the scripts.** One module parses flags and reports usage errors for `change-map`, `match-ids`, `validate`, `repo-facts`, `session` and `session-hook`. Each script's usage text, error wording and exit codes stay exactly as they are.

AC: the existing script tests in `test/unit/agent/` pass unchanged `[unit]`.

**RFX-06 One git output parser.** `src/model/changeMap.ts` and `src/model/changes.ts` share one parser for `-z` name-status output, unified diffs and quoted paths. `git.ts` drops its inline copies (`renamesSince` and `parsePorcelainZ` use the shared parser). One revision guard replaces `isRevision` and `REVISION_PATTERN`. One untracked-file listing replaces `GIT_READS.untracked` and `untrackedFiles()`. Every git call goes through the resolved absolute git path (SAF-07), which includes the three calls in `change-map.ts` that rely on the `program = "git"` default today.

AC: the existing `changeMap`, `changes` and `git` tests pass unchanged. The exec scan fails when a git call uses a bare `"git"` program `[unit]`.

**RFX-07 One set of webview DOM helpers.** The viewer, the sidebar and the session webview share one `el` and `button` helper module, which RF3 moves to `src/viewer/dom.ts`.

AC: the dom tests pass unchanged `[dom]`.

### RF3 Unit folders

**RFX-08 Unit folders.** Every file under `src/`, `webview/` and `action/src/` moves to its unit under the rules in §2. `src/layout/` moves into `src/viewer/layout/`. `src/extension/skillFiles.ts` moves to `src/core-node`, because the CLI and the extension both install skills. The bug-hunt files stay where they are until RF4. `esbuild.mjs`, `package.json` scripts, `vitest.config.ts` and `tsconfig.json` follow the moves, and every bundle keeps its output path. The milestone's proposal table in progress lists every file with its destination.

AC: `npm run check` and `npm run test:e2e` pass. The bundles under `skills/*/scripts/` and `action/dist/` change only in the source-path comments that esbuild writes `[unit]` `[e2e]`.

**RFX-09 Unit import rules.**
- **`boundaries.test.ts`.** The per-file allowlists give way to the rules in §2, checked on path prefixes. The test also asserts four negatives:
  - only `src/vscode/` imports the `vscode` module;
  - nothing imports `src/vscode/`, `src/cli/`, `src/action/` or `src/skills/` (they are entry points);
  - inside `src/vscode/`, only `src/vscode/extension.ts` and `src/vscode/learn/` import `src/learn/`;
  - `src/viewer/` names neither `acquireVsCodeApi` nor `--vscode-`.
- **Core typecheck.** `src/core/tsconfig.json` sets `lib: ["ES2023"]` and `types: []`, and `npm run typecheck` runs it. A Node or DOM API inside `src/core` therefore fails the typecheck.
- **Path-keyed security tests.** `noNetwork.test.ts`, `execScan.test.ts`, `committed.test.ts` and `messages.test.ts` keep their checks with the new paths.

AC: each rule fails when a test fixture breaks it once. A `node:fs` import added to `src/core` fails `npm run typecheck` `[unit]`.

**RFX-10 Protocols owned by their units.** `src/model/messages.ts` splits three ways:
- the viewer's `HostMessage`, `WebviewMessage` and `Compare` go to `src/viewer/protocol.ts`;
- `HomeState`, `HomeHostMessage`, `HomeWebviewMessage` and the run card types go to `src/vscode/sidebar/protocol.ts`;
- the `Session*` types go to `src/learn/protocol.ts`.

Each host imports the protocol of the unit it talks to. The messages and their shapes stay exactly as they are.

AC: `npm run typecheck` and the dom and e2e suites pass `[unit]` `[dom]` `[e2e]`.

**RFX-11 Unit boundaries ADR.** A new ADR records the units, the import rules and the core typecheck. It supersedes the structural parts of ADRs 0004, 0007, 0015, 0016, 0026, 0052 and 0064. The same change marks ADRs 0049, 0051, 0054, 0055, 0059, 0060 and 0063 as Superseded, each with one line saying `647df7b` removed the feature from `main`. Accepted ADRs change only in their status. The duplicate numbers 0029 to 0033 stay as they are.

AC: `npm run check:docs` passes `[unit]`.

### RF4 Isolate learn

**RFX-12 Learn unit.** The bug-hunt files move into `src/learn/`:
- `src/model/session.ts` and `leaderboard.ts`;
- `src/agent/session.ts`, `session-hook.ts` and `modes/bugfix/`;
- the hook merge and removal in `src/extension/hooksFiles.ts`, apart from `.git/info/exclude`, which goes to `src/core-node` because `generate.ts` uses it too;
- `sessionAgents.ts` and `sessionFiles.ts`;
- `webview/session.ts` and `session.css`.

The VS Code UI for the track moves to `src/vscode/learn/`: `learn.ts`, `sessionPanel.ts` and `sessionWatcher.ts`. `devin.ts` stays in `src/vscode/`, because diagram generation launches Devin too.

AC: `npm run check` and `npm run test:e2e` pass `[unit]` `[e2e]`.

**RFX-13 Learn reached through one seam.** `src/vscode/extension.ts` is the only file outside `src/vscode/learn/` that imports `src/learn/`. Today `home.ts`, `install.ts`, `removeSustain.ts` and `generate.ts` reach into the track directly. Instead, `extension.ts` passes them what they need:
- a session summary source for `HomeState.session`;
- an install step that merges hooks;
- a removal step that removes them;
- the `startLearning` and `openSession` handlers.

The bug-hunt files in `.sustain/` and the hook files keep their formats. As a one-off check, recorded in progress and not kept as a test, a scratch branch deletes `src/learn/`, `src/vscode/learn/` and the wiring lines in `extension.ts`, and the remaining extension still typechecks and builds.

AC: the RFX-09 rule for `src/learn/` passes and fails on a fixture import from `src/vscode/home.ts` `[unit]`. The removal check is recorded `[manual]`.

### RF5 Skills independence

**RFX-14 Architecture skill in any repository.**
- `skills/sustain-architecture/SKILL.md` describes its output as an Archify diagram of the repository, and names the Sustain viewer as one consumer of it.
- Its scripts import only `src/core` and `src/core-node` (RFX-09), and they read nothing that only the extension writes.
- A test copies the committed `skills/sustain-architecture/` into a fresh temporary git repository that has no extension, no `.vscode/`, no `node_modules/` and no Sustain settings. It then runs `repo-facts.mjs`, `validate.mjs` on a valid draft, `change-map.mjs` and `match-ids.mjs` with `node`, and checks each one's exit code and JSON.

AC: the fresh-copy test passes, and it fails when a script is made to read a file that only the extension writes `[unit]`.

**RFX-15 Bug-hunt hooks owned by the skill.** `session.mjs` installs and removes its own hooks, so a session is guarded without the extension.

- **The first step is an investigation.** It finds out whether Codex and Devin reload their hook files during a session, as Claude Code does ("Direct edits to hooks in settings files are normally picked up automatically by the file watcher", [hooks reference](https://code.claude.com/docs/en/hooks)). The progress log records the findings with their sources. An agent with no documented reload counts as one that does not reload.
- **`session.mjs init --agent <claude|codex|devin>`** merges the Sustain hook block for that agent before the session leaves setup. It writes `.claude/settings.local.json`, `.codex/hooks.json` or `.devin/hooks.v1.json`, plus `.git/info/exclude`. `--agent` accepts only those three names. The hook command is fixed by the script and is never built from an argument, so the pre-approved `Bash(node ${CLAUDE_SKILL_DIR}/scripts/session.mjs *)` rule still meets SAF-02.
- **The session enters `hunting` only behind a live hook.** `session-hook.mjs` records in the active session that it ran, each time any of its events fires. `inject` refuses with a "restart the agent" error until that record exists. For an agent that does not reload hooks, `init` reports `"restart": true`, and `SKILL.md` has the agent ask the user to restart it and run the skill again.
- **`session.mjs hooks install --agent <a>` and `session.mjs hooks remove`** do the same work by hand.
- **`session.mjs complete` and `session.mjs abandon`** remove the Sustain hooks when no other session is active.
- **Only Sustain's hook objects change.** Merges and removals touch only hook objects whose command contains `SUSTAIN_HOOK_MARKER`, so the user's hooks survive.
- **The extension calls the same module.** Its install step and idle removal (RFX-13) call `src/learn`'s hook module directly rather than running the script.
- **`SKILL.md` step 1** tells the agent to pass its own name to `init`.

These are new behaviours of `session.mjs`, so the progress log lists them as divergences from the no-behaviour-change rule.

AC: `init` for each agent writes that agent's block. `inject` refuses before the hook has run and succeeds after one hook event. `complete` and `abandon` remove the block and keep a user hook in the same file. `hooks install` and `hooks remove` are idempotent. An unknown `--agent` exits with the usage error code `[unit]`.

**RFX-16 Bug-hunt skill in any repository.**
- `skills/sustain-bugfix/SKILL.md` stops assuming the extension installed anything.
- A test copies the committed `skills/sustain-bugfix/` into a fresh temporary git repository with no extension files. For each of `claude`, `codex` and `devin`, it runs this sequence:
  1. `init --agent <a>`, after which the hook file holds the Sustain block;
  2. `session-hook.mjs` receives a `SessionStart` event, and the phase then advances to `hunting`;
  3. `session-hook.mjs` receives a blocked tool call on stdin and denies it with the hunting reason;
  4. `abandon`, after which the Sustain block is gone and a user hook written beforehand is still there.

AC: the fresh-copy test passes for all three agents, and it fails when `abandon` stops removing hooks `[unit]`. A session started from the skill alone, without the extension, refuses the agent's edit while hunting in Claude Code `[smoke]`.

### RF6 One check flow

**RFX-17 One check flow.** One function in `src/core-node` takes the `--fail-on` value, runs the check and produces the delta markdown. Both `src/cli/commands.ts` (`check`) and `src/action/main.ts` call it. Their output and exit codes stay as they are. `action/dist/` is rebuilt.

AC: the existing `cli.test.ts`, `action.test.ts` and delta snapshot pass unchanged. CI's `action-dist` diff passes `[unit]` `[ci]`.

### RF7 Viewer host

**RFX-18 Viewer host contract.** The viewer starts as `startViewer(root, host)`, where `host` implements:

```ts
interface ViewerHost {
  post(message: WebviewMessage): void;
  onMessage(handler: (message: HostMessage) => void): void;
  getState(): unknown;
  setState(state: ChangesState): void;
}
```

`src/viewer/` calls nothing host-specific. `src/vscode/viewer/host.ts` builds the host from `acquireVsCodeApi()` and is the entry point for `dist/webview.js`. Text measurement reads the font family from `--sustain-font-family`.

AC: the RFX-09 rule that `src/viewer/` never names `acquireVsCodeApi` passes. The e2e view, compare, navigate and show-in-map suites pass unchanged `[unit]` `[e2e]`.

**RFX-19 Viewer theme tokens.** `src/viewer/` styles itself only with `--sustain-*` custom properties. `src/vscode/viewer/theme.css` maps each one from the `--vscode-*` variable the viewer uses today, with the same fallbacks. The bundle order puts the theme first, so the viewer in VS Code looks exactly as it does now. The sidebar and session CSS keep their `--vscode-*` variables, because they are VS Code UI.

AC: the RFX-09 rule that `src/viewer/` never names `--vscode-` passes `[unit]`. Screenshots of a fixture map before and after, in a dark and a light theme, match `[smoke]`.

**RFX-20 Viewer test host.**
- `test/dom/support/browserHost.ts` implements `ViewerHost` on a plain page. It keeps state in memory, records posted messages, and supplies a `--sustain-*` palette.
- The viewer's dom tests start the viewer through it, with no `acquireVsCodeApi` defined.

AC: a dom test renders a fixture map through the test host. Clicking a box posts the open-source message for its first citation. Saved state survives a restart of the viewer `[dom]`.

**RFX-21 Viewer host ADR.** A new ADR records the `ViewerHost` contract, the `--sustain-*` tokens and the rule that each host maps its own theme onto them. It supersedes ADRs 0024 and 0047.

AC: `npm run check:docs` passes `[unit]`.

### RF8 Split hotspots

Each named file ends up with a single concern per module. There is no line-count cap. Splits move code and change no behaviour.

**RFX-22 Session referee split.** `src/learn/session.ts` (today `src/agent/session.ts`, 673 lines) splits into four modules: the command line (arguments, usage and dispatch), repository path handling, mutation orchestration, and scoring.

AC: `test/unit/agent/session.test.ts` and `session-hook.test.ts` pass unchanged, in their new folder `[unit]`.

**RFX-23 Git module split.** After RF1's deletions, `src/core-node/git.ts` splits into the repository facts the skill reads and the reads the check engine makes.

AC: the git, changeMap, validate and check tests pass unchanged `[unit]`.

**RFX-24 Sidebar host split.** `src/vscode/home.ts` splits into the state and its caches (health, hotspots, maps) and the message handlers. The handlers are one function per message type, dispatched from a table, in place of the 17-case switch.

AC: the e2e sidebar suite passes unchanged `[e2e]`.

**RFX-25 Sidebar and changes views split.**
- `src/vscode/sidebar/home.ts` splits into one component per sidebar section.
- `src/viewer/changes.ts` splits into the comparison logic and the changes panel component.

AC: `test/dom/sidebar.test.ts` and `changes.test.ts` pass unchanged `[dom]`.

### RF9 Architecture docs

**RFX-26 Architecture docs.** `docs/architecture.md` describes the code as it now stands:
- the units and their import rules;
- the three protocols;
- the viewer host contract;
- the bundles and their entry points;
- the on-disk layout (`.archify/`, `.sustain/`, hook files, `.git/info/exclude`).

The README's development section names the unit folders.

AC: `npm run check:docs` passes. Every unit in §2 and every bundle in `esbuild.mjs` appears in `architecture.md` `[manual]`.

## 5. Milestones

| Milestone | Features | Done when |
|---|---|---|
| RF0 Adoption | RFX-01 | The refactor docs are in `docs/` and traced, and the baseline is recorded |
| RF1 Dead code | RFX-02, RFX-03 | No leftovers from the dropped features; e2e green |
| RF2 Shared helpers | RFX-04..07 | One copy of each named helper |
| RF3 Unit folders | RFX-08..11 | Every file sits in its unit and the import rules hold |
| RF4 Isolate learn | RFX-12, RFX-13 | Learn is reached only through `extension.ts` |
| RF5 Skills independence | RFX-14..16 | Both skills pass their fresh-copy tests |
| RF6 One check flow | RFX-17 | The CLI and the Action share one check function |
| RF7 Viewer host | RFX-18..21 | The viewer runs on the test host with no VS Code API |
| RF8 Split hotspots | RFX-22..25 | Each named file holds one concern per module |
| RF9 Architecture docs | RFX-26 | `architecture.md` matches the code |

The milestones run in this order. RF4 to RF8 each touch one area, and their pull requests rarely conflict with one another.

## 6. Process

- **Resume.** At the start of every session, read `AGENTS.md`, this spec and `progress-refactor.md`, then check `git status` and `git log`. Work on the first unticked feature of the earliest open milestone.
- **Per milestone:**
  1. Branch `refactor/rfN-<slug>` off the latest `main`.
  2. Write the proposal table into progress before any code. Give one row per file or logical unit, with the change and an estimated size.
  3. Open one pull request when the milestone closes. The owner pushes and merges.
  4. Add the Built column and the list of differences when the milestone closes.
- **Per feature:**
  1. Write or update the tests the AC calls for.
  2. Make the moves in pure `git mv` commits.
  3. Make the edits in later commits.
  4. Run `npm run check` and `npm run test:e2e` as their own steps and read the results.
  5. Tick the feature with its evidence.
  6. Commit `refactor RFn <IDs>: <summary>`, staging only that feature's files.
- **Gates.** `npm run check` and `npm run test:e2e` pass before every commit and every pull request.
- **Existing tests** change only in their import paths and folder, except where a feature here names the change. A test that pins a file path keeps its check with the new path.
- **Decisions** get one line in the progress log. ADRs are written only where this spec names them.
- **Hard stops.** Only these pause a feature, and other work continues meanwhile:
  - installing anything;
  - pushing or merging;
  - running paid agent calls;
  - a change to the Archify format.

  Each one goes under Waiting in progress with exact steps.
- **When an AC can't be met after a fair attempt,** record what was tried in progress and continue.

## 7. Suggestions outside this refactor

These go into progress as suggestions. None of them is built here.
- Runtime validation of webview messages on the host side.
- A standalone host for the viewer (a diagram page) and an IntelliJ JCEF host, both on RFX-18's contract.
- Promoting units to npm workspaces once a second package needs them.

## 8. Environment

- **This machine.** macOS on arm64. `node` resolves to v26.7.0 directly, and `~/.nvm/nvm.sh` does not exist here. The nvm prefix in `AGENTS.md` applies only on machines that have nvm. RF0 updates the Shell section of `AGENTS.md` to say so.
- **Agent CLIs.** Nobody has yet checked whether `claude`, `codex` and `devin` are installed here. `[smoke]` items that need an agent go under Waiting.
