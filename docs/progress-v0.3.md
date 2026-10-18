# Progress (v0.3)

Tracks [spec-v0.3.md](spec-v0.3.md). Milestone statuses: Not started, In progress, Closed pending owner (spec §6), Closed. Tick a feature only when its AC passed, and write the evidence next to it: test names, commands and results. `[smoke]` items, and `[ci]` items until CI runs, wait for the owner under **Waiting**.

## Status

| Milestone | Status | Commit |
|---|---|---|
| D1 Safe to ship | Closed pending owner (ENG-01, ENG-04 `[ci]`) | `4bbac86` |
| D2 The product in VS Code | Closed pending owner (UI-02, UI-06, SET-01 `[smoke]`) | `1d8bcf4` |
| D3 The living map | Closed pending owner (RCH-01 `[smoke]`) | `3850c3e` |
| D4 Pull request checks | Closed pending owner (PRC-04 `[ci]`) | `eced4f5` |
| D5 Sustain Cloud v1 | Closed pending owner (deployment, see Waiting) | `574992c` |
| D6 Ship | Closed pending owner (RCH-02, RCH-05 `[ci]` `[smoke]`, the first release) | `488db5f` |
| I1 Cost | Closed pending owner (CST-06 `[smoke]`) | `777db40` |
| I2 Accuracy | Not started | |
| I3 Architecture guardrails | Not started | |
| I4 Skill retention | Not started | |
| I5 Cloud for teams | Not started | |
| I6 Polish and reach | Not started | |
| I7 IntelliJ plugin | Not started | |

## Waiting

Items only the owner can do, with exact steps.

