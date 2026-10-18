# Progress (v0.3)

Tracks [spec-v0.3.md](spec-v0.3.md). Milestone statuses: Not started, In progress, Closed pending owner (spec §6), Closed. Tick a feature only when its AC passed, and write the evidence next to it: test names, commands and results. `[smoke]` items, and `[ci]` items until CI runs, wait for the owner under **Waiting**.

## Status

| Milestone | Status | Commit |
|---|---|---|
| D1 Safe to ship | In progress | |
| D2 The product in VS Code | Not started | |
| D3 The living map | Not started | |
| D4 Pull request checks | Not started | |
| D5 Sustain Cloud v1 | Not started | |
| D6 Ship | Not started | |
| I1 Cost | Not started | |
| I2 Accuracy | Not started | |
| I3 Architecture guardrails | Not started | |
| I4 Skill retention | Not started | |
| I5 Cloud for teams | Not started | |
| I6 Polish and reach | Not started | |
| I7 IntelliJ plugin | Not started | |

## Waiting

Items only the owner can do, with exact steps.

- Push `kerk` and enable GitHub Actions so `[ci]` items can run.
- Install and sign in to `claude`, `codex` and `devin` for `[smoke]` checks; approve any paid agent calls first (spec §6).

## D1 Safe to ship

### D1 proposal (2026-10-18)

| Location | Change | Est. LoC |
|---|---|---|
| `.github/workflows/ci.yml`, `.gitattributes` | CI jobs: check on three OSes, e2e under xvfb, package, scripts on Node 18; LF endings | +70 |
| `test/unit/support/temp.ts` | Script tests spawn `SUSTAIN_SCRIPT_NODE` when set | +4 / -2 |
| `test/unit/layout/perf.test.ts`, `test/unit/layout/perfBudget.ts` | Relative layout budget (60/120 median ≤ 8 × 12-component median) | +35 / -5 |
| `esbuild.mjs`, `scripts/notices.mjs`, `THIRD_PARTY_NOTICES.md` | Metafiles, notices generator, `check:notices` in `npm run check` | +130 |
| `src/agent/session.ts`, `skills/sustain-bugfix/SKILL.md` | `verify --check-exit <code>` replaces `--check-cmd`; no shell | +20 / -20 |
| `skills/*/SKILL.md` | Exact Bash rules, no Edit/Write pre-approval, the repository-content rule | +10 / -6 |
| `src/model/secrets.ts`, `src/model/submission.ts` | Secret-shaped strings rejected by the validator | +70 |
| `src/model/confine.ts` and every writer | Writes stay inside the root and never through a link | +60 / -10 |
| `src/extension/hooksFiles.ts`, `install.ts`, `learn.ts`, `sessionWatcher.ts`, `extension.ts` | Hooks merged at session launch, removed when the session ends; `.git/info/exclude` replaces `.gitignore` | +60 / -30 |
| `src/model/git.ts`, `src/extension/agents.ts`, `package.json` | Absolute binaries from absolute PATH entries, `core.fsmonitor=false`, untrusted workspaces off | +30 / -5 |
| `src/model/integrity.ts`, `src/extension/integrity.ts`, `generate.ts`, `learn.ts`, `esbuild.mjs` | Bundled skill hashes and the check before every launch | +170 |

Tests the D1 ACs call for:
- the CI workflow's jobs, read from the YAML;
- the relative budget helper, with a 10 × slower median failing;
- notices generation from a metafile fixture, and the stale-file check;
- every shipped SKILL.md has no Edit/Write/NotebookEdit and no Bash rule that reaches free text;
- a source scan: no `shell: true`, and every spawn uses `process.execPath` or the resolved git path;
- `verify --check-exit` in the session script tests, replacing the `--check-cmd` cases;
- secret patterns: rejected and accepted cases, through the validator;
- inert rendering of hostile strings in the map webview;
- argv tables per agent, free of permission-skipping flags; relative PATH entries skipped;
- confinement: each listed path linked outside the root is refused;
- hook lifecycle: install leaves `.devin/` and `.gitignore` alone; merge at launch; removal at session end;
- git argv carries `core.fsmonitor=false`; an fsmonitor configured in `.git/config` never runs;
- integrity: changed, extra, missing, escaping link and CRLF cases; a tampered skill blocks Generate and Start Learning.


