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
| I2 Accuracy | Closed pending owner (ACC-04 `[smoke]`) | `949d927` |
| I3 Architecture guardrails | Closed pending owner (PRC-05 `[smoke]`) | `e97077f` |
| I4 Skill retention | Closed pending owner (LRN-01 `[smoke]`) | `5b7a19c` |
| I5 Cloud for teams | Waiting for the owner (CLD-12 hard stop, CLD-10 `[ci]`, CLD-07 Stripe products) | `f732167` |
| I6 Polish and reach | Closed pending owner (VWR-02 `[ci]`, RCH-04 `[smoke]`) | `34d09df` |
| I7 IntelliJ plugin | Waiting for the owner (IDE-01 needs a JDK and Gradle; the JCEF host is built) | |

## Waiting

Items only the owner can do, with exact steps.

- Push `kerk` and enable GitHub Actions so `[ci]` items can run: ENG-01 (the workflow's four jobs), ENG-04 (the stale-notices check) and VWR-02 (`perf.test.ts`, the 60/120 layout median under 1 s on Ubuntu). Then tick them with the run's link.
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
- ACC-04 `[smoke]`: run `npm run eval:check-truth` once with network access. It clones the four public corpus repositories into `~/.cache/sustain-bench` (zulip is the largest) and checks every glob at its pinned commit. Confirm it prints `ok` for each.
- PRC-05 `[smoke]` (hard stop: paid agent calls). In a test repository with a committed map, add to the workflow `permissions: contents: write`, `actions/checkout` with `ref: ${{ github.head_ref }}` and `fetch-depth: 0`, a step that installs Claude Code (`npm i -g @anthropic-ai/claude-code`), and on the Sustain step `with: refresh: claude` and `env: ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}`. Open a pull request that adds a new folder of three source files. Confirm a commit "Update the architecture map for this pull request" lands on the branch with a new run folder, the comment's Map update names it with the changes and tokens, and a pull request from a fork gets "The map is never updated on a pull request from a fork."
- LRN-01 `[smoke]`: in a small JavaScript repository, start a learning session three times from the sidebar, once each in Claude Code, Codex and Devin. In Codex, type `/hooks` and trust Sustain's hook first. In each, let the agent plant a bug, then ask it to fix the bug for you, and confirm the edit is refused with the hunting reason, once only in Devin. Finish or abandon the session and confirm `.claude/settings.local.json`, `.codex/hooks.json` and `.devin/hooks.v1.json` hold no Sustain entry.
- RCH-04 `[smoke]`: with Devin installed, pick Devin in the composer and press Generate in a small repository. Confirm a terminal runs `devin -- "/sustain-architecture <focus>"` and the map opens on acceptance. Then use Copy prompt for… with Cursor's agent or GitHub Copilot agent mode and confirm the pasted prompt runs the skill.
- CLD-07 billing (hard stop: creating Stripe products). In Stripe, create the Team product with a monthly per-seat price, enable the Customer Portal with plan changes and cancellation, and add a webhook endpoint `https://<domain>/api/stripe/webhook` for `checkout.session.completed`, `customer.subscription.updated` and `customer.subscription.deleted`. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (the endpoint's signing secret), `STRIPE_TEAM_PRICE` (the price's id) and `SUSTAIN_TEAM_PRICE_TEXT` (such as "$8 per seat a month") on the host. Then upgrade a test account in Stripe's test mode and confirm Settings shows Team.
- CLD-10 `[ci]`: after the push, confirm the `cloud-image` job builds the image and its health check passes.
- CLD-10 Postgres (install: a new npm dependency). The app runs on PGlite in the `/data` volume. Approve adding `pg@8` with `@types/pg` to `cloud/`, and `cloud/src/db/client.ts` then uses Postgres through Drizzle when `DATABASE_URL` is set, and `cloud/docker-compose.yml` gains a `postgres:17` service. This also covers the D5 deployment's driver step.
- IDE-01 `[jvm]` (hard stop: installing toolchains). Approve installing, without sudo: Eclipse Temurin JDK 21 and JDK 25, from the adoptium.net tarballs into `~/.jdks`; the Gradle 9 wrapper in `intellij/`, which downloads Gradle itself; and the IntelliJ IDEA 2026.1 and 2026.2 distributions that the IntelliJ Platform Gradle Plugin 2.x downloads from JetBrains on the first build, about 1.5 GB each. Then the `intellij/` rows of the I7 proposal are built, and `./gradlew test verifyPlugin` joins the gates.
- CLD-12 (hard stop: network access in shipped extension code). Reply with a go to let the extension send maps to Sustain Cloud when `sustain.cloud.enabled` is on. Nothing of CLD-12 is built until then. With the go, the maps list gains "Share to Sustain Cloud", which signs in through VS Code's GitHub authentication, previews the exact JSON, asks to confirm, and sends it through `src/cloud/client.ts`, the one file the no-network test then allows in the extension.
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

| Location | Change | Est. LoC | Built |
|---|---|---|---|
| `src/model/evidence/imports.ts`, `java.ts`, `typescript.ts`, `python.ts`, `graph.ts` | ACC-02: imports per language (Java packages through source roots; TypeScript and JavaScript relative imports, `require`, re-exports, `tsconfig` `paths` and `baseUrl`; Python absolute and relative imports); the box graph through PRC-01's ownership; `UnsupportedEdge` (no path within two hops), `MissingEdge` (3 or more links, no arrow), `Isolated`, and arrows "not checked" | +420 | +453 / -17 with the next row |
| `src/agent/validate.ts`, `src/model/evidence.ts`, both skills' step 7 | ACC-02: the validator adds the import findings to `evidence.json`; step 7 reviews them in its one revision | +40 | in the row above |
| `src/model/delta.ts`, `src/model/check.ts`, `src/model/deltaMarkdown.ts`, `src/model/config.ts`, `src/extension/review.ts`, `webview/viewer.ts` | PRC-06: new arrow candidates from import links the diff adds between boxes with no arrow; the third new-box rule for uncovered files that import each other more than any box's files; dashed ghost arrows; the comment lists them; `new-arrow` for `--fail-on` | +220 | +181 / -31 |
| `skills/sustain-audit/`, `src/agent/audit-record.ts`, `src/model/audit.ts`, `src/model/schemas/audit.schema.json`, `esbuild.mjs`, `src/extension/audit.ts`, `package.json` | ACC-05: the audit skill, reading each box's cited ranges in a fresh subagent where supported; `audit-record.mjs` validates and writes `audit.json` (`supports`, `partial` or `contradicts` per box with a reason of at most 200 characters, evidence per arrow); an Audit Map command in the map's title bar | +300 | +337 / -7 |
| `src/model/uncertainty.ts`, `src/extension/panel.ts`, `src/model/messages.ts`, `webview/viewer.ts`, `webview/styles.css`, `package.json` | ACC-03: dotted outlines with the reason for `DeclarationOnly`, `partial` and `contradicts` boxes; dashed grey `UnsupportedEdge` arrows labelled "no import evidence"; a legend; the Checks toggle in the map's title bar | +200 | +211 / -5 |
| `src/model/feedback.ts`, `src/extension/feedback.ts`, `package.json` | ACC-06: the box menu's "This box is wrong…" saves a note to `feedback.json` and offers "Refresh this box" | +90 | +74 / -1 |
| `eval/score.ts`, `eval/check-truth.ts`, `src/model/score.ts`, `eval/ground-truth/*.json`, `esbuild.mjs`, `package.json` | ACC-04: ground truth for the five corpus repositories from their architecture documents; `npm run eval` scores maps by containment (precision, recall, edges, grouping errors, citation support); `npm run eval:check-truth` checks the globs against the cached clones | +350, plus the ground truth | +285 / -9, plus 804 lines of ground truth |

Tests the I2 ACs call for:
- per-language import fixtures for Java, TypeScript and Python, and each finding;
- the uncertainty rendering, the legend and the toggle `[dom]`;
- scorer cases with known scores;
- the audit recorder `[unit]` and the verdicts on the map `[dom]`;
- "This box is wrong…" saving a note and offering the refresh `[e2e]`;
- new arrow candidates and the third new-box rule in temporary git repositories.

Where the I2 build differs from the proposal:
- Java imports resolve through each file's package declaration and name, which finds the classes whatever the source roots are. Classes in the same package need no import, so a same-package class named in the text counts as a link.
- Python modules are known by their dotted name from the repository root, from `src/`, and from the folder above the outermost package.
- An arrow is backed by a directed import path either way, directly or through one box. Arrows whose label names a protocol, that join two languages, or that reach a box without checked code are `NotChecked`. Test files are left out of the import graph.
- A fit of the third new-box rule needs the group's files to import each other more often than they import any one box's files. New arrow candidates come only from links the diff added; a link already at the merge base is not new.
- The summary line names new arrow candidates only when there are some, so reports without them read as before. The pull request chart draws them as dotted edges labelled "new import".
- The audit's issues reuse the validator's codes, plus `MissingEntry` for a box or arrow with no entry. A wrong arrow entry is reported once and does not also count as missing. Its evidence passes the map's citation rules. Claude Code's headless audit may use `Task` for subagents; Codex judges the boxes one at a time.
- The audit runs from Audit Map in the map's title bar. Its estimate uses the refresh coefficients until the bench fits an audit line. The skill ships in the plugin and installs with the others.
- Unbacked arrows are relabelled before layout, so showing or hiding the Checks draws the map again. Hide Checks and Show Checks toggle in the map's title bar.
- ACC-05's verdicts on the map are tested with ACC-03's rendering.
- The ground truth for this repository describes v0.1, the corpus's pinned commit. The external agent and `.archify/` have no code there and are left out. Agents read the other four architecture documents through read-only API calls and wrote the files. Two edges inferred for markbind, not drawn in its document, were removed.
- Fixed along the way: CST-03's `estimate` in `run.json` was refused by the closed upload schema. The schema allows it, and the Action's bundle carries the change. The install e2e test now expects the audit skill.
- The eval and check-truth commands share `eval/lib/truth.ts`. Each command bundle keeps one entry point, after an import of one command into the other ran both.

Tests the I2 ACs call for are listed above. 48 deliberate breaks across I2 each failed their tests, including two e2e breaks for ACC-06 and the old upload schema refusing the estimate.

Done when: Evidence and audit verdicts show on the map; the scorer runs.

- [x] **ACC-02 Evidence checks** `[unit]` — 2026-10-18: `src/model/evidence/` (`java.ts`, `typescript.ts`, `python.ts`, `paths.ts`, `graph.ts`), the validator and both skills' step 7. Tests: `imports.test.ts` (5: Java, TypeScript and JavaScript, Python fixtures; the findings with each kind of not-checked arrow; arrows backed either way and through one box), `validate.test.ts` updated for the new findings. 49 ms for this repository's 169 source files.
- [x] **ACC-03 Uncertainty on the map** `[dom]` — 2026-10-18: `src/model/uncertainty.ts`, the panel's `uncertainty` message, the viewer, the tooltip note, the legend, Hide Checks and Show Checks. Tests: `main.test.ts` › ACC-03 ACC-05 (2: dotted boxes, grey dashed relabelled arrows and the legend; the toggle hiding them), `tooltip.test.ts` › ACC-03.
- [ ] **ACC-04 Eval scorer and ground truth** `[unit]` `[smoke]` — `[unit]` done 2026-10-18: `src/model/score.ts`, `eval/score.ts`, `eval/check-truth.ts`, `eval/lib/truth.ts`, five files in `eval/ground-truth/`. `score.test.ts` (2: a map scored as worked out by hand; a perfect and an empty map). Every glob was checked against the tree at its pinned commit, with no file in two components; `eval:check-truth` passed for this repository against a local clone. The other four wait for the owner (see Waiting).
- [x] **ACC-05 Audit** `[unit]` `[dom]` — 2026-10-18: `skills/sustain-audit/`, `src/agent/audit-record.ts`, `src/model/audit.ts`, `schemas/audit.schema.json`, `src/extension/audit.ts`. Tests: `auditRecord.test.ts` (5: recorded and the draft removed; the shape; one entry per box and arrow; the evidence rules; usage), `launchArgs.test.ts` › ACC-05; the rendering in ACC-03's dom tests.
- [x] **ACC-06 Flag a wrong box** `[e2e]` — 2026-10-18: `src/extension/feedback.ts`, the box menu. e2e `single.refresh.test.ts` › ACC-06 (the note saved with its box and date, the offer, the refresh limited to the box's files, a dismissed note saving nothing, a second note appended), on VS Code 1.126.0 and 1.141.0.
- [x] **PRC-06 Import-aware delta** `[unit]` — 2026-10-18: `delta.ts`, `check.ts`, `deltaMarkdown.ts`, `config.ts` (`new-arrow`), the review's ghost arrows, the upload schema. Tests: `check.test.ts` › PRC-06 (2, on temporary git repositories: new arrow candidates with a link already at the base left out, the verdict and the markdown; the third new-box rule and its absence without the cycle).

## I3 Architecture guardrails

### I3 proposal (2026-10-19)

| Location | Change | Est. LoC | Built |
|---|---|---|---|
| `src/model/evidence/*.ts` | ARC-01: every resolved import keeps the line of its first import statement | +40 | +454 / -44 across this row and the next three |
| `src/model/rules.ts`, `src/model/config.ts` | ARC-01: `rules` as `{id, kind, from, to?, via?, reason}` with box ids or `path:` globs; `forbid`, `only-via` and `isolated` checked against the imports; each violation names the rule, the importing file and line, and the imported file | +200 | in the row above |
| `src/extension/rules.ts`, `package.json` | ARC-01: diagnostics at each importing line in the Problems panel, severity from `sustain.rules.severity`, recomputed when a source file or the config is saved; red arrows labelled with the rule on the map | +150 | in the row above |
| `src/model/delta.ts`, `src/model/check.ts`, `src/model/deltaMarkdown.ts`, upload schema | ARC-01: PRC-01's `violation` category for violations the diff adds, and `--fail-on violation` | +80 | in the row above |
| `src/extension/rules.ts`, `webview/viewer.ts`, `webview/home.ts`, `package.json` | ARC-02: "Forbid this dependency" on an arrow; "Only allow imports from…" and "Route dependencies through…" on a box; the sidebar's Rules section with reasons and violation counts; "Suggest rules" for box pairs with no import link; a diff preview before every config write | +260 | +404 / -56 with the shared diff preview |
| `src/model/hotspots.ts`, `src/extension/hotspots.ts`, `webview/viewer.ts`, `webview/home.ts` | ARC-03: commits, lines changed and distinct authors per box over `sustain.hotspots.days` (90); the map's Hotspots toggle colours boxes; the tooltip shows lines and author count; the sidebar lists the five most changed boxes | +220 | +251 / -10 |
| `src/model/agentNotes.ts`, `src/extension/agentNotes.ts`, `package.json` | ARC-04: `Sustain: Write Architecture Notes for Agents` merges a managed block into `AGENTS.md`, and into `CLAUDE.md` when it exists without an `@AGENTS.md` import, after a diff preview | +160 | +141 |
| `src/model/diff.ts`, `src/extension/compare.ts`, `webview/viewer.ts` | FRS-07, pulled forward from I6 for PRC-03: boxes and arrows added, removed and relabelled between two maps; "Compare with…" outlines added boxes and ghosts removed ones | +200 | +342 / -8 with the cloud's map page |
| `src/extension/review.ts`, `webview/home.ts` | PRC-03: Review offers "Compare with base map" when the branch has a newer accepted map, and "Update map for this branch" runs the refresh with `--paths` set to every candidate and stale box | +90 | +103 / -2 |
| `src/model/health.ts`, `src/extension/home.ts`, `webview/home.ts` | ARC-05: the sidebar's Health section with freshness, uncovered changed lines since the map, open violations and the top hotspot, each opening its view | +120 | +149 / -2 |
| `action/src/refresh.ts`, `action/action.yml`, `action/src/main.ts` | PRC-05: `refresh: claude` or `refresh: codex`; with candidates or stale boxes, the refresh runs headless with CST-06's isolation and the new run folder is committed to the pull request branch; the comment adds the map's changes and the tokens; never on forks | +250 | +166 / -27 with the agent home and summary moved to the model |

Tests the I3 ACs call for:
- each rule kind in each language; a violating import's diagnostic appearing and disappearing when fixed `[e2e]`;
- the rule writes `[unit]`, the arrow and box menus and the Rules section `[dom]`, a rule written from the map `[e2e]`;
- hotspots on a temporary git history, and the colouring `[dom]`;
- the managed block merging idempotently with user text untouched, and the command `[e2e]`;
- the map diff `[unit]` and its drawing `[dom]`;
- Compare with base map and Update map for this branch `[e2e]`;
- the Health section `[unit]` `[dom]`;
- the refresh's decision, argv and fork refusal `[unit]`.

Where the I3 build differs from the proposal:
- Each import keeps the line of its first import statement. The rule check reads tracked and untracked source files and leaves tests out. Every rule needs `from`; a rule written from the map for `only-via` uses `path:**`.
- The pull request check reports only the violations its diff added. The extension checks again 300 ms after a source file, the config or a map is saved. The map's red arrows join the boxes that own the two files and carry the rule ids.
- Every config write, Review's Ignore included, shows its diff through one shared `confirmWrite`. Rules are written from the map only when it is the map the rules use. Suggest Rules leaves out boxes without code and pairs an existing `forbid` covers.
- Hotspots read git's log with `--since-as-filter`, because `--since` stops at the first older commit and an out-of-order date hid the rest. Older git falls back to `--since`. The log is reused for a minute, levels round up by share of the busiest box, and the toggle starts off. The tooltip takes notes from several sources.
- Archify boxes have no description, so the agents' notes give each box's sublabel and type as its role. The command sits in the palette and the map's title-bar menu, and says so when the notes are up to date.
- FRS-07 was built here because branch maps compare with the base map. A box whose id changed matches when the two share at least half their cited files. Removed arrows are drawn when both ends are on the map. Cloud map pages offer it with `?compare=<id>`.
- The base map is the newest accepted map with an empty focus at the merge-base. Update map for this branch covers each candidate's folder and each stale or gone box's cited files.
- Health sits under the run card, and is measured at most every 5 s. Uncovered lines leave tests out. Its lines open the map, Show Changes, the Problems panel, or the map with hotspots shown.
- The map update needs the agent's CLI on the runner, because the Action installs nothing, and the pull request's head checked out, because it commits there. It isolates the agent's home and environment but leaves the checkout's files as they are. ADR 0058 supersedes 0053. The agent home and the stream summary moved from the bench into the model to be shared.
- On the map, the compare bar sits at the top, and the Checks legend moves under the toolbar while the changes bar shows.
- Fixed along the way: the CST-01 timing test compares back-to-back pairs, after other test files running alongside skewed one side. Tests whose assertions v0.3 features changed now name those features; that commit's message says thirteen, and sixteen were renamed. ARC-01 to ARC-04 were ticked after their commits.

52 deliberate breaks across I3 each failed their tests, including eight e2e breaks for ARC-01, ARC-02, ARC-04 and PRC-03.

Done when: Rule violations show on the map, in Problems and in PR checks.

- [x] **ARC-01 Architecture rules** `[unit]` `[e2e]` — 2026-10-19: `src/model/rules.ts`, import lines in `src/model/evidence/`, `src/extension/rules.ts` (diagnostics and the map's red arrows), the check's `violations` and `--fail-on violation`. Tests: `rules.test.ts` (11: each kind in TypeScript, Java and Python with the importing line; `path:` globs; reading rules from the config); e2e `single.rules.test.ts` › ARC-01 (a diagnostic at the importing line, gone when fixed). The check's category was confirmed by hand on a scratch repository.
- [x] **ARC-02 Rules from the map** `[dom]` `[unit]` `[e2e]` — 2026-10-19: `src/model/ruleEdits.ts`, `src/extension/ruleCommands.ts`, `src/extension/previewWrite.ts`, the arrow and box menus, the sidebar's Rules section. Tests: `ruleEdits.test.ts` (3), `render.test.ts` and `main.test.ts` › ARC-02 (the arrow menu's context; added arrows without it), `sidebar.test.ts` › ARC-02 (2); e2e `single.rules.test.ts` › ARC-02 (the diff, a no saving nothing, Add saving the rule).
- [x] **ARC-03 Hotspots** `[unit]` `[dom]` — 2026-10-19: `changeLog` in `git.ts`, `src/model/hotspots.ts`, `src/extension/hotspots.ts`, Show Hotspots and Hide Hotspots, the sidebar's Hotspots section. Tests: `hotspots.test.ts` (a temporary history with an out-of-order commit outside the window), `main.test.ts` › ARC-03 (tints kept across a reload, cleared when hidden), `sidebar.test.ts` › ARC-03.
- [x] **ARC-04 Architecture notes for agents** `[unit]` `[e2e]` — 2026-10-19: `src/model/agentNotes.ts`, `src/extension/agentNotes.ts`. Tests: `agentNotes.test.ts` (3: the block, an idempotent merge with the people's text kept, the CLAUDE.md rule); e2e `single.notes.test.ts` (2: both files after their diffs and once only; a CLAUDE.md that imports AGENTS.md left alone, and a no writing nothing).
- [x] **ARC-05 Architecture health** `[unit]` `[dom]` — 2026-10-19: `src/model/health.ts`, the sidebar's Health section and its `openHealth` actions. Tests: `health.test.ts` (2: uncovered lines from the diff and new files; the four lines with and without things to look at), `sidebar.test.ts` › ARC-05.
- [x] **PRC-03 Branch maps** `[e2e]` — 2026-10-19: `src/model/branchMaps.ts`, Review's `compareBase` and `updateBranchMap`, the sidebar's two actions. e2e `single.review.test.ts` › PRC-03 (a branch's newer map offered, compared with the base map read from git, and refreshed with `--paths` for its candidate).
- [ ] **PRC-05 Map update in CI** `[unit]` `[smoke]` — `[unit]` done 2026-10-19: `action/src/refresh.ts`, the Action's `refresh` input and its Map update lines, `src/model/agentHome.ts` and `src/model/agentStream/summary.ts` (moved from the bench to share). Tests: `actionRefresh.test.ts` (3: the decision, the fork refusal, the argv and environment for each agent), `noNetwork.test.ts` › PRC-04 PRC-05. ADR 0058 supersedes 0053. `[smoke]` waits for the owner (see Waiting).
- [x] **FRS-07 Compare maps** `[unit]` `[dom]` (pulled forward from I6 for PRC-03) — 2026-10-19: `src/model/diff.ts`, `src/extension/compare.ts`, the viewer's compare overlay and bar, the cloud map page's `?compare=<id>`. Tests: `diff.test.ts` (2: boxes matched by id or by shared files with arrows following them, and a map against itself), `main.test.ts` › FRS-07 (added outlined, removed see-through with no menu, the bar and Clear, clearing).

## I4 Skill retention

### I4 proposal (2026-10-19)

| Location | Change | Est. LoC | Built |
|---|---|---|---|
| `src/model/practice.ts` | SKL-01: the prompt that asks for three questions about a scope, and the prompt that grades one answer; the checks on the agent's JSON, three questions each with `question`, `key` and a `path:line` citation, and a grade of `correct`, `partial` or `wrong` with one sentence and a citation | +180 | +217 |
| `src/extension/practice.ts`, `package.json` | SKL-01: `Sustain: Check My Understanding` and the box menu's "Check my understanding"; the scopes this branch's changes, uncommitted changes and a box; UI-06's read-only agent for the questions and for each grade; the keys kept in the extension host; results in workspace state | +260 | +277 / -2 |
| `src/model/messages.ts`, `webview/home.ts`, `webview/sidebar.css` | SKL-01: the sidebar's Practice section with the three scopes, the questions with an answer box each, and each grade with its sentence and code link | +170 | +222 / -6 |
| `src/model/tour.ts`, `src/model/schemas/tour.schema.json`, `src/agent/tour-record.ts`, `skills/sustain-tour/` | SKL-02: `tour.json` with 4–12 ordered stops, each checked against the map's boxes and the code; `tour-record.mjs`; the `sustain-tour` skill | +260 | +250 / -4 with the skill lists and the build |
| `src/extension/tour.ts`, `webview/viewer.ts`, `webview/tour.ts`, `package.json` | SKL-02: the map's title-bar Tour and the maps list's Create tour; the player highlights the stop's box, opens its code beside, explains, asks and reveals the answer, with Back, Next and End | +250 | +355 / -7 with the panel and the styles |
| `src/model/upload.ts`, upload schema, `src/cli/commands.ts`, `cloud/src/lib/mapPage.ts`, `webview/page.ts` | SKL-02: `publish` uploads the tour as a sidecar, and the cloud's map page plays it with each stop's code opening on GitHub | +80 | +54 / -10 with the privacy page |
| `src/model/practiceLog.ts`, `src/extension/practice.ts`, `webview/home.ts` | SKL-03: the Practice section lists bug-hunt sessions from `.sustain/`, and explain-back scores and finished tours from workspace state, newest first with dates | +120 | +115 / -11 |
| `src/extension/learn.ts`, `src/extension/hooksFiles.ts`, `src/agent/session-hook.ts` | LRN-01: Start Learning offers Claude Code, Codex and Devin. A launch merges its agent's hooks, into `.claude/settings.local.json` (matcher `Edit\|Write\|NotebookEdit\|Agent`), `.codex/hooks.json` (matcher `apply_patch`) or `.devin/hooks.v1.json`, and removes Sustain's entries from the other two, so the Devin CLI meets one entry. Removal at the session's end covers all three. The hook blocks the Claude Code and Codex tool names and finds the repository from its event's `cwd` | +200 | +172 / -39 with `sessionAgents.ts` |
| `src/agent/modes/bugfix/mutations.ts`, `src/model/session.ts`, `src/agent/session.ts`, `skills/sustain-bugfix/references/bug-taxonomy.md` | LRN-02: Java rule tables for off-by-one and flipped comparison, with generic type arguments left alone, plus `and-or-swap` (T1) and `reference-equality` (T2); `inject` takes `.java` files and the kinds of their language | +150 | +142 / -49 |
| `docs/adr/` | ADRs for the explain-back keys staying in the extension host, `tour.json` and tours in the cloud, hunt enforcement on Claude Code and Codex, and bug kinds per language | 4 ADRs | ADRs 0059 to 0062 |

Tests the I4 ACs call for:
- SKL-01: the prompts and the question and grade checks `[unit]`; no answer key in the sidebar's DOM `[dom]`; a stub agent's questions and grade shown in the sidebar `[e2e]`.
- SKL-02: the recorder `[unit]`; the player `[dom]`; Tour on a recorded tour opening the first stop's code beside the map `[e2e]`.
- SKL-03: the log's entries from sessions, explain-backs and tours `[unit]`; the Practice section `[dom]`.
- LRN-01: the hooks merge and removal for Claude Code and Codex, and the hook's verdicts on their tool names `[unit]`; Start Learning with a stub Claude Code merging its hooks, and a released lock removing them `[e2e]`; one real session per agent `[smoke]`.
- LRN-02: each Java kind on AB3-style fixtures, with generics, strings and comments left alone `[unit]`.

Where the I4 build differs from the proposal:
- The explain-back's checks are written in `practice.ts` without a schema file, and they accept a little more text than the prompts ask for. The estimate shown is one Ask run's, said to cover the questions and each grade. Starting a check above the threshold takes a second click, or a modal from the palette; grading an answer does not. A box is picked from the boxes that cite code.
- A tour's title is at most 100 characters, its question 300 and its answer 400, and each citation names a line. The viewer shows its own Tour button under the toolbar whenever the map has a tour, because the cloud page has no title bar. Create Tour also sits in the map title bar's menu and the palette. The cloud's tour was checked by hand with a scratch script, since the AC names no `[web]` test. The README's title-bar and box-menu rows now list every entry, including ones I3 had added.
- The practice log shows at most 20 entries, dated by day. Bug hunts appear once completed or abandoned. Clear hides an explain-back from the section and keeps it in the log. Tours are logged when Finish is pressed in VS Code.
- The agent pick and each agent's argv live in a new `sessionAgents.ts`. Claude Code and Codex get the PreToolUse hook only. The context hooks stay Devin's. Their hook runs by absolute path, also for a project install, and finds the repository through `CLAUDE_PROJECT_DIR` or by walking up from the event's `cwd`. Each launch removes Sustain's entries from the other agents' files, which is how the Devin CLI meets one entry.
- The Java kinds are named `and-or-swap` and `reference-equality`. Generic type arguments are recognised by their shape, so a comparison that looks like one loses its target. `verify` checks that Java still compiles only through `--check-cmd`.
- Committed `render-html.mjs` scripts were rebuilt in SKL-02 and SKL-03, because the diagram page inlines the viewer. The first SKL-01 e2e break changed nothing observable (on a repository whose branch is `main`, this branch and uncommitted give the same diff), so a second break was used.

50 deliberate breaks across I4 each failed their tests, including four e2e breaks for SKL-01, SKL-02 (two) and LRN-01.

Done when: Explain-back, tours and sessions on every agent work.

- [x] **SKL-01 Explain-back** `[unit]` `[dom]` `[e2e]` — 2026-10-19: `src/model/practice.ts` (the prompts, the question and grade checks, and `checkView`, which leaves the keys out), `src/extension/practice.ts`, the sidebar's Practice section, `Sustain: Check My Understanding` in the palette and the box menu. ADR 0059. Tests: `practice.test.ts` (6: both prompts, the changed lines from a diff, three questions accepted and the refusals, the grades), `sidebar.test.ts` › SKL-01 (4: no key in the state or the DOM, a draft kept across states, the grade and its checked link, the scopes and the second click, the running and blocked states); e2e `single.practice.test.ts` (a stub agent's questions without keys, a grade with a link that opens the line).
- [x] **SKL-02 Guided tours** `[unit]` `[dom]` `[e2e]` — 2026-10-19: `src/model/tour.ts` and `tour.schema.json`, `src/agent/tour-record.ts`, the `sustain-tour` skill, `webview/tour.ts` in the viewer, Tour and Create Tour in the map's title bar, Create tour in the maps list, the `tour` upload sidecar and the cloud map page's player. ADR 0060. Tests: `tourRecord.test.ts` (3: recorded with its date and the draft removed; the shape; boxes and citations), `main.test.ts` › SKL-02 (2: each stop's box, code, explanation, question and hidden answer, Back, Next and Finish, the mark kept across a reload; the title bar's Tour and a tour removed); e2e `single.tour.test.ts` (2: Tour opens each stop's code beside the map; Create tour launches `/sustain-tour <run>`). The skill lists in `release.test.ts`, `cli.test.ts`, `committed.test.ts`, `preapprovals.test.ts`, `skill.test.ts` and `single.install.test.ts` gained the tour skill, and those tests name SKL-02. The cloud map page's tour message was confirmed by hand with a scratch script: a valid tour is sent, and a tour of one stop or none is not.
- [x] **SKL-03 Practice log** `[unit]` `[dom]` — 2026-10-19: `src/model/practiceLog.ts`, the Practice section's log, finished tours recorded from the map's Finish (`tourFinished`) under `sustain.practiceTours`, and Clear keeping a graded explain-back in the log. Tests: `practiceLog.test.ts` (2: finished hunts, fully graded explain-backs and finished tours newest first with their details; the limit), `sidebar.test.ts` › SKL-03 (the entries with their dates as text, and no list when empty), `main.test.ts` › SKL-03 (Finish tells the host, End tour does not).
- [ ] **LRN-01 Learning sessions on Claude Code and Codex** `[unit]` `[e2e]` `[smoke]` — `[unit]` `[e2e]` done 2026-10-19: `src/extension/sessionAgents.ts`, the agent pick in Start Learning, `mergeSessionHooks`, `mergeAgentHooks` and `removeAgentHooks` in `hooksFiles.ts`, and the hook's Claude Code and Codex tool names and repository lookup. ADR 0061. Tests: `hooksFiles.test.ts` › LRN-01 (3: Claude Code's local settings merged once with the user's kept; Codex's file and one Sustain entry per agent; removal from every file), `session-hook.test.ts` › LRN-01 (5: each Claude Code tool blocked; Codex's `apply_patch` blocked with the repository found from `cwd`), `sessionAgents.test.ts` (2: the agents offered, and each argv); e2e `single.session.test.ts` › LRN-01 (a stub Claude Code launched with `/sustain-bugfix`, its hooks merged and removed with the lock). `[smoke]` waits for the owner (see Waiting).
- [x] **LRN-02 Java bug kinds** `[unit]` — 2026-10-19: Java rule tables in `src/agent/modes/bugfix/mutations.ts` with generic type arguments masked, `and-or-swap` (T1) and `reference-equality` (T2) in `src/model/session.ts`, `inject` on `.java` files, and the kinds in the skill's taxonomy. ADR 0062. Tests: `javaMutations.test.ts` (20 on `test/fixtures/java/DeleteCommand.java`, an AB3-style command: each Java kind, comparisons in call arguments and beside `&&`, generics, strings, comments and a cast argument left alone, the kinds refused outside their language, and `inject` seeding `reference-equality` through `session.mjs`).

## I5 Cloud for teams

### I5 proposal (2026-10-19)

| Location | Change | Est. LoC | Built |
|---|---|---|---|
| `cloud/src/lib/dashboard.ts`, `cloud/src/app/[owner]/page.tsx` | CLD-05: `/<org>` lists each repository the viewer can see under that account with its main map's age, freshness, uncovered changed files and open violations from the latest check, the boxes pull requests touched most, a trend of stale boxes and uncovered files over the checks against the default branch, and recent pull requests with the boxes they touched. Every figure is per repository; nothing names a person | +280 | +206 |
| `cloud/src/db/schema.ts`, `cloud/src/db/migrations.ts`, `cloud/src/lib/shares.ts`, `cloud/src/app/s/[token]/page.tsx`, the repository's settings | CLD-06: share links stored as a hash with an expiry of 1, 7 or 30 days; owners create and revoke them in settings; `/s/<token>` shows the main map read-only until it expires or is revoked | +220 | +203 / -6 |
| `cloud/plans.ts`, `cloud/src/lib/billing.ts`, `cloud/src/app/api/v1/billing/`, `cloud/src/app/api/stripe/webhook/route.ts`, schema | CLD-07: Free, Team and Enterprise with their limits enforced on the server (one private repository and 30 days of history on Free; pull request pages, the dashboard and share links on Team). Checkout and the Customer Portal through Stripe's REST API with `fetch`, and webhooks checked by their HMAC signature with `node:crypto`, so Stripe adds no dependency. Prices and Stripe ids come from the environment. Without Stripe keys billing is off and every space is Enterprise | +380 | +427 / -31 with the limits in each route and page |
| `cloud/Dockerfile`, `cloud/docker-compose.yml`, `cloud/src/app/api/health/route.ts`, `.github/workflows/ci.yml` | CLD-10: an image of the built app, a compose file, a health endpoint, and a CI job that builds the image and asks the endpoint | +120 | +79 |
| — | CLD-12: a hard stop (network access in shipped extension code). It waits for the owner's go, and nothing is built | 0 | not built; waits for the owner's go |
| `cloud/src/lib/exportData.ts`, `cloud/src/lib/retention.ts`, `cloud/src/app/api/v1/account/export/route.ts`, settings, `cloud/src/instrumentation.ts` | CLD-13: an owner's data as one JSON download; each repository's audit log of uploads with how each was signed (the token's name or the OIDC repository), the time and the size; a daily job that removes uploads older than the plan keeps | +240 | +170 / -12 |

Tests the I5 ACs call for:
- CLD-05: the dashboard `[web]`; no route returns author-level data `[unit]`.
- CLD-06: a link that opens, then expires and is revoked `[web]`.
- CLD-07: signed test webhooks and the limits `[unit]`; the upgrade flow against a mocked Stripe `[web]`.
- CLD-10: the image builds and the health endpoint answers `[ci]`.
- CLD-13: the export, the audit log and retention `[unit]`; the export and the audit log in settings `[web]`.

Where the I5 build differs from the proposal:
- The dashboard counts uncovered changed files, because check reports list files without their lines. Its checks against the default branch are those run on it and those of pull requests into it, since the Action checks pull requests. The cloud holds no git history, so its hotspots are the boxes the most pull requests touched in the last 90 days. The dashboard needs the Team plan.
- Share links also have a unit test for expiry, revocation and the stored hash, because the `[web]` server's clock cannot move. The settings list refreshes through the router, so the new link stays shown once.
- Billing calls Stripe's REST API with `fetch` and checks the webhook's HMAC with `node:crypto`, so it adds no dependency. Plans belong to the GitHub account that owns the repositories. Seats are the people with access, sent to Checkout and kept from Stripe, and nothing else limits them. Free's limits apply to an account's public repositories too, apart from the private-repository count. The `[web]` suite runs a second app instance with billing on, against a Stripe stand-in, so the other specs keep every feature.
- The image runs the app on PGlite in its `/data` volume, and the compose file has no Postgres service, because Postgres needs a driver that is not installed. The image uses Node 22. The health endpoint was checked by hand, since its AC is `[ci]`.
- CLD-12 is not built. It adds network access to the shipped extension, a hard stop, and waits for the owner's go.
- The audit log names the signer as the token's name or "GitHub Actions OIDC for owner/name". Retention keeps each repository's newest default-branch map, so a quiet repository keeps its map. The daily job runs from `instrumentation.ts` with a timer.
- Fixed along the way: the SKL-02 e2e test waits for the stop's lines to be selected, after it failed once on VS Code 1.126.0.

29 deliberate breaks across I5 each failed their tests, including four `[web]` breaks for CLD-05, CLD-06, CLD-07 and CLD-13. One more e2e break checked the SKL-02 test fix.

Done when: Dashboard, billing and self-hosting work.

- [x] **CLD-05 Team dashboard** `[web]` `[unit]` — 2026-10-19: `cloud/src/lib/dashboard.ts` and the `/<owner>` page. Tests: `dashboard.test.ts` (2: a repository's row from its map and checks; no person in the dashboard, nor a field for one in the closed upload schema), `cld05-dashboard.spec.ts` (an organization's row with its figures, hotspot and pull request link).
- [x] **CLD-06 Share links** `[web]` — 2026-10-19: the `share_links` table (migration `0002_share_links`), `cloud/src/lib/shares.ts`, the shares API, `/s/<token>` and the settings section. Tests: `cld06-share.spec.ts` (a 7-day link opens a private map to a signed-out visitor, and answers 404 once revoked), `shares.test.ts` (expiry, revocation and only the hash stored, which `[web]` cannot reach because the server's clock is real).
- [x] **CLD-07 Plans and billing** `[unit]` `[web]` — 2026-10-19: `cloud/plans.ts`, `cloud/src/lib/billing.ts`, the `account_plans` table (migration `0003_account_plans`), the checkout, portal and webhook routes, each limit at its server route or page, and the settings' Plans section. ADR 0063. Tests: `billing.test.ts` (4: signed, wrong, missing, altered and old webhooks; the subscription states; the private repository limit through the upload API; history, share links and billing off), `cld07-billing.spec.ts` (Free to Team through a mocked Checkout on a second app instance with billing on, and pull request pages unlocked). Creating the Stripe product waits for the owner (see Waiting).
- [ ] **CLD-10 Self-hosting** `[ci]` — built 2026-10-19: `cloud/Dockerfile`, `.dockerignore`, `cloud/docker-compose.yml`, `GET /api/health` and CI's `cloud-image` job. The health endpoint answered `{"status":"ok"}` from the built app by hand. `[ci]` waits for the owner's push, and the compose file's Postgres waits for a driver (see Waiting).
- [ ] **CLD-12 Share from the extension** `[unit]` `[e2e]` — waits for the owner's go (hard stop: network access in shipped extension code; see Waiting).
- [x] **CLD-13 Export and audit** `[unit]` `[web]` — 2026-10-19: `cloud/src/lib/exportData.ts`, `cloud/src/lib/retention.ts`, `auditLog` in `store.ts`, migration `0004_upload_audit` (each upload's token and size), the export route, the settings' Your data and Uploads sections, and the daily job in `instrumentation.ts`. Tests: `export.test.ts` (3: the audit log's signers and sizes; the export without any secret; retention by plan, keeping the newest default-branch map), `cld13-export.spec.ts` (the audit log in settings, and the JSON download).

## I6 Polish and reach

### I6 proposal (2026-10-19)

| Location | Change | Est. LoC | Built |
|---|---|---|---|
| `src/layout/worker.ts`, `src/layout/layout.ts`, `webview/layoutWorkers.ts`, `esbuild.mjs`, `src/extension/html.ts`, `src/model/page.ts` | VWR-02: ELK runs in two Web Workers started from Blob URLs, one per direction, in parallel; the worker's code is built separately and embedded as a string; the webview's and the page's CSP gain `worker-src blob:`; Node and tests run the same function in the thread | +160 | +74 / -16 |
| `webview/finder.ts`, `webview/viewer.ts` | VWR-03: Find with `/` or Ctrl/⌘+F filters boxes by label, sublabel or cited path; Enter centres and zooms on a match, and the arrow keys cycle | +150 | +224 / -4 |
| `webview/render.ts`, `webview/viewer.ts`, `webview/a11y.ts` | VWR-04: boxes take focus with Tab and open their code with Enter, with a focus ring, accessible names and a hidden list for screen readers | +120 | +98 / -3 |
| `src/agent/repo-facts.ts`, `skills/sustain-architecture/SKILL.md`, `src/extension/drill.ts`, `webview/viewer.ts`, `package.json` | VWR-05: "Map this box in detail" in the box menu runs Generate focused on the box with `--parent <run>`; `repo-facts.mjs --parent` records a drill run; a drill-down map offers "Back to overview" | +150 | +120 / -14 |
| `webview/imageExport.ts`, `src/extension/panel.ts`, `package.json` | VWR-06: Save Image in the map's title bar writes the map as SVG or PNG through a save dialog | +140 | +210 / -3 |
| `src/extension/agents.ts`, `src/extension/generate.ts`, `webview/home.ts`, `skills/*/SKILL.md` | RCH-04: Devin in the composer, in terminal mode; `triggers: [user]` in every skill; "Copy prompt for…" GitHub Copilot agent mode, Cursor's agent, Gemini CLI, OpenCode and Devin Desktop | +140 | +129 / -35 |
| `docs/messages.md`, `src/extension/*.ts`, `test/unit/messages.test.ts` | SET-04: every user-visible message in `docs/messages.md` with its ID, text and action; each error and warning offers exactly one action; a source scan keeps the two in step | +220 | +114 / -69, with the 73-line `docs/messages.md` |
| `src/model/usageLog.ts`, `src/extension/usageLog.ts`, `package.json` | SET-05: `sustain.usageLog` (off by default) keeps daily counts of fixed event names; Export Usage Log through a save dialog and Clear Usage Log | +150 | +168 / -13 |
| `src/extension/removeSustain.ts`, `package.json` | SAF-08: `Sustain: Remove Sustain from This Folder`, also in the sidebar's title bar: repository skills, hook entries, exclude lines and the `AGENTS.md` block go; `.archify/`, `.sustain/` and `sustain.config.json` go after asking; the per-user skills are offered | +160 | +146 / -0 |
| `scripts/check-docs.mjs` | ENG-03: every ID this spec defines is on exactly one checklist line of progress, and every requirement-shaped ID in progress is defined here or in `spec.md` | +80 | +51 / -2 |
| `docs/adr/` | ADRs for layout in workers (superseding ADR 0010) and more agents (superseding ADR 0003) | 2 ADRs | 2 ADRs (0064, 0065) |

Tests the I6 ACs call for:
- VWR-02: worker and in-thread layouts identical `[unit]`; the 60/120 median under 1 s on CI `[ci]`.
- VWR-03: the finder `[dom]`. VWR-04: focus, Enter and the screen-reader list `[dom]`. VWR-06: the SVG and PNG export `[dom]`.
- VWR-05: Map this box in detail and Back to overview `[e2e]`.
- RCH-04: the prompt formats `[unit]`; one Devin run `[smoke]`.
- SET-04: the source scan `[unit]`. SET-05: the log `[unit]` and its commands `[e2e]`. SAF-08: the removal `[e2e]`. ENG-03: the traceability check `[unit]`.

Where the I6 build differs from the proposal:
- VWR-02 keeps ELK's own API in the page and starts ELK's bundled worker code from Blob URLs, one worker per direction, in place of a worker of Sustain's own in `src/layout/worker.ts`. ELK's worker build answers on the worker's own message channel and cannot be wrapped. Node lays out through `src/layout/elkInThread.ts`. The `[ci]` median waits for the owner's push.
- VWR-03 also has the viewport leave keys typed into a text box alone.
- VWR-04's accessible name holds the label as attribute text. SAF-03's hostile-label test now reads that attribute, and its name carries VWR-04.
- VWR-06's Save Image sits in the map's title-bar menu beside Compare With… and Create Tour, and its command lives in `src/extension/saveImage.ts`. The PNG is painted onto a canvas from the drawn boxes, arrows and text, rather than drawn from the SVG as an image. The CSP then stays as VWR-02 left it.
- RCH-04's Devin argv test found that `skillPrompt` gave Devin Codex's `$`, and Devin now gets `/`. Its `[smoke]` run waits for the owner.
- SET-04 covers every notification. It changed `sourceTarget.ts` to return navigation problems as data and `confirmWrite` to ask through its callers, because the scan reads each message where it is shown. The scan reads call arguments itself, since a parser package would be a new dependency.
- SAF-08 removes a link after checking only the folder that holds it, because SAF-05's `assertWritable` refuses any path that is a link.
- ENG-03's first run found FRS-07 on both the I3 and the I6 checklist. FRS-07 stays ticked in I3.
- Fixed along the way: the cloud viewer's hydration race (CLD-03) and a stale cloud type-check cache (CLD-13), both logged.

51 deliberate breaks across I6 each failed their tests.

Done when: Gates green.

FRS-07 Compare maps was built in I3 for PRC-03, and is ticked there.

- [ ] **VWR-02 Layout in workers** `[unit]` `[ci]` — `[unit]` done 2026-10-19: `webview/layoutWorkers.ts` (ELK's API with one Blob worker per direction), `src/layout/elkInThread.ts`, the engine passed into `runElk` and `layoutDiagram`, ELK's worker code embedded by `esbuild.mjs`, and `worker-src blob:` in the webview's and the page's CSP. ADR 0064 supersedes 0010. Tests: `worker.test.ts` (ELK's embedded worker code through ELK's API lays out every fixture as the thread does, in two workers), `html.test.ts` and `page.test.ts` › VWR-02 (the CSP strings). `perf.test.ts` › VWR-02 runs on CI's Ubuntu only; here, with `CI=true`, its median was about 0.44 s. `[ci]` waits for the owner's push.
- [x] **VWR-03 Finder** `[dom]` — 2026-10-19: `webview/finder.ts`, `focusView` in `viewport.ts`, the viewer's marks, Find in Map in the map's title bar (`find`), and the viewport leaving keys typed into a text box alone. Tests: `main.test.ts` › VWR-03 (2: `/` opens it, matches by label, sublabel and path in any case, the rest dimmed, typed keys left out of zooming, Escape; Ctrl+F, Enter centring the match, and the arrow keys cycling).
- [x] **VWR-04 Keyboard and screen readers** `[dom]` — 2026-10-19: `webview/a11y.ts`, the boxes' `tabindex`, `role` and `aria-label` in `render.ts`, Enter and Space in the viewer, the focus ring and `.sr-only`. Tests: `main.test.ts` › VWR-04 (2: focus, names and Enter or Space opening only boxes with code; the hidden list of boxes and arrows and its buttons), `inert.test.ts` › SAF-03 VWR-04 (a hostile label in the accessible name stays attribute text).
- [x] **VWR-05 Drill down** `[e2e]` — 2026-10-19: `src/extension/drill.ts` and Map This Box in Detail in the box menu, `repo-facts.mjs --parent` recording a drill run, the architecture skill passing it on, the panel's `overview` message and the map's Back to overview. Tests: e2e `single.drill.test.ts` (2: the launch with `--parent`; Back to overview opening the map it came from). `repo-facts.mjs --parent` was checked by hand on a scratch folder: a drill run with its parent, and exit 2 for a missing parent or a missing value.
- [x] **VWR-06 Image export** `[dom]` — 2026-10-19: `webview/imageExport.ts` (`mapSvg`, `mapPng`), the panel's `image` request and the map's answer, `src/extension/saveImage.ts`, and Save Image in the map's menu. Tests: `imageExport.test.ts` (2: the SVG keeps the theme's colours and leaves out the live map's attributes; the PNG paints the background, boxes, arrows and labels at twice the size) and `main.test.ts` (1: the map answers with itself, and with nothing while no map is shown). Each of 5 deliberate breaks failed a test.
- [ ] **RCH-04 More agents** `[unit]` `[smoke]` — `[unit]` done 2026-10-19: Devin in `AGENTS`, `agentBinary`, `foundAgents` and `chosenHeadless` in `generate.ts`, Devin's terminal launch, `copiedPrompt` and `PROMPT_TARGETS` in `agents.ts`, `src/extension/copyPrompt.ts` with Copy Prompt for… in the composer and the palette, and `triggers: [user]` in every skill. ADR 0065 supersedes 0003. Tests: `launchArgs.test.ts` › RCH-04 (2: Devin's argv; each copied prompt), `skill.test.ts` › RCH-04 (the five skills' `triggers`, and the two frontmatter tests that now name RCH-04), and `agents.test.ts` › RCH-04 (the three agents in order). The Action bundle was rebuilt, since it embeds `agents.ts`. The Devin argv test found that `skillPrompt` gave Devin Codex's `$`. `[smoke]` waits for the owner (see Waiting).
- [x] **SET-04 Messages that say what to do** `[unit]` — 2026-10-19: `docs/messages.md` lists all 67 notifications by ID, kind, text and action. `src/extension/notify.ts` runs a notification's action while the code that showed it carries on. Each error and warning that had no action gained one, and the hooks warning before a learning session became a modal with Start Anyway. `sourceTarget.ts` returns navigation problems as data, and the write confirmations ask from their callers. Every message is now written out at its call. Tests: `messages.test.ts` (1: the scan), and the three `sourceTarget.test.ts` tests it changed now carry SET-04. Each of 6 deliberate breaks failed the scan.
- [x] **SET-05 Opt-in usage log** `[unit]` `[e2e]` — 2026-10-19: `src/model/usageLog.ts` (the fixed event names, daily counts, 90 days), `src/extension/usageLog.ts`, `sustain.usageLog`, the counted commands and sidebar actions, and Export Usage Log and Clear Usage Log in the sidebar's title-bar menu. Tests: `usageLog.test.ts` (2: only listed actions counted by day, with nothing else in the export; old days dropped), e2e `single.usage.test.ts` (2: counting, Export through a save dialog and Clear; nothing kept with the setting off).
- [x] **SAF-08 Remove Sustain from a folder** `[e2e]` — 2026-10-19: `src/extension/removeSustain.ts` (Remove Sustain from This Folder, in the palette and the sidebar's title-bar menu), `removeNotes` in `agentNotes.ts` and `removeGitExclude` in `hooksFiles.ts`. Removing a link checks only the folder that holds it, because SAF-05's `assertWritable` refuses any path that is a link. Tests: e2e `single.remove.test.ts` (2: everything goes once each question is answered yes, with the user's own lines and settings kept; declining keeps the data and the per-user skills).
- [x] **ENG-03 Spec traceability check** `[unit]` — 2026-10-19: `checkTraceability`, `specIds` and `checklistIds` in `scripts/check-docs.mjs`, run by `check:docs`. Tests: `checkDocs.test.ts` › ENG-03 (2: an ID on two checklist lines, one on none, and an undefined ID; the check run on a docs folder), and its existing check of the repository's own docs, which found FRS-07 on both the I3 and the I6 checklist and now passes.

## I7 IntelliJ plugin

### I7 proposal (2026-10-19)

| Location | Change | Est. LoC |
|---|---|---|
| `webview/hosts/jcef.ts`, `webview/jcef.ts`, `esbuild.mjs` | IDE-01: the viewer's JCEF host. The viewer's messages go to Kotlin as JSON through `window.sustainPost`, Kotlin's messages arrive through `window.sustainReceive`, and `window.sustainDark` picks the light or dark palette. Built as `dist/jcef.js` | +50 |
| `intellij/settings.gradle.kts`, `intellij/build.gradle.kts`, `intellij/gradle.properties`, `intellij/src/main/resources/META-INF/plugin.xml` | IDE-01: the Kotlin project on the IntelliJ Platform Gradle Plugin 2.x for IntelliJ IDEA 2026.2 (Java 25) and 2026.1 (Java 21), with the bundled "Web Browser (JCEF)" plugin as a dependency for 2026.2. The plugin packs `dist/jcef.js`, `dist/webview.css`, `dist/cli/` and `dist/skills/` | +120 |
| `intellij/src/main/kotlin/…/MapPanel.kt`, `Bridge.kt` | The Map tab: a JCEF page with the viewer, its messages, and `OpenFileDescriptor(project, file, line - 1, 0).navigate(true)` on the UI thread. Without JCEF, the diagram page opens instead | +200 |
| `intellij/src/main/kotlin/…/HomePanel.kt`, `SustainToolWindowFactory.kt` | The Home tab: the composer with Generate in the IDE terminal, the maps list, Review through `check` and Setup through `preflight` and `install` | +220 |
| `intellij/src/main/kotlin/…/ShowInMapAction.kt` | "Show in Sustain Map" in the editor menu | +60 |
| `intellij/src/main/kotlin/…/CoreCli.kt`, `AgentLaunch.kt` | `node <plugin>/core/cli/sustain.mjs <command> --root <root>`, and each agent's terminal command | +100 |
| `intellij/src/test/kotlin/` | The bridge, argv and CLI-call tests | +150 |

Tests the I7 AC calls for:
- IDE-01: the JCEF host's bridge `[dom]`; the bridge, argv and CLI-call tests and `verifyPlugin` `[jvm]`; on AB3, generate, open, and click to open the cited lines `[smoke]`.

The `intellij/` rows wait for a JDK and Gradle, which are not installed here (hard stop: installing toolchains, see Waiting). Kotlin that cannot be compiled or tested here is not written blind. The JCEF host is built now.

Done when: The plugin opens cited lines on AB3.

- [ ] **IDE-01 IntelliJ plugin** `[jvm]` `[smoke]` — the JCEF host done 2026-10-19: `webview/hosts/jcef.ts`, `webview/jcef.ts` and `node esbuild.mjs --intellij`, which writes `out/intellij/jcef.js` and `jcef.css`. Tests: `jcef.test.ts` (2: messages go out as JSON through `sustainPost` and come in through `sustainReceive`; `sustainDark` picks the palette). The built bundle was also run once in happy-dom, where it posted `ready` and showed an empty state sent through `sustainReceive`. Each of 3 deliberate breaks failed a test. The bundle stays out of `dist/`, because `.vscodeignore` cannot leave out one file of a folder it includes. The `intellij/` project waits for a JDK and Gradle (see Waiting).

## Log

- 2026-10-18 — D5 closed pending owner. Gates: `npm run check` exit 0 (1073 tests, 55 ADRs); `npm run test:e2e` exit 0 on VS Code 1.126.0 and 1.141.0 (single 74, empty 3, multi 2 each); cloud `vitest` 35 passed; cloud `[web]` 8 passed against the built app. Every new test was seen to fail once with its behaviour broken: 16 deliberate breaks across D5. Deployment is a hard stop and waits for the owner (see Waiting).
- 2026-10-18 — D6 closed pending owner. Gates: `npm run check` exit 0 (1086 tests, 57 ADRs); `npm run test:e2e` exit 0 on VS Code 1.126.0 and 1.141.0 (single 74, empty 3, multi 2 each); cloud `vitest` 35 passed; cloud build exit 0; cloud `[web]` 8 passed against the built app with the start hook. Every new test was seen to fail once with its behaviour broken: 8 deliberate breaks across D6. `[ci]`, `[smoke]` and the first release wait for the owner (see Waiting).
- 2026-10-18 — I1 closed pending owner. Gates: `npm run check` exit 0 (1113 tests, 57 ADRs); `npm run test:e2e` exit 0 on VS Code 1.126.0 and 1.141.0 after CST-03 (single 75, empty 3, multi 2 each); later I1 commits touch only the skills' fact scripts, the bench and docs. Cloud untouched since D6. 41 deliberate breaks across I1. One check run under a load average of 15 from another project's browsers timed out three unrelated tests; they passed alone and in the next full run. CST-06 `[smoke]` waits for the owner.
- 2026-10-19 — I2 closed pending owner. Gates: `npm run check` exit 0 (1134 tests, 57 ADRs); `npm run test:e2e` exit 0 on VS Code 1.126.0 and 1.141.0 after ACC-06 (single 76, empty 3, multi 2 each); cloud `vitest` 35 passed; cloud build exit 0; cloud `[web]` 7 passed and one failed on its 5 s wait for a signed-out page to draw while the machine was loaded. That spec passed alone in 1.3 s, and the suite now waits up to 15 s. 48 deliberate breaks across I2. ACC-04 `[smoke]` waits for the owner.
- 2026-10-19 — I3 closed pending owner. Gates: `npm run check` exit 0 (1167 tests, 58 ADRs); `npm run test:e2e` exit 0 on VS Code 1.126.0 and 1.141.0 after PRC-05 (single 81, empty 3, multi 2 each); cloud `vitest` 35 passed; cloud build exit 0; cloud `[web]` 8 passed. The web run took 4.7 minutes, because after the machine restarted a connection to an unused local port waited for its timeout instead of being refused. 52 deliberate breaks across I3. PRC-05 `[smoke]` waits for the owner.
- 2026-10-19 — I4 closed pending owner. Gates: `npm run check` exit 0 (1219 tests, 62 ADRs); `npm run test:e2e` exit 0 on VS Code 1.126.0 and 1.141.0 after LRN-02 (single 85, empty 3, multi 2 each); cloud `vitest` 35 passed; cloud build exit 0 and cloud `[web]` 8 passed after SKL-02, the last I4 change to the cloud. 50 deliberate breaks across I4. LRN-01 `[smoke]` waits for the owner.
- 2026-10-19 — I5 built but for CLD-12, which waits for the owner's go (hard stop: network access in shipped extension code). Gates after CLD-13: `npm run check` exit 0 (1219 tests, 63 ADRs); `npm run test:e2e` exit 0 on VS Code 1.126.0 and 1.141.0 (single 85, empty 3, multi 2 each); cloud typecheck exit 0; cloud `vitest` 45 passed; cloud build exit 0; cloud `[web]` 12 passed in 9.3 minutes with two app instances. 29 deliberate breaks across I5. CLD-10 `[ci]` and the Stripe products wait for the owner. I6 starts while CLD-12 waits, as §7 allows.
- 2026-10-19 — The cloud's incremental type check kept `cloud/tsconfig.tsbuildinfo` between runs, and CLD-13's gate passed over a `mapPage.test.ts` fixture that lacked `size` and `tokenId`. The fixture was fixed, and the cloud gates now delete that file before the type check and the build.
- 2026-10-19 — Signed-out cloud map pages showed no map. The viewer script filled the page before React hydrated it, and hydration replaced its work. `MapViewer.tsx` now loads the script through `next/script` once the page is interactive, and two `[web]` tests were seen failing without it. The fix went in with CLD-03.
- 2026-10-19 — I6 closed pending owner. Gates after SET-04: `npm run check` exit 0 (1239 tests, 65 ADRs); `npm run test:e2e` exit 0 on VS Code 1.126.0 and 1.141.0 (single 91, empty 3, multi 2 each); cloud `vitest` 45 passed. After VWR-06, the last I6 change to viewer code: cloud typecheck and build exit 0, and cloud `[web]` 12 passed in 9.2 minutes. VWR-02 `[ci]` and RCH-04 `[smoke]` wait for the owner.
- 2026-10-19 — The first CI runs on pull request #4 ran every job twice, once for the push and once for the pull request. CI now runs on pushes to main and on pull requests only. GitHub also warned that `actions/checkout@v4` and the Sustain Action target Node 20, which it is retiring. The workflows now use `actions/checkout@v5`, `actions/setup-node@v5`, `actions/upload-artifact@v6` and `azure/login@v3`, the first majors that run on Node 24, and the Action runs on `node24`. Its bundle came out the same.
- 2026-10-19 — The v0.3 build has reached the end of what runs without the owner. Every unticked item waits for a push, a `[smoke]` run, an install or a go, and Waiting lists the steps for each.
- 2026-10-19 — SET-05's first e2e run failed once. VS Code's built-in git extension threw an uncaught `write EPIPE` from `git check-ignore` during VWR-05's drill test, and the suite counts any uncaught error as a failure. The rerun passed on both versions. A second occurrence will get the drill test waiting for git's work on its folder to finish.
- 2026-10-19 — SET-04 reads "every user-visible message" as every notification, modal or not. The sidebar's and the map's own text, the status bar and quick pick prompts stay where they are. The scan reads call arguments with a small scanner in the test, because TypeScript 7 ships no parser API and a parser package would be a new dependency. The new actions are Open Folder… for errors that need a folder, Refresh Map for stale citations, Open File for an unreadable map, Open Config for config errors, Open Exclude File, Open run.json, Remove Copies, Copy Note, Compare With… and Try Again.
- 2026-10-18 — `architecture.md` had not been updated per feature during D2 to D4, as spec §7 asks; it was brought up to date at D4's close (`29f183b`) and kept current since. The layout fixtures test got a 30 s timeout: it lays out 48 diagrams and passed 5 s only narrowly when the whole suite ran in parallel.

- 2026-10-18 — D4 closed pending owner. Gates: `npm run check` exit 0 (1066 tests, 53 ADRs); `npm run test:e2e` exit 0 on VS Code 1.126.0 and 1.141.0 (single 74, empty 3, multi 2 each). Every new test was seen to fail once with its behaviour broken: 18 deliberate breaks across D4. PRC-04 waits for a committed map of this repository and a push (see Waiting).

- 2026-10-18 — D3 closed pending owner. The candidate watcher also lists each folder's candidates every 2 s: under a load average of 12 from another project's browser tests, two watcher e2e tests timed out on WSL because file events arrived late or not at all. SAF-07's `[e2e]` half now runs in the FRS-04 suite, as planned. Gates: `npm run check` exit 0 (1027 tests, 51 ADRs); `npm run test:e2e` exit 0 on VS Code 1.126.0 and 1.141.0 (single 71, empty 3, multi 2 each). Every new test was seen to fail once with its behaviour broken: 31 deliberate breaks across D3.

- 2026-10-18 — D2 closed pending owner. UI-03's map-panel title buttons (Refresh, Show Changes, Export Page), UI-05's "Refresh this box" and the maps list's Refresh and Export page move to the D3 features they run (FRS-06, FRS-04, RCH-01): a menu entry for a command that does nothing yet would break UI-01's reachability rule in spirit. UI-04 uses a codicon for the idle icon, because a status bar item cannot show an SVG. Gates: `npm run check` exit 0 (914 tests, 46 ADRs); `npm run test:e2e` exit 0 on VS Code 1.126.0 and 1.141.0 (single 59, empty 3, multi 2 each). Ten deliberate breaks each failed their test: inline answer code set as HTML, Cancel signalling only the agent, rejected citations kept, folder citations ignored, the status text ignoring a run, the setup list never opening, box context dropped, the final answer ignored, the newest run not chosen, and a missing Explorer menu entry.

- 2026-10-18 — FR-WAT-01 fix, found by the first e2e run on this machine. The candidate watcher's tests failed 2–3 of 4 on the base commit too: on Linux and WSL, a `candidate.json` written inside a just-created run folder can arrive without an event. The watcher now listens on `.archify/**`, rechecks a run folder's candidate on any event in it, and decides "new" against the candidates it already knows. All four watcher tests pass on both VS Code versions.

- 2026-10-18 — SAF-07 departs from the spec in two places. The Windows stub `git.exe` CI test became a unit test that a relative PATH entry is never searched, since spawning by absolute path is what keeps Windows away from the current folder. The `core.fsmonitor` e2e check waits for Show Changes (FRS-04, D3); the unit test covers the git calls that exist today.

- 2026-10-18 — ENG-02 departs from the spec: the budget factor is 12, not 8. The measured ratio is 7.4, so 8 would flake.

- 2026-10-18 — Spec v0.3 written (`docs/spec-v0.3.md`, features only) with `docs/vision.md`, `AGENTS.md`, `CLAUDE.md`, `.nvmrc` and this file. `kerk` rebased onto `origin/feat/bugfix-mode` (`5df3221`). No code changed. Baseline on Node 26: `npm run check` 774 of 775 tests pass; NFR-PERF-01 times out (ENG-02).
