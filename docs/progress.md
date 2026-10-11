# Progress

Tracks [spec.md](spec.md) milestones. An item is ticked only when its AC passed; evidence is written next to it. `[manual]` and `[live]` checks belong to the owner and are listed separately under each milestone.

## Status

| Milestone | Status | Commit |
|---|---|---|
| M0 Scaffold | Done (owner checks open) | `M0: Scaffold (NFR-QUAL-01, NFR-QUAL-02, NFR-QUAL-03, NFR-SEC-02, FR-DOC-03; ADR 0001-0016)` |
| M1 Model, validator, repo facts | Done | `M1: Model, validator, repo facts (FR-MOD-01, FR-MOD-02, FR-VAL-01..06, FR-GIT-01, FR-RF-01; ADR 0017-0019)` |
| M2 Skill, install, generate | Done (FR-SKL-02 `[live]` open) | `M2: Skill, install, generate (FR-SKL-01..03, FR-WS-01, FR-INS-01, FR-GEN-01; ADR 0020-0021)` |
| M3 Viewer | Not started | |
| M4 Navigation and watching | Not started | |
| M5 Finish | Not started | |

## Environment

* Build machine: macOS (darwin arm64), Node v26.7.0, npm 11.19.0. VS Code is not installed; `[e2e]` uses the copy downloaded by `@vscode/test-electron` into `.vscode-test/`.
* **e2e VS Code version: 1.141.0** (stable on 2026-10-10, pinned in `test/e2e/runTest.ts`); `package.json` `engines.vscode` is `^1.141.0`.

## Dependencies (NFR-QUAL-02)

Pinned exactly in `package.json`: runtime `ajv` 8.20.0, `elkjs` 0.12.0; dev `typescript` 7.0.2, `esbuild` 0.28.2, `vitest` 5.0.3, `happy-dom` 20.14.6, `@types/vscode` 1.140.0, `@types/node` 26.6.5, `@vscode/test-electron` 3.1.0, `mocha` 12.0.3, `@vscode/vsce` 4.0.0.

Additional dev dependencies and their justification: none.

## M0 Scaffold