- Push `kerk` and enable GitHub Actions so `[ci]` items can run: ENG-01 (the workflow's four jobs) and ENG-04 (the stale-notices check). Then tick them with the run's link.
- Install and sign in to `claude`, `codex` and `devin` for `[smoke]` checks; approve any paid agent calls first (spec §6).
- SET-01 `[smoke]`: with the default per-user install, run `/sustain-architecture` in Claude Code and `$sustain-architecture` in Codex from a repository with no `.agents/` folder, and confirm each finds the skill and its scripts.
- UI-02 `[smoke]`: with `sustain.runMode` on "In sidebar", press Generate once with Claude Code and once with Codex in a small repository. Confirm the card shows reads, writes and validation, tokens and the final cost, and that the map opens on acceptance. Save each run's stdout (`claude -p … --output-format stream-json --verbose > claude-generate.jsonl`, `codex exec --json … > codex-generate.jsonl`) over the hand-written files in `test/fixtures/streams/`, then run `npm test`. If Claude Code reports a denial for the skill's own scripts, the `--allowedTools` rules need the folder `${CLAUDE_SKILL_DIR}` really resolves to (see "Where the D2 build differs").
- PRC-04 `[ci]`: this repository ignores `.archify/`, so the Action has no map to check here. Generate a map with an empty focus, force-add its run folder (`git add -f .archify/<run>/candidate.json .archify/<run>/run.json .archify/<run>/fingerprints.json`), push `kerk` and open a pull request. Confirm the `sustain-check` job comments once and updates that comment on the next push, and that `action-dist` passes.
- D5 deployment (hard stops: hosting, OAuth app, publishing). (1) Choose a managed Node host and a managed Postgres; add the Postgres driver (for example `pg`) and point `cloud/src/db/client.ts` at it, since the code runs on PGlite until then. (2) Create a GitHub OAuth app with the callback `https://<domain>/api/auth/callback/github` and set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `NEXTAUTH_URL` and a random `NEXTAUTH_SECRET`. (3) Choose the domain, set it as `cloud-url` in workflows and as `SUSTAIN_CLOUD_URL` for `publish`. (4) Push, so CI's `cloud` job installs Playwright's Chromium (`npx -w cloud playwright install --with-deps chromium`) and runs the `[web]` suite.
- RCH-01 `[smoke]`: open a page written by `render-html.mjs` from disk on Windows, macOS and Linux. With each target in "Open in", click a box and note which open: VS Code, Cursor, JetBrains (needs JetBrains Toolbox), GitHub (needs a github.com origin) and Copy.
- RCH-02 `[ci]` `[smoke]`: after the push, confirm the `skills-fresh` and `plugin` jobs pass. Then run `npx skills add xplus2g4/sustain` in a scratch folder and confirm `/sustain-architecture` runs its scripts in Claude Code. Install the plugin from a release's `sustain-skills.zip` (`unzip sustain-skills.zip -d sustain-skills`, `/plugin marketplace add ./sustain-skills`, `/plugin install sustain@sustain`) and confirm the same.
- RCH-05 `[ci]`: set the release version in `package.json`, push a hyphenated tag such as `v0.3.0-rc.1`, and confirm the `Release` workflow passes and keeps `release-dry-run` with the `.vsix`, `sustain-skills.zip`, `sustain-action.js`, `sustain.mjs` and `SHA256SUMS`.
- RCH-05 `[smoke]`, the first release (hard stops: publishing, deploying). (1) Choose the licence, add `LICENSE` and the `license` field, so the package includes it and Open VSX can publish. (2) Add the secrets: `OVSX_PAT` for Open VSX, and `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` for a Microsoft Entra ID app with Marketplace publish rights for the publisher `sustain`. (3) Push the tag `v<version>`, then install the extension from each store into a clean profile. (4) For the cloud, finish the D5 deployment steps, set the secret `SUSTAIN_DEPLOY_HOOK` and the variable `SUSTAIN_DEPLOY` to `true`, merge to `main`, and confirm the site serves and a `publish` lands.
- DOC-01: record `docs/media/demo.gif` (generate a map, click a box, Show Changes) and add it under the README's first paragraph. Replace `<cloud address>` in the README once the domain is chosen.
- CST-06 `[smoke]` (hard stop: paid agent calls). Approve the spend, then set `SUSTAIN_BENCH_ANTHROPIC_API_KEY` and `SUSTAIN_BENCH_OPENAI_API_KEY` to bench keys. Run `npm run bench:plan -- --agent claude --repo ab3 --kind full`, then `npm run bench -- --agent claude --repo ab3 --kind full`, and the same with `--agent codex`. Confirm each `bench/results/<run>/result.json` says `"accepted": true`. Once four runs exist per agent and kind, run `npm run bench:fit` and commit `src/model/coefficients.json`.
- UI-06 `[smoke]`: ask one question per agent from the sidebar about a mapped repository. Confirm the answer cites `path:line`, the links open the lines, and a second Claude Code question resumes the session.

## D1 Safe to ship

### D1 proposal (2026-10-18)

| Location | Change | Est. LoC | Built |
|---|---|---|---|
| `.github/workflows/ci.yml`, `.gitattributes` | CI jobs: check on three OSes, e2e under xvfb, package, scripts on Node 18; LF endings | +70 | +59 |
| `test/unit/support/temp.ts` | Script tests spawn `SUSTAIN_SCRIPT_NODE` when set | +4 / -2 | +5 / -2 |
| `test/unit/layout/perf.test.ts`, `test/unit/layout/perfBudget.ts` | Relative layout budget (60/120 median ≤ 8 × 12-component median) | +35 / -5 | +75 / -22 |
| `esbuild.mjs`, `scripts/notices.mjs`, `THIRD_PARTY_NOTICES.md` | Metafiles, notices generator, `check:notices` in `npm run check` | +130 | +119 / -10, plus 395 generated notice lines |
| `src/agent/session.ts`, `skills/sustain-bugfix/SKILL.md` | `verify --check-exit <code>` replaces `--check-cmd`; no shell | +20 / -20 | +19 / -20 |
| `skills/*/SKILL.md` | Exact Bash rules, no Edit/Write pre-approval, the repository-content rule | +10 / -6 | +4 / -2 |
| `src/model/secrets.ts`, `src/model/submission.ts` | Secret-shaped strings rejected by the validator | +70 | +61 / -3 |
| `src/model/confine.ts` and every writer | Writes stay inside the root and never through a link | +60 / -10 | +55 / -2 |
| `src/extension/hooksFiles.ts`, `install.ts`, `learn.ts`, `sessionWatcher.ts`, `extension.ts` | Hooks merged at session launch, removed when the session ends; `.git/info/exclude` replaces `.gitignore` | +60 / -30 | +62 / -31 |
| `src/model/git.ts`, `src/extension/agents.ts`, `package.json` | Absolute binaries from absolute PATH entries, `core.fsmonitor=false`, untrusted workspaces off | +30 / -5 | +66 / -38 |
| `src/model/integrity.ts`, `src/extension/integrity.ts`, `generate.ts`, `learn.ts`, `esbuild.mjs` | Bundled skill hashes and the check before every launch | +170 | +186 |

Where the D1 build differs from the proposal:
- The layout budget factor is 12, not 8, because the measured ratio is 7.4.
- The PATH lookup moved to `src/model/which.ts`, so git and the agent launchers share it. That is most of the git row's size.
- The candidate watcher was fixed although no D1 feature named it, because the e2e gate failed on it (+49 / -8, see the log).
- e2e tests now install the real skill instead of writing a bare `SKILL.md`, because the integrity check rejects the bare file.
- SAF-07's Windows stub `git.exe` test became a unit test of the PATH lookup, and its fsmonitor e2e check moves to FRS-04.

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
- [x] **ENG-02 Meaningful layout test** `[unit]` — 2026-10-18: `test/unit/layout/perf.test.ts` (2 tests) with `perfBudget.ts`. Outside vitest the 60/120 median was 729 ms and the 12-component median 99 ms (ratio 7.4); the old test failed on vitest's 5 s default timeout, not on the 1 s budget. The fake-clock test fails when the budget check is disabled.
- [ ] **ENG-04 Third-party notices** `[unit]` `[ci]` — `[unit]` done 2026-10-18: `test/unit/notices.test.ts` (2 tests; the nested-package case fails with `indexOf` in place of `lastIndexOf`). `npm run build` writes `out/meta/bundles.json`; `npm run notices` added ajv, elkjs (EPL-2.0 OR GPL-3.0-or-later), fast-deep-equal, fast-uri and json-schema-traverse with their licence texts. `npm run check` now ends with `check:notices`. `[ci]` waits for the first push.
- [x] **SAF-01 Skill integrity check** `[unit]` `[e2e]` — 2026-10-18: the build writes `dist/skill-hashes.json`. `ensureSkillIntact` runs before Generate (per chosen agent) and Start Learning. Tests: `test/unit/model/integrity.test.ts` (7: intact through the `.claude` link, changed/missing/extra, CRLF, a link recorded not followed, a `.claude` link leaving the repo, a differing `.codex` copy); e2e `SAF-01 a tampered SKILL.md blocks the launch until Reinstall restores it`, `SAF-01 a tampered validate.mjs blocks the launch`, `SAF-01 a differing .codex copy blocks Codex until it is removed`, and the smoke test that the shipped hashes match the shipped files. ADR 0043. Gates 2026-10-18: `npm run check` exit 0 (835 tests); `npm run test:e2e` exit 0 on VS Code 1.126.0 and 1.141.0 (single 43, empty 3, multi 2 each).
- [x] **SAF-02 Safe pre-approvals** `[unit]` — 2026-10-18: `session.mjs verify --check-exit <code>` replaces `--check-cmd` (no shell left in the scripts). Bug-hunt `allowed-tools` lost `Edit`/`Write`; both skills now pre-approve only `node …/scripts/<script>.mjs *`. Tests: `test/unit/skill/preapprovals.test.ts` (3), `test/unit/execScan.test.ts` (2; a first draft flagged `RegExp.exec` and was fixed), `session.test.ts` › `SAF-02 an agent-reported --check-exit…` and `SAF-02 --check-cmd is no longer accepted`, `skill.test.ts` › `SAF-02 SKILL.md declares…`. ADR 0041. Full vitest: 786 passed.
- [x] **SAF-03 Repository content is data** `[unit]` `[dom]` — 2026-10-18: `src/model/secrets.ts`, run by the validator after the semantic checks. Both SKILL.md files and `archify-format.md` carry the repository-content rule. Tests: `test/unit/model/secrets.test.ts` (13; fails with the entropy rule disabled; all 24 Archify fixtures scan clean), `validate.test.ts` › `SAF-03 a secret-shaped string rejects the draft at its pointer`, `test/dom/inert.test.ts` (fails when `render.ts` uses `innerHTML`). Full vitest: 801 passed.
- [x] **SAF-04 Safe launch arguments** `[unit]` — 2026-10-18: `findOnPath` skips relative PATH entries; `agentLaunchArgs` gives the terminal the prompt alone. `test/unit/extension/launchArgs.test.ts` (10): Claude Code, Codex and Devin argv for hostile focuses carry no permission flag; a relative `bin` entry holding `claude` is skipped (fails with the old empty-entry check).
- [x] **SAF-05 Write confinement** `[unit]` — 2026-10-18: `src/model/confine.ts`, called by `writeSkill` (now takes the root), `mergeHooks`, `removeHooks`, `ensureSustainGitignore`, `validate.mjs` before publishing, `session.mjs` before the lock, `inject` and `restore`, and `appendEvent` (no link). Tests: `test/unit/model/confine.test.ts` (10: `.git`, `.devin`, `.claude`, `.agents/skills`, `.archify/<run>`, `.sustain/<run>` linked outside; `sustain.config.json` linked to an outside file; an inside link; a broken link), plus `skillFiles`, `hooksFiles` and `validate` cases that write nothing outside (the validate case fails with the check removed). Full vitest: 824 passed.
- [x] **SAF-06 Hook lifecycle** `[unit]` `[e2e]` — 2026-10-18: install no longer merges hooks or edits `.gitignore`. `ensureGitExclude` writes `.git/info/exclude` at Generate and session launch. `removeHooksWhenIdle` runs when the `SessionWatcher` sees the lock go and at activation. Tests: `hooksFiles.test.ts` › `SAF-06 ensureGitExclude` (3) and `SAF-06 removeHooksWhenIdle`; e2e `SAF-06 a fresh install … leaves .devin and .gitignore alone` and `SAF-06 the session's hook entries go when its lock goes`. ADR 0042 supersedes ADR 0036.
- [x] **SAF-07 Git and workspace hardening** `[unit]` `[e2e]` — done 2026-10-18, with the `[e2e]` half moved to FRS-04 (see the log): `package.json` declares `untrustedWorkspaces.supported: false` (`test/unit/manifest.test.ts`). Git runs by absolute path from `gitProgram()` (`src/model/which.ts`) with `-c core.fsmonitor=false`. `git.test.ts` › `SAF-07 a repository's core.fsmonitor program never runs` fails when the flag is removed; `SAF-07 a git found only on a relative PATH entry is never run`. The `[e2e]` half moved to FRS-04 and passes there since 2026-10-18: `SAF-07 a repository's core.fsmonitor program never runs`.

## D2 The product in VS Code

### D2 proposal (2026-10-18)

| Location | Change | Est. LoC | Built |
|---|---|---|---|
| `package.json`, `media/sustain.svg` | Activity Bar container, the `sustain.home` view, menus (editor title, Explorer, box, view title), commands, settings | +120 | +165 / -1, three icons |
| `src/model/scope.ts`, `skills/*/SKILL.md`, `src/model/integrity.ts`, `src/extension/skillFiles.ts` | Per-user install by default (`sustain.skillScope`), `${CLAUDE_SKILL_DIR}` in skill bodies and rules, scope-aware integrity | +90 / -20 | +83 / -42 |
| `src/model/runRecord.ts`, `src/agent/repo-facts.ts`, `src/agent/validate.ts` | `run.json` written at creation and updated by the validator | +70 | +131 / -4 |
| `src/model/preflight.ts` | Setup checks: Node, agent CLIs with versions, skills intact, git repository | +90 | +98 |
| `src/model/messages.ts` | Home state and sidebar messages | +80 | +137 / -3 |
| `src/extension/home.ts`, `webview/sidebar.ts`, `webview/sidebar.css` | The sidebar: header, composer, run card, maps, setup, learning session, Ask | +500 | +1,087 |
| `src/model/agentStream/*.ts` | Claude Code and Codex stream parsers to feed items and usage | +180 | +320 |
| `src/extension/runner.ts` | Headless runs: argv per SAF-04, live card, cancel, denials, open on acceptance | +160 | +310 |
| `src/extension/generate.ts` | One click from the sidebar, one modal from the palette, the last agent remembered | +60 / -30 | +165 / -43 |
| `src/extension/showInMap.ts`, `panel.ts`, `webview/main.ts` | Show in Map, follow editor, highlighted boxes | +120 | +280 / -21 |
| `src/extension/statusBar.ts` | The status bar item | +50 | +50 |
| `src/extension/menus.ts` | Map this folder, Show in architecture map, Open code from a box | +50 | In `showInMap.ts` |
| `src/model/ask.ts`, `webview/answer.ts` | Ask prompt, safe answer renderer, `path:line` and box links | +150 | +456 / -1 |

Where the D2 build differs from the proposal:
- The sidebar is twice its estimate. Its stylesheet alone is 413 lines, because every control is styled from theme variables. The maps list (`src/model/maps.ts`) and the shared wording (`src/model/home.ts`) got their own modules.
- The runner row includes `src/extension/runs.ts` (191 lines), which keeps the window's one run, follows `run.json` in both modes, records agent, mode, tokens and cost, and opens the map.
- Ask includes its host controller (`src/extension/ask.ts`, 197 lines): history, the Claude Code session for follow-ups, and the second citation check before a line opens.
- `scope.ts` lives in `src/extension/`, because it reads a VS Code setting. `menus.ts` was not needed; its three commands sit in `showInMap.ts`.
- UI-03's map-panel title buttons (Refresh, Show Changes, Export Page), UI-05's "Refresh this box" and the maps list's Refresh and Export page arrive with the features they run: FRS-06, FRS-04 and RCH-01 in D3 (see the log).
- UI-04's idle icon is the `type-hierarchy-sub` codicon, not `$(sustain)`. A status bar item shows only codicons or a contributed icon font, and Sustain ships no font. "Sustain: 3 changed" is wired through `StatusItem.changed` and waits for FRS-04's counts.
- Windows `.cmd` and `.bat` agent launchers run in a terminal even in sidebar mode, because only `cmd.exe` starts them and it would parse the focus. The note under Generate says so.
- The palette's Generate asks for the focus first. One agent on PATH skips the agent pick. An install, a repair and the data note share one modal, which is a warning when it repairs a changed skill (SAF-01).
- Claude Code's `--allowedTools` script rules name the folder Claude Code loads the skill from (`~/.claude/skills/sustain-architecture` by default, a link to `~/.agents/skills/…`). Whether `${CLAUDE_SKILL_DIR}` resolves to the link or its target is checked at the first `[smoke]` run. The skill's own `allowed-tools` apply too, and a mismatch shows as a denial with "Run in terminal instead".
- Ask needs a map. Without one it says "Generate a map first."
- Claude Code's final reply replaces the narration streamed before it in an Ask answer.

Tests the D2 ACs call for:
- contributions, and every command reachable from a menu, the sidebar or a title bar;
- the sidebar's states: empty, maps, running, setup failing, session active;
- revealing the container shows the view; Generate launches with the typed focus;
- stream parsers on Claude and Codex fixture streams; headless argv per SAF-04;
- a stub agent replaying a stream: feed, tokens, acceptance, Cancel, a denial offering terminal mode;
- editor-title contributions and `when` clauses; Show in Map highlights; follow editor tracks;
- status bar transitions; its click focuses the view;
- Explorer and box menu contributions; box context data; the folder action's focus;
- no SKILL.md hard-codes a repository-root script path; install into a temporary HOME and into the repository;
- setup check version parsing and results; checklist states; stubbed PATHs;
- one interaction from the sidebar, at most two from the palette;
- `run.json` written and updated; terminal-mode card transitions;
- Ask prompt, argv, renderer, link detection; a stub answer whose links open the cited lines.


Done when: Everything is reachable without the Command Palette; runs and questions stream in the sidebar.

- [x] **UI-01 Sustain sidebar** `[unit]` `[dom]` `[e2e]` — 2026-10-18: Activity Bar container `sustain` with the `sustain.home` webview (`dist/sidebar.js`, same CSP as the map); Refresh and Check Setup in its title bar. Tests: `manifest.test.ts` › `UI-01 the Activity Bar container…`, `UI-01 every command is reachable from a menu, a title bar or the sidebar`, `UI-01 each sidebar action is a button the sidebar renders`, `UI-01 the sidebar title bar…`; `test/dom/sidebar.test.ts` › `UI-01 sidebar states` (9: empty, maps, running, setup failing, session active, the focus surviving a state, folder picker, agent and mode); `home.test.ts` (wording, maps list); e2e `UI-01 revealing the container shows the view for this folder`, `UI-01 SET-03 Generate from the sidebar takes one click…` and `UI-01 Delete asks first and removes the run folder`.
- [ ] **UI-02 Runs streamed into the sidebar** `[unit]` `[e2e]` `[smoke]` — `[unit]` `[e2e]` done 2026-10-18: `src/model/agentStream/` parsers and `RunTracker`, `src/extension/runner.ts` (process group, Cancel, Windows shims to the terminal), `src/extension/runs.ts`. Tests: `agentStream.test.ts` (11, on the Claude Code and Codex fixtures), `launchArgs.test.ts` › `UI-02 …` argv cases, `runner.test.ts` (4: replay, Cancel kills the agent and its child, a missing binary, Windows shims); e2e `UI-02 a replayed stream shows feed, tokens and acceptance, records the run and opens the map`, `UI-02 Cancel kills the agent and the processes it started`, `UI-02 a denial offers terminal mode…`. ADR 0046. `[smoke]` waits for the agent CLIs.
- [x] **UI-03 Editor title buttons** `[unit]` `[e2e]` — 2026-10-18, with the map-panel buttons moved to D3 (see the log): Show in Map on every file editor's title bar; it opens the map beside the editor without taking focus and marks the citing boxes; Follow editor; an empty map offers "Map this folder". Tests: `citing.test.ts` (2), `manifest.test.ts` › `UI-03 Show in Map sits in every file editor's title bar…`, `main.test.ts` › `UI-03 boxes citing the active file` (3); e2e `UI-03 Show in Map opens the map beside the editor…`, `UI-03 Follow editor moves the marks…`, `UI-03 a folder without a map…`.
- [x] **UI-04 Status bar item** `[unit]` `[e2e]` — 2026-10-18: `src/extension/statusBar.ts`; idle, `Sustain: generating m:ss` and `Sustain: N changed`. Tests: `home.test.ts` › `UI-04 status bar`; e2e `UI-04 the status bar item's command opens the sidebar` and the status text asserted during and after `UI-02 a replayed stream…`.
- [x] **UI-05 Explorer and box menus** `[unit]` `[dom]` `[e2e]` — 2026-10-18, with "Refresh this box" moved to FRS-06: "Map This Folder with Sustain" on folders, "Show in Architecture Map" on files, Open Code on a box's native context menu. Tests: `manifest.test.ts` › `UI-05 the Explorer maps folders and shows files; boxes open their code`; `render.test.ts` › `UI-05 box context menus` (2, one with a hostile id); e2e `UI-05 Map this folder launches Generate with the folder as the focus`, `UI-05 Open code on a box opens its first source`.
- [ ] **UI-06 Ask about the map** `[unit]` `[dom]` `[e2e]` `[smoke]` — `[unit]` `[dom]` `[e2e]` done 2026-10-18: `src/model/ask.ts` (prompt, blocks, citations, box links), `src/extension/ask.ts` (read-only runs, Claude Code resume, history, the second check before opening), `webview/answer.ts`. Tests: `ask.test.ts` (10, including markup staying text and rejected citations turning back into text), `launchArgs.test.ts` › `UI-06 …`, `agentStream.test.ts` › `UI-06 answers` (2); `answer.test.ts` (3: elements, hostile markup, links) and `sidebar.test.ts` › `UI-06 Ask` (4); e2e `UI-06 a recorded answer renders with checked links, its citation opens the line, and a follow-up resumes the session` (a `.env` citation stays text and never opens). `[smoke]` waits for the agent CLIs.
- [ ] **SET-01 Install anywhere** `[unit]` `[e2e]` `[smoke]` — `[unit]` `[e2e]` done 2026-10-18: `sustain.skillScope` (default `user`) picks the base; skills use `${CLAUDE_SKILL_DIR}`; integrity checks the base copy and repository copies; a per-user session hook runs by absolute path. Tests: `skill.test.ts` › `SET-01 … never a repository path` (2) and the updated frontmatter test; `integrity.test.ts` › `SET-01 a per-user install …`; e2e install into a temporary HOME (every launch now gets its own HOME) and `SET-01 with sustain.skillScope set to project …`. The real `~/.claude/skills` and `~/.agents/skills` stay empty. ADR 0044 supersedes ADR 0006. `[smoke]`: each agent loading the per-user skill waits for the agent CLIs.
- [x] **SET-02 Setup check** `[unit]` `[dom]` `[e2e]` — `[dom]` and `[e2e]` done 2026-10-18 with the sidebar: `sidebar.test.ts` › `setup failing: the checklist opens, with one fix per failing check` and `setup while checking says so`; e2e `SET-02 the setup check finds the stubbed agent and offers one fix for each failing check` (a stub `claude` on PATH, no Codex, no git; the Codex fix copies its install command). `[unit]` done 2026-10-18: `src/model/preflight.ts` checks Node ≥ 18, each agent CLI with its `--version` (asynchronous, 5 s limit, absolute PATH entries only), skills intact and the git repository, each failure with one fix. `test/unit/model/preflight.test.ts` (6; the two stub-CLI tests skip on Windows because the stubs are shell scripts).
- [x] **SET-03 One-click Generate** `[e2e]` — 2026-10-18: the sidebar states the install or repair and the data note under Generate and acts on them with the click; the palette shows them in one modal; the last agent is remembered per workspace. e2e `UI-01 SET-03 Generate from the sidebar takes one click…` (no prompt besides the click), `SET-03 a fresh install takes two interactions…`, `SET-03 dismissing the modal installs nothing and launches nothing`; the palette's FR-GEN-01 and SAF-01 tests were updated for the one-modal flow.
- [x] **CST-04 Run record** `[unit]` `[e2e]` — `[e2e]` done 2026-10-18: e2e `CST-04 a terminal run's run.json transitions show in the card` (created, validating 1, rejected, validating 2, accepted; then `agent` and `mode` recorded) and `UI-02 a replayed stream…` (agent, mode, tokens and cost recorded); `sidebar.test.ts` › `CST-04 terminal-mode card`. `[unit]` done 2026-10-18: `src/model/runRecord.ts`; `repo-facts.mjs` writes `run.json` (git facts now come first, so the new run folder is not a dirty path); `validate.mjs` counts attempts and records `rejected` or `accepted` with `finishedAt`; the build fills in `skillVersion`. Tests: `repoFacts.test.ts` › `CST-04 creates the run folder with run.json…`, `CST-04 git facts … exclude the new run folder`; `validate.test.ts` › `CST-04 run.json counts validator runs and records the outcome` and four updated FR-VAL tests. ADR 0045.

## D3 The living map

### D3 proposal (2026-10-18)

| Location | Change | Est. LoC |
|---|---|---|
| `webview/bridge.ts`, `webview/hosts/vscode.ts`, `webview/hosts/standalone.ts`, `webview/viewer.ts`, `webview/main.ts`, `webview/styles.css` | VWR-01: the viewer talks to its host only through the bridge; colours come from `--sustain-*` tokens each host sets | +170 / -70 | +396 / -216 |
| `src/model/fingerprints.ts`, `src/agent/validate.ts` | FRS-01: `fingerprints.json` on acceptance, blob ids computed as git does, normalized range hashes | +110 | +87 / -1 |
| `src/model/staleness.ts`, `src/model/git.ts` | FRS-02: fresh, moved, edited, missing, unknown per citation and per box; renames from `git diff -M --name-status` | +180 | +137 |
| `src/extension/freshness.ts`, `panel.ts`, `webview/viewer.ts`, `src/model/messages.ts`, `statusBar.ts`, `src/model/maps.ts`, `webview/home.ts` | FRS-03: staleness on load and when a cited file changes, badges, the header, moved lines opening, counts in the maps list and status bar | +240 | +282 / -14 |
| `src/model/changes.ts`, `src/extension/changes.ts`, `webview/viewer.ts` | FRS-04: three scopes, hunk parsing, strong and weak marks, uncovered files, Clear | +280 | +423 / -6 |
| `skills/sustain-refresh/`, `src/agent/refresh-facts.ts`, `esbuild.mjs`, skill lists | FRS-05: the refresh skill and `refresh-facts.mjs` | +280 | +334 / -3 |
| `src/extension/refresh.ts`, `src/extension/agents.ts`, `package.json`, `webview/home.ts`, `webview/viewer.ts` | FRS-06: Refresh in the map's title bar, the freshness header, the maps list and the box menu; the map-panel buttons D2 deferred | +180 / -20 | +184 / -31 |
| `src/model/evidence.ts`, `src/agent/validate.ts`, `skills/sustain-architecture/` | ACC-01: the `evidence` report key, `evidence.json`, the skill text and the revise-once flow | +150 | +109 / -6 |
| `src/agent/render-html.ts`, `src/model/openLinks.ts`, `webview/page.ts`, `esbuild.mjs` | RCH-01: the one-file diagram page with its open targets | +380 | +466 / -24 |

Where the D3 build differs from the proposal:
- VWR-01 is larger because about 160 lines of `webview/main.ts` moved into `webview/viewer.ts`; the new code is the bridge and the two hosts' token tables.
- FRS-01's fingerprints carry `loose`, the range hash with leading whitespace trimmed too, beside `range`. FRS-02 needs it to find a re-indented block as moved, which the spec asks for. Blob ids are computed as git does for SHA-1 repositories.
- FRS-03 watches every workspace folder from activation and also listens to editor saves. A watcher created when a map loads missed the first edit in the e2e suite.
- FRS-04's diff and change model grew with quoted paths, renames, deletions and the untracked-file handling, and `src/model/changes.ts` also holds the commit-range parser.
- FRS-04 compares hunks on the old side, where citations point. A whole-file citation of a changed file is marked strong and a pure rename weak.
- FRS-05 adds `stripAppOwned` to `src/model/submission.ts`, three git helpers to `src/model/git.ts` and `src/model/refresh.ts` for the report and the `--paths` globs.
- FRS-06 changed launching to take a task that names its skill, arguments and card title, so Generate and Refresh share one path. The palette modal says "Refresh with …?" for a refresh.
- ACC-01's heuristic treats typed members such as `id: string;` as declarations and any call outside a function's own signature as behaviour. `run.json` still counts a revision as an attempt; only the skill leaves it out of the three repairs.
- RCH-01 moved `citationPathOk` to the browser-safe `src/model/citationPath.ts`, re-exported from `citations.ts`. The page assembly is `src/model/page.ts`, shared by `render-html.mjs` and Export Page. The Copy target copies `path:line`; the spec's `idea --line` form is left out because the JetBrains target already opens the file. `render-html.mjs` carries the 1.5 MB page bundle, so each skill folder grows by that much.
- The candidate watcher also lists each folder every 2 s (see the log).

Tests the D3 ACs call for:
- every fixture renders the same DOM under the VS Code and standalone hosts, ignoring style values;
- `blob` equals `git hash-object --no-filters`; rejected runs write no fingerprints;
- staleness for CRLF, trailing whitespace, an indentation change, a duplicated block and a rename;
- badges and the freshness header; editing a cited file badges its box within 3 s; a moved block opens at its new lines;
- hunk parsing and mapping to boxes; the overlay in a temporary git repository;
- `refresh-facts` on temporary repositories, with `--paths`, and the run folder's name;
- Refresh launched from each place;
- the declaration-only heuristic, the skill text and the revise-once flow;
- link builders and path checks; the page rendering offline; a hostile label yielding exactly one executable script.

Done when: Staleness, overlay and refresh work; the diagram page works offline.

- [x] **VWR-01 Host bridge** `[dom]` — 2026-10-18: `webview/bridge.ts`, `webview/hosts/vscode.ts`, `webview/hosts/standalone.ts`, `webview/viewer.ts`; `webview/styles.css` uses only `--sustain-*` tokens. Tests: `test/dom/hosts.test.ts` (26: every fixture renders the same DOM under both hosts; each host defines every token the stylesheet uses; the dark palette follows the system), and the existing map DOM tests unchanged. ADR 0047 supersedes ADR 0024.
- [x] **FRS-01 Fingerprints** `[unit]` — 2026-10-18: `src/model/fingerprints.ts`; `validate.mjs` writes `fingerprints.json` on acceptance. Tests: `fingerprints.test.ts` › `FRS-01 blob equals git hash-object --no-filters…` (CRLF, empty, UTF-8 and binary files with a `.gitattributes` that would convert endings) and `…range hash ignores \r and trailing whitespace…`; `validate.test.ts` › `FRS-01 an accepted run gets fingerprints with the revision; a rejected run gets none`.
- [x] **FRS-02 Staleness** `[unit]` — 2026-10-18: `src/model/staleness.ts`, `renamesSince` in `src/model/git.ts`. `staleness.test.ts` (10): fresh; CRLF and trailing whitespace; lines added above (moved, with new lines); an indentation change (moved); a duplicated block resolving to the nearest copy, not the first; edited and missing; worst citation per box; unknown without fingerprints; a rename through `git diff -M --name-status`; a rename outside git (missing).
- [x] **FRS-03 Freshness on the map** `[dom]` `[e2e]` — 2026-10-18: `src/extension/freshness.ts`; badges, the header, moved lines, the maps list, the sidebar header and the status bar. Tests: `main.test.ts` › `FRS-03 freshness on the map` (2); `home.test.ts` › `FRS-03 freshness wording` (2); e2e `FRS-03 editing a cited block badges its box within 3 s and the counts follow` and `FRS-03 a moved block opens at its new lines`. ADR 0048 supersedes ADR 0012.
- [x] **FRS-04 Change overlay** `[unit]` `[e2e]` — 2026-10-18: `src/model/changes.ts` (shared with PRC-01), `diffFor` in `src/model/git.ts`, `src/extension/changes.ts`, the title-bar button. Tests: `changes.test.ts` (6: parsing with renames, deletions, additions and quoted paths; strong, weak and uncovered marks; scopes in a git repository; commit ranges); `main.test.ts` › `FRS-04 change overlay`; e2e `FRS-04 uncommitted changes mark…`, `FRS-04 a commit range compares two commits`, and `SAF-07 a repository's core.fsmonitor program never runs`.
- [x] **FRS-05 Refresh skill** `[unit]` — 2026-10-18: `skills/sustain-refresh/`, `src/agent/refresh-facts.ts`, `src/model/refresh.ts`. Tests: `refreshFacts.test.ts` (8: a temporary repository's edited box, changed and uncovered files and new folder, the run folder's name, `run.json` and the draft passing the validator again; `--paths`; a map without fingerprints; five refused argument lists), `refresh.test.ts` › globs, `skill.test.ts` › `FRS-05 refresh skill` (2), the pre-approval and install tests extended to the third skill. ADR 0049 supersedes ADR 0004.
- [x] **FRS-06 Refresh from the UI** `[e2e]` — 2026-10-18: `src/extension/refresh.ts`; Refresh in the map's title bar, the freshness header, the maps list and the box menu; `Sustain: Refresh Architecture`. e2e `FRS-06 the map's title-bar Refresh…`, `…the freshness header's Refresh…`, `…the maps list refreshes its map`, `…Refresh this box limits the refresh to the files the box cites`, `FRS-06 SAF-01 a missing refresh skill is installed after one modal`, `FRS-06 without a map Refresh is Generate`.
- [x] **ACC-01 Behaviour over names** `[unit]` — 2026-10-18: `src/model/evidence.ts`; the validator's `evidence` key and `evidence.json`; the format reference and both skills. Tests: `evidence.test.ts` (14), `validate.test.ts` › `ACC-01 an accepted report lists declaration-only boxes…` and `ACC-01 a revised draft in an accepted run folder replaces the candidate and its sidecars`, `skill.test.ts` › `ACC-01 behaviour over names` (3). ADR 0050 extends ADR 0017.
- [ ] **RCH-01 Diagram page** `[unit]` `[dom]` `[smoke]` — `[unit]` `[dom]` done 2026-10-18: `src/agent/render-html.ts`, `src/model/page.ts`, `src/model/openLinks.ts`, `webview/page.ts`; both skills run it last; Export Page in the map's title bar and the maps list. Tests: `openLinks.test.ts` (14: each target's link, Windows roots, targets without a root or revision, eight paths that get no link), `page.test.ts` (4), `renderHtml.test.ts` (6: meta.output, the root only locally, refused arguments); `test/dom/page.test.ts` (a hostile label yields exactly one executable script; the page script draws the map with the real layout and no network call, copies a clicked citation, and refuses a denied one); e2e `RCH-01 the map's Export Page writes meta.output with the map and the viewer`. ADR 0051. `[smoke]` waits for the owner.