Done when: Gates green; a tampered skill cannot launch; no pre-approved command runs a caller's program.

- [ ] **ENG-01 Toolchain and CI** `[unit]` `[ci]` — `[unit]` done 2026-10-18: `test/unit/ci.test.ts` (2 tests, seen to fail with macOS removed from the matrix). `SUSTAIN_SCRIPT_NODE=/usr/bin/node` (v18.19.1) → `vitest run --project unit test/unit/agent`: 148 passed. `[ci]` waits for the first push.
- [ ] **ENG-02 Meaningful layout test** `[unit]`
- [ ] **ENG-04 Third-party notices** `[unit]` `[ci]`
- [ ] **SAF-01 Skill integrity check** `[unit]` `[e2e]`
- [ ] **SAF-02 Safe pre-approvals** `[unit]`
- [ ] **SAF-03 Repository content is data** `[unit]` `[dom]`
- [ ] **SAF-04 Safe launch arguments** `[unit]`
- [ ] **SAF-05 Write confinement** `[unit]`
- [ ] **SAF-06 Hook lifecycle** `[unit]` `[e2e]`
- [ ] **SAF-07 Git and workspace hardening** `[unit]` `[e2e]`

## D2 The product in VS Code

Done when: Everything is reachable without the Command Palette; runs and questions stream in the sidebar.

- [ ] **UI-01 Sustain sidebar** `[unit]` `[dom]` `[e2e]`
- [ ] **UI-02 Runs streamed into the sidebar** `[unit]` `[e2e]` `[smoke]`
- [ ] **UI-03 Editor title buttons** `[unit]` `[e2e]`
- [ ] **UI-04 Status bar item** `[unit]` `[e2e]`
- [ ] **UI-05 Explorer and box menus** `[unit]` `[dom]` `[e2e]`
- [ ] **UI-06 Ask about the map** `[unit]` `[dom]` `[e2e]` `[smoke]`
- [ ] **SET-01 Install anywhere** `[unit]` `[e2e]` `[smoke]`
- [ ] **SET-02 Setup check** `[unit]` `[dom]` `[e2e]`
- [ ] **SET-03 One-click Generate** `[e2e]`
- [ ] **CST-04 Run record** `[unit]` `[e2e]`

## D3 The living map

Done when: Staleness, overlay and refresh work; the diagram page works offline.

- [ ] **VWR-01 Host bridge** `[dom]`
- [ ] **FRS-01 Fingerprints** `[unit]`
- [ ] **FRS-02 Staleness** `[unit]`
- [ ] **FRS-03 Freshness on the map** `[dom]` `[e2e]`
- [ ] **FRS-04 Change overlay** `[unit]` `[e2e]`
- [ ] **FRS-05 Refresh skill** `[unit]`
- [ ] **FRS-06 Refresh from the UI** `[e2e]`
- [ ] **ACC-01 Behaviour over names** `[unit]`
- [ ] **RCH-01 Diagram page** `[unit]` `[dom]` `[smoke]`

## D4 Pull request checks

Done when: The Action comments on this repository's pull requests; Review shows candidates.

- [ ] **RCH-03 Core CLI** `[unit]`
- [ ] **PRC-01 Delta report** `[unit]`
- [ ] **PRC-02 Review changes in the editor** `[dom]` `[e2e]`
- [ ] **PRC-04 GitHub Action** `[unit]` `[ci]`

## D5 Sustain Cloud v1

Done when: Uploads, map pages and PR pages work against mocks.

- [ ] **CLD-01 Accounts and organizations** `[unit]` `[web]`
- [ ] **CLD-02 Upload API** `[unit]`
- [ ] **CLD-03 Map pages** `[web]`
- [ ] **CLD-04 Pull request pages** `[web]`
- [ ] **CLD-08 Public site** `[web]`
- [ ] **CLD-09 Upload from the CLI and the Action** `[unit]`
- [ ] **CLD-11 Delete data** `[unit]` `[web]`

## D6 Ship

Done when: Released: extension published, Action tagged, cloud deployed.

- [ ] **RCH-02 Skills from GitHub and as a plugin** `[ci]` `[smoke]`
- [ ] **RCH-05 Packaging and release** `[unit]` `[ci]` `[smoke]`
- [ ] **DOC-01 README** `[unit]`

