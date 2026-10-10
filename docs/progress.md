# Progress

Tracks [spec.md](spec.md) milestones. An item is ticked only when its AC passed; evidence is written next to it. `[manual]` and `[live]` checks belong to the owner and are listed separately under each milestone.

## Status

| Milestone | Status | Commit |
|---|---|---|
| M0 Scaffold | Done (owner checks open) | `M0: Scaffold (NFR-QUAL-01..03, NFR-SEC-02, FR-DOC-03; ADR 0001-0016)` |
| M1 Model, validator, repo facts | Not started | |
| M2 Skill, install, generate | Not started | |
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

- [ ] FR-MOD-01 Types
- [ ] FR-MOD-02 Schema
- [ ] FR-VAL-01 CLI
- [ ] FR-VAL-02 App-owned fields
- [ ] FR-VAL-03 Schema step
- [ ] FR-VAL-04 Semantic checks
- [ ] FR-VAL-05 Citations
- [ ] FR-VAL-06 Publish
- [ ] FR-GIT-01 Git facts
- [ ] FR-RF-01 repo-facts CLI

## M2 Skill, install, generate

- [ ] FR-SKL-01 Frontmatter
- [ ] FR-SKL-02 Body (`[live]`, verified by FR-LIVE-*)
- [ ] FR-SKL-03 Format reference
- [ ] FR-WS-01 Folder choice
- [ ] FR-INS-01 Install Agent Skills
- [ ] FR-GEN-01 Generate Architecture

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
