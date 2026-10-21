---
status: accepted
date: 2026-10-21
decision-makers: owner
---

# Units with one-way import rules

## Context and Problem Statement

The code sat in `src/model`, `src/extension`, `src/layout`, `src/agent`, `webview/` and `action/src`. `test/unit/boundaries.test.ts` kept per-file lists of the model modules that could use Node. A folder did not say which product surface a module served. The refactor ([spec-refactor.md](../spec-refactor.md) §2) asks that the skills work in any repository, that the diagram viewer run in any host, and that the bug-hunt track come out by deleting its folders. How is the code divided, and what keeps it divided?

## Decision Drivers

* Each product surface stands on its own.
* A broken boundary fails a test, not a review.
* No new dependency and no second package.

## Considered Options

* Units as top-level folders under `src/` in one package, with import rules checked by a source scan and a core typecheck
* npm workspaces, one package per unit
* The old folders, with per-file allowlists

## Decision Outcome

Chosen option: "Units as top-level folders under `src/` in one package, with import rules checked by a source scan and a core typecheck", because it enforces the boundaries now and lets a unit become a workspace later without moving code.

| Unit | Holds | May import |
|---|---|---|
| `src/core` | The Archify format: types, schema, tolerant parsing, submission and citation-path checks, change maps, diagram diff, ID matching, comparison, the lineage types and small pure helpers. | Nothing outside `src/core` but `ajv`. No Node built-in and no DOM. |
| `src/core-node` | Repository facts and file I/O: git, run folders, run records, lineage files, discovery, repository size, evidence, the rules, delta and check engine, fingerprints, confinement, integrity hashing, skill install files and JSON files. | `src/core` and Node built-ins. |
| `src/skills` | The `sustain-architecture` scripts. | `src/core` and `src/core-node`. |
| `src/viewer` | The diagram viewer: layout, render, viewport, tooltip, changes, accessibility, clicks, its protocol and the shared DOM helpers. | `src/core`, `elkjs` and the DOM. |
| `src/cli` | The core CLI. | `src/core` and `src/core-node`. |
| `src/action` | The GitHub Action. | `src/core` and `src/core-node`. |
| `src/learn` | The bug-hunt track without VS Code UI. | `src/core`, `src/core-node` and `src/viewer`. |
| `src/vscode` | The extension host, the sidebar and `src/vscode/learn/`. | `src/core`, `src/core-node`, `src/viewer` and `src/learn`. |

* Only `src/vscode` imports the `vscode` module.
* Nothing imports `src/vscode`, `src/cli`, `src/action` or `src/skills`. Each is the entry point of a bundle.
* Inside `src/vscode`, only `extension.ts` and `src/vscode/learn/` import `src/learn`.
* `src/viewer` names neither `acquireVsCodeApi` nor a `--vscode-` variable.
* A module lives in the most specific unit that all its importers may import. Pure logic that one host uses stays in that host's unit.
* Each unit owns the protocol of the webview it talks to: `src/viewer/protocol.ts`, `src/vscode/sidebar/protocol.ts` and `src/learn/protocol.ts`.
* The bundles keep their output paths. The unit and dom tests sit in `test/unit/<unit>/` and `test/dom/<unit>/`.
* `src/core/tsconfig.json` typechecks the core with `lib: ["ES2023"]` and `types: []`, and `npm run typecheck` runs it after the root typecheck. `src/core/hostGlobals.d.ts` declares `TextEncoder`, `TextDecoder` and `structuredClone`, which Node and every browser provide. The core uses nothing else outside ES2023.

This ADR supersedes the structural parts of the following ADRs. Their other decisions stand.

* [ADR 0004](0004-one-skill-with-bundled-scripts.md) and [ADR 0007](0007-validator-as-dependency-free-node-bundles.md): the scripts are built from `src/skills`, and they share `src/core` and `src/core-node` in place of `src/model`.
* [ADR 0015](0015-typescript-esbuild-vitest-plain-svg-webview.md): the one source tree is divided into the units above.
* [ADR 0016](0016-build-test-and-docs-check-harness.md): `npm run typecheck` also runs the core typecheck, and the unit and dom tests sit in one folder per unit.
* [ADR 0026](0026-activate-test-hook-and-happy-dom-tests.md): the test hook lives in `src/vscode/extension.ts`, and the dom tests in `test/dom/<unit>/`.
* [ADR 0052](0052-a-core-cli-shares-the-model-with-every-host.md): the CLI shares `src/core` and `src/core-node` with the other hosts.
* [ADR 0064](0064-layout-runs-in-web-workers-from-blob-urls.md): the layout lives in `src/viewer/layout/`.

This ADR also supersedes the ADRs of the features that `647df7b` left out of `main`.

* [ADR 0049](0049-a-refresh-skill-updates-a-map-from-its-fingerprints.md): `647df7b` removed the refresh skill from `main`.
* [ADR 0051](0051-the-diagram-page-is-one-offline-html-file.md): `647df7b` removed the offline diagram page from `main`.
* [ADR 0054](0054-the-cloud-accepts-maps-never-code.md): `647df7b` removed the cloud from `main`.
* [ADR 0055](0055-only-the-cloud-client-sends-and-only-when-asked.md): `647df7b` removed the cloud client from `main`.
* [ADR 0059](0059-explain-back-keeps-answer-keys-in-the-extension-host.md): `647df7b` removed explain-back from `main`.
* [ADR 0060](0060-tours-are-a-sidecar-the-viewer-plays.md): `647df7b` removed tours from `main`.
* [ADR 0063](0063-plans-are-enforced-on-the-server-and-billed-through-stripes-api.md): `647df7b` removed plans and billing from `main`.

### Consequences

* Good, because a broken boundary fails `test/unit/boundaries.test.ts` or the core typecheck.
* Good, because a unit can become an npm workspace without moving code.
* Bad, because a pure helper with importers in two units lives in the lower unit, even where it reads like part of the higher one.
* Neutral, because the bug-hunt files keep their old folders until the learn unit is built. The test treats each of them as part of the unit it moves to.

### Confirmation

`test/unit/boundaries.test.ts` scans every file under `src/` and `webview/` against the table and the four rules, and one fixture per rule shows that the rule fails. It also typechecks a fixture under `src/core/tsconfig.json` and sees a Node import and a DOM global fail. `noNetwork.test.ts`, `execScan.test.ts`, `committed.test.ts` and `messages.test.ts` keep their security checks on the new paths.

## Pros and Cons of the Options

### npm workspaces, one package per unit

* Good, because each package declares its own dependencies.
* Bad, because it adds package plumbing before a second package needs it.

### The old folders, with per-file allowlists

* Good, because nothing moves.
* Bad, because every new module needs a list entry, and the lists say nothing about the product surfaces.