## D4 Pull request checks

### D4 proposal (2026-10-18)

| Location | Change | Est. LoC | Built |
|---|---|---|---|
| `src/cli/sustain.ts`, `src/cli/commands.ts`, `esbuild.mjs` | RCH-03: `dist/cli/sustain.mjs` with `install`, `verify-skills`, `staleness`, `changes`, `export-page`, `preflight` and `check`; JSON or markdown; the validator's exit codes | +320 | +303 / -13 |
| `src/model/config.ts` | PRC-01: `sustain.config.json`, its schema and reading | +90 | +54 |
| `src/model/ownership.ts` | PRC-01: which box owns a file, by citation or by the deepest cited directory | +60 | +57 |
| `src/model/delta.ts`, `src/model/deltaMarkdown.ts` | PRC-01: touched, stale, uncovered, new box candidates and gone boxes; the main map; `--fail-on`; markdown | +320 | +434 / -8, with `src/model/check.ts` (136) and git helpers (48) |
| `src/extension/review.ts`, `webview/home.ts`, `webview/viewer.ts`, `src/model/messages.ts`, `package.json` | PRC-02: the Review changes section and command, ghost boxes, Show files, Add to map, Ignore with a diff preview | +300 | +407 / -26 |
| `action/action.yml`, `action/src/*.ts`, `action/dist/index.js`, `esbuild.mjs`, `.github/workflows/ci.yml` | PRC-04: the Action: the check, one marked comment with a Mermaid flowchart, `fail-on`; the committed bundle checked for staleness in CI | +330 | +205 / -3, plus the 40 KB bundle |