- [x] **NFR-QUAL-01 Gates.** `npm run check` = `tsc --noEmit` (strict) → `vitest run` → `npm run check:docs` → `npm run build`; `npm run test:e2e` = build → `node esbuild.mjs --e2e` → `node out/e2e/runTest.js`. Evidence 2026-10-10: `npm run check` exit 0 (3 files / 39 tests passed; `check:docs: 16 ADRs and 36 relative links OK`; build OK). `npm run test:e2e` exit 0: VS Code 1.141.0, suite `smoke` 3 passing (`the extension is installed and activates`, `the built bundle ships the skill files`, `a workspace folder is open`).
- [x] **NFR-QUAL-03 Boundaries.** `test/unit/boundaries.test.ts`: `src/model and src/layout respect the boundaries` (scans every file of `src/model/**` and `src/layout/**`; stricter than the AC: no `vscode` anywhere, no Node built-ins in `src/layout/**` and `types/tolerant/checks`, only `fs`/`path`/`child_process` in `citations/git/runFolder/discovery`, no imports from outside the layer); 11 `rejects …` cases and 5 `allows …` cases prove the scanner detects static, type, re-export, `require` and `import()` forms. Passed in `npm run check`.
- [x] **NFR-SEC-02 No network.** `test/unit/noNetwork.test.ts`: `src/** and webview/** contain no network imports or APIs`, 9 `flags …` cases (`http`, `node:https`, `node:http2`, `require("net")`, `node:tls`, `dgram`, `fetch(`, `XMLHttpRequest`, `WebSocket`) and `allows file-system and child-process imports`. Passed in `npm run check`.
- [x] **FR-DOC-03 ADRs** (`[unit]` part). `scripts/check-docs.mjs` checks front matter (`status` incl. `superseded by [ADR-NNNN](…)` targets, `date`, `decision-makers`), required sections, ≥ 2 considered options, the `Chosen option: "…", because …` sentence, `Good/Bad, because` consequences, contiguous numbering, index rows (status and date) in both directions, `template.md` presence, and every relative link in `docs/**/*.md`. `test/unit/checkDocs.test.ts`: 11 tests (well-formed tree, the repo's own docs, missing fields, invalid status, valid supersession, missing sections, missing outcome sentence, numbering gap, stale/missing/extra index rows, broken links ignoring code and URLs, fenced code). ADRs 0001–0015 seed spec §5; 0016 records the harness.
- Vendored files (spec §6), verified identical with `diff -r` / `cmp` against `reference/sustain-prototype`: `src/model/schemas/{architecture,common}.schema.json`, `fixtures/archify/**` (24 JSON + README), `skills/sustain-architecture/references/example.json`. `THIRD_PARTY_NOTICES.md` carries the Archify MIT section with the file list adapted to this repository's paths (the format-reference entry is added in M2 when that file exists).

Owner checks:

- [ ] **NFR-QUAL-02 Dependencies** `[manual]`: `package.json` matches the list above.
- [ ] **FR-DOC-03** `[manual]`: content quality of ADRs 0001–0016.

## M1 Model, validator, repo facts

All M1 tests run in `npm run check` (`vitest run`); the script tests execute the real bundles, built by the vitest global setup `test/unit/support/buildScripts.ts` with `esbuild.mjs`'s `buildScripts()` into `out/test-scripts/`, as child processes of `node`. Evidence 2026-10-11: `npm run check` exit 0 (11 files / 313 tests; `check:docs: 19 ADRs and 38 relative links OK`; build OK, `dist/skills/sustain-architecture/scripts/{repo-facts,validate}.mjs` present); `npm run test:e2e` exit 0 (smoke, 3 passing).

- [x] **FR-MOD-01 Types.** `src/model/types.ts`; documents stay plain JSON values, rewritten with `stringifyDocument`. `test/unit/model/schema.test.ts` › `there are 24 vendored fixtures` and 24 × `<fixture> round-trips parse → stringify as an equal JSON value`; unknown fields kept by the validator: `validate.test.ts` › `root and meta constants are set over agent values; unknown fields survive` (`cards`, `meta.legend`).
- [x] **FR-MOD-02 Schema.** `src/model/schema.ts` (Ajv 2020, `allErrors`, `strict: false`, `$id` resolution from the two local schemas). `schema.test.ts`: 24 × `<fixture> passes the vendored schema`; `an unknown component type points at /components/1/type`; `an extra field points at the extra property` (`/components/0/colour`); `~`/`/` escaping; all errors reported; required → owning object; non-documents; 6 `portableOutputPath` violations and one valid run-folder output.
- [x] **FR-VAL-01 CLI.** `src/agent/validate.ts` → `validate.mjs` ([ADR 0017](adr/0017-validator-output-contract-and-exit-codes.md)). `test/unit/agent/validate.test.ts` › `accepted: exit 0, …`, `rejected: exit 1, …`, `an absolute draft path works from any cwd`, `malformed JSON is a rejection at pointer ""`, 5 × `usage or I/O error (…): exit 2, message on stderr, nothing on stdout`, `a publish failure is an I/O error: exit 2 and the draft stays`, `at most 50 errors are listed, then a count of the rest`; `runFolder.test.ts` › draft location cases. Also smoke-run under Node v18.20.8 (`npx -y node@18`): repo-facts exit 0, validate exit 1 then 0.
- [x] **FR-VAL-02 App-owned fields.** `submission.ts` › `applyAppOwnedFields`. `validate.test.ts` › `every removable field is stripped with a warning and the draft is still accepted` (all 24 pointers listed, none left in the candidate), `root and meta constants are set over agent values; unknown fields survive`, `meta.repository comes from git facts and overrides the agent's`, `without git an agent-supplied meta.repository is removed with a warning`.
- [x] **FR-VAL-03 Schema step.** `validate.test.ts` › `rejected: exit 1, …` (`/components/1/type`), `schema errors stop before semantic and citation checks`.
- [x] **FR-VAL-04 Semantic checks.** `src/model/checks.ts`. `test/unit/model/checks.test.ts`: one test per rule asserting the pointer (duplicate component id, duplicate connection id, unknown `from`, unknown `to`, unknown `wraps/j`, `MissingSources` at `/components/i`, partial overlap and equal sets at `/boundaries/j`), plus valid, id-less connections, nested/separate boundaries, `boundaryRelation`.
- [x] **FR-VAL-05 Citations.** `src/model/{citations,deny}.ts`. `test/unit/model/citations.test.ts` builds a temp repo with an outside folder, an outside file symlink, an outside directory symlink and an in-root symlink: path syntax (7 accepted, 14 rejected incl. 241 chars), line counting (6 cases), valid citations, 5 denied paths, 7 broken targets (outside file link, outside dir link, missing, ENOTDIR, folder, > 2 MiB, NUL in first 8 KiB; exactly 2 MiB and a NUL after 8 KiB are fine), 7 line-range cases each naming the line count, pointer indices. `deny.test.ts`: 64 ported deny-list cases. CLI: `a symlink pointing outside the root is a broken citation`, `semantic and citation errors are reported together`. Deviations from the prototype: [ADR 0019](adr/0019-validator-deviations-from-the-prototype-gate.md).
- [x] **FR-VAL-06 Publish.** `runFolder.ts` › `publishCandidate`. `validate.test.ts` › `an accepted run leaves only candidate.json, written as 2-space JSON with a trailing newline`, `a rejected run leaves only draft.json, byte-identical`; `runFolder.test.ts` › `writes candidate.json, deletes the draft and leaves no temp files`, `replaces an existing candidate`.
- [x] **FR-GIT-01 Git facts.** `src/model/git.ts`. `test/unit/model/git.test.ts` with temp git repos (isolated config, unsigned commits): clean, dirty (modified/untracked/renamed), 205 untracked → 200 + `dirtyCount` 205, no origin, origin with credentials (github), gitee, non-hosted (`local-only`), subfolder, plain folder, no commits, git missing; 10 `sanitizeOrigin` cases; fixed argv; porcelain parsing. CLI with `git` absent from PATH: `repoFacts.test.ts` › `git absent from PATH gives git: null and still succeeds`, `validate.test.ts` (all `envWithoutGit` runs).
- [x] **FR-RF-01 repo-facts CLI.** `src/agent/repo-facts.ts` → `repo-facts.mjs` ([ADR 0018](adr/0018-repo-facts-creates-the-run-folder.md)). `runFolder.test.ts`: 14-row slug table ported from `run_storage.rs`, local timestamp, folder creation, collisions `-2`/`-3`, unusable `.archify`. `repoFacts.test.ts`: output keys and paths, slug from focus / folder name / empty focus, `a name collision appends -2`, git facts, git absent, 3 bad-argument cases, unusable `.archify` → exit 2.

## M2 Skill, install, generate

Evidence 2026-10-11: `npm run check` exit 0 (14 files / 336 tests; `check:docs: 21 ADRs …`; build OK). `npm run test:e2e` exit 0 on VS Code 1.141.0 with three launches: `single` 13 passing, `empty` 3 passing, `multi` 2 passing.

- [x] **FR-SKL-01 Frontmatter.** `skills/sustain-architecture/SKILL.md`, `agents/openai.yaml`. `test/unit/skill/skill.test.ts` › `SKILL.md declares the manual-only skill with its pre-approved tools` (exact four fields), `agents/openai.yaml names the skill and forbids implicit invocation`. Codex tolerance of the Claude-only key: FR-LIVE-02.
- [ ] **FR-SKL-02 Body** `[live]`: written (seven steps, scripts by repo-root path, deny-list listed, 3 repairs / 4 runs, report). Verified only by FR-LIVE-01/02 (owner).
- [x] **FR-SKL-03 Format reference.** `references/archify-format.md` adapted from `crates/archalign-agent/prompts/system.md` (How you work order, Composition, Schema rules kept; tools and "the app" removed; Validation section describes the `validate.mjs` steps; attribution kept). `skill.test.ts` › 5 × `does not mention the prototype tool …`, `does not mention "the app"`, `keeps the Archify attribution`. `THIRD_PARTY_NOTICES.md` lists the file.
- [x] **FR-WS-01 Folder choice.** `src/extension/folders.ts`. e2e: `empty.folders.test.ts` › `the window has no workspace folder`, `sustain.installSkills shows "Open a folder first."`, `sustain.generateArchitecture shows "Open a folder first."`; `multi.folders.test.ts` › `the QuickPick lists every folder and the pick decides the repo root`, `dismissing the folder pick does nothing`; single folder used without a pick in every `single.*` test.
- [x] **FR-INS-01 Install Agent Skills.** `src/extension/{install,skillFiles}.ts`. e2e `single.install.test.ts` › `a fresh install copies the skill and links .claude to it` (`lstat().isSymbolicLink()`, `readlink` = `../../.agents/skills/sustain-architecture`, success message names both paths), `an existing install is replaced after Overwrite` (modal flag and buttons asserted), `Cancel leaves an existing install untouched`, `a lone .claude entry also triggers the overwrite prompt`. Unit `test/unit/extension/skillFiles.test.ts` › `copies into .claude when the symlink cannot be created` (fallback), `replaces an existing install and removes a stale link without following it`, `a dangling .claude link counts as installed`.
- [x] **FR-GEN-01 Generate Architecture.** `src/extension/{generate,agents}.ts` ([ADR 0020](adr/0020-launch-agent-terminal-with-shellpath-and-shellargs.md), [ADR 0021](adr/0021-command-ui-details-not-fixed-by-the-spec.md)). e2e `single.generate.test.ts` with stub CLIs on a temp `PATH` › `Claude Code: the terminal runs the resolved CLI with the prompt as its argument` (`creationOptions.shellPath`, `cwd`, `shellArgs` = `["/sustain-architecture Payment flow"]`, name `Sustain: Claude Code`), `Codex with an empty focus: …` (`["$sustain-architecture"]`), `a missing CLI shows the warning and Copy prompt copies the prompt` (clipboard read back), `dismissing the focus prompt stops before the agent pick`, `without the skill it offers to install first; Install installs and continues`, `without the skill, Cancel stops and installs nothing`. Unit `agents.test.ts`: 5 prompt-format cases, agent order, PATH order, non-executable/folder/empty entries skipped, absent, Windows `PATHEXT`.

## M3 Viewer

- [ ] FR-VIEW-01 Open commands
- [ ] FR-VIEW-02 Newest candidate
- [ ] FR-VIEW-03 Tolerant parse
- [ ] FR-VIEW-04 Panel
- [ ] FR-VIEW-05 Rendering (theme switching `[manual]`)
- [ ] FR-VIEW-06 Viewport (feel `[manual]`)
- [ ] FR-VIEW-07 Tooltip
- [ ] FR-LAY-01 Mode
- [ ] FR-LAY-02 Auto layout
- [ ] FR-LAY-03 Boundaries
- [ ] FR-LAY-04 Edges
- [ ] NFR-SEC-01 Webview CSP (elkjs under CSP `[manual]`)
- [ ] NFR-PERF-01 Layout performance

## M4 Navigation and watching

- [ ] FR-NAV-01 Click
- [ ] FR-NAV-02 Open
- [ ] FR-NAV-03 Stale references
- [ ] FR-WAT-01 Watch
- [ ] FR-TEST-01 Test hook

## M5 Finish

- [ ] FR-PKG-01 Package `[manual]`
- [ ] FR-DOC-01 README `[manual]`
- [ ] FR-DOC-02 Architecture document `[manual]`
- [ ] FR-LIVE-01 Claude Code `[live]`
- [ ] FR-LIVE-02 Codex `[live]`

## Log

- 2026-10-10 — **M0 Scaffold** (NFR-QUAL-01..03, NFR-SEC-02, FR-DOC-03; ADRs 0001–0016 added). Small decisions: `publisher` is `sustain` (extension id `sustain.sustain`, needed by `vsce` and the e2e smoke test); `activationEvents` is empty and `contributes` has no commands until M2 adds the first one; `vitest.config.ts` keeps the spec's name, so Vite prints a notice that native config loading would want `.mts` or `"type": "module"` (making the package ESM would break the CJS `dist/extension.js`); `Promise.withResolvers` is fine in extension/test code but must not be used in the Node-18 skill scripts. `docs/backlog.md` asks for a node finder and a history browser, both spec §3 non-goals: not implemented, raised with the owner.
- 2026-10-11 — **M1 Model, validator, repo facts** (FR-MOD-01..02, FR-VAL-01..06, FR-GIT-01, FR-RF-01; ADRs 0017–0019 added). Small decisions: the candidate's root keys are re-ordered so `schema_version` and `diagram_type` come first (cosmetic; values unchanged); `repo-facts.mjs` prints `root` as the cwd as given (not real-path resolved); the script bundles need no `require` shim (Ajv's `require("ajv/dist/runtime/…")` strings are only used for standalone code generation, which Sustain does not use). Test-only: the vitest unit project has a global setup that builds the scripts into `out/test-scripts/`, because `npm run check` runs vitest before `npm run build`.
- 2026-10-11 — **M2 Skill, install, generate** (FR-SKL-01..03, FR-WS-01, FR-INS-01, FR-GEN-01; ADRs 0020–0021 added). Small decisions: the `vscode`-free parts of install and generate live in `src/extension/skillFiles.ts` and `src/extension/agents.ts` so they are unit-tested in Node; `folders.ts` holds the shared folder choice. Test-only: the e2e harness now launches one VS Code per scenario (`single`, `empty`, `multi`) with its own `--user-data-dir` under `/tmp` (macOS limits IPC socket paths to 104 bytes, which the per-user temp dir exceeds), and UI calls are stubbed on the shared `vscode.window` object (`test/e2e/stubs.ts`). Open question for the owner: ADR 0021 keeps the backticks in §7 messages literally.