## I1 Cost

Done when: An estimate shows before every run.

- [ ] **CST-01 Repository size** `[unit]`
- [ ] **CST-02 Token estimate** `[unit]`
- [ ] **CST-03 Cost before every run** `[unit]` `[e2e]`
- [ ] **CST-05 Exploration budget** `[unit]`
- [ ] **CST-06 Bench harness** `[unit]` `[smoke]`

## I2 Accuracy

Done when: Evidence and audit verdicts show on the map; the scorer runs.

- [ ] **ACC-02 Evidence checks** `[unit]`
- [ ] **ACC-03 Uncertainty on the map** `[dom]`
- [ ] **ACC-04 Eval scorer and ground truth** `[unit]` `[smoke]`
- [ ] **ACC-05 Audit** `[unit]` `[dom]`
- [ ] **ACC-06 Flag a wrong box** `[e2e]`
- [ ] **PRC-06 Import-aware delta** `[unit]`

## I3 Architecture guardrails

Done when: Rule violations show on the map, in Problems and in PR checks.

- [ ] **ARC-01 Architecture rules** `[unit]` `[e2e]`
- [ ] **ARC-02 Rules from the map** `[dom]` `[unit]` `[e2e]`
- [ ] **ARC-03 Hotspots** `[unit]` `[dom]`
- [ ] **ARC-04 Architecture notes for agents** `[unit]` `[e2e]`
- [ ] **ARC-05 Architecture health** `[unit]` `[dom]`
- [ ] **PRC-03 Branch maps** `[e2e]`
- [ ] **PRC-05 Map update in CI** `[unit]` `[smoke]`

## I4 Skill retention

Done when: Explain-back, tours and sessions on every agent work.

- [ ] **SKL-01 Explain-back** `[unit]` `[dom]` `[e2e]`
- [ ] **SKL-02 Guided tours** `[unit]` `[dom]` `[e2e]`
- [ ] **SKL-03 Practice log** `[unit]` `[dom]`
- [ ] **LRN-01 Learning sessions on Claude Code and Codex** `[unit]` `[e2e]` `[smoke]`
- [ ] **LRN-02 Java bug kinds** `[unit]`

## I5 Cloud for teams

Done when: Dashboard, billing and self-hosting work.

- [ ] **CLD-05 Team dashboard** `[web]` `[unit]`
- [ ] **CLD-06 Share links** `[web]`
- [ ] **CLD-07 Plans and billing** `[unit]` `[web]`
- [ ] **CLD-10 Self-hosting** `[ci]`
- [ ] **CLD-12 Share from the extension** `[unit]` `[e2e]`
- [ ] **CLD-13 Export and audit** `[unit]` `[web]`

## I6 Polish and reach

Done when: Gates green.

- [ ] **FRS-07 Compare maps** `[unit]` `[dom]`
- [ ] **VWR-02 Layout in workers** `[unit]` `[ci]`
- [ ] **VWR-03 Finder** `[dom]`
- [ ] **VWR-04 Keyboard and screen readers** `[dom]`
- [ ] **VWR-05 Drill down** `[e2e]`
- [ ] **VWR-06 Image export** `[dom]`
- [ ] **RCH-04 More agents** `[unit]` `[smoke]`
- [ ] **SET-04 Messages that say what to do** `[unit]`
- [ ] **SET-05 Opt-in usage log** `[unit]` `[e2e]`
- [ ] **SAF-08 Remove Sustain from a folder** `[e2e]`
- [ ] **ENG-03 Spec traceability check** `[unit]`

## I7 IntelliJ plugin

Done when: The plugin opens cited lines on AB3.

- [ ] **IDE-01 IntelliJ plugin** `[jvm]` `[smoke]`

## Log

- 2026-10-18 — Spec v0.3 written (`docs/spec-v0.3.md`, features only) with `docs/vision.md`, `AGENTS.md`, `CLAUDE.md`, `.nvmrc` and this file. `kerk` rebased onto `origin/feat/bugfix-mode` (`5df3221`). No code changed. Baseline on Node 26: `npm run check` 774 of 775 tests pass; NFR-PERF-01 times out (ENG-02).