`publish` (CLD-09) joins the CLI in D5.

Where the D4 build differs from the proposal:
- PRC-01's gathering sits in `src/model/check.ts`: the config, the map, the diff from the merge-base of `--base` and the head, and the code at the head through `git cat-file`. The comparison always starts at the merge-base, as a pull request's diff does.
- "Stale boxes" are boxes whose worst citation is edited or missing, minus gone boxes, which have their own list. `--fail-on stale` fails on either.
- A file at the repository root never forms a candidate; each uncovered file joins the highest folder above it with nothing cited below, and that group's deepest common folder is the candidate.
- "Source files" are recognised by extension, and test files by the usual folder and name patterns; both lists are in `src/model/delta.ts`.
- The markdown lists stop at 30 items in the pull request comment, with a count of the rest, to stay under GitHub's comment size limit.
- RCH-03's `--root` names the repository. `install` and `verify-skills` take `--scope user|project`, and `verify-skills` takes `--agent`. The test setup builds the skills, their hashes and the CLI into `out/test-dist`, so the CLI tests run the real bundle.
- PRC-04's `upload` input exists and logs that nothing was uploaded until CLD-09. A `github-token` input defaults to the workflow's token.
- PRC-02's scope "this branch" compares the working tree with the default branch's merge-base, so uncommitted work counts too. Ignore writes `<folder>/**`.

Tests the D4 ACs call for:
- each CLI command against temporary repositories, as JSON and as markdown, with its exit code;
- one temporary git repository per delta category; the config schema; a markdown snapshot; the exit codes;
- ghost boxes on the map; on a temporary repository branch, the candidates listed, Add to map launching refresh with their paths, and Ignore writing the config;
- the comment and its Mermaid flowchart with hostile labels, through an injected API client; a run against a recorded `pull_request` payload with a fake API.

Done when: The Action comments on this repository's pull requests; Review shows candidates.

- [x] **RCH-03 Core CLI** `[unit]` — 2026-10-18: `src/cli/sustain.ts`, `src/cli/commands.ts`, built to `dist/cli/sustain.mjs` beside the skills and their hashes. `test/unit/cli.test.ts` (14): install into a project and a home, verify-skills intact, changed and missing, staleness, changes per scope, export-page with `--share`, preflight, check pass and fail with markdown, six usage errors (exit 2), a repository without a map. ADR 0052.
- [x] **PRC-01 Delta report** `[unit]` — 2026-10-18: `src/model/check.ts`, `delta.ts`, `deltaMarkdown.ts`, `ownership.ts`, `config.ts`. `test/unit/model/check.test.ts` (15): one temporary git repository each for touched, stale, uncovered (with ignore and non-source files), candidates (a new folder with 3 files, a nested subfolder, test lines left out, an unowned folder gaining 210 lines), gone, the working tree, and `--fail-on`; the main map, `--map` and the config's map; refusals; ownership; the config schema; source and test names; a markdown snapshot (`__snapshots__/delta.md`); escaping; the Mermaid chart. Exit codes in `cli.test.ts`.
- [x] **PRC-02 Review changes in the editor** `[dom]` `[e2e]` — 2026-10-18: `src/extension/review.ts`, the sidebar section, ghost boxes in `webview/viewer.ts`. Tests: `main.test.ts` › `PRC-02 ghost boxes`; `sidebar.test.ts` › `PRC-02 Review changes` (2); e2e `PRC-02 the branch's new folder is listed and drawn as a ghost box`, `PRC-02 Add to map launches a refresh limited to the candidate's folder`, `PRC-02 Ignore shows the change, writes the config and drops the candidate`.
- [ ] **PRC-04 GitHub Action** `[unit]` `[ci]` — `[unit]` done 2026-10-18: `action/` with its committed bundle; `test/unit/action.test.ts` (5: a comment posted then updated on a recorded `pull_request` payload with a fake API; fail-on; hostile labels in the comment and chart; comment off and bad events; the committed bundle equals a fresh build), `noNetwork.test.ts` › `PRC-04 in the Action only the GitHub client uses the network…`, `ci.test.ts` › the `action-dist` and `sustain-check` jobs. ADR 0053. `[ci]` waits for the owner (see Waiting).

## D5 Sustain Cloud v1

### D5 proposal (2026-10-18)

| Location | Change | Est. LoC | Built |
|---|---|---|---|
| `package.json` (workspaces), `cloud/package.json`, `cloud/next.config.ts`, `cloud/tsconfig.json` | The `cloud/` workspace: Next.js 16 App Router, React 19, next-auth 4, Drizzle ORM with PGlite, Playwright; exact versions | +80 | +310 with the schema, migration and client |
| `cloud/src/db/schema.ts`, `cloud/src/db/client.ts`, `cloud/src/lib/store.ts` | Tables for users, organizations, repositories, access, uploads and tokens; PGlite for tests and local runs; queries | +260 | in the rows around it |
| `cloud/src/lib/github.ts`, `cloud/src/lib/access.ts`, `cloud/src/auth.ts`, `cloud/src/app/api/auth/` | CLD-01: GitHub sign-in, organizations mirrored, permission to role mapping, rechecks at sign-in and hourly | +220 | +225 / -2 |
| `cloud/src/lib/oidc.ts`, `cloud/src/lib/tokens.ts`, `cloud/src/lib/upload.ts`, `schemas/sidecars/*.schema.json`, `cloud/src/app/api/v1/uploads/route.ts` | CLD-02: the upload API: OIDC or hashed tokens, schemas with no extra properties, the secret scan, 1 MiB, a rate limit | +330 | +499 |
| `cloud/src/app/[owner]/[repo]/`, `cloud/src/lib/viewerPage.ts`, `esbuild.mjs` | CLD-03, CLD-04: map pages with history and freshness, pull request pages with the overlay, candidates and stale boxes, in the standalone viewer | +260 | +1,208 / -19 with CLD-08, CLD-11 and the `[web]` setup |
| `cloud/src/app/(site)/`, `cloud/src/lib/markdown.ts` | CLD-08: landing, docs from the README and `docs/`, privacy with the upload schema, the pricing note, the gallery; no analytics | +260 | in the row above |
| `src/cli/commands.ts`, `src/cloud/client.ts`, `action/src/main.ts` | CLD-09: `sustain.mjs publish [--run] [--dry-run]` with `SUSTAIN_TOKEN`, and the Action's `upload` through OIDC | +180 | +193 / -10 |
| `cloud/src/app/settings/`, `cloud/src/lib/store.ts` | CLD-11: delete a map, a repository's data or the account, at once; tokens, public maps | +150 | in the CLD-03 row |

Where the D5 build differs from the proposal:
- The upload schema is one file, `src/model/schemas/upload.schema.json`, with the sidecars and the check as `$defs`, and its check lives in `src/model/upload.ts`, so `publish` runs the same check as the server.
- next-auth is version 4, its latest stable release; version 5 is still a beta. Its GitHub provider's endpoints and profile request are replaced with ones built from `GITHUB_OAUTH_URL` and `GITHUB_API_URL`, because the stock one hard-codes an email lookup at api.github.com.
- OIDC tokens are verified with `node:crypto` against GitHub's JWKS, with no JWT library. `SUSTAIN_OIDC_JWKS_URL` points the `[web]` tests at the mock's keys.
- The database is PGlite in memory or in a folder (`SUSTAIN_DB`). A managed Postgres needs a driver package, which the spec does not name, so production waits for the owner's hosting choice (see Waiting). Next loads modules once per bundle, so one instance per process lives on `globalThis`.
- The map pages use the diagram page's bundle (`cloud/public/viewer.js`, built by `node esbuild.mjs --cloud`) with extra messages for freshness, the overlay and ghosts; the viewer can mount into an element.
- The docs publish the README, `docs/architecture.md` and `docs/spec-v0.3.md`. `vision.md` and progress hold plans and are left out until the owner says otherwise.
- Owner changes use small API routes checked for an owner role and a same-site Origin; the check compares the Origin with the Host header, because Next's request URL does not carry the browser's host.
- The site sends security headers (`nosniff`, `same-origin` referrers, no framing) but no CSP yet: Next needs nonces for its inline scripts, which is iterate work. Every map string reaches pages as escaped JSON or React text.
- A GitHub account named like a site route (docs, gallery, privacy, settings, signin, api) cannot have map pages.
- The Action takes a `cloud-url` input for uploads, and a failed upload is logged without failing the job.
- The `[web]` suite runs the built app against a mock GitHub with a fresh PGlite folder, using Playwright's Chromium or the newest cached headless shell. On this machine it used the cached Chromium 151 headless shell.

Tests the D5 ACs call for:
- permission mapping; sign-in against a mocked GitHub;
- an extra `content` field rejected, a secret rejected, OIDC verified with test keys, tokens stored hashed;
- map pages, pull request pages and the public site against a mocked GitHub;
- the publish payload, the dry run, the scan and both authentication paths against a fake server;
- deletion of a map, a repository's data and an account.

Done when: Uploads, map pages and PR pages work against mocks.

- [x] **CLD-01 Accounts and organizations** `[unit]` `[web]` — 2026-10-18: `cloud/src/auth.ts`, `cloud/src/lib/access.ts`, `cloud/src/lib/github.ts`. Tests: `cloud/test/unit/access.test.ts` (11: the mapping table, rank, sign-in mirroring organizations, access reused for an hour then rechecked and removed, rechecks at sign-in, no access); `[web]` `cld01-signin.spec.ts` (2: sign-in through the mock GitHub with organizations mirrored; a signed-out visit returning after sign-in).
- [x] **CLD-02 Upload API** `[unit]` — 2026-10-18: `src/model/upload.ts`, `src/model/schemas/upload.schema.json`, `cloud/src/lib/oidc.ts`, `tokens.ts`, `cloud/src/app/api/v1/uploads/route.ts`. `cloud/test/unit/upload.test.ts` (14): an extra `content` field rejected at the top, in a map component, in a sidecar and in a check; a secret rejected; 413, 400, 422 and 401; OIDC accepted with test keys and refused for another repository, audience, issuer, an expired token, an unknown key, another algorithm and another key's signature; tokens stored as their hash, used for their repository only; the hourly limit. ADR 0054.
- [x] **CLD-03 Map pages** `[web]` — 2026-10-18: `cloud/src/app/[owner]/[repo]/page.tsx`, `cloud/src/lib/mapPage.ts`, `pages.ts`, the viewer bundle. `[web]` `cld03-map.spec.ts` (2: the main map draws with freshness from the latest check and history, and a box opens GitHub at the map's commit; an owner makes a public repository's maps public, after which a visitor and the gallery see them while a private space still asks to sign in); unit `mapPage.test.ts`.
- [x] **CLD-04 Pull request pages** `[web]` — 2026-10-18: `cloud/src/app/[owner]/[repo]/pull/[n]/page.tsx`. `[web]` `cld04-pull.spec.ts` (2: strong and weak boxes, a ghost candidate, a stale box and the counts; a pull request without a check).
- [x] **CLD-08 Public site** `[web]` — 2026-10-18: landing with "Free during beta.", `/docs` from the README and `docs/`, `/privacy` with the upload schema, `/gallery`. `[web]` `cld08-site.spec.ts` (every request stays on the site); unit `markdown.test.ts` (2: links to the web, anchors and published docs only, script URLs as text).
- [x] **CLD-09 Upload from the CLI and the Action** `[unit]` — 2026-10-18: `sustain.mjs publish`, `src/cloud/client.ts`, the Action's `upload`. Tests: `cli.test.ts` › `CLD-09 publish` (4 against a fake cloud: the payload signed with the token, the dry run sending nothing, a secret stopping the upload, refusals and missing settings); `action.test.ts` › `CLD-09 the Action's upload` (2: the OIDC request with audience `sustain-cloud`, the upload signed with that token, the page linked; nothing sent without `upload`, and a missing permission logged); `noNetwork.test.ts` allowing only `src/cloud/client.ts`. ADR 0055.
- [x] **CLD-11 Delete data** `[unit]` `[web]` — 2026-10-18: the account and repository routes and settings pages. Tests: `cloud/test/unit/delete.test.ts` (5: one map, a repository's data, an account with only its own spaces, owners only and same-site only, tokens and public maps); `[web]` `cld11-delete.spec.ts` (a map, a token shown once, a repository's data and the account, each at once).

## D6 Ship

### D6 proposal (2026-10-18)

| Location | Change | Est. LoC | Built |
|---|---|---|---|
| `esbuild.mjs`, `skills/*/scripts/`, `skills/sustain-refresh/references/`, `.github/workflows/ci.yml` | RCH-02: the built scripts committed into each skill and refreshed by `npm run build`; CI fails when they are stale | +50, plus the generated scripts | +42 / -1, plus about 20,000 generated lines |
| `scripts/release.mjs`, `package.json`, `.gitignore` | RCH-02: `npm run build:release` assembles `release/plugin/` with `.claude-plugin/plugin.json` and a marketplace manifest | +80 | +44 |
| `package.json`, `media/icon.png`, `scripts/package.mjs` | RCH-05: the icon, repository, homepage, bugs, keywords, categories and `preview`; `--skip-license` only without a LICENSE; no `--allow-missing-repository` | +60 | +50 / -4 |
| `.github/workflows/release.yml`, `.github/workflows/deploy-cloud.yml` | RCH-05: on `v*` tags the gates, then a GitHub release with the `.vsix`, skill zip, Action bundle and checksums; Open VSX and Marketplace steps behind their secrets; a pre-release tag as a dry run; the cloud deployed from `main` | +130 | +96, with the start hook |
| `README.md` | DOC-01: rewritten around value, quick starts, where to find it, committing the map, cost, what it touches and removal | +150 / -69 | +119 / -41 |

Where the D6 build differs from the proposal:
- The release also carries the CLI as `sustain.mjs`. Sustain Cloud's map pages are filled by `sustain publish`, and people outside the extension had no other way to get it.
- The release fails when the committed Action bundle or skill scripts differ from a fresh build. A hyphenated tag keeps its files as the workflow artifact `release-dry-run`.
- Open VSX needs a declared licence, and `package.json` declares none. Its step is skipped until the owner chooses one. The version stays 0.2.0 until the owner sets the release version.
- The cloud's server opens its database in Next's start hook, `cloud/src/instrumentation.ts`. Migrations therefore run before the first request. A local `next start` with a fresh `SUSTAIN_DB` folder created the database before any request.
- The deploy runs only when the repository variable `SUSTAIN_DEPLOY` is `true`. It calls the host's deploy hook from the secret `SUSTAIN_DEPLOY_HOOK`, and runs the cloud's tests and build first.
- The Marketplace categories are Visualization, AI and Education.
- The README has a short "Using the map" section besides the spec's sections. It has no demo GIF yet, and its cloud quick start says `<cloud address>` until the domain is chosen (see Waiting).
- The refresh skill commits its own copy of the shared `references/`, because `npx skills add` copies each folder on its own.
- CI's `plugin` job runs a pinned `@anthropic-ai/claude-code@2.1.302` through `npx`, on the runner only.

Tests the D6 ACs call for:
- the committed scripts equal a fresh build; the plugin folder's manifests;
- package metadata;
- the release workflow's steps, its secret conditions and the dry run on a pre-release tag;
- the README's headings present and the false phrases absent.

Done when: Released: extension published, Action tagged, cloud deployed.

- [ ] **RCH-02 Skills from GitHub and as a plugin** `[ci]` `[smoke]` — the stale check done 2026-10-18: `syncCommittedSkills` in `esbuild.mjs`, the committed `skills/*/scripts/`, `scripts/release.mjs`. Tests: `test/unit/skill/committed.test.ts` (4: each skill's committed scripts equal a fresh build, seen to fail with one script edited; the refresh skill's references), `release.test.ts` (the plugin's manifests and skills), `ci.test.ts` (the `skills-fresh` and `plugin` jobs). ADR 0056. `[ci]` and `[smoke]` wait for the owner (see Waiting).
- [ ] **RCH-05 Packaging and release** `[unit]` `[ci]` `[smoke]` — `[unit]` done 2026-10-18: `package.json`, `media/icon.png`, `scripts/package.mjs`, `.github/workflows/release.yml`, `.github/workflows/deploy-cloud.yml`, `cloud/src/instrumentation.ts`. `test/unit/package.test.ts` (4: the metadata and the 128 × 128 PNG; the vsce arguments with and without a LICENSE; the release's gates, files, dry run and secret conditions; the deploy's switch and steps), each seen to fail once with its behaviour broken. `npm run package` produced `sustain-0.2.0.vsix` (39 files, 2.49 MB) whose manifest carries the icon, the repository links, the categories and the preview flag. ADR 0057 supersedes 0014 and 0028. `[ci]` and `[smoke]` wait for the owner (see Waiting).
- [x] **DOC-01 README** `[unit]` — 2026-10-18: `README.md`. `test/unit/readme.test.ts` (2: the quick start per setup and the five sections; the `.gitignore` line and the skill-folder advice absent), both seen to fail on the old README, and the second again with the advice added back.

## I1 Cost

### I1 proposal (2026-10-18)

| Location | Change | Est. LoC | Built |
|---|---|---|---|
| `src/model/repoSize.ts`, `src/model/git.ts` | CST-01: tracked files from `git ls-files -z`, or a walk that skips the spec's folders, deny-listed paths and binaries; lines per language, split into test and non-test; the tier. Up to 2,000 files are counted line by line; in larger repositories 2,000 files spread through the tree are counted and the rest estimated from their sizes, which keeps 20,000 files within 4 × the time of 2,000 | +220 | +225 with `trackedFiles` and `generatedFiles` |
| `src/model/estimate.ts`, `src/model/coefficients.json`, `src/model/pricing.json` | CST-02: `estimate(size, agent, kind)` returns `{low, high, basis}` from non-test lines and file count, with provisional coefficients per agent and kind (full, refresh, ask); prices per model with `asOf` and the official source; dollars from a token mix | +160 | +173 with the prices and coefficients |
| `bench/fit.ts`, `src/model/fit.ts`, `package.json` | CST-02: `npm run bench:fit` fits the coefficients, the band and the token mix from `bench/results/*/result.json` by least squares and writes `coefficients.json` with `basis: "fitted"` | +120 | +136 |
| `src/agent/repo-facts.ts`, `skills/sustain-architecture/SKILL.md`, `skills/sustain-refresh/SKILL.md` | CST-01, CST-03, CST-05: `repo-facts` prints `size`, `estimate` and `budget`; step 2 tells the user the estimate; the architecture skill names the read budget per tier (S 25, M 45, L 70) | +40 | +32 |
| `src/extension/generate.ts`, `src/extension/estimates.ts`, `src/extension/home.ts`, `src/extension/ask.ts`, `package.json` | CST-03: the estimate under Generate, in the palette modal and the run card, and under Ask; `sustain.confirmAboveTokens` (default 300,000); above it the sidebar asks for a second click and the palette always shows the modal; sizes cached per folder | +150 | +104 |
| `webview/home.ts`, `src/model/messages.ts`, `src/model/home.ts` | CST-03: the estimate line, the second click on Generate and Ask, the estimate on the run card | +80 | +53 |
| `bench/corpus.json`, `bench/bench.ts`, `bench/src/*.ts`, `bench/fixtures/injection/`, `esbuild.mjs`, `package.json` | CST-06: `npm run bench` with `--dry-run`; clones into a cache outside the repository; removes agent configuration and `strip` globs; a fresh `CLAUDE_CONFIG_DIR` or `CODEX_HOME` with only the skill and no hooks; the bench API key; no shell. Records tokens, cost, wall time, validator runs, acceptance and reads, and keeps the candidate, sidecars and transcript in `bench/results/<run>/`. `npm run bench:plan` projects a series' cost and refuses above `--cap` | +450 | +655 with the corpus and the fixture |

Tests the I1 ACs call for:
- size fixtures for each listing, language and test split, and the tier bounds; 20,000 files within 4 × the time of 2,000;
- estimates growing with size; `bench:fit` reproducing known coefficients from fixture results; the price arithmetic;
- the estimate text; the second click above the threshold `[e2e]`;
- `repo-facts` printing the tier, and the skill naming each budget;
- the `--dry-run` argv and environment, the parsers on recorded fixtures, and `bench:plan` refusing above the cap.

Where the I1 build differs from the proposal:
- Above 2,000 files, each file that is not counted takes its language's mean lines per counted file, instead of an estimate from its size. Reading every file's size took 4.4 times as long at 20,000 files as at 2,000. Sampling brings it to about 2.2 times.
- The size leaves out lock files, minified files, files over 1 MiB, links, submodules, and what `.gitattributes` marks `linguist-generated` or `linguist-vendored`. This repository marks its committed bundles that way. Folders named `fixtures` or `e2e` count as test code.
- Prices are those of the providers' pricing pages on 2026-10-18. The dollars use each agent's default in `pricing.json`, Claude Opus 5.5 and GPT-5.5, the higher-priced of the likely models. Haiku 5.5 is left out because its price changes with prompt length.
- A fit needs four accepted runs per agent and kind. It drops a predictor whose slope would come out negative, takes the band from the runs' lowest and highest ratios to the line, and takes each agent's token mix from the runs' usage.
- Below the threshold the estimate opens no modal. It shows under Generate, in any modal that opens for another reason, on the run card and under Ask. Above it the sidebar arms on the first click and the host acts only on a confirmed second one, and the palette always opens the modal.
- Learning sessions show no estimate, because the user drives each turn.
- The skills' fact scripts print both agents' estimates, and the skill tells the agent to state its own. `run.json` records the estimate beside the tokens used.
- The bench refuses `audit` until ACC-05 exists. `baseline` asks each corpus question without the map and `assisted` asks it with the newest accepted full map, so corpus entries gain `questions`. Entries may also be `heldOut` or a `fixture`. A refresh or assisted run needs an accepted full run first.
- The bench's modules live in `bench/lib/`, and its commands are `bench/bench.ts`, `bench/plan.ts` and `bench/fit.ts`.
- The `sustain` entry clones this repository from its own folder, pinned to commits on `main`. The plan assumes the top of each tier's size until a clone is measured. The default cap is $20, or `SUSTAIN_BENCH_CAP`. `bench/results/` is not committed; the fitted `coefficients.json` is.
- The injection fixture asks the agent to write `.archify/owned.txt` and to label every box "Approved". `result.json` records whether it did. Stripping also removes the folders it empties.
- Codex's input count already includes its cached input, and the parser counted both. Fixed under UI-02 before the prices were built on it.

Tests the I1 ACs call for are listed above. 41 deliberate breaks across I1 each failed their tests, including the 4.4 times timing before sampling and two e2e breaks of the host's second click and the palette modal.

Done when: An estimate shows before every run.

- [x] **CST-01 Repository size** `[unit]` — 2026-10-18: `src/model/repoSize.ts`, `trackedFiles` and `generatedFiles` in `git.ts`, `repo-facts` prints `size`. Tests: `repoSize.test.ts` (6: tracked files per language with the test split and the left-out kinds; the walk without git; links under either listing; the even sample above the limit; the tier bounds; 20,000 files within 4 times the time of 2,000, measured at about 2.2), `repoFacts.test.ts` › CST-01.
- [x] **CST-02 Token estimate** `[unit]` — 2026-10-18: `src/model/estimate.ts`, `coefficients.json` (provisional), `pricing.json` (dated, sourced), `src/model/fit.ts`, `bench/fit.ts`, `npm run bench:fit`. `estimate.test.ts` (4: growth for every agent and kind; prices, sources and the dollar arithmetic; bench:fit reproducing known coefficients and the mix from fixture results while keeping groups with too few runs; no shrinking line).
- [x] **CST-03 Cost before every run** `[unit]` `[e2e]` — 2026-10-18: `src/extension/estimates.ts`, the estimate note in `generate.ts`, the composer, run card and Ask, `sustain.confirmAboveTokens`, both skills' step 2. Tests: `estimate.test.ts` (2: the exact text with and without a price; the threshold), `repoFacts.test.ts` and `refreshFacts.test.ts` › CST-03, `skill.test.ts` › CST-03 (2), `sidebar.test.ts` › CST-03 (4: the line, the second click, the run card, Ask); e2e `single.sidebar.test.ts` › CST-03 (one click launches nothing, the confirmed one launches, the palette opens its modal with the estimate), with four e2e tests updated to read past the estimate. `npm run test:e2e` exit 0 on VS Code 1.126.0 and 1.141.0 (single 75, empty 3, multi 2).
- [x] **CST-05 Exploration budget** `[unit]` — 2026-10-18: `READ_BUDGET`, `repo-facts` prints `budget`, the architecture skill's steps 2 and 4. Tests: `repoFacts.test.ts` › CST-05 (S 25 and M 45), `skill.test.ts` › CST-05.
- [ ] **CST-06 Bench harness** `[unit]` `[smoke]` — `[unit]` done 2026-10-18: `bench/bench.ts`, `bench/plan.ts`, `bench/lib/`, `bench/corpus.json`, `bench/fixtures/injection/`. `test/unit/bench/bench.test.ts` (4: the dry run's argv, whole environment, no shell, steps and no cache made; Codex refresh and read-only question runs; the parsers on recorded transcripts; bench:plan and the bench refusing above the cap). The isolation was also run by hand on the fixture and on this repository's pinned commit. `[smoke]` waits for the owner (see Waiting).

## I2 Accuracy

### I2 proposal (2026-10-18)

| Location | Change | Est. LoC |
|---|---|---|
| `src/model/evidence/imports.ts`, `java.ts`, `typescript.ts`, `python.ts`, `graph.ts` | ACC-02: imports per language (Java packages through source roots; TypeScript and JavaScript relative imports, `require`, re-exports, `tsconfig` `paths` and `baseUrl`; Python absolute and relative imports); the box graph through PRC-01's ownership; `UnsupportedEdge` (no path within two hops), `MissingEdge` (3 or more links, no arrow), `Isolated`, and arrows "not checked" | +420 |
| `src/agent/validate.ts`, `src/model/evidence.ts`, both skills' step 7 | ACC-02: the validator adds the import findings to `evidence.json`; step 7 reviews them in its one revision | +40 |
| `src/model/delta.ts`, `src/model/check.ts`, `src/model/deltaMarkdown.ts`, `src/model/config.ts`, `src/extension/review.ts`, `webview/viewer.ts` | PRC-06: new arrow candidates from import links the diff adds between boxes with no arrow; the third new-box rule for uncovered files that import each other more than any box's files; dashed ghost arrows; the comment lists them; `new-arrow` for `--fail-on` | +220 |
| `skills/sustain-audit/`, `src/agent/audit-record.ts`, `src/model/audit.ts`, `src/model/schemas/audit.schema.json`, `esbuild.mjs`, `src/extension/audit.ts`, `package.json` | ACC-05: the audit skill, reading each box's cited ranges in a fresh subagent where supported; `audit-record.mjs` validates and writes `audit.json` (`supports`, `partial` or `contradicts` per box with a reason of at most 200 characters, evidence per arrow); an Audit Map command in the map's title bar | +300 |
| `src/model/uncertainty.ts`, `src/extension/panel.ts`, `src/model/messages.ts`, `webview/viewer.ts`, `webview/styles.css`, `package.json` | ACC-03: dotted outlines with the reason for `DeclarationOnly`, `partial` and `contradicts` boxes; dashed grey `UnsupportedEdge` arrows labelled "no import evidence"; a legend; the Checks toggle in the map's title bar | +200 |
| `src/model/feedback.ts`, `src/extension/feedback.ts`, `package.json` | ACC-06: the box menu's "This box is wrong…" saves a note to `feedback.json` and offers "Refresh this box" | +90 |
| `eval/score.ts`, `eval/check-truth.ts`, `src/model/score.ts`, `eval/ground-truth/*.json`, `esbuild.mjs`, `package.json` | ACC-04: ground truth for the five corpus repositories from their architecture documents; `npm run eval` scores maps by containment (precision, recall, edges, grouping errors, citation support); `npm run eval:check-truth` checks the globs against the cached clones | +350, plus the ground truth |

Tests the I2 ACs call for:
- per-language import fixtures for Java, TypeScript and Python, and each finding;
- the uncertainty rendering, the legend and the toggle `[dom]`;
- scorer cases with known scores;
- the audit recorder `[unit]` and the verdicts on the map `[dom]`;
- "This box is wrong…" saving a note and offering the refresh `[e2e]`;
- new arrow candidates and the third new-box rule in temporary git repositories.

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

- 2026-10-18 — D5 closed pending owner. Gates: `npm run check` exit 0 (1073 tests, 55 ADRs); `npm run test:e2e` exit 0 on VS Code 1.126.0 and 1.141.0 (single 74, empty 3, multi 2 each); cloud `vitest` 35 passed; cloud `[web]` 8 passed against the built app. Every new test was seen to fail once with its behaviour broken: 16 deliberate breaks across D5. Deployment is a hard stop and waits for the owner (see Waiting).
- 2026-10-18 — D6 closed pending owner. Gates: `npm run check` exit 0 (1086 tests, 57 ADRs); `npm run test:e2e` exit 0 on VS Code 1.126.0 and 1.141.0 (single 74, empty 3, multi 2 each); cloud `vitest` 35 passed; cloud build exit 0; cloud `[web]` 8 passed against the built app with the start hook. Every new test was seen to fail once with its behaviour broken: 8 deliberate breaks across D6. `[ci]`, `[smoke]` and the first release wait for the owner (see Waiting).
- 2026-10-18 — I1 closed pending owner. Gates: `npm run check` exit 0 (1113 tests, 57 ADRs); `npm run test:e2e` exit 0 on VS Code 1.126.0 and 1.141.0 after CST-03 (single 75, empty 3, multi 2 each); later I1 commits touch only the skills' fact scripts, the bench and docs. Cloud untouched since D6. 41 deliberate breaks across I1. One check run under a load average of 15 from another project's browsers timed out three unrelated tests; they passed alone and in the next full run. CST-06 `[smoke]` waits for the owner.
- 2026-10-18 — `architecture.md` had not been updated per feature during D2 to D4, as spec §7 asks; it was brought up to date at D4's close (`29f183b`) and kept current since. The layout fixtures test got a 30 s timeout: it lays out 48 diagrams and passed 5 s only narrowly when the whole suite ran in parallel.

- 2026-10-18 — D4 closed pending owner. Gates: `npm run check` exit 0 (1066 tests, 53 ADRs); `npm run test:e2e` exit 0 on VS Code 1.126.0 and 1.141.0 (single 74, empty 3, multi 2 each). Every new test was seen to fail once with its behaviour broken: 18 deliberate breaks across D4. PRC-04 waits for a committed map of this repository and a push (see Waiting).

- 2026-10-18 — D3 closed pending owner. The candidate watcher also lists each folder's candidates every 2 s: under a load average of 12 from another project's browser tests, two watcher e2e tests timed out on WSL because file events arrived late or not at all. SAF-07's `[e2e]` half now runs in the FRS-04 suite, as planned. Gates: `npm run check` exit 0 (1027 tests, 51 ADRs); `npm run test:e2e` exit 0 on VS Code 1.126.0 and 1.141.0 (single 71, empty 3, multi 2 each). Every new test was seen to fail once with its behaviour broken: 31 deliberate breaks across D3.

- 2026-10-18 — D2 closed pending owner. UI-03's map-panel title buttons (Refresh, Show Changes, Export Page), UI-05's "Refresh this box" and the maps list's Refresh and Export page move to the D3 features they run (FRS-06, FRS-04, RCH-01): a menu entry for a command that does nothing yet would break UI-01's reachability rule in spirit. UI-04 uses a codicon for the idle icon, because a status bar item cannot show an SVG. Gates: `npm run check` exit 0 (914 tests, 46 ADRs); `npm run test:e2e` exit 0 on VS Code 1.126.0 and 1.141.0 (single 59, empty 3, multi 2 each). Ten deliberate breaks each failed their test: inline answer code set as HTML, Cancel signalling only the agent, rejected citations kept, folder citations ignored, the status text ignoring a run, the setup list never opening, box context dropped, the final answer ignored, the newest run not chosen, and a missing Explorer menu entry.

- 2026-10-18 — FR-WAT-01 fix, found by the first e2e run on this machine. The candidate watcher's tests failed 2–3 of 4 on the base commit too: on Linux and WSL, a `candidate.json` written inside a just-created run folder can arrive without an event. The watcher now listens on `.archify/**`, rechecks a run folder's candidate on any event in it, and decides "new" against the candidates it already knows. All four watcher tests pass on both VS Code versions.

- 2026-10-18 — SAF-07 departs from the spec in two places. The Windows stub `git.exe` CI test became a unit test that a relative PATH entry is never searched, since spawning by absolute path is what keeps Windows away from the current folder. The `core.fsmonitor` e2e check waits for Show Changes (FRS-04, D3); the unit test covers the git calls that exist today.

- 2026-10-18 — ENG-02 departs from the spec: the budget factor is 12, not 8. The measured ratio is 7.4, so 8 would flake.

- 2026-10-18 — Spec v0.3 written (`docs/spec-v0.3.md`, features only) with `docs/vision.md`, `AGENTS.md`, `CLAUDE.md`, `.nvmrc` and this file. `kerk` rebased onto `origin/feat/bugfix-mode` (`5df3221`). No code changed. Baseline on Node 26: `npm run check` 774 of 775 tests pass; NFR-PERF-01 times out (ENG-02).
